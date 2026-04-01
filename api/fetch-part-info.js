function innerText(html) {
  return html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
}

function extractByLabel(html, labels) {
  for (const label of labels) {
    // th/td pair
    const tablePattern = new RegExp(
      `<t[hd][^>]*>(?:(?!</t[hd]>)[\\s\\S])*?${label}(?:(?!</t[hd]>)[\\s\\S])*?</t[hd]>\\s*<t[hd][^>]*>((?:(?!</t[hd]>)[\\s\\S])*?)</t[hd]>`,
      'i'
    )
    const tableMatch = html.match(tablePattern)
    if (tableMatch) {
      const text = innerText(tableMatch[1])
      if (text && text !== '該当データがありません') return text
    }

    // id="MainContent_tb*" (service.hitachi-gls.com)
    const idMap = {
      '部品番号': 'MainContent_tbNo',
      '部品名': 'MainContent_tbName',
      '照合番号': 'MainContent_tsNo',
      '希望小売価格': 'MainContent_tsPrice',
    }
    if (idMap[label]) {
      const idPattern = new RegExp(`id="${idMap[label]}"[^>]*>((?:(?!<\\/td>)[\\s\\S])*?)<\\/td>`, 'i')
      const idMatch = html.match(idPattern)
      if (idMatch) {
        const text = innerText(idMatch[1])
        if (text && text !== '該当データがありません') return text
      }
    }

    // dt/dd pair
    const dlPattern = new RegExp(
      `<dt[^>]*>(?:(?!</dt>)[\\s\\S])*?${label}(?:(?!</dt>)[\\s\\S])*?</dt>\\s*<dd[^>]*>((?:(?!</dd>)[\\s\\S])*?)</dd>`,
      'i'
    )
    const dlMatch = html.match(dlPattern)
    if (dlMatch) {
      const text = innerText(dlMatch[1])
      if (text) return text
    }

    // span/div adjacent
    const spanPattern = new RegExp(`${label}[：:]*\\s*</[^>]+>\\s*<[^>]+>([^<]+)<`, 'i')
    const spanMatch = html.match(spanPattern)
    if (spanMatch) return spanMatch[1].trim()

    // inline colon
    const inlinePattern = new RegExp(`${label}[：:]\\s*([^<\\n]{1,80})`, 'i')
    const inlineMatch = html.match(inlinePattern)
    if (inlineMatch) return inlineMatch[1].trim()
  }
  return null
}

function normalizePrice(raw) {
  const m = raw.match(/[\d,]+/)
  if (!m) return raw.trim()
  return `¥${m[0]}`
}

const ALLOWED_DOMAINS = [
  'hitachi-gls.com',
  'hitachi-gls.co.jp',
  'hitachi-cm.com',
  'hitachi-cm.co.jp',
  'kadenfan.hitachi.co.jp',
  'hitachi.co.jp',
]

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const { url } = req.query
  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'url パラメータが必要です' })
  }

  let parsed
  try {
    parsed = new URL(url)
  } catch {
    return res.status(400).json({ error: '不正な URL です' })
  }

  const isAllowed = ALLOWED_DOMAINS.some(
    d => parsed.hostname === d || parsed.hostname.endsWith('.' + d)
  )
  if (!isAllowed) {
    return res.status(403).json({ error: `許可されていないドメインです: ${parsed.hostname}` })
  }

  let html
  try {
    const resp = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'ja-JP,ja;q=0.9',
      },
      signal: AbortSignal.timeout(8000),
    })
    if (!resp.ok) {
      return res.status(502).json({ error: `Hitachi サイトからエラー: ${resp.status}` })
    }
    html = await resp.text()
  } catch (e) {
    return res.status(502).json({ error: `取得失敗: ${e.message || String(e)}` })
  }

  html = html
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#xa5;/gi, '¥')
    .replace(/&yen;/gi, '¥')

  const partNo = extractByLabel(html, ['部品番号', '品番', 'Parts No', 'Part No'])
  const partName = extractByLabel(html, ['部品名', '名称', 'Parts Name', 'Part Name'])
  const referenceNo = extractByLabel(html, ['照合番号', '照合No', '整理番号'])
  const rawPrice =
    extractByLabel(html, ['希望小売価格', '参考価格', '税込価格', '小売価格']) ??
    extractByLabel(html, ['価格', 'Price'])

  return res.status(200).json({
    partNo,
    partName,
    referenceNo,
    price: rawPrice ? normalizePrice(rawPrice) : null,
    rawUrl: url,
  })
}
