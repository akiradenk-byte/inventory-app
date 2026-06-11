// 共有アカウントの自動ログイン用エンドポイント。
// 認証情報はサーバ側の環境変数のみで管理し、クライアントのJSバンドルには含めない。
//   必須 env: SHARED_EMAIL / SHARED_PASSWORD（Vercel の Environment Variables に設定。VITE_ 接頭辞は付けない）
//   既存 env: VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY をそのまま利用可能
// 返すのは Supabase のセッショントークンのみ。パスワードは決してレスポンスに含めない。
import { applyCors } from './_guard.js'

export default async function handler(req, res) {
  applyCors(req, res)
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })

  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const anon = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
  const email = process.env.SHARED_EMAIL || process.env.VITE_SHARED_EMAIL
  const password = process.env.SHARED_PASSWORD || process.env.VITE_SHARED_PASSWORD
  if (!url || !anon) return res.status(500).json({ error: 'Supabase env not configured' })
  if (!email || !password) return res.status(500).json({ error: 'shared account env not configured' })

  try {
    const r = await fetch(`${url}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: anon },
      body: JSON.stringify({ email, password }),
    })
    const data = await r.json().catch(() => ({}))
    if (!r.ok) {
      return res.status(401).json({ error: data.error_description || data.msg || 'login failed' })
    }
    return res.status(200).json({
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_in: data.expires_in,
      token_type: data.token_type,
    })
  } catch (e) {
    return res.status(502).json({ error: e.message || String(e) })
  }
}
