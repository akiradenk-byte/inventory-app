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

  const prompt = `この画像から顧客・連絡先情報を読み取ってください。
画像は名刺、メモ書き、書類、伝票、注文書など様々な種類の可能性があります。

以下のルールに従って情報を抽出し、JSON形式で返してください：

【名前の処理】
- 日本語の名前は「姓」と「名」を正しく分けてください
- 会社名・法人名と個人名を区別してください
- 会社名は company_name に、個人名は name（姓＋名）に入れてください
- 「株式会社」「有限会社」「合同会社」等の法人格は company_name に含めてください
- 名前のフリガナが読み取れる場合は furigana に入れてください

【電話番号の処理】
- ハイフンあり・なし両方に対応してください（例: 09012345678 → 090-1234-5678）
- 固定電話、携帯電話、FAX番号をそれぞれ phone1, phone2, phone3 に入れてください
- 携帯電話を優先的に phone1 に入れてください
- 電話番号は必ずハイフン付き形式に統一してください（例: 03-1234-5678, 090-1234-5678）
- 数字の羅列でも電話番号パターン（10〜11桁）なら検出してください

【住所の処理】
- 都道府県から番地・部屋番号まで正確に抽出してください
- 郵便番号は postal_code に入れてください（〒マークは除去、ハイフン付き形式: 123-4567）
- 住所が複数行にまたがっている場合は結合してください

{
  "name": "個人名（姓 名）",
  "furigana": "フリガナ（カタカナ）",
  "company_name": "会社名・法人名",
  "phone1": "電話番号1（携帯優先）",
  "phone2": "電話番号2",
  "phone3": "電話番号3（FAXなど）",
  "address": "住所（都道府県から番地まで）",
  "postal_code": "郵便番号（ハイフン付き）",
  "email": "メールアドレス",
  "memo": "役職、部署、その他の重要情報"
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

    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return res.status(200).json({ error: 'No JSON in response', raw: text })

    const parsed = JSON.parse(jsonMatch[0])
    return res.status(200).json(parsed)
  } catch (e) {
    return res.status(500).json({ error: e.message || String(e) })
  }
}
