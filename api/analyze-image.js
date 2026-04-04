export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' })

  const { image, mediaType } = req.body || {}
  if (!image) return res.status(400).json({ error: 'image (base64) is required' })

  const prompt = `この画像に写っている文字をすべて読み取ってください。
読み取った文字から以下の情報を抽出してJSON形式で返してください。

{
  "product_name": "型番・品番（例: RAS-E40F2）。部品番号と組み合わせて「RAS-E40F2 003」のような形式にする",
  "part_number": "部品番号（例: 003）",
  "part_name": "部品名・DESCRIPTION（例: ツユサラクミ（フラップ ナシ）DRAINPAN）",
  "price": 数値のみ（例: 6050。¥やカンマは除去。読み取れない場合は0）,
  "reference_number": "照合番号・管理番号（あれば）",
  "manufacturer": "メーカー名（HITACHI、日立、パナソニック、ダイキンなど。わかれば）",
  "category": "補修部品、REPLACEMENT PARTSなどの記載があれば",
  "memo": "上記に含まれないが重要と思われる情報（注文型式、その他の番号など）"
}

読み取れない項目は空文字にしてください。
JSONのみを返し、他のテキストは含めないでください。`

  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: mediaType || 'image/jpeg',
                data: image,
              },
            },
            { type: 'text', text: prompt },
          ],
        }],
      }),
    })

    if (!resp.ok) {
      const errText = await resp.text()
      return res.status(502).json({ error: `Anthropic API error: ${resp.status}`, detail: errText })
    }

    const result = await resp.json()
    const text = result.content?.[0]?.text || ''

    // Extract JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return res.status(200).json({ error: 'No JSON in response', raw: text })

    const parsed = JSON.parse(jsonMatch[0])
    return res.status(200).json(parsed)
  } catch (e) {
    return res.status(500).json({ error: e.message || String(e) })
  }
}
