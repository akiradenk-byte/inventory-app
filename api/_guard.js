// API共通ガード: CORSオリジン制限 + Supabase JWT検証
// （_ 始まりのファイルはVercelのルーティング対象外。ライブラリとしてのみ利用）

// 許可オリジン。環境変数 ALLOWED_ORIGINS（カンマ区切り）で指定。
// 未設定の場合は従来どおりリクエスト元を許可し、保護は下のJWT検証に委ねる。
// 例: ALLOWED_ORIGINS="https://your-app.vercel.app,http://localhost:5173"
function allowedOrigins() {
  return (process.env.ALLOWED_ORIGINS || '')
    .split(',').map(s => s.trim()).filter(Boolean)
}

export function applyCors(req, res) {
  const origin = req.headers.origin || ''
  const list = allowedOrigins()
  if (list.length === 0) {
    res.setHeader('Access-Control-Allow-Origin', origin || '*')
  } else if (origin && list.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin)
  } else if (list.includes('*')) {
    res.setHeader('Access-Control-Allow-Origin', '*')
  }
  res.setHeader('Vary', 'Origin')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
}

// Supabaseのアクセストークンを検証。ログイン済みユーザーのみAPIを使えるようにする。
// （既存の VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY をそのまま利用可能）
export async function verifyAuth(req) {
  const auth = req.headers.authorization || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  if (!token) return false
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const anon = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
  if (!url || !anon) return false
  try {
    const r = await fetch(`${url}/auth/v1/user`, {
      headers: { apikey: anon, Authorization: `Bearer ${token}` },
    })
    return r.ok
  } catch {
    return false
  }
}
