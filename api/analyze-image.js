import { applyCors, verifyAuth } from './_guard.js'

export default async function handler(req, res) {
  applyCors(req, res)
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })
  if (!(await verifyAuth(req))) return res.status(401).json({ error: '認証が必要です（ログインしてください）' })

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' })

  const { image, mediaType } = req.body || {}
  if (!image) return res.status(400).json({ error: 'image (base64) is required' })

  const prompt = `この画像に写っている文字をすべて正確に読み取ってください。
画像は部品ラベル、伝票、書類、メモ書き、カタログなど様々な種類の可能性があります。

以下のルールに従って情報を抽出し、JSON形式で返してください：

【型番・品番の処理】
- 型番（例: RAS-E40F2）と部品番号（例: 003）を区別してください
- 型番+部品番号で「RAS-E40F2 003」のような形式にしてproduct_nameに入れてください

【価格の処理】
- ¥、円、カンマは除去し、数値のみにしてください
- 税込・税抜の区別がある場合は税込価格を優先してください
- 数字の羅列でも金額パターンなら検出してください

【メーカーの処理】
- HITACHI、日立、Panasonic、パナソニック、DAIKIN、ダイキン、三菱、MITSUBISHI、東芝、TOSHIBA、SHARP、シャープ等を検出してください
- ロゴからも判別してください

{
  "product_name": "型番・品番（部品番号と組み合わせた形式）",
  "part_number": "部品番号",
  "part_name": "部品名・DESCRIPTION",
  "price": 数値のみ（読み取れない場合は0）,
  "reference_number": "照合番号・管理番号",
  "manufacturer": "メーカー名",
  "category": "補修部品、REPLACEMENT PARTSなどの記載",
  "memo": "上記に含まれないが重要な情報（注文型式、その他の番号など）"
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
        model: 'claude-sonnet-4-6',
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
