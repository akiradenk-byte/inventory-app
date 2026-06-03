import { createClient } from '@supabase/supabase-js'

// 認証情報は環境変数から読み込む（鍵をソースに直書きしない）
//   例: SUPABASE_URL=https://xxxx.supabase.co \
//       SUPABASE_SECRET_KEY=sb_secret_xxx node update-prices.mjs
const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY

if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
  console.error('環境変数 SUPABASE_URL と SUPABASE_SECRET_KEY を設定してください。')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY)

// --- HTML parsing helpers (same logic as api/fetch-part-info.js) ---

function innerText(html) {
  return html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
}

function extractByLabel(html, labels) {
  for (const label of labels) {
    const tablePattern = new RegExp(
      `<t[hd][^>]*>(?:(?!</t[hd]>)[\\s\\S])*?${label}(?:(?!</t[hd]>)[\\s\\S])*?</t[hd]>\\s*<t[hd][^>]*>((?:(?!</t[hd]>)[\\s\\S])*?)</t[hd]>`,
      'i'
    )
    const tableMatch = html.match(tablePattern)
    if (tableMatch) {
      const text = innerText(tableMatch[1])
      if (text && text !== '該当データがありません') return text
    }

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

    const dlPattern = new RegExp(
      `<dt[^>]*>(?:(?!</dt>)[\\s\\S])*?${label}(?:(?!</dt>)[\\s\\S])*?</dt>\\s*<dd[^>]*>((?:(?!</dd>)[\\s\\S])*?)</dd>`,
      'i'
    )
    const dlMatch = html.match(dlPattern)
    if (dlMatch) {
      const text = innerText(dlMatch[1])
      if (text) return text
    }

    const spanPattern = new RegExp(`${label}[：:]*\\s*</[^>]+>\\s*<[^>]+>([^<]+)<`, 'i')
    const spanMatch = html.match(spanPattern)
    if (spanMatch) return spanMatch[1].trim()

    const inlinePattern = new RegExp(`${label}[：:]\\s*([^<\\n]{1,80})`, 'i')
    const inlineMatch = html.match(inlinePattern)
    if (inlineMatch) return inlineMatch[1].trim()
  }
  return null
}

async function fetchPartInfo(url) {
  const resp = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'ja-JP,ja;q=0.9',
    },
    signal: AbortSignal.timeout(10000),
  })
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
  let html = await resp.text()
  html = html.replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/&#xa5;/gi, '¥').replace(/&yen;/gi, '¥')

  const partName = extractByLabel(html, ['部品名', '名称', 'Parts Name', 'Part Name'])
  const referenceNo = extractByLabel(html, ['照合番号', '照合No', '整理番号'])
  const rawPrice =
    extractByLabel(html, ['希望小売価格', '参考価格', '税込価格', '小売価格']) ??
    extractByLabel(html, ['価格', 'Price'])

  let priceNum = 0
  if (rawPrice) {
    const m = rawPrice.replace(/[¥￥,\s]/g, '').match(/\d+/)
    if (m) priceNum = parseInt(m[0], 10)
  }

  return { partName, referenceNo, priceNum }
}

// --- Main ---

const { data: items, error } = await supabase
  .from('items')
  .select('id, bc, name, price, note')
  .or('bc.ilike.%hitachi-gls%,bc.ilike.%hitachi-cm%')

if (error) { console.error('DB取得エラー:', error); process.exit(1) }

console.log(`対象アイテム: ${items.length}件\n`)

const results = { updated: 0, skipped: 0, errors: [] }

for (let i = 0; i < items.length; i++) {
  const item = items[i]
  console.log(`[${i + 1}/${items.length}] ID:${item.id} — ${item.bc}`)

  try {
    const info = await fetchPartInfo(item.bc)

    if (info.priceNum === 0 && !info.partName) {
      console.log(`  → スキップ（情報取得できず）`)
      results.skipped++
      continue
    }

    // Build note
    const parts = [
      info.partName ? '部品名: ' + info.partName : '',
      info.referenceNo ? '照合番号: ' + info.referenceNo : '',
    ].filter(Boolean).join(' / ')

    let newNote = item.note || ''
    if (parts && !newNote.includes(parts)) {
      newNote = newNote ? newNote + '\n' + parts : parts
    }

    const updates = {}
    if (info.priceNum > 0) updates.price = info.priceNum
    if (parts) updates.note = newNote

    if (Object.keys(updates).length === 0) {
      console.log(`  → スキップ（更新データなし）`)
      results.skipped++
      continue
    }

    const { error: updateErr } = await supabase
      .from('items')
      .update(updates)
      .eq('id', item.id)

    if (updateErr) throw updateErr

    console.log(`  → 更新完了: 価格=${info.priceNum || '—'}, 部品名=${info.partName || '—'}`)
    results.updated++
  } catch (e) {
    console.log(`  → エラー: ${e.message}`)
    results.errors.push({ id: item.id, bc: item.bc, error: e.message })
  }

  // 1秒待機
  if (i < items.length - 1) await new Promise(r => setTimeout(r, 1000))
}

console.log(`\n===== 完了 =====`)
console.log(`更新: ${results.updated}件`)
console.log(`スキップ: ${results.skipped}件`)
console.log(`エラー: ${results.errors.length}件`)
if (results.errors.length > 0) {
  console.log('\nエラー詳細:')
  results.errors.forEach(e => console.log(`  ID:${e.id} ${e.bc} — ${e.error}`))
}
