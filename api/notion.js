export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const token = process.env.NOTION_TOKEN;
  const dbId = process.env.NOTION_DB_ID;
  const data = req.body;

  const properties = { Name: { title: [{ text: { content: data.date } }] } };
  for (const [key, value] of Object.entries(data.checks)) {
    properties[key] = { checkbox: value };
  }

  const response = await fetch('https://api.notion.com/v1/pages', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Notion-Version': '2022-06-28'
    },
    body: JSON.stringify({ parent: { database_id: dbId }, properties })
  });

  const result = await response.json();
  res.status(response.ok ? 200 : 500).json(result);
}
