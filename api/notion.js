export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const token = process.env.NOTION_TOKEN;
  const dbId = process.env.NOTION_DB_ID;
  const { date, checks } = req.body;

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

  let response;
  if (existing) {
    // 오늘 행이 이미 있으면 체크박스만 갱신 — 타이틀 메모는 그대로 둠
    response = await fetch(`https://api.notion.com/v1/pages/${existing.id}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ properties: checkProps })
    });
  } else {
    // 없으면 새로 생성, 타이틀은 비워둠 (직접 메모 쓸 수 있게)
    response = await fetch('https://api.notion.com/v1/pages', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        parent: { database_id: dbId },
        properties: {
          Date: { date: { start: date } },
          ...checkProps
        }
      })
    });
  }

  const result = await response.json();
  if (!response.ok) {
    return res.status(500).json({ step: existing ? 'update' : 'create', message: result.message || JSON.stringify(result) });
  }
  res.status(200).json(result);
}
