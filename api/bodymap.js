// Body Map 의 Notion "Body Parts" 데이터베이스를 읽어서 body_map.html 에 내려준다.
// 읽기 전용(GET). 화면에 필요한 칸만 골라서 보내고, 실패하면 사유 코드만 돌려준다.
// body_map.html 은 실패 시 파일 안의 저장본을 그대로 쓰므로 여기서 에러가 나도 화면은 깨지지 않는다.
const BODY_DB = (process.env.NOTION_BODY_DB_ID || '97182c1b535847d2bcb44211a95cd3ea').replace(/-/g, '');

const text = (prop) =>
  prop && Array.isArray(prop.rich_text || prop.title)
    ? (prop.rich_text || prop.title).map((t) => t.plain_text || '').join('')
    : '';
const pick = (prop) => (prop && prop.select && prop.select.name) || '';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ ok: false, reason: 'method' });
  }
  // 에러 응답이 CDN 에 남지 않도록 기본은 no-store, 성공했을 때만 짧게 캐시한다.
  res.setHeader('Cache-Control', 'no-store');

  const token = process.env.NOTION_TOKEN;
  if (!token) return res.status(503).json({ ok: false, reason: 'no_token' });

  const headers = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
    'Notion-Version': '2022-06-28'
  };

  const parts = [];
  let cursor;
  try {
    for (let i = 0; i < 5; i++) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 8000);
      let r;
      try {
        r = await fetch(`https://api.notion.com/v1/databases/${BODY_DB}/query`, {
          method: 'POST',
          headers,
          signal: ctrl.signal,
          body: JSON.stringify(cursor ? { page_size: 100, start_cursor: cursor } : { page_size: 100 })
        });
      } finally {
        clearTimeout(timer);
      }
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        // object_not_found = 연동(Connection)이 이 데이터베이스에 연결되지 않았을 때 나오는 코드
        return res.status(502).json({ ok: false, reason: data.code || `http_${r.status}` });
      }
      for (const row of data.results || []) {
        if (!row || row.object !== 'page' || row.archived || row.in_trash) continue;
        const p = row.properties || {};
        parts.push({
          id: String(row.id || '').replace(/-/g, ''),
          name: text(p.Part),
          zone: pick(p.Zone),
          status: pick(p.Status),
          goal: text(p.Goal),
          now: text(p.Now)
        });
      }
      if (!data.has_more || !data.next_cursor) break;
      cursor = data.next_cursor;
    }
  } catch (e) {
    return res.status(502).json({ ok: false, reason: e && e.name === 'AbortError' ? 'timeout' : 'network' });
  }

  res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=300');
  return res.status(200).json({ ok: true, at: new Date().toISOString(), parts });
}
