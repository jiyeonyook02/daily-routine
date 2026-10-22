// Session #01 의 Monthly Overview(1~12월) / year view(연도) 페이지 ID.
// 저장할 때 Daily Log 행을 해당 월·연도에 자동으로 연결한다.
const MONTH_PAGES = [
  '3ecd6b58c4ff80bf8fdfd2ca9fa2d54b', // January
  '3ecd6b58c4ff804da3a3cec26ccc1704', // February
  '3ecd6b58c4ff80539906cf6f6bd7d419', // March
  '3ecd6b58c4ff80f5902bc52b40e28cb0', // April
  '3ecd6b58c4ff8099b89df89750262c29', // May
  '3ecd6b58c4ff80499260f5fc89e8384c', // June
  '3ecd6b58c4ff800792b3f25ecec073af', // July
  '3ecd6b58c4ff801fa925f28688d54c83', // August
  '3ecd6b58c4ff8091a2d5ddb8afaa5124', // September
  '3ecd6b58c4ff80eeae98c2cc8eda5083', // October
  '3ecd6b58c4ff80278c29e1e1c67c7014', // November
  '3ecd6b58c4ff802fb529e859f9644bde'  // December
];
const YEAR_PAGES = {
  2026: '3edd6b58c4ff8073af70ead66c998a50',
  2027: '3edd6b58c4ff8052bd0ff2ec108a5db1',
  2028: '3edd6b58c4ff8013a479eae642229139',
  2029: '3edd6b58c4ff80689d52ff8c37f5d8a7',
  2030: '3edd6b58c4ff80c1b3b7de6ced0601af'
};

function relationProps(date) {
  const props = {};
  const m = /^(\d{4})-(\d{2})-\d{2}$/.exec(String(date || ''));
  if (!m) return props;
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (YEAR_PAGES[year]) props['Year'] = { relation: [{ id: YEAR_PAGES[year] }] };
  if (month >= 1 && month <= 12) props['Monthly Overview'] = { relation: [{ id: MONTH_PAGES[month - 1] }] };
  return props;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const token = process.env.NOTION_TOKEN;
  const dbId = process.env.NOTION_DB_ID;
  const { date, checks, day } = req.body;

  const headers = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
    'Notion-Version': '2022-06-28'
  };

  // 오늘 날짜 행 찾기 (Date 프로퍼티 기준)
  const query = await fetch(`https://api.notion.com/v1/databases/${dbId}/query`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      filter: { property: 'Date', date: { equals: date } }
    })
  });
  const queryResult = await query.json();

  if (!query.ok) {
    return res.status(500).json({ step: 'query', message: queryResult.message || JSON.stringify(queryResult) });
  }

  const existing = (queryResult.results || [])[0];

  const checkProps = {};
  for (const [key, value] of Object.entries(checks)) {
    checkProps[key] = { checkbox: value };
  }

  // 주말/평일 구분 + 주말 블록·한 줄 기록 (Day Type, Block A/B/C, Baek, Day Note)
  const dayProps = {};
  if (day && typeof day === 'object') {
    const sel = v => ({ select: v ? { name: String(v) } : null });
    if (day.type) dayProps['Day Type'] = sel(day.type);
    for (const k of ['A', 'B', 'C']) if (k in day) dayProps['Block ' + k] = sel(day[k]);
    if ('baek' in day) dayProps['Baek'] = { checkbox: !!day.baek };
    if ('note' in day) dayProps['Day Note'] = { rich_text: day.note ? [{ type: 'text', text: { content: String(day.note).slice(0, 2000) } }] : [] };
  }

  // 월/연도 relation 을 같이 보낸다. 연동 권한 문제 등으로 실패하면
  // 체크 저장이 막히지 않도록 relation 없이 한 번 더 시도한다.
  const relProps = relationProps(date);

  const send = (extra) => {
    if (existing) {
      // 오늘 행이 이미 있으면 체크박스만 갱신 — 타이틀 메모는 그대로 둠
      return fetch(`https://api.notion.com/v1/pages/${existing.id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ properties: { ...checkProps, ...extra } })
      });
    }
    // 없으면 새로 생성, 타이틀은 비워둠 (직접 메모 쓸 수 있게)
    return fetch('https://api.notion.com/v1/pages', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        parent: { database_id: dbId },
        properties: {
          Date: { date: { start: date } },
          ...checkProps,
          ...extra
        }
      })
    });
  };

  // 실패하면 relation → 주말 칸 순서로 빼면서 다시 시도해서 체크 저장은 꼭 되게 한다.
  let relationsLinked = Object.keys(relProps).length > 0;
  let dayLinked = Object.keys(dayProps).length > 0;
  let response = await send({ ...dayProps, ...relProps });
  if (!response.ok && relationsLinked) {
    relationsLinked = false;
    response = await send({ ...dayProps });
  }
  if (!response.ok && dayLinked) {
    dayLinked = false;
    response = await send({});
  }

  const result = await response.json();
  if (!response.ok) {
    return res.status(500).json({ step: existing ? 'update' : 'create', message: result.message || JSON.stringify(result) });
  }
  res.status(200).json({ ...result, relationsLinked, dayLinked });
}
