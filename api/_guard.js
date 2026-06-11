// API共通ガード: CORSオリジン制限 + Supabase JWT検証
// （_ 始まりのファイルはVercelのルーティング対象外。ライブラリとしてのみ利用）

// 許可オリジン。環境変数 ALLOWED_ORIGINS（カンマ区切り）で指定。
// 未設定の場合は従来どおりリクエスト元を許可し、保護は下のJWT検証に委ねる。
// 例: ALLOWED_ORIGINS="https://your-app.vercel.app,http://localhost:5173"
function allowedOrigins() {
  return (process.env.ALLOWED_ORIGINS || '')
    .split(',').map(s => s.trim()).filter(Boolean)
}

// 既定許可: 自分のデプロイ先(*.vercel.app)とローカル開発のみ。
// ALLOWED_ORIGINS 未設定でも本番(vercel.app)とローカルは動くが、任意オリジンは弾く。
function isDefaultAllowed(origin) {
  try {
    const u = new URL(origin)
    if (u.hostname === 'localhost' || u.hostname === '127.0.0.1') return true
    return u.hostname === 'vercel.app' || u.hostname.endsWith('.vercel.app')
  } catch {
    return false
  }
}

export function applyCors(req, res) {
  const origin = req.headers.origin || ''
  const list = allowedOrigins()
  if (list.length === 0) {
    // 環境変数未設定時は任意オリジンへのエコーをやめ、自分のデプロイ先とローカルのみ許可。
    // 本番URLを厳密に固定したい場合は ALLOWED_ORIGINS に設定する。
    if (origin && isDefaultAllowed(origin)) res.setHeader('Access-Control-Allow-Origin', origin)
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
