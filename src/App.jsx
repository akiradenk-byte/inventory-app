import { useState, useEffect, useCallback, useRef, Component } from 'react'
import { supabase } from './supabase'
import BarcodeScanner from './BarcodeScanner'
import './App.css'

// ===== ログイン画面 =====
function LoginScreen() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password })
    setLoading(false)
    if (authError) {
      setError('ログインに失敗しました: ' + authError.message)
    }
  }

  return (
    <div className="login-screen">
      <div className="login-card">
        <img src="/icon-192.png" alt="在庫管理" className="login-logo" />
        <h1 className="login-title">在庫管理</h1>
        <p className="login-subtitle">ログインしてください</p>
        <form onSubmit={handleSubmit} className="login-form">
          <div className="field">
            <label>メールアドレス</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="example@email.com"
              autoComplete="email"
              required
            />
          </div>
          <div className="field">
            <label>パスワード</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="パスワード"
              autoComplete="current-password"
              required
            />
          </div>
          {error && <div className="login-error">{error}</div>}
          <button type="submit" className="btn primary login-btn" disabled={loading}>
            {loading ? '処理中...' : 'ログイン'}
          </button>
        </form>
      </div>
    </div>
  )
}

class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, errorMessage: null }
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, errorMessage: String(error) }
  }
  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo)
    this.setState({
      errorMessage: String(error) + '\n\n' + JSON.stringify(error, Object.getOwnPropertyNames(error || {}), 2) + '\n\nComponent Stack:' + (errorInfo?.componentStack || 'なし')
    })
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '2rem', textAlign: 'center' }}>
          <p>エラーが発生しました。リロードしてください。</p>
          <pre style={{ fontSize: '12px', textAlign: 'left', padding: '1rem', background: '#f5f5f5', overflow: 'auto', maxHeight: '300px' }}>{this.state.errorMessage || 'エラー情報なし'}</pre>
          <button onClick={() => window.location.reload()}>リロード</button>
        </div>
      )
    }
    return this.props.children
  }
}

const BC = ['b0','b1','b2','b3','b4','b5','b6','b7','b8']
const CONDITIONS = ['', '新品', '新古品', '中古（良品）', '中古（可）', 'ジャンク']
const CONDITION_COLORS = {
  '新品': { bg: '#E1F5EE', color: '#085041' },
  '新古品': { bg: '#E6F1FB', color: '#0C447C' },
  '中古（良品）': { bg: '#FAEEDA', color: '#633806' },
  '中古（可）': { bg: '#FAECE7', color: '#712B13' },
  'ジャンク': { bg: '#FCEBEB', color: '#791F1F' },
}

// ===== 案件管理（desk_jobs）=====
const JOB_STATUSES = ['inquiry', 'scheduled', 'in_progress', 'completed', 'invoiced', 'paid']
const JOB_STATUS_LABELS = {
  inquiry: '受付', scheduled: '予約', in_progress: '作業中',
  completed: '完了', invoiced: '請求', paid: '入金',
}
const JOB_STATUS_COLORS = {
  inquiry: { bg: '#FAEEDA', color: '#633806' },
  scheduled: { bg: '#E6F1FB', color: '#0C447C' },
  in_progress: { bg: '#FCF3D9', color: '#6B5500' },
  completed: { bg: '#E1F5EE', color: '#085041' },
  invoiced: { bg: '#EDE7FA', color: '#3B2A77' },
  paid: { bg: '#D7F0E4', color: '#0A6B45' },
}
const EMPTY_JOB = {
  title: '', customer_id: null, customer_name: '', status: 'inquiry',
  maker: '', model_number: '', product_name: '', failure_detail: '',
  scheduled_at: '', next_visit_at: '', warranty_end_date: '', amount_yen: '', notes: '', case_number: '',
}

// ===== 共有アカウントによる自動ログイン =====
// 第一経路: /api/login（認証情報はサーバ側の環境変数 SHARED_EMAIL / SHARED_PASSWORD のみで管理。
//           クライアントのJSバンドルに秘密を含めないための経路）
// 第二経路: 下記のクライアント埋め込み認証情報（移行期フォールバック）。
//   ※ パスワードローテーション完了後は無効になる。その時点でこのフォールバックごと削除すること。
const SHARED_EMAIL = import.meta.env.VITE_SHARED_EMAIL || 'shared@akiradenki.app'
const SHARED_PASSWORD = import.meta.env.VITE_SHARED_PASSWORD || 'Akira-Kyoyu-2026-7xQ2tZ'

// サーバ(/api/login)から共有アカウントのセッションを取得して適用する
async function autoLoginViaApi() {
  try {
    const resp = await fetch('/api/login', { method: 'POST' })
    if (!resp.ok) return false
    const data = await resp.json()
    if (!data.access_token || !data.refresh_token) return false
    const { error } = await supabase.auth.setSession({
      access_token: data.access_token,
      refresh_token: data.refresh_token,
    })
    return !error
  } catch {
    return false
  }
}

// CSVセル: ダブルクオート・カンマ・改行を含む値を安全に出力
function csvCell(v) {
  return '"' + String(v ?? '').replace(/"/g, '""') + '"'
}

// CSVパーサ（"" エスケープ・引用内の改行に対応）
function parseCSV(text) {
  const rows = []
  let row = [], cur = '', inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { cur += '"'; i++ } else inQuotes = false
      } else cur += c
    } else if (c === '"') inQuotes = true
    else if (c === ',') { row.push(cur); cur = '' }
    else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = '' }
    else if (c === '\r') { /* ignore */ }
    else cur += c
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row) }
  return rows
}

// timestamptz → datetime-local の入力値（ローカル時刻）。
// UTCのISO文字列を slice で切り出すと9時間ズレて表示され、再保存のたびに時刻が past 方向へずれるため必ず変換する。
function toLocalInputValue(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  if (isNaN(d.getTime())) return ''
  const pad = n => String(n).padStart(2, '0')
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes())
}

// Storage上の画像をpublic URLから削除（孤児ファイル対策）
async function removeStorageByUrl(url) {
  try {
    if (!url) return
    const marker = '/item-images/'
    const idx = url.indexOf(marker)
    if (idx === -1) return
    const path = url.slice(idx + marker.length).split('?')[0]
    if (path) await supabase.storage.from('item-images').remove([path])
  } catch { /* 失敗しても致命的でないため無視 */ }
}

export default function App() {
  // Auth
  const [session, setSession] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)

  useEffect(() => {
    // 古いService Workerをクリーンアップ（過去のPWAキャッシュ対策）
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then(regs => {
        regs.forEach(r => r.unregister())
      })
    }

    let mounted = true

    // セッション初期化: onAuthStateChangeを先にセット → getSessionで初期値取得
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      if (!mounted) return
      setSession(s)
      if (s) setAuthLoading(false)
    })

    // セッションが無ければ共有アカウントで自動ログイン（ログイン画面を出さない運用）
    supabase.auth.getSession().then(async ({ data: { session: s } }) => {
      if (!mounted) return
      if (s) { setSession(s); setAuthLoading(false); return }
      // 第一経路: サーバ経由（成功時は onAuthStateChange が session をセットする）
      const ok = await autoLoginViaApi()
      if (!mounted || ok) return
      // 第二経路: 移行期フォールバック（ローテーション後に削除）
      if (SHARED_EMAIL && SHARED_PASSWORD) {
        const { error } = await supabase.auth.signInWithPassword({ email: SHARED_EMAIL, password: SHARED_PASSWORD })
        if (!mounted) return
        if (error) { console.error('自動ログイン失敗:', error.message); setAuthLoading(false) }
      } else {
        setAuthLoading(false) // 共有アカウント未設定 → 手動ログイン画面（フォールバック）
      }
    }).catch(() => {
      if (mounted) setAuthLoading(false)
    })

    // タイムアウト: 一定時間で確定しなければローディング解除
    const timeout = setTimeout(() => {
      if (mounted) setAuthLoading(false)
    }, 8000)

    return () => {
      mounted = false
      clearTimeout(timeout)
      subscription.unsubscribe()
    }
  }, [])

  if (authLoading) return <div className="loading">読み込み中...</div>
  // 自動ログインが未設定/失敗した場合のみ手動ログイン画面を表示（フォールバック）
  if (!session) return <LoginScreen />

  return <AppMain session={session} />
}

function AppMain({ session }) {
  const [items, setItems] = useState([])
  const [categories, setCategories] = useState([])
  const [locations, setLocations] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [catFilter, setCatFilter] = useState('')
  const [locFilter, setLocFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [conditionFilter, setConditionFilter] = useState('')
  const [expanded, setExpanded] = useState({})
  const [page, setPage] = useState(0)
  const PAGE = 30

  // Tab navigation
  const [activeTab, setActiveTab] = useState('home')

  const [showAdd, setShowAdd] = useState(false)
  const [showEdit, setShowEdit] = useState(false)
  const [showScanner, setShowScanner] = useState(false)
  const [scanTarget, setScanTarget] = useState('search')
  const [formHidden, setFormHidden] = useState(false)
  const [editItem, setEditItem] = useState(null)
  const [addPreset, setAddPreset] = useState(null)

  const [form, setForm] = useState({ bc: '', name: '', cat: '', loc: '', price: 0, note: '', image_url: '', condition: '' })
  const [newCat, setNewCat] = useState('')
  const [newLoc, setNewLoc] = useState('')
  const [nameSuggest, setNameSuggest] = useState([])
  const [masterTab, setMasterTab] = useState('category')

  // Image
  const [imageFile, setImageFile] = useState(null)
  const [imagePreview, setImagePreview] = useState(null)
  const imageInputRef = useRef(null)

  // Detail modal
  const [detailItem, setDetailItem] = useState(null)
  const [showHelp, setShowHelp] = useState(false)
  const [helpOpen, setHelpOpen] = useState({})

  // Trash (soft-deleted items)
  const [showTrash, setShowTrash] = useState(false)
  const [trashItems, setTrashItems] = useState([])

  // Jobs (案件管理)
  const [jobs, setJobs] = useState([])
  const [jobStatusFilter, setJobStatusFilter] = useState('')
  const [showJobForm, setShowJobForm] = useState(false)
  const [editJob, setEditJob] = useState(null)
  const [jobForm, setJobForm] = useState(EMPTY_JOB)
  const [jobCustomerSearch, setJobCustomerSearch] = useState('')
  const [showJobCustDropdown, setShowJobCustDropdown] = useState(false)
  const [jobParts, setJobParts] = useState([])
  const [jobPartSearch, setJobPartSearch] = useState('')
  const [showJobPartDropdown, setShowJobPartDropdown] = useState(false)

  // Fullscreen image viewer
  const [viewerImage, setViewerImage] = useState(null)

  // Part info fetching
  const [fetchingPart, setFetchingPart] = useState(false)

  // Scan toast
  const [scanToast, setScanToast] = useState(null)

  // AI image analysis
  const [aiAnalyzing, setAiAnalyzing] = useState(false)
  const aiImageInputRef = useRef(null)

  // Submit guard（連打による二重登録を防止）
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [hasSubmitted, setHasSubmitted] = useState(false)

  // Stocktake
  const [stocktakeMode, setStocktakeMode] = useState(false)
  const [confirmedIds, setConfirmedIds] = useState(new Set())
  const [stocktakeLocFilter, setStocktakeLocFilter] = useState('')
  const [showStocktakeSearch, setShowStocktakeSearch] = useState(false)
  const [stocktakeSearchQuery, setStocktakeSearchQuery] = useState('')
  const [scanHistory, setScanHistory] = useState([])
  const [stocktakeScanning, setStocktakeScanning] = useState(false)
  const [lastScanResult, setLastScanResult] = useState(null)
  const lastScanTimerRef = useRef(null)

  // Customers
  const [customers, setCustomers] = useState([])
  const [customerSearch, setCustomerSearch] = useState('')
  const [showCustomerForm, setShowCustomerForm] = useState(false)
  const [showCustomerEdit, setShowCustomerEdit] = useState(false)
  const [editCustomer, setEditCustomer] = useState(null)
  const [customerForm, setCustomerForm] = useState({ name: '', furigana: '', phone1: '', phone2: '', phone3: '', address: '', postal_code: '', memo: '' })
  const [customerAiAnalyzing, setCustomerAiAnalyzing] = useState(false)
  const customerImageRef = useRef(null)
  const customerCsvRef = useRef(null)
  // Customer selector in item form
  const [itemCustomerId, setItemCustomerId] = useState(null)
  const [itemCustomerSearch, setItemCustomerSearch] = useState('')
  const [showItemCustomerDropdown, setShowItemCustomerDropdown] = useState(false)
  const [showNewCustomerInItemForm, setShowNewCustomerInItemForm] = useState(false)
  const [newCustomerForm, setNewCustomerForm] = useState({ name: '', furigana: '', phone1: '', phone2: '', phone3: '', address: '', postal_code: '', memo: '' })
  const [newCustomerAiAnalyzing, setNewCustomerAiAnalyzing] = useState(false)
  const newCustomerImageRef = useRef(null)

  // Pull to refresh
  const [pullDistance, setPullDistance] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const touchStartY = useRef(0)
  const contentRef = useRef(null)

  const hasLoadedRef = useRef(false)
  const fetchAll = useCallback(async () => {
    // 全画面ローディングは初回のみ（保存/削除/プルリフレッシュでの画面フラッシュを防ぐ）
    if (!hasLoadedRef.current) setLoading(true)
    const [{ data: itemsData }, { data: catsData }, { data: locsData }, { data: custData }, { data: jobsData }] = await Promise.all([
      supabase.from('items').select('*').is('deleted_at', null).order('created_at', { ascending: false }),
      supabase.from('categories').select('*').order('name'),
      supabase.from('locations').select('*').order('sort_order').order('name'),
      supabase.from('customers').select('*').eq('is_deleted', false).order('created_at', { ascending: false }),
      supabase.from('desk_jobs').select('*').order('created_at', { ascending: false }),
    ])
    setItems(itemsData || [])
    setCategories((catsData || []).map(c => c.name))
    setLocations((locsData || []).map(l => ({ name: l.name, sort_order: l.sort_order ?? 0 })))
    setCustomers(custData || [])
    setJobs(jobsData || [])
    setLoading(false)
    hasLoadedRef.current = true
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  // Pull to refresh handlers
  const touchStartX = useRef(0)
  const pullActive = useRef(false)

  const handleTouchStart = (e) => {
    if (contentRef.current && contentRef.current.scrollTop === 0) {
      touchStartY.current = e.touches[0].clientY
      touchStartX.current = e.touches[0].clientX
      pullActive.current = false
    } else {
      touchStartY.current = 0
    }
  }

  const handleTouchMove = (e) => {
    if (!touchStartY.current) return
    const dy = e.touches[0].clientY - touchStartY.current
    const dx = Math.abs(e.touches[0].clientX - touchStartX.current)
    // Y方向の移動がX方向より大きい場合のみ発動
    if (!pullActive.current) {
      if (dy < 10) return
      if (dx > dy) { touchStartY.current = 0; return }
      pullActive.current = true
    }
    if (dy > 0) {
      // ゴムバンド効果: 実際の移動量を0.4倍に
      setPullDistance(dy * 0.4)
    }
  }

  const handleTouchEnd = async () => {
    if (pullDistance >= 120) {
      setRefreshing(true)
      setPullDistance(0)
      await fetchAll()
      setRefreshing(false)
    } else {
      setPullDistance(0)
    }
    touchStartY.current = 0
    pullActive.current = false
  }

  const getGroups = () => {
    try {
      const q = search.toLowerCase()
      const filtered = items.filter(i => {
        if (q && !(i.name || '').toLowerCase().includes(q) && !(i.bc || '').toLowerCase().includes(q) && !(i.cat || '').toLowerCase().includes(q) && !(i.note || '').toLowerCase().includes(q) && !(i.loc || '').toLowerCase().includes(q)) return false
        if (catFilter && i.cat !== catFilter) return false
        if (locFilter && i.loc !== locFilter) return false
        if (statusFilter === 'instock' && !i.loc) return false
        if (statusFilter === 'noloc' && i.loc) return false
        if (conditionFilter && (i.condition || '') !== conditionFilter) return false
        return true
      })
      const map = {}
      filtered.forEach(i => {
        const key = (i.name || '') + '||' + (i.bc || '')
        if (!map[key]) map[key] = { name: i.name || '', bc: i.bc || '', cat: i.cat || '', items: [] }
        map[key].items.push(i)
      })
      return Object.values(map)
    } catch (err) {
      console.error('getGroups error:', err)
      return []
    }
  }

  const groups = getGroups()
  const totalGroups = groups.length
  const maxPage = Math.max(0, Math.ceil(totalGroups / PAGE) - 1)
  const sliced = groups.slice(page * PAGE, (page + 1) * PAGE)

  const catIdx = c => { const i = categories.indexOf(c); return i < 0 ? 0 : i % BC.length }

  const openScanner = (target) => {
    setScanTarget(target)
    if (target === 'form') setFormHidden(true)
    setShowScanner(true)
  }

  // ログイン中ユーザーのアクセストークンをAPIへ渡すヘッダ（API側で認証検証）
  const authHeader = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    return session?.access_token ? { Authorization: 'Bearer ' + session.access_token } : {}
  }

  const fetchHitachiPartInfo = async (url) => {
    try {
      setFetchingPart(true)
      const resp = await fetch('/api/fetch-part-info?url=' + encodeURIComponent(url), { headers: { ...(await authHeader()) } })
      if (!resp.ok) { console.error('fetch-part-info error:', resp.status); return null }
      return await resp.json()
    } catch (err) {
      console.error('fetchHitachiPartInfo error:', err)
      return null
    } finally {
      setFetchingPart(false)
    }
  }

  const handleScan = useCallback((code) => {
    try {
      setShowScanner(false)
      setFormHidden(false)
      if (navigator.vibrate) navigator.vibrate([100, 50, 100])

      if (scanTarget === 'search') {
        setSearch(code)
        setPage(0)
        setActiveTab('home')
        return
      }

      // scanTarget === 'form' （スキャンタブから）
      const urlStr = (code || '').trim()

      try {
        const url = new URL(urlStr.toLowerCase().startsWith('http') ? urlStr : 'http://' + urlStr)
        const hostname = url.hostname.toLowerCase()
        if (hostname.includes('hitachi-gls') || hostname.includes('hitachi-cm')) {
          const params = url.searchParams
          const pno = params.get('pno') || params.get('PNO') || params.get('Pno') || ''
          const cno = params.get('cno') || params.get('CNO') || params.get('Cno') || ''
          const itemName = pno ? pno.toUpperCase() + (cno ? ' ' + cno : '') : ''

          // 既存入力を保持し、空のフィールドだけ自動入力
          setForm(f => ({
            ...f,
            bc: code,
            name: f.name || itemName,
            cat: f.cat || 'HITACHI',
          }))
          setEditItem(null); setAddPreset(null); setImageFile(null); setImagePreview(null)
          setShowAdd(true)
          setScanToast({ ok: true, msg: '日立部品情報を取得中...' })

          // 部品詳細を非同期で取得（空フィールドのみ自動入力）
          fetchHitachiPartInfo(urlStr).then(info => {
            if (info && (info.partName || info.referenceNo || info.price)) {
              let priceNum = 0
              if (info.price) {
                const priceMatch = info.price.replace(/[¥￥,\s]/g, '').match(/\d+/)
                if (priceMatch) priceNum = parseInt(priceMatch[0], 10)
              }
              setForm(f => ({
                ...f,
                name: f.name || (info.partName ? (pno.toUpperCase() + ' ' + info.partName) : ''),
                ...(!f.price && priceNum > 0 ? { price: priceNum } : {}),
                note: f.note || [
                  info.partName ? '部品名: ' + info.partName : '',
                  info.referenceNo ? '照合番号: ' + info.referenceNo : '',
                ].filter(Boolean).join(' / '),
              }))
              setScanToast({ ok: true, msg: '日立部品情報を取得しました' })
            }
            setTimeout(() => setScanToast(null), 3000)
          }).catch(() => { setTimeout(() => setScanToast(null), 3000) })
          return
        }
      } catch { /* URLでなければ通常バーコードとして処理 */ }

      // 通常バーコード: 既存アイテム検索
      const codeLower = code.toLowerCase()
      const existing = items.find(i => i.bc && i.bc.toLowerCase() === codeLower)

      if (existing) {
        // 既存アイテム → 詳細表示
        setDetailItem(existing)
        setScanToast({ ok: true, msg: existing.name + ' が見つかりました' })
      } else {
        // 新規 → バーコード欄のみ更新（既存入力を保持）
        setForm(f => ({
          ...f,
          bc: code,
          // 空のフィールドだけデフォルト値を設定
          cat: f.cat || categories[0] || '',
        }))
        setEditItem(null); setAddPreset(null)
        setShowAdd(true)
        setScanToast({ ok: 'new', msg: '新規バーコード — 登録してください' })
      }
      setTimeout(() => setScanToast(null), 3000)
    } catch (err) {
      console.error('handleScan error:', err)
      setScanToast({ ok: false, msg: 'スキャンエラー: ' + (err.message || err) })
      setTimeout(() => setScanToast(null), 3000)
    }
  }, [scanTarget, items, categories])

  const handleScanClose = () => {
    setShowScanner(false)
    setFormHidden(false)
  }

  const uploadImage = async (itemId, file) => {
    try {
      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
      const path = `${itemId}.${ext}`
      const { error } = await supabase.storage.from('item-images').upload(path, file, { upsert: true, contentType: file.type })
      if (error) { console.error('画像アップロードエラー:', error.message); return null }
      const { data } = supabase.storage.from('item-images').getPublicUrl(path)
      return data.publicUrl
    } catch (err) {
      console.error('uploadImage error:', err)
      return null
    }
  }

  const handleImageChange = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImageFile(file)
    setImagePreview(URL.createObjectURL(file))
    e.target.value = ''
  }

  const resizeAndConvert = (file, maxSize = 1024) => new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    const cleanup = () => { try { URL.revokeObjectURL(url) } catch { /* noop */ } }
    // デコードできない画像(HEIC等)で固まらないようタイムアウト＋onerrorを設定
    const timer = setTimeout(() => { cleanup(); reject(new Error('画像の読み込みがタイムアウトしました')) }, 15000)
    img.onload = () => {
      clearTimeout(timer)
      try {
        let { width, height } = img
        if (width > maxSize || height > maxSize) {
          const ratio = Math.min(maxSize / width, maxSize / height)
          width = Math.round(width * ratio)
          height = Math.round(height * ratio)
        }
        const canvas = document.createElement('canvas')
        canvas.width = width; canvas.height = height
        canvas.getContext('2d').drawImage(img, 0, 0, width, height)
        const dataUrl = canvas.toDataURL('image/jpeg', 0.8)
        const base64 = dataUrl.split(',')[1]
        canvas.toBlob(blob => { cleanup(); resolve({ base64, blob }) }, 'image/jpeg', 0.8)
      } catch (err) { cleanup(); reject(err) }
    }
    img.onerror = () => { clearTimeout(timer); cleanup(); reject(new Error('画像を読み込めませんでした（対応していない形式の可能性）')) }
    img.src = url
  })

  const handleAiAnalyze = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setAiAnalyzing(true)

    try {
      // Resize and convert to base64
      const { base64, blob } = await resizeAndConvert(file)
      const resizedFile = new File([blob], file.name, { type: 'image/jpeg' })
      setImageFile(resizedFile)
      setImagePreview(URL.createObjectURL(resizedFile))

      // 30秒タイムアウト付きでAPI呼び出し
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 30000)
      let resp
      try {
        resp = await fetch('/api/analyze-image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
          body: JSON.stringify({ image: base64, mediaType: 'image/jpeg' }),
          signal: controller.signal,
        })
      } finally {
        clearTimeout(timeout)
      }
      const data = await resp.json()
      if (data.error) { alert('AI解析エラー: ' + data.error); setAiAnalyzing(false); return }

      // Auto-fill form
      const itemName = data.product_name || ''
      const noteLines = [
        data.part_name ? '部品名: ' + data.part_name : '',
        data.reference_number ? '照合番号: ' + data.reference_number : '',
        data.memo || '',
      ].filter(Boolean).join(' / ')

      // カテゴリ: manufacturer or category から既存カテゴリにマッチするものを探す
      let matchedCat = ''
      const catCandidates = [data.manufacturer, data.category].filter(Boolean)
      for (const c of catCandidates) {
        const exact = categories.find(cat => cat.toLowerCase() === c.toLowerCase())
        if (exact) { matchedCat = exact; break }
        const partial = categories.find(cat => cat.toLowerCase().includes(c.toLowerCase()) || c.toLowerCase().includes(cat.toLowerCase()))
        if (partial) { matchedCat = partial; break }
      }

      setForm(f => ({
        ...f,
        name: itemName || f.name,
        ...(data.price > 0 ? { price: data.price } : {}),
        note: noteLines ? (f.note ? f.note + '\n' + noteLines : noteLines) : f.note,
        ...(matchedCat ? { cat: matchedCat } : {}),
      }))
    } catch (err) {
      if (err.name === 'AbortError') {
        alert('読み取りに失敗しました。手動で入力してください。（タイムアウト）')
      } else {
        alert('読み取りに失敗しました。手動で入力してください。')
      }
    }
    setAiAnalyzing(false)
  }

  const saveItem = async () => {
    if (isSubmitting || (!editItem && hasSubmitted)) return
    if (!(form.name || '').trim()) { alert('物品名は必須です'); return }
    setIsSubmitting(true)
    const data = {
      bc: form.bc || '',
      name: (form.name || '').trim(),
      cat: form.cat || '',
      loc: form.loc || '',
      price: parseInt(form.price) || 0,
      note: (form.note || '').trim(),
      condition: form.condition || null,
      customer_id: itemCustomerId || null,
    }
    let savedId = null
    if (editItem) {
      const { error } = await supabase.from('items').update(data).eq('id', editItem.id)
      if (error) { alert('更新エラー: ' + error.message); setIsSubmitting(false); return }
      savedId = editItem.id
    } else {
      const { data: newItem, error } = await supabase.from('items').insert(data).select().single()
      if (error) { alert('登録エラー: ' + error.message); setIsSubmitting(false); return }
      savedId = newItem?.id
    }
    if (savedId && imageFile) {
      const url = await uploadImage(savedId, imageFile)
      if (url) {
        await supabase.from('items').update({ image_url: url }).eq('id', savedId)
        if (editItem?.image_url && editItem.image_url !== url) await removeStorageByUrl(editItem.image_url)
      }
    } else if (savedId && imagePreview === null && editItem?.image_url) {
      await supabase.from('items').update({ image_url: null }).eq('id', savedId)
      await removeStorageByUrl(editItem.image_url)
    }
    setIsSubmitting(false)
    if (editItem) {
      setShowAdd(false); setShowEdit(false); setEditItem(null)
      setForm({ bc: '', name: '', cat: '', loc: '', price: 0, note: '', image_url: '', condition: '' })
      setNameSuggest([])
      setImageFile(null)
      setImagePreview(null)
      fetchAll()
    } else {
      setHasSubmitted(true)
      fetchAll()
    }
  }

  const delItem = async (id) => {
    if (!confirm('この1点をゴミ箱へ移動しますか？（30日後に自動削除）')) return
    const { error } = await supabase.from('items').update({ deleted_at: new Date().toISOString() }).eq('id', id)
    if (error) { alert('削除エラー: ' + error.message); return }
    setDetailItem(null)
    fetchAll()
  }

  const delProduct = async (g) => {
    if (!confirm('「' + g.name + '」の全' + g.items.length + '点をゴミ箱へ移動しますか？（30日後に自動削除）')) return
    const ids = g.items.map(i => i.id)
    const { error } = await supabase.from('items').update({ deleted_at: new Date().toISOString() }).in('id', ids)
    if (error) { alert('削除エラー: ' + error.message); return }
    fetchAll()
  }

  // ===== ゴミ箱（ソフト削除） =====
  const fetchTrash = async () => {
    const { data } = await supabase.from('items').select('*').not('deleted_at', 'is', null).order('deleted_at', { ascending: false })
    setTrashItems(data || [])
  }
  const restoreItem = async (id) => {
    const { error } = await supabase.from('items').update({ deleted_at: null }).eq('id', id)
    if (error) { alert('復元エラー: ' + error.message); return }
    fetchTrash(); fetchAll()
  }
  const purgeItem = async (item) => {
    if (!confirm('「' + (item.name || '') + '」を完全に削除しますか？元に戻せません。')) return
    const { error } = await supabase.from('items').delete().eq('id', item.id)
    if (error) { alert('削除エラー: ' + error.message); return }
    if (item.image_url) await removeStorageByUrl(item.image_url)
    fetchTrash()
  }
  const emptyTrash = async () => {
    if (trashItems.length === 0) return
    if (!confirm('ゴミ箱の全' + trashItems.length + '点を完全に削除しますか？元に戻せません。')) return
    const ids = trashItems.map(i => i.id)
    const { error } = await supabase.from('items').delete().in('id', ids)
    if (error) { alert('削除エラー: ' + error.message); return }
    for (const it of trashItems) { if (it.image_url) await removeStorageByUrl(it.image_url) }
    fetchTrash()
  }

  // ===== 案件管理（desk_jobs） =====
  const openJobForm = () => {
    setEditJob(null); setJobForm(EMPTY_JOB)
    setJobCustomerSearch(''); setShowJobCustDropdown(false)
    setJobParts([]); setJobPartSearch(''); setShowJobPartDropdown(false)
    setShowJobForm(true)
  }
  const openJobEdit = (job) => {
    setEditJob(job)
    setJobForm({
      title: job.title || '', customer_id: job.customer_id || null, customer_name: job.customer_name || '',
      status: job.status || 'inquiry', maker: job.maker || '', model_number: job.model_number || '',
      product_name: job.product_name || '', failure_detail: job.failure_detail || '',
      scheduled_at: toLocalInputValue(job.scheduled_at),
      next_visit_at: toLocalInputValue(job.next_visit_at),
      warranty_end_date: job.warranty_end_date || '',
      amount_yen: job.amount_yen ?? '', notes: job.notes || '', case_number: job.case_number || '',
    })
    setJobCustomerSearch(''); setShowJobCustDropdown(false)
    setJobPartSearch(''); setShowJobPartDropdown(false)
    fetchJobParts(job.id)
    setShowJobForm(true)
  }
  const saveJob = async () => {
    if (!(jobForm.title || '').trim()) { alert('案件名は必須です'); return }
    const data = {
      title: jobForm.title.trim(),
      customer_id: jobForm.customer_id || null,
      customer_name: (jobForm.customer_name || '').trim(),
      status: jobForm.status || 'inquiry',
      maker: (jobForm.maker || '').trim() || null,
      model_number: (jobForm.model_number || '').trim() || null,
      product_name: (jobForm.product_name || '').trim() || null,
      failure_detail: (jobForm.failure_detail || '').trim() || null,
      scheduled_at: jobForm.scheduled_at ? new Date(jobForm.scheduled_at).toISOString() : null,
      next_visit_at: jobForm.next_visit_at ? new Date(jobForm.next_visit_at).toISOString() : null,
      warranty_end_date: jobForm.warranty_end_date || null,
      amount_yen: (jobForm.amount_yen === '' || jobForm.amount_yen === null) ? null : Math.max(0, parseInt(jobForm.amount_yen) || 0),
      notes: (jobForm.notes || '').trim() || null,
      case_number: (jobForm.case_number || '').trim() || null,
      updated_at: new Date().toISOString(),
    }
    if (editJob) {
      const { error } = await supabase.from('desk_jobs').update(data).eq('id', editJob.id)
      if (error) { alert('更新エラー: ' + error.message); return }
    } else {
      const { error } = await supabase.from('desk_jobs').insert(data)
      if (error) { alert('登録エラー: ' + error.message); return }
    }
    setShowJobForm(false); setEditJob(null); setJobForm(EMPTY_JOB)
    fetchAll()
  }
  const deleteJob = async (job) => {
    if (!confirm('案件「' + (job.title || '') + '」を削除しますか？')) return
    const { error } = await supabase.from('desk_jobs').delete().eq('id', job.id)
    if (error) { alert('削除エラー: ' + error.message); return }
    setShowJobForm(false); setEditJob(null)
    fetchAll()
  }

  // ----- 案件の使用部品（desk_job_items）-----
  const fetchJobParts = async (jobId) => {
    const { data } = await supabase.from('desk_job_items').select('*').eq('job_id', jobId).order('created_at', { ascending: true })
    setJobParts(data || [])
  }
  const addJobPart = async (item) => {
    if (!editJob) return
    const { error } = await supabase.from('desk_job_items').insert({
      job_id: editJob.id, item_id: item.id, name: item.name || '', unit_price: item.price || 0, qty: 1,
    })
    if (error) { alert('部品追加エラー: ' + error.message); return }
    setJobPartSearch(''); setShowJobPartDropdown(false)
    fetchJobParts(editJob.id)
  }
  const removeJobPart = async (partId) => {
    const { error } = await supabase.from('desk_job_items').delete().eq('id', partId)
    if (error) { alert('削除エラー: ' + error.message); return }
    if (editJob) fetchJobParts(editJob.id)
  }
  const updateJobPartQty = async (part, qty) => {
    const q = Math.max(1, parseInt(qty) || 1)
    const { error } = await supabase.from('desk_job_items').update({ qty: q }).eq('id', part.id)
    if (error) { alert('更新エラー: ' + error.message); return }
    if (editJob) fetchJobParts(editJob.id)
  }

  const addCat = async () => {
    if (!newCat.trim() || categories.includes(newCat.trim())) return
    await supabase.from('categories').insert({ name: newCat.trim() })
    setNewCat(''); fetchAll()
  }
  const delCat = async (name) => {
    if (!confirm('カテゴリ「' + name + '」を削除しますか？')) return
    await supabase.from('categories').delete().eq('name', name); fetchAll()
  }
  const addLoc = async () => {
    if (!newLoc.trim() || locations.some(l => l.name === newLoc.trim())) return
    const maxOrder = locations.reduce((m, l) => Math.max(m, l.sort_order), -1)
    await supabase.from('locations').insert({ name: newLoc.trim(), sort_order: maxOrder + 1 })
    setNewLoc(''); fetchAll()
  }
  const delLoc = async (name) => {
    if (!confirm('保管場所「' + name + '」を削除しますか？')) return
    await supabase.from('locations').delete().eq('name', name); fetchAll()
  }
  const moveLoc = async (index, direction) => {
    const swapIdx = index + direction
    if (swapIdx < 0 || swapIdx >= locations.length) return
    const a = locations[index], b = locations[swapIdx]
    const newLocs = [...locations]
    newLocs[index] = { ...b, sort_order: a.sort_order }
    newLocs[swapIdx] = { ...a, sort_order: b.sort_order }
    newLocs.sort((x, y) => x.sort_order - y.sort_order)
    setLocations(newLocs)
    await Promise.all([
      supabase.from('locations').update({ sort_order: a.sort_order }).eq('name', b.name),
      supabase.from('locations').update({ sort_order: b.sort_order }).eq('name', a.name),
    ])
  }

  const exportCSV = () => {
    const header = ['ID', 'バーコード', '物品名', 'カテゴリ', '保管場所', '状態', '単価', 'メモ', '登録日時'].map(csvCell).join(',')
    const rows = items.map(i => [
      i.id, i.bc, i.name || '', i.cat, i.loc, i.condition || '', i.price, i.note || '', i.created_at
    ].map(csvCell).join(','))
    const csv = '\uFEFF' + [header, ...rows].join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    a.download = '在庫_' + new Date().toISOString().slice(0, 10) + '.csv'
    a.click()
  }

  // ===== Customer Functions =====
  const saveCustomer = async (formData, isInlineNew = false) => {
    if (!(formData.name || '').trim()) { alert('顧客名は必須です'); return null }
    const data = {
      name: (formData.name || '').trim(),
      furigana: (formData.furigana || '').trim(),
      phone1: (formData.phone1 || '').trim(),
      phone2: (formData.phone2 || '').trim(),
      phone3: (formData.phone3 || '').trim(),
      address: (formData.address || '').trim(),
      postal_code: (formData.postal_code || '').trim(),
      memo: (formData.memo || '').trim(),
    }
    const { data: newCust, error } = await supabase.from('customers').insert(data).select().single()
    if (error) { alert('顧客登録エラー: ' + error.message); return null }
    await fetchAll()
    if (!isInlineNew) {
      setShowCustomerForm(false)
      setCustomerForm({ name: '', furigana: '', phone1: '', phone2: '', phone3: '', address: '', postal_code: '', memo: '' })
    }
    return newCust
  }

  const updateCustomer = async () => {
    if (!editCustomer) return
    if (!(customerForm.name || '').trim()) { alert('顧客名は必須です'); return }
    const data = {
      name: (customerForm.name || '').trim(),
      furigana: (customerForm.furigana || '').trim(),
      phone1: (customerForm.phone1 || '').trim(),
      phone2: (customerForm.phone2 || '').trim(),
      phone3: (customerForm.phone3 || '').trim(),
      address: (customerForm.address || '').trim(),
      postal_code: (customerForm.postal_code || '').trim(),
      memo: (customerForm.memo || '').trim(),
      updated_at: new Date().toISOString(),
    }
    const { error } = await supabase.from('customers').update(data).eq('id', editCustomer.id)
    if (error) { alert('更新エラー: ' + error.message); return }
    setShowCustomerEdit(false)
    setEditCustomer(null)
    setCustomerForm({ name: '', furigana: '', phone1: '', phone2: '', phone3: '', address: '', postal_code: '', memo: '' })
    fetchAll()
  }

  const deleteCustomer = async (cust) => {
    if (!confirm('「' + cust.name + '」を削除しますか？')) return
    const { error } = await supabase.from('customers').update({ is_deleted: true, deleted_at: new Date().toISOString() }).eq('id', cust.id)
    if (error) { alert('削除エラー: ' + error.message); return }
    fetchAll()
  }

  const openCustomerEdit = (cust) => {
    setEditCustomer(cust)
    setCustomerForm({
      name: cust.name || '', furigana: cust.furigana || '',
      phone1: cust.phone1 || '', phone2: cust.phone2 || '', phone3: cust.phone3 || '',
      address: cust.address || '', postal_code: cust.postal_code || '', memo: cust.memo || '',
    })
    setShowCustomerEdit(true)
  }

  const exportCustomersCSV = () => {
    const header = ['ID', '顧客名', 'フリガナ', '電話番号1', '電話番号2', '電話番号3', '住所', '郵便番号', 'メモ', '登録日'].map(csvCell).join(',')
    const rows = customers.map(c => [
      c.id, c.name || '', c.furigana || '', c.phone1 || '', c.phone2 || '', c.phone3 || '',
      c.address || '', c.postal_code || '', c.memo || '', c.created_at,
    ].map(csvCell).join(','))
    const csv = '\uFEFF' + [header, ...rows].join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    a.download = '顧客_' + new Date().toISOString().slice(0, 10) + '.csv'
    a.click()
  }

  const importCustomersCSV = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    const text = await file.text()
    const allRows = parseCSV(text).filter(r => r.some(c => (c || '').trim()))
    if (allRows.length < 2) { alert('CSVにデータがありません'); return }
    let imported = 0
    for (let i = 1; i < allRows.length; i++) {
      const cols = allRows[i]
      if (!cols || cols.length < 2 || !(cols[1] || '').trim()) continue
      const row = {
        name: (cols[1] || '').trim(),
        furigana: (cols[2] || '').trim(),
        phone1: (cols[3] || '').trim(),
        phone2: (cols[4] || '').trim(),
        phone3: (cols[5] || '').trim(),
        address: (cols[6] || '').trim(),
        postal_code: (cols[7] || '').trim(),
        memo: (cols[8] || '').trim(),
      }
      const { error } = await supabase.from('customers').insert(row)
      if (!error) imported++
    }
    alert(imported + '件の顧客をインポートしました')
    fetchAll()
  }

  const handleCustomerAiAnalyze = async (e, targetForm, setTargetForm, setAnalyzing) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setAnalyzing(true)
    try {
      const { base64 } = await resizeAndConvert(file)
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 30000)
      let resp
      try {
        resp = await fetch('/api/parse-business-card', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
          body: JSON.stringify({ image: base64, mediaType: 'image/jpeg' }),
          signal: controller.signal,
        })
      } finally { clearTimeout(timeout) }
      const data = await resp.json()
      if (data.error) { alert('AI解析エラー: ' + data.error); setAnalyzing(false); return }
      const nameStr = data.company_name
        ? (data.name ? data.company_name + ' ' + data.name : data.company_name)
        : (data.name || '')
      setTargetForm(f => ({
        ...f,
        name: nameStr || f.name,
        furigana: data.furigana || f.furigana,
        phone1: data.phone1 || f.phone1,
        phone2: data.phone2 || f.phone2,
        phone3: data.phone3 || f.phone3,
        address: data.address || f.address,
        postal_code: data.postal_code || f.postal_code,
        memo: [f.memo, data.email ? 'Email: ' + data.email : '', data.memo || ''].filter(Boolean).join('\n') || f.memo,
      }))
    } catch (err) {
      if (err.name === 'AbortError') {
        alert('読み取りに失敗しました（タイムアウト）')
      } else {
        alert('読み取りに失敗しました: ' + (err.message || err))
      }
    }
    setAnalyzing(false)
  }

  const filteredCustomers = customers.filter(c => {
    if (!customerSearch) return true
    const q = customerSearch.toLowerCase()
    return (c.name || '').toLowerCase().includes(q) ||
      (c.furigana || '').toLowerCase().includes(q) ||
      (c.phone1 || '').includes(q) ||
      (c.phone2 || '').includes(q) ||
      (c.phone3 || '').includes(q) ||
      (c.address || '').toLowerCase().includes(q)
  })

  const itemCustomerResults = itemCustomerSearch.length >= 1
    ? customers.filter(c => {
        const q = itemCustomerSearch.toLowerCase()
        return (c.name || '').toLowerCase().includes(q) ||
          (c.furigana || '').toLowerCase().includes(q) ||
          (c.phone1 || '').includes(q) ||
          (c.address || '').toLowerCase().includes(q)
      }).slice(0, 10)
    : []

  const selectedCustomerObj = itemCustomerId ? customers.find(c => c.id === itemCustomerId) : null

  const filteredJobs = jobStatusFilter ? jobs.filter(j => j.status === jobStatusFilter) : jobs
  const jobCustomerResults = jobCustomerSearch.length >= 1
    ? customers.filter(c => {
        const q = jobCustomerSearch.toLowerCase()
        return (c.name || '').toLowerCase().includes(q) ||
          (c.furigana || '').toLowerCase().includes(q) ||
          (c.phone1 || '').includes(q)
      }).slice(0, 10)
    : []
  const jobPartsTotal = jobParts.reduce((s, p) => s + (p.unit_price || 0) * (p.qty || 1), 0)
  const jobPartResults = jobPartSearch.length >= 1
    ? items.filter(i => {
        const q = jobPartSearch.toLowerCase()
        return (i.name || '').toLowerCase().includes(q) || (i.bc || '').toLowerCase().includes(q)
      }).slice(0, 10)
    : []

  const handleNameInput = (v) => {
    setForm(f => ({ ...f, name: v }))
    if (!v) { setNameSuggest([]); return }
    const names = [...new Set(items.map(i => i.name).filter(Boolean))]
      .filter(n => n.toLowerCase().includes(v.toLowerCase()) && n.toLowerCase() !== v.toLowerCase())
      .slice(0, 5)
    setNameSuggest(names)
  }

  const selectSuggestion = (name) => {
    const existing = items.find(i => i.name === name)
    if (existing) {
      setForm(f => ({ ...f, name, bc: existing.bc || f.bc, cat: existing.cat || f.cat }))
    } else {
      setForm(f => ({ ...f, name }))
    }
    setNameSuggest([])
  }

  const openAddSame = (g) => {
    setForm({ bc: g.bc, name: g.name, cat: g.cat, loc: '', price: g.items[0]?.price || 0, note: '', image_url: '', condition: g.items[0]?.condition || '' })
    setAddPreset(g); setImageFile(null); setImagePreview(null); setShowAdd(true)
  }

  const openAdd = () => {
    setForm({ bc: '', name: '', cat: categories[0] || '', loc: '', price: 0, note: '', image_url: '', condition: '' })
    setAddPreset(null); setImageFile(null); setImagePreview(null)
    setItemCustomerId(null); setItemCustomerSearch(''); setShowItemCustomerDropdown(false); setShowNewCustomerInItemForm(false)
    setShowAdd(true)
  }

  const openEdit = (item) => {
    setEditItem(item)
    setForm({ bc: item.bc || '', name: item.name || '', cat: item.cat || '', loc: item.loc || '', price: item.price || 0, note: item.note || '', image_url: item.image_url || '', condition: item.condition || '' })
    setImageFile(null)
    setImagePreview(item.image_url || null)
    setItemCustomerId(item.customer_id || null); setItemCustomerSearch(''); setShowItemCustomerDropdown(false); setShowNewCustomerInItemForm(false)
    setDetailItem(null)
    setShowEdit(true)
  }

  const openDetail = (item) => { setDetailItem(item) }

  const kinds = new Set(items.map(i => (i.name || '') + '_' + (i.bc || ''))).size
  const totalVal = items.reduce((s, i) => s + (i.price || 0), 0)

  // ===== Stocktake =====
  const startStocktake = () => {
    setStocktakeMode(true)
    setConfirmedIds(new Set())
    setScanHistory([])
    setStocktakeLocFilter('')
    setStocktakeSearchQuery('')
    setShowStocktakeSearch(false)
    setLastScanResult(null)
    setActiveTab('stocktake')
  }

  const endStocktake = () => {
    if (confirmedIds.size > 0 && !confirm('棚卸しを終了しますか？進捗は失われます。')) return
    setStocktakeMode(false)
    setConfirmedIds(new Set())
    setScanHistory([])
    setStocktakeScanning(false)
    setLastScanResult(null)
    setActiveTab('home')
  }

  const confirmItem = (itemId) => {
    setConfirmedIds(prev => { const s = new Set(prev); s.add(itemId); return s })
  }

  const confirmItemWithFeedback = (item) => {
    confirmItem(item.id)
    setScanHistory(prev => [item, ...prev.filter(h => h.id !== item.id)].slice(0, 5))
    if (navigator.vibrate) navigator.vibrate(200)
  }

  const handleStocktakeScan = useCallback((code) => {
    const codeLower = (code || '').toLowerCase()
    // 完全一致を基本とし、部分一致は誤確認を防ぐため十分に長いコード同士のみ許可
    const PARTIAL_MIN = 8
    const matched = items.filter(i => {
      if (!i.bc) return false
      const bc = i.bc.toLowerCase()
      if (bc === codeLower) return true
      if (bc.length >= PARTIAL_MIN && codeLower.length >= PARTIAL_MIN) {
        return bc.includes(codeLower) || codeLower.includes(bc)
      }
      return false
    })

    if (matched.length > 0) {
      const first = matched[0]
      const alreadyConfirmed = matched.every(i => confirmedIds.has(i.id))
      if (alreadyConfirmed) {
        if (navigator.vibrate) navigator.vibrate([300])
        setLastScanResult({ ok: 'already', name: first.name })
      } else {
        matched.forEach(i => confirmItem(i.id))
        setScanHistory(prev => [first, ...prev.filter(h => h.id !== first.id)].slice(0, 5))
        if (navigator.vibrate) navigator.vibrate([100, 50, 100])
        setLastScanResult({ ok: true, name: first.name, count: matched.length, image_url: first.image_url })
      }
    } else {
      if (navigator.vibrate) navigator.vibrate([300])
      setLastScanResult({ ok: false, code: code.length > 40 ? code.slice(0, 40) + '...' : code })
    }

    if (lastScanTimerRef.current) clearTimeout(lastScanTimerRef.current)
    lastScanTimerRef.current = setTimeout(() => setLastScanResult(null), 3000)
  }, [items, confirmedIds])

  const stocktakeSearchResults = stocktakeSearchQuery.length >= 1
    ? items.filter(i => {
        const q = stocktakeSearchQuery.toLowerCase()
        return (i.name || '').toLowerCase().includes(q) || (i.bc || '').toLowerCase().includes(q)
      }).slice(0, 30)
    : []

  const unconfirmedItems = stocktakeMode
    ? items.filter(i => !confirmedIds.has(i.id) && (!stocktakeLocFilter || i.loc === stocktakeLocFilter))
    : []

  const stocktakePercent = items.length > 0 ? Math.round((confirmedIds.size / items.length) * 100) : 0

  // Open image viewer
  const openViewer = (url, e) => {
    if (e) e.stopPropagation()
    if (url) setViewerImage(url)
  }

  if (loading) return <div className="loading">読み込み中...</div>

  return (
    <ErrorBoundary>
    <div className="app">

      {/* ===== Header ===== */}
      <div className="app-header">
        <div className="header-top">
          <div className="header-title">
            {activeTab === 'home' && '在庫管理'}
            {activeTab === 'scan' && 'スキャン'}
            {activeTab === 'stocktake' && '棚卸し'}
            {activeTab === 'customers' && '顧客管理'}
            {activeTab === 'jobs' && '案件管理'}
            {activeTab === 'settings' && '設定'}
          </div>
          <div className="header-actions">
            {activeTab === 'home' && (
              <button className="btn icon-btn" onClick={openAdd}>+</button>
            )}
            {activeTab === 'customers' && (
              <button className="btn icon-btn" onClick={() => {
                setCustomerForm({ name: '', furigana: '', phone1: '', phone2: '', phone3: '', address: '', postal_code: '', memo: '' })
                setShowCustomerForm(true)
              }}>+</button>
            )}
            {activeTab === 'jobs' && (
              <button className="btn icon-btn" onClick={openJobForm}>+</button>
            )}
            {activeTab === 'stocktake' && stocktakeMode && (
              <button className="btn sm danger" onClick={endStocktake}>終了</button>
            )}
          </div>
        </div>

        {/* Search bar (home tab only) */}
        {activeTab === 'home' && (
          <>
            <div className="search-bar">
              <div className="search-input-wrap">
                <span className="search-icon">🔍</span>
                <input
                  type="text"
                  placeholder="物品名・バーコード・カテゴリ・メモで検索..."
                  value={search}
                  onChange={e => { setSearch(e.target.value); setPage(0) }}
                />
              </div>
              <button className="search-scan-btn" onClick={() => openScanner('search')}>📷</button>
            </div>
            <div className="filter-row">
              <select className="filter-select" value={catFilter} onChange={e => { setCatFilter(e.target.value); setPage(0) }}>
                <option value="">全カテゴリ</option>
                {categories.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <select className="filter-select" value={locFilter} onChange={e => { setLocFilter(e.target.value); setPage(0) }}>
                <option value="">全ロケーション</option>
                {locations.map(l => <option key={l.name} value={l.name}>{l.name}</option>)}
              </select>
              <select className="filter-select" value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(0) }}>
                <option value="">全ステータス</option>
                <option value="instock">保管場所あり</option>
                <option value="noloc">保管場所なし</option>
              </select>
              <select className="filter-select" value={conditionFilter} onChange={e => { setConditionFilter(e.target.value); setPage(0) }}>
                <option value="">全状態</option>
                {CONDITIONS.filter(c => c).map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </>
        )}
      </div>

      {/* ===== Pull to Refresh Indicator ===== */}
      {(pullDistance > 60 || refreshing) && (
        <div className="pull-indicator" style={{
          height: refreshing ? 40 : Math.min(pullDistance - 60, 60),
          opacity: refreshing ? 1 : Math.min((pullDistance - 60) / 60, 1),
          color: pullDistance >= 120 ? 'var(--tint)' : 'var(--text3)',
        }}>
          {refreshing ? <div className="pull-spinner" /> : (pullDistance >= 120 ? '↑ 離して更新' : '↓ 引っ張って更新')}
        </div>
      )}

      {/* ===== Tab Content ===== */}
      <div
        className="tab-content"
        ref={contentRef}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >

        {/* ===== HOME TAB ===== */}
        {activeTab === 'home' && (
          <>
            {/* Stats */}
            <div className="stats">
              <div className="stat"><div className="lbl">総登録点数</div><div className="val">{items.length}</div></div>
              <div className="stat"><div className="lbl">物品種類数</div><div className="val">{kinds}</div></div>
              <div className="stat"><div className="lbl">在庫総額</div><div className="val sm">{'¥' + totalVal.toLocaleString()}</div></div>
              <div className="stat"><div className="lbl">カテゴリ数</div><div className="val">{categories.length}</div></div>
            </div>

            {/* Quick Actions */}
            <div className="quick-actions">
              <button className="quick-action" onClick={openAdd}>
                <span className="quick-action-icon">📦</span>
                <span className="quick-action-label">新規登録</span>
              </button>
              <button className="quick-action" onClick={() => { setActiveTab('scan'); }}>
                <span className="quick-action-icon">📷</span>
                <span className="quick-action-label">スキャン登録</span>
              </button>
              <button className="quick-action" onClick={startStocktake}>
                <span className="quick-action-icon">📋</span>
                <span className="quick-action-label">棚卸し開始</span>
              </button>
              <button className="quick-action" onClick={exportCSV}>
                <span className="quick-action-icon">📄</span>
                <span className="quick-action-label">CSV出力</span>
              </button>
            </div>

            {/* Item List (Card-based) */}
            <div className="section-header">在庫一覧</div>
            {sliced.length > 0 ? (
              <div className="item-card-list">
                {sliced.map(g => {
                  const key = (g.name || '') + '||' + (g.bc || '')
                  const isOpen = !!expanded[key]
                  const locs = [...new Set((g.items || []).map(i => i.loc).filter(Boolean))]
                  const firstItem = g.items?.[0]
                  return [
                    <div key={key} className="item-card" onClick={() => setExpanded(e => ({ ...e, [key]: !e[key] }))}>
                      {firstItem?.image_url ? (
                        <img
                          src={firstItem.image_url}
                          alt=""
                          className="item-thumb"
                          onClick={(e) => openViewer(firstItem.image_url, e)}
                          onError={e => { e.target.style.display = 'none' }}
                        />
                      ) : (
                        <div className="item-thumb-empty">📦</div>
                      )}
                      <div className="item-info">
                        <div className="item-name">{g.name || '(名前なし)'}</div>
                        <div className="item-meta">
                          {g.cat && <span className={'badge sm ' + BC[catIdx(g.cat)]}>{g.cat}</span>}
                          {locs.length > 0 && locs.map(l => <span key={l} className="loc-pill">{l}</span>)}
                          {locs.length === 0 && <span className="no-loc">未設定</span>}
                          {firstItem?.condition && (
                            <span className="condition-badge" style={{ background: CONDITION_COLORS[firstItem.condition]?.bg || '#F1EFE8', color: CONDITION_COLORS[firstItem.condition]?.color || '#444' }}>{firstItem.condition}</span>
                          )}
                        </div>
                      </div>
                      <div className="item-right">
                        <span className="item-count">{(g.items || []).length}</span>
                        <span className="item-chevron">{isOpen ? '▼' : '▶'}</span>
                      </div>
                    </div>,
                    ...(isOpen ? (g.items || []).map(i => (
                      <div key={i.id || Math.random()} className="detail-card">
                        <span className="detail-loc">{'📍' + (i.loc || '未設定')}</span>
                        <span className="detail-price">{'¥' + (i.price || 0).toLocaleString()}</span>
                        <div className="action-cell">
                          <button className="btn sm" onClick={e => { e.stopPropagation(); openDetail(i) }}>詳細</button>
                          <button className="btn sm" onClick={e => { e.stopPropagation(); openEdit(i) }}>編集</button>
                          <button className="btn sm danger" onClick={e => { e.stopPropagation(); delItem(i.id) }}>削除</button>
                        </div>
                      </div>
                    )) : []),
                    ...(isOpen ? [
                      <div key={key + '-actions'} className="detail-card" style={{ justifyContent: 'center', gap: 8 }}>
                        <button className="btn sm primary" onClick={e => { e.stopPropagation(); openAddSame(g) }}>+ 同じ物品を追加</button>
                        <button className="btn sm danger" onClick={e => { e.stopPropagation(); delProduct(g) }}>全 {g.items.length} 点を削除</button>
                      </div>
                    ] : [])
                  ]
                })}
              </div>
            ) : (
              <div className="empty">該当する物品がありません</div>
            )}

            {totalGroups > PAGE && (
              <div className="pager">
                <button disabled={page === 0} onClick={() => setPage(p => p - 1)}>前へ</button>
                <span>{(page + 1) + ' / ' + (maxPage + 1)}</span>
                <button disabled={page === maxPage} onClick={() => setPage(p => p + 1)}>次へ</button>
              </div>
            )}
            {totalGroups <= PAGE && totalGroups > 0 && (
              <div className="pager"><span>{totalGroups + '種類 / ' + items.length + '点'}</span></div>
            )}
          </>
        )}

        {/* ===== SCAN TAB ===== */}
        {activeTab === 'scan' && (
          <div className="scan-tab-content">
            <button className="scan-tab-btn" onClick={() => {
              setScanTarget('form')
              setForm({ bc: '', name: '', cat: categories[0] || '', loc: '', price: 0, note: '', image_url: '', condition: '' })
              setAddPreset(null); setImageFile(null); setImagePreview(null)
              setShowScanner(true)
            }}>
              📷
            </button>
            <div className="scan-tab-label">タップしてバーコードをスキャン</div>
            <p style={{ fontSize: 13, color: 'var(--text3)', textAlign: 'center', maxWidth: 280 }}>
              スキャンしたバーコードで新規物品を登録できます。日立部品URLにも対応しています。
            </p>
          </div>
        )}

        {/* ===== STOCKTAKE TAB ===== */}
        {activeTab === 'stocktake' && (
          <>
            {!stocktakeMode ? (
              <div className="scan-tab-content">
                <button className="quick-action" style={{ width: 160, height: 160, borderRadius: 30 }} onClick={startStocktake}>
                  <span className="quick-action-icon" style={{ fontSize: 48 }}>📋</span>
                  <span className="quick-action-label" style={{ fontSize: 16 }}>棚卸し開始</span>
                </button>
                <p style={{ fontSize: 13, color: 'var(--text3)', textAlign: 'center', maxWidth: 280 }}>
                  バーコードスキャンや手動検索で在庫を確認できます。
                </p>
              </div>
            ) : (
              <div className="stocktake-view">
                {/* Progress */}
                <div className="stocktake-progress-wrap">
                  <div className="stocktake-progress-bar">
                    <div className="stocktake-progress-fill" style={{ width: stocktakePercent + '%' }} />
                  </div>
                  <div className="stocktake-progress-text">
                    <span className="stocktake-count">{confirmedIds.size}</span>
                    <span className="stocktake-sep"> / </span>
                    <span>{items.length} 確認済み</span>
                    <span className="stocktake-pct">{stocktakePercent}%</span>
                  </div>
                </div>

                {/* Action buttons */}
                <div className="stocktake-actions">
                  <button className="btn primary stocktake-scan-btn" onClick={() => setStocktakeScanning(true)}>📷 スキャン</button>
                  <button className="btn stocktake-manual-btn" onClick={() => { setShowStocktakeSearch(true); setStocktakeSearchQuery('') }}>🔍 手動検索</button>
                </div>

                {/* Scan result toast */}
                {lastScanResult && (
                  <div className={'scan-toast' + (lastScanResult.ok ? ' ok' : ' ng')}>
                    {lastScanResult.ok ? (
                      <div className="scan-toast-inner">
                        {lastScanResult.image_url && (
                          <img src={lastScanResult.image_url} alt="" className="scan-toast-img"
                            onClick={(e) => openViewer(lastScanResult.image_url, e)} />
                        )}
                        <div>
                          <div className="scan-toast-title">✓ {lastScanResult.name}</div>
                          <div className="scan-toast-sub">{lastScanResult.count}点を確認済みにしました</div>
                        </div>
                      </div>
                    ) : (
                      <div className="scan-toast-inner">
                        <div>
                          <div className="scan-toast-title">✗ 該当なし</div>
                          <div className="scan-toast-sub">{lastScanResult.code}</div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Scan history */}
                {scanHistory.length > 0 && (
                  <div className="scan-history">
                    <div className="scan-history-title">スキャン履歴</div>
                    <div className="scan-history-list">
                      {scanHistory.map((h, idx) => (
                        <div key={h.id + '-' + idx} className="scan-history-item">
                          {h.image_url && (
                            <img src={h.image_url} alt="" className="scan-history-thumb"
                              onClick={(e) => openViewer(h.image_url, e)}
                              onError={e => { e.target.style.display = 'none' }} />
                          )}
                          <span className="scan-history-name">{h.name || '—'}</span>
                          <span className="scan-history-check">✓</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Location filter */}
                <div className="stocktake-filter">
                  <select value={stocktakeLocFilter} onChange={e => setStocktakeLocFilter(e.target.value)}>
                    <option value="">全ロケーション ({unconfirmedItems.length}件未確認)</option>
                    {locations.map(l => {
                      const cnt = items.filter(i => !confirmedIds.has(i.id) && i.loc === l.name).length
                      return <option key={l.name} value={l.name}>{l.name} ({cnt}件)</option>
                    })}
                  </select>
                </div>

                {/* Unconfirmed items list */}
                <div className="stocktake-list">
                  {unconfirmedItems.slice(0, 50).map(item => (
                    <div key={item.id} className="stocktake-item">
                      <div className="stocktake-item-left">
                        {item.image_url ? (
                          <img src={item.image_url} alt="" className="item-thumb"
                            onClick={(e) => openViewer(item.image_url, e)}
                            onError={e => { e.target.style.display = 'none' }} />
                        ) : (
                          <div className="item-thumb-empty">📦</div>
                        )}
                        <div className="stocktake-item-info">
                          <div className="stocktake-item-name">{item.name || '(名前なし)'}</div>
                          <div className="stocktake-item-sub">
                            {item.loc && <span className="loc-pill">{item.loc}</span>}
                            {item.bc && <span className="mono">{(item.bc.length > 25 ? item.bc.slice(0, 25) + '...' : item.bc)}</span>}
                          </div>
                        </div>
                      </div>
                      <button className="btn sm primary stocktake-check-btn" onClick={() => confirmItemWithFeedback(item)}>✓</button>
                    </div>
                  ))}
                  {unconfirmedItems.length > 50 && (
                    <div className="stocktake-more">他 {unconfirmedItems.length - 50} 件</div>
                  )}
                  {unconfirmedItems.length === 0 && (
                    <div className="stocktake-done">
                      {confirmedIds.size === items.length ? '🎉 全アイテムの確認が完了しました！' : 'このロケーションの全アイテムを確認済みです'}
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}

        {/* ===== CUSTOMERS TAB ===== */}
        {activeTab === 'customers' && (
          <>
            <div className="customer-search-bar">
              <div className="search-input-wrap">
                <span className="search-icon">🔍</span>
                <input
                  type="text"
                  placeholder="名前・電話番号・住所で検索..."
                  value={customerSearch}
                  onChange={e => setCustomerSearch(e.target.value)}
                />
              </div>
            </div>

            <div className="customer-actions-bar">
              <button className="btn sm primary" onClick={() => {
                setCustomerForm({ name: '', furigana: '', phone1: '', phone2: '', phone3: '', address: '', postal_code: '', memo: '' })
                setShowCustomerForm(true)
              }}>+ 新規顧客</button>
              <button className="btn sm" onClick={exportCustomersCSV}>CSV出力</button>
              <input ref={customerCsvRef} type="file" accept=".csv" onChange={importCustomersCSV} style={{ display: 'none' }} />
              <button className="btn sm" onClick={() => customerCsvRef.current?.click()}>CSVインポート</button>
            </div>

            {filteredCustomers.length > 0 ? (
              <div className="customer-list">
                {filteredCustomers.map(c => (
                  <div key={c.id} className="customer-card" onClick={() => openCustomerEdit(c)}>
                    <div className="customer-card-main">
                      <div className="customer-card-name">{c.name || '(名前なし)'}</div>
                      {c.furigana && <div className="customer-card-furigana">{c.furigana}</div>}
                    </div>
                    <div className="customer-card-details">
                      {c.phone1 && <span className="customer-card-phone">📞 {c.phone1}</span>}
                      {c.address && <span className="customer-card-address">📍 {c.address.length > 20 ? c.address.slice(0, 20) + '...' : c.address}</span>}
                    </div>
                    <div className="customer-card-date">
                      {c.created_at ? new Date(c.created_at).toLocaleDateString('ja-JP') : ''}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty">{customerSearch ? '該当する顧客がありません' : '顧客が登録されていません'}</div>
            )}
            <div className="pager"><span>{filteredCustomers.length} 件</span></div>
          </>
        )}

        {/* ===== JOBS TAB ===== */}
        {activeTab === 'jobs' && (
          <>
            <div className="job-status-filter">
              <button className={'job-chip' + (jobStatusFilter === '' ? ' active' : '')} onClick={() => setJobStatusFilter('')}>全て ({jobs.length})</button>
              {JOB_STATUSES.map(s => {
                const cnt = jobs.filter(j => j.status === s).length
                return <button key={s} className={'job-chip' + (jobStatusFilter === s ? ' active' : '')} onClick={() => setJobStatusFilter(s)}>{JOB_STATUS_LABELS[s]} ({cnt})</button>
              })}
            </div>
            {filteredJobs.length > 0 ? (
              <div className="job-list">
                {filteredJobs.map(job => (
                  <div key={job.id} className="job-card" onClick={() => openJobEdit(job)}>
                    <div className="job-card-top">
                      <span className="job-status-badge" style={{ background: JOB_STATUS_COLORS[job.status]?.bg || '#F1EFE8', color: JOB_STATUS_COLORS[job.status]?.color || '#444' }}>{JOB_STATUS_LABELS[job.status] || job.status}</span>
                      <span className="job-card-title">{job.title || '(無題)'}</span>
                    </div>
                    {(job.customer_name || job.maker || job.model_number || job.product_name) && (
                      <div className="job-card-meta">
                        {job.customer_name && <span>👤 {job.customer_name}</span>}
                        {(job.maker || job.model_number || job.product_name) && <span>🔧 {[job.maker, job.model_number, job.product_name].filter(Boolean).join(' ')}</span>}
                      </div>
                    )}
                    <div className="job-card-meta">
                      {job.scheduled_at && <span>📅 {new Date(job.scheduled_at).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>}
                      {(job.amount_yen || job.amount_yen === 0) && <span className="job-card-amount">¥{(job.amount_yen || 0).toLocaleString()}</span>}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty">{jobs.length === 0 ? '案件がありません。右上の＋から登録できます' : '該当する案件がありません'}</div>
            )}
            <div className="pager"><span>{filteredJobs.length} 件</span></div>
          </>
        )}

        {/* ===== SETTINGS TAB ===== */}
        {activeTab === 'settings' && (
          <>
            <div className="settings-section-title">データ管理</div>
            <div className="settings-section">
              <div className="settings-row" onClick={exportCSV}>
                <span className="settings-row-icon">📄</span>
                <span className="settings-row-label">CSV出力</span>
                <span className="settings-row-chevron">›</span>
              </div>
              <div className="settings-row" onClick={() => { fetchTrash(); setShowTrash(true) }}>
                <span className="settings-row-icon">🗑️</span>
                <span className="settings-row-label">ゴミ箱</span>
                <span className="settings-row-chevron">›</span>
              </div>
            </div>

            <div className="settings-section-title">マスター管理</div>
            <div className="master-panel">
              <div className="master-tabs">
                <button className={'master-tab' + (masterTab === 'category' ? ' active' : '')} onClick={() => setMasterTab('category')}>カテゴリ</button>
                <button className={'master-tab' + (masterTab === 'location' ? ' active' : '')} onClick={() => setMasterTab('location')}>保管場所</button>
              </div>
              {masterTab === 'category' && (
                <div>
                  <div className="master-add">
                    <input type="text" value={newCat} onChange={e => setNewCat(e.target.value)} placeholder="新しいカテゴリ名" onKeyDown={e => e.key === 'Enter' && addCat()} />
                    <button className="btn sm primary" onClick={addCat}>追加</button>
                  </div>
                  <div className="master-list">
                    {categories.map((c, i) => (
                      <div key={c} className="master-item">
                        <span className={'badge ' + BC[i % BC.length]}>{c}</span>
                        <button className="del-x" onClick={() => delCat(c)}>×</button>
                      </div>
                    ))}
                    {categories.length === 0 && <div className="master-empty">カテゴリがありません</div>}
                  </div>
                </div>
              )}
              {masterTab === 'location' && (
                <div>
                  <div className="master-add">
                    <input type="text" value={newLoc} onChange={e => setNewLoc(e.target.value)} placeholder="新しい保管場所名" onKeyDown={e => e.key === 'Enter' && addLoc()} />
                    <button className="btn sm primary" onClick={addLoc}>追加</button>
                  </div>
                  <div className="master-list loc-sortable">
                    {locations.map((l, idx) => (
                      <div key={l.name} className="master-item loc-sort-item">
                        <span className="loc-sort-handle">≡</span>
                        <span className="master-loc">{l.name}</span>
                        <div className="loc-sort-btns">
                          <button className="loc-sort-btn" disabled={idx === 0} onClick={() => moveLoc(idx, -1)}>↑</button>
                          <button className="loc-sort-btn" disabled={idx === locations.length - 1} onClick={() => moveLoc(idx, 1)}>↓</button>
                        </div>
                        <button className="del-x" onClick={() => delLoc(l.name)}>×</button>
                      </div>
                    ))}
                    {locations.length === 0 && <div className="master-empty">保管場所がありません</div>}
                  </div>
                </div>
              )}
            </div>

            <div className="settings-section-title">アカウント</div>
            <div className="settings-section">
              <div className="settings-row" style={{ cursor: 'default' }}>
                <span className="settings-row-icon">👤</span>
                <span className="settings-row-label" style={{ fontSize: 13 }}>{session?.user?.email || '共有アカウント'}</span>
              </div>
            </div>

            <div className="settings-section-title">サポート</div>
            <div className="settings-section">
              <div className="settings-row" onClick={() => setShowHelp(true)}>
                <span className="settings-row-icon">📖</span>
                <span className="settings-row-label">使い方ガイド</span>
                <span className="settings-row-chevron">›</span>
              </div>
            </div>

            <div className="settings-section-title">アプリ情報</div>
            <div className="settings-section">
              <div className="settings-row" style={{ cursor: 'default' }}>
                <span className="settings-row-icon">📦</span>
                <span className="settings-row-label">在庫管理アプリ</span>
                <span style={{ color: 'var(--text3)', fontSize: 13 }}>v2.0</span>
              </div>
              <div className="settings-row" style={{ cursor: 'default' }}>
                <span className="settings-row-icon">💾</span>
                <span className="settings-row-label">登録数</span>
                <span style={{ color: 'var(--text2)', fontSize: 14, fontWeight: 600 }}>{items.length} 点</span>
              </div>
            </div>
          </>
        )}

      </div>

      {/* ===== Bottom Tab Bar ===== */}
      <div className="tab-bar">
        <button className={'tab-item' + (activeTab === 'home' ? ' active' : '')} onClick={() => setActiveTab('home')}>
          <span className="tab-icon">🏠</span>
          <span className="tab-label">ホーム</span>
        </button>
        <button className={'tab-item' + (activeTab === 'scan' ? ' active' : '')} onClick={() => setActiveTab('scan')}>
          <span className="tab-icon">📷</span>
          <span className="tab-label">スキャン</span>
        </button>
        <button className={'tab-item' + (activeTab === 'customers' ? ' active' : '')} onClick={() => setActiveTab('customers')}>
          <span className="tab-icon">👥</span>
          <span className="tab-label">顧客</span>
        </button>
        <button className={'tab-item' + (activeTab === 'jobs' ? ' active' : '')} onClick={() => setActiveTab('jobs')}>
          <span className="tab-icon">🛠️</span>
          <span className="tab-label">案件</span>
        </button>
        <button className={'tab-item' + (activeTab === 'stocktake' ? ' active' : '')} onClick={() => setActiveTab('stocktake')}>
          <span className="tab-icon">📋</span>
          <span className="tab-label">棚卸し</span>
        </button>
        <button className={'tab-item' + (activeTab === 'settings' ? ' active' : '')} onClick={() => setActiveTab('settings')}>
          <span className="tab-icon">⚙️</span>
          <span className="tab-label">設定</span>
        </button>
      </div>

      {/* ===== Scan Toast ===== */}
      {scanToast && (
        <div className={'global-toast' + (scanToast.ok === true ? ' ok' : scanToast.ok === 'new' ? ' info' : ' ng')} style={{ zIndex: 1300 }}>
          {scanToast.ok === true ? '✓ ' : scanToast.ok === 'new' ? '📝 ' : '✗ '}{scanToast.msg}
        </div>
      )}

      {/* ===== Scanner Modal ===== */}
      {showScanner && <BarcodeScanner onScan={handleScan} onClose={handleScanClose} />}

      {/* ===== Stocktake Scanner (continuous) ===== */}
      {stocktakeScanning && (
        <>
          <BarcodeScanner continuous={true} onScan={handleStocktakeScan} onClose={() => setStocktakeScanning(false)} />
          <div className="stocktake-scanner-overlay">
            {lastScanResult && (
              <div className={'stocktake-scanner-toast' + (lastScanResult.ok === true ? ' ok' : lastScanResult.ok === 'already' ? ' already' : ' ng')}>
                {lastScanResult.ok === true && <span>✓ {lastScanResult.name} 確認済！</span>}
                {lastScanResult.ok === 'already' && <span>⚠ {lastScanResult.name} は確認済です</span>}
                {lastScanResult.ok === false && <span>✗ 登録されていないバーコードです</span>}
              </div>
            )}
            <div className="stocktake-scanner-bottom">
              <div className="stocktake-scanner-counter">確認済: {confirmedIds.size} / {items.length} 件</div>
              {scanHistory.length > 0 && (
                <div className="stocktake-scanner-history">
                  {scanHistory.slice(0, 5).map((h, i) => (
                    <div key={h.id + '-' + i} className="stocktake-scanner-history-item">✓ {h.name}</div>
                  ))}
                </div>
              )}
              <button className="btn stocktake-scanner-done" onClick={() => setStocktakeScanning(false)}>スキャン完了</button>
            </div>
          </div>
        </>
      )}

      {/* ===== Image Viewer (Fullscreen) ===== */}
      {viewerImage && (
        <div className="image-viewer" onClick={() => setViewerImage(null)}>
          <button className="image-viewer-close" onClick={() => setViewerImage(null)}>✕</button>
          <img src={viewerImage} alt="" onClick={e => e.stopPropagation()} />
        </div>
      )}

      {/* ===== Detail Modal ===== */}
      {detailItem && (
        <div className="modal-bg" onClick={e => { if (e.target.className === 'modal-bg') setDetailItem(null) }}>
          <div className="modal">
            <div className="modal-header">
              <h2>物品詳細</h2>
              <button className="modal-close" onClick={() => setDetailItem(null)}>✕</button>
            </div>

            {detailItem.image_url && (
              <div className="detail-image-wrap" onClick={() => openViewer(detailItem.image_url)}>
                <img src={detailItem.image_url} alt={detailItem.name || ''} className="detail-image" onError={e => { e.target.style.display = 'none' }} />
              </div>
            )}

            <div className="detail-info">
              <div className="detail-info-row">
                <span className="detail-label">物品名</span>
                <span className="detail-value">{detailItem.name || '—'}</span>
              </div>
              <div className="detail-info-row">
                <span className="detail-label">カテゴリ</span>
                <span className="detail-value">{detailItem.cat ? <span className={'badge ' + BC[catIdx(detailItem.cat)]}>{detailItem.cat}</span> : '—'}</span>
              </div>
              <div className="detail-info-row">
                <span className="detail-label">バーコード</span>
                <span className="detail-value mono" style={{ wordBreak: 'break-all', fontSize: '12px' }}>
                  {detailItem.bc ? (
                    /^https?:\/\//i.test(detailItem.bc)
                      ? <a href={detailItem.bc} target="_blank" rel="noopener noreferrer" style={{ color: '#007AFF', textDecoration: 'underline' }}>{detailItem.bc}</a>
                      : detailItem.bc
                  ) : '—'}
                </span>
              </div>
              <div className="detail-info-row">
                <span className="detail-label">保管場所</span>
                <span className="detail-value">{detailItem.loc ? <span className="loc-pill">{detailItem.loc}</span> : '未設定'}</span>
              </div>
              <div className="detail-info-row">
                <span className="detail-label">状態</span>
                <span className="detail-value">
                  {detailItem.condition ? (
                    <span className="condition-badge" style={{ background: CONDITION_COLORS[detailItem.condition]?.bg || '#F1EFE8', color: CONDITION_COLORS[detailItem.condition]?.color || '#444' }}>{detailItem.condition}</span>
                  ) : '未指定'}
                </span>
              </div>
              <div className="detail-info-row">
                <span className="detail-label">単価</span>
                <span className="detail-value">{'¥' + (detailItem.price || 0).toLocaleString()}</span>
              </div>
              <div className="detail-info-row">
                <span className="detail-label">メモ</span>
                <span className="detail-value" style={{ whiteSpace: 'pre-wrap' }}>{detailItem.note || '—'}</span>
              </div>
              {detailItem.customer_id && (() => {
                const cust = customers.find(c => c.id === detailItem.customer_id)
                return cust ? (
                  <div className="detail-info-row">
                    <span className="detail-label">顧客</span>
                    <span className="detail-value">{cust.name}{cust.phone1 ? ' / ' + cust.phone1 : ''}</span>
                  </div>
                ) : null
              })()}
              <div className="detail-info-row">
                <span className="detail-label">ID</span>
                <span className="detail-value mono" style={{ fontSize: '11px' }}>{String(detailItem.id || '')}</span>
              </div>
            </div>

            <div className="modal-actions">
              <button className="btn" onClick={() => openEdit(detailItem)}>編集</button>
              <button className="btn danger" onClick={() => delItem(detailItem.id)}>削除</button>
            </div>
          </div>
        </div>
      )}

      {/* ===== Add/Edit Modal ===== */}
      {(showAdd || showEdit) && !formHidden && (
        <div className="modal-bg" onClick={e => { if (e.target.className === 'modal-bg') { setShowAdd(false); setShowEdit(false); setNameSuggest([]); setHasSubmitted(false) } }}>
          <div className="modal">
            <div className="modal-header">
              <h2>{showEdit ? '物品編集' : addPreset ? '追加登録（同一物品）' : '新規物品登録'}</h2>
              <button className="modal-close" onClick={() => { setShowAdd(false); setShowEdit(false); setNameSuggest([]); setImageFile(null); setImagePreview(null); setHasSubmitted(false) }}>✕</button>
            </div>

            <div className="field">
              <label>画像</label>
              <input ref={imageInputRef} type="file" accept="image/*" onChange={handleImageChange} style={{ display: 'none' }} />
              {imagePreview ? (
                <div className="image-preview-wrap">
                  <img src={imagePreview} alt="プレビュー" className="image-preview" onClick={() => openViewer(imagePreview)} />
                  <button type="button" className="image-remove-btn" onClick={() => { setImageFile(null); setImagePreview(null) }}>✕</button>
                  <button type="button" className="image-change-btn" onClick={() => imageInputRef.current?.click()}>変更</button>
                </div>
              ) : (
                <button type="button" className="image-upload-btn" onClick={() => imageInputRef.current?.click()}>
                  📷 タップして画像を選択
                </button>
              )}
            </div>

            <div className="field">
              <input ref={aiImageInputRef} type="file" accept="image/*" capture="environment" onChange={handleAiAnalyze} style={{ display: 'none' }} />
              <button type="button" className="ai-analyze-btn" onClick={() => aiImageInputRef.current?.click()} disabled={aiAnalyzing}>
                {aiAnalyzing ? '🤖 AI解析中...' : '📸 AI読取'}
              </button>
            </div>

            {/* Customer Selector */}
            <div className="field" style={{ position: 'relative' }}>
              <label>顧客</label>
              {selectedCustomerObj ? (
                <div className="selected-customer">
                  <span className="selected-customer-name">{selectedCustomerObj.name}</span>
                  {selectedCustomerObj.phone1 && <span className="selected-customer-phone">{selectedCustomerObj.phone1}</span>}
                  <button type="button" className="selected-customer-clear" onClick={() => { setItemCustomerId(null); setItemCustomerSearch('') }}>✕</button>
                </div>
              ) : showNewCustomerInItemForm ? (
                <div className="inline-customer-form">
                  <div className="inline-customer-header">
                    <span>新規顧客登録</span>
                    <button type="button" className="btn sm" onClick={() => setShowNewCustomerInItemForm(false)}>戻る</button>
                  </div>
                  <input ref={newCustomerImageRef} type="file" accept="image/*" capture="environment" onChange={(e) => handleCustomerAiAnalyze(e, newCustomerForm, setNewCustomerForm, setNewCustomerAiAnalyzing)} style={{ display: 'none' }} />
                  <button type="button" className="ai-analyze-btn sm" onClick={() => newCustomerImageRef.current?.click()} disabled={newCustomerAiAnalyzing}>
                    {newCustomerAiAnalyzing ? '🤖 解析中...' : '📷 画像から入力'}
                  </button>
                  <input type="text" value={newCustomerForm.name} onChange={e => setNewCustomerForm(f => ({ ...f, name: e.target.value }))} placeholder="顧客名 *" />
                  <input type="text" value={newCustomerForm.furigana} onChange={e => setNewCustomerForm(f => ({ ...f, furigana: e.target.value }))} placeholder="フリガナ" />
                  <div className="field-row compact">
                    <input type="tel" value={newCustomerForm.phone1} onChange={e => setNewCustomerForm(f => ({ ...f, phone1: e.target.value }))} placeholder="連絡先1" />
                    <input type="tel" value={newCustomerForm.phone2} onChange={e => setNewCustomerForm(f => ({ ...f, phone2: e.target.value }))} placeholder="連絡先2" />
                  </div>
                  <input type="tel" value={newCustomerForm.phone3} onChange={e => setNewCustomerForm(f => ({ ...f, phone3: e.target.value }))} placeholder="連絡先3" />
                  <input type="text" value={newCustomerForm.postal_code} onChange={e => setNewCustomerForm(f => ({ ...f, postal_code: e.target.value }))} placeholder="郵便番号" />
                  <input type="text" value={newCustomerForm.address} onChange={e => setNewCustomerForm(f => ({ ...f, address: e.target.value }))} placeholder="住所" />
                  <textarea value={newCustomerForm.memo} onChange={e => setNewCustomerForm(f => ({ ...f, memo: e.target.value }))} placeholder="メモ" rows={2} />
                  <button type="button" className="btn sm primary" onClick={async () => {
                    const cust = await saveCustomer(newCustomerForm, true)
                    if (cust) {
                      setItemCustomerId(cust.id)
                      setShowNewCustomerInItemForm(false)
                      setNewCustomerForm({ name: '', furigana: '', phone1: '', phone2: '', phone3: '', address: '', postal_code: '', memo: '' })
                    }
                  }}>登録</button>
                </div>
              ) : (
                <>
                  <input
                    type="text"
                    value={itemCustomerSearch}
                    onChange={e => { setItemCustomerSearch(e.target.value); setShowItemCustomerDropdown(true) }}
                    onFocus={() => setShowItemCustomerDropdown(true)}
                    placeholder="顧客を検索（名前・電話番号・住所）"
                    autoComplete="off"
                  />
                  {showItemCustomerDropdown && itemCustomerSearch.length >= 1 && (
                    <div className="suggest-box customer-suggest">
                      {itemCustomerResults.map(c => (
                        <div key={c.id} className="suggest-item" onMouseDown={() => {
                          setItemCustomerId(c.id); setItemCustomerSearch(''); setShowItemCustomerDropdown(false)
                        }}>
                          <span className="suggest-customer-name">{c.name}</span>
                          {c.phone1 && <span className="suggest-customer-sub">{c.phone1}</span>}
                          {c.address && <span className="suggest-customer-sub">{c.address.length > 15 ? c.address.slice(0, 15) + '...' : c.address}</span>}
                        </div>
                      ))}
                      {itemCustomerResults.length === 0 && <div className="suggest-item disabled">該当なし</div>}
                    </div>
                  )}
                  <button type="button" className="btn sm customer-new-btn" onClick={() => {
                    setShowNewCustomerInItemForm(true)
                    setNewCustomerForm({ name: '', furigana: '', phone1: '', phone2: '', phone3: '', address: '', postal_code: '', memo: '' })
                  }}>+ 新規顧客を登録</button>
                </>
              )}
            </div>

            <div className="field">
              <label>バーコード</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input type="text" value={form.bc} onChange={e => setForm(f => ({ ...f, bc: e.target.value }))} placeholder="バーコード番号（任意）" style={{ flex: 1 }} />
                <button className="scan-btn" onClick={() => openScanner('form')}>📷</button>
              </div>
            </div>
            {fetchingPart && (
              <div className="fetching-info">部品情報を取得中...</div>
            )}
            <div className="field" style={{ position: 'relative' }}>
              <label>物品名 *</label>
              <input type="text" value={form.name} onChange={e => handleNameInput(e.target.value)} placeholder="物品名を入力" autoComplete="off" />
              {nameSuggest.length > 0 && (
                <div className="suggest-box">
                  {nameSuggest.map(n => <div key={n} className="suggest-item" onMouseDown={() => selectSuggestion(n)}>{n}</div>)}
                </div>
              )}
            </div>
            <div className="field-row">
              <div className="field">
                <label>カテゴリ</label>
                <select value={form.cat} onChange={e => setForm(f => ({ ...f, cat: e.target.value }))}>
                  <option value="">未分類</option>
                  {categories.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="field">
                <label>ロケーション</label>
                <select value={form.loc} onChange={e => setForm(f => ({ ...f, loc: e.target.value }))}>
                  <option value="">未指定</option>
                  {locations.map(l => <option key={l.name} value={l.name}>{l.name}</option>)}
                </select>
              </div>
            </div>
            <div className="field-row">
              <div className="field">
                <label>状態</label>
                <select value={form.condition} onChange={e => setForm(f => ({ ...f, condition: e.target.value }))}>
                  <option value="">未指定</option>
                  {CONDITIONS.filter(c => c).map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="field">
                <label>単価（円）</label>
                <input type="number" value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} min="0" />
              </div>
            </div>
            <div className="field">
              <label>メモ</label>
              <textarea value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} placeholder="自由記入" rows={2} />
            </div>
            <p className="hint">※ 登録ごとに固有IDが割り当てられます（1登録=1点）</p>
            <div className="modal-actions">
              {hasSubmitted && !showEdit ? (
                <>
                  <p className="submit-success-msg">✓ 登録しました</p>
                  <button className="btn" onClick={() => {
                    setHasSubmitted(false)
                    setForm({ bc: '', name: '', cat: '', loc: '', price: 0, note: '', image_url: '', condition: '' })
                    setImageFile(null); setImagePreview(null); setNameSuggest([])
                  }}>続けて登録</button>
                  <button className="btn primary" onClick={() => { setShowAdd(false); setShowEdit(false); setNameSuggest([]); setImageFile(null); setImagePreview(null); setHasSubmitted(false) }}>閉じる</button>
                </>
              ) : (
                <>
                  <button className="btn" onClick={() => { setShowAdd(false); setShowEdit(false); setNameSuggest([]); setImageFile(null); setImagePreview(null); setHasSubmitted(false) }}>キャンセル</button>
                  <button
                    className="btn primary"
                    onClick={saveItem}
                    disabled={isSubmitting || (!showEdit && hasSubmitted)}
                  >
                    {showEdit
                      ? (isSubmitting ? '更新中...' : '更新')
                      : (isSubmitting ? '登録中...' : '登録')
                    }
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ===== Stocktake Search Modal ===== */}
      {showStocktakeSearch && (
        <div className="modal-bg" onClick={e => { if (e.target.className === 'modal-bg') setShowStocktakeSearch(false) }}>
          <div className="modal">
            <div className="modal-header">
              <h2>手動検索</h2>
              <button className="modal-close" onClick={() => setShowStocktakeSearch(false)}>✕</button>
            </div>
            <div className="field">
              <input
                type="text"
                value={stocktakeSearchQuery}
                onChange={e => setStocktakeSearchQuery(e.target.value)}
                placeholder="物品名・バーコード・カテゴリ・メモで検索..."
                autoFocus
              />
            </div>
            <div className="stocktake-search-results">
              {stocktakeSearchResults.map(item => (
                <div key={item.id} className={'stocktake-search-item' + (confirmedIds.has(item.id) ? ' confirmed' : '')}>
                  <div className="stocktake-item-left">
                    {item.image_url ? (
                      <img src={item.image_url} alt="" className="item-thumb"
                        onClick={(e) => openViewer(item.image_url, e)}
                        onError={e => { e.target.style.display = 'none' }} />
                    ) : (
                      <div className="item-thumb-empty">📦</div>
                    )}
                    <div className="stocktake-item-info">
                      <div className="stocktake-item-name">{item.name || '(名前なし)'}</div>
                      <div className="stocktake-item-sub">
                        {item.loc && <span className="loc-pill">{item.loc}</span>}
                      </div>
                    </div>
                  </div>
                  {confirmedIds.has(item.id) ? (
                    <span className="stocktake-already">確認済 ✓</span>
                  ) : (
                    <button className="btn sm primary" onClick={() => { confirmItemWithFeedback(item) }}>✓</button>
                  )}
                </div>
              ))}
              {stocktakeSearchQuery.length >= 1 && stocktakeSearchResults.length === 0 && (
                <div className="stocktake-no-result">該当なし</div>
              )}
              {stocktakeSearchQuery.length === 0 && (
                <div className="stocktake-no-result">物品名やバーコード番号を入力してください</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ===== Customer Form Modal (New) ===== */}
      {showCustomerForm && (
        <div className="modal-bg" onClick={e => { if (e.target.className === 'modal-bg') setShowCustomerForm(false) }}>
          <div className="modal">
            <div className="modal-header">
              <h2>新規顧客登録</h2>
              <button className="modal-close" onClick={() => setShowCustomerForm(false)}>✕</button>
            </div>
            <input ref={customerImageRef} type="file" accept="image/*" capture="environment" onChange={(e) => handleCustomerAiAnalyze(e, customerForm, setCustomerForm, setCustomerAiAnalyzing)} style={{ display: 'none' }} />
            <div className="field">
              <button type="button" className="ai-analyze-btn" onClick={() => customerImageRef.current?.click()} disabled={customerAiAnalyzing}>
                {customerAiAnalyzing ? '🤖 AI解析中...' : '📷 画像から入力'}
              </button>
            </div>
            <div className="field">
              <label>顧客名 *</label>
              <input type="text" value={customerForm.name} onChange={e => setCustomerForm(f => ({ ...f, name: e.target.value }))} placeholder="顧客名（会社名 or 個人名）" />
            </div>
            <div className="field">
              <label>フリガナ</label>
              <input type="text" value={customerForm.furigana} onChange={e => setCustomerForm(f => ({ ...f, furigana: e.target.value }))} placeholder="カタカナ" />
            </div>
            <div className="field">
              <label>連絡先1</label>
              <input type="tel" value={customerForm.phone1} onChange={e => setCustomerForm(f => ({ ...f, phone1: e.target.value }))} placeholder="電話番号（携帯優先）" />
            </div>
            <div className="field">
              <label>連絡先2</label>
              <input type="tel" value={customerForm.phone2} onChange={e => setCustomerForm(f => ({ ...f, phone2: e.target.value }))} placeholder="電話番号2" />
            </div>
            <div className="field">
              <label>連絡先3</label>
              <input type="tel" value={customerForm.phone3} onChange={e => setCustomerForm(f => ({ ...f, phone3: e.target.value }))} placeholder="電話番号3（FAXなど）" />
            </div>
            <div className="field">
              <label>郵便番号</label>
              <input type="text" value={customerForm.postal_code} onChange={e => setCustomerForm(f => ({ ...f, postal_code: e.target.value }))} placeholder="123-4567" />
            </div>
            <div className="field">
              <label>住所</label>
              <input type="text" value={customerForm.address} onChange={e => setCustomerForm(f => ({ ...f, address: e.target.value }))} placeholder="都道府県から番地まで" />
            </div>
            <div className="field">
              <label>メモ</label>
              <textarea value={customerForm.memo} onChange={e => setCustomerForm(f => ({ ...f, memo: e.target.value }))} placeholder="自由記入" rows={2} />
            </div>
            <div className="modal-actions">
              <button className="btn" onClick={() => setShowCustomerForm(false)}>キャンセル</button>
              <button className="btn primary" onClick={() => saveCustomer(customerForm)}>登録</button>
            </div>
          </div>
        </div>
      )}

      {/* ===== Customer Edit Modal ===== */}
      {showCustomerEdit && editCustomer && (
        <div className="modal-bg" onClick={e => { if (e.target.className === 'modal-bg') { setShowCustomerEdit(false); setEditCustomer(null) } }}>
          <div className="modal">
            <div className="modal-header">
              <h2>顧客編集</h2>
              <button className="modal-close" onClick={() => { setShowCustomerEdit(false); setEditCustomer(null) }}>✕</button>
            </div>
            <div className="field">
              <label>顧客名 *</label>
              <input type="text" value={customerForm.name} onChange={e => setCustomerForm(f => ({ ...f, name: e.target.value }))} placeholder="顧客名" />
            </div>
            <div className="field">
              <label>フリガナ</label>
              <input type="text" value={customerForm.furigana} onChange={e => setCustomerForm(f => ({ ...f, furigana: e.target.value }))} placeholder="カタカナ" />
            </div>
            <div className="field">
              <label>連絡先1</label>
              <input type="tel" value={customerForm.phone1} onChange={e => setCustomerForm(f => ({ ...f, phone1: e.target.value }))} placeholder="電話番号" />
            </div>
            <div className="field">
              <label>連絡先2</label>
              <input type="tel" value={customerForm.phone2} onChange={e => setCustomerForm(f => ({ ...f, phone2: e.target.value }))} placeholder="電話番号2" />
            </div>
            <div className="field">
              <label>連絡先3</label>
              <input type="tel" value={customerForm.phone3} onChange={e => setCustomerForm(f => ({ ...f, phone3: e.target.value }))} placeholder="電話番号3" />
            </div>
            <div className="field">
              <label>郵便番号</label>
              <input type="text" value={customerForm.postal_code} onChange={e => setCustomerForm(f => ({ ...f, postal_code: e.target.value }))} placeholder="123-4567" />
            </div>
            <div className="field">
              <label>住所</label>
              <input type="text" value={customerForm.address} onChange={e => setCustomerForm(f => ({ ...f, address: e.target.value }))} placeholder="住所" />
            </div>
            <div className="field">
              <label>メモ</label>
              <textarea value={customerForm.memo} onChange={e => setCustomerForm(f => ({ ...f, memo: e.target.value }))} placeholder="自由記入" rows={2} />
            </div>
            <div className="modal-actions">
              <button className="btn danger" onClick={() => deleteCustomer(editCustomer)}>削除</button>
              <button className="btn" onClick={() => { setShowCustomerEdit(false); setEditCustomer(null) }}>キャンセル</button>
              <button className="btn primary" onClick={updateCustomer}>更新</button>
            </div>
          </div>
        </div>
      )}

      {/* ===== Help Guide Modal ===== */}
      {showHelp && (
        <div className="help-overlay">
          <div className="help-page">
            <div className="help-header">
              <h2>📖 使い方ガイド</h2>
              <button className="modal-close" onClick={() => setShowHelp(false)}>✕</button>
            </div>
            <div className="help-body">
              {[
                { key: 'intro', icon: '🏁', title: 'はじめに', content: (
                  <div>
                    <p>このアプリでは以下のことができます：</p>
                    <ul>
                      <li><b>在庫管理</b> — 物品の登録・編集・削除・検索</li>
                      <li><b>バーコードスキャン</b> — QRコード/バーコードで素早く登録・検索</li>
                      <li><b>AI画像読み取り</b> — 写真から型番・価格などを自動入力</li>
                      <li><b>棚卸し</b> — スキャンや手動検索で在庫を確認</li>
                    </ul>
                    <p style={{ marginTop: 12 }}><b>画面構成（6つのタブ）：</b></p>
                    <ul>
                      <li>🏠 <b>ホーム</b> — 物品一覧・検索・フィルター</li>
                      <li>📷 <b>スキャン</b> — バーコードスキャンで新規登録</li>
                      <li>👥 <b>顧客</b> — 顧客情報の登録・編集・CSV入出力</li>
                      <li>🛠️ <b>案件</b> — 修理・出張案件の管理</li>
                      <li>📋 <b>棚卸し</b> — 棚卸しモードで在庫確認</li>
                      <li>⚙️ <b>設定</b> — カテゴリ・保管場所・ゴミ箱・データ管理</li>
                    </ul>
                  </div>
                )},
                { key: 'register', icon: '📝', title: '物品を登録する', content: (
                  <ol>
                    <li><b>「+」ボタン</b>またはスキャンタブから新規登録フォームを開きます</li>
                    <li><b>QRコード/バーコードスキャン</b> — スキャンタブでカメラアイコンをタップし、コードを読み取ると自動入力されます</li>
                    <li><b>AI画像読み取り</b> — 新規登録フォームで写真を撮影すると、AIが型番・部品名・価格などを自動で読み取ります</li>
                    <li><b>手動入力</b> — 物品名、カテゴリ、保管場所、単価、メモを手入力します</li>
                    <li><b>画像登録</b> — フォーム上部のカメラアイコンから物品の写真を撮影・添付できます</li>
                  </ol>
                )},
                { key: 'scan', icon: '📷', title: 'QRコードスキャン', content: (
                  <div>
                    <ol>
                      <li>スキャンタブのカメラアイコンをタップ</li>
                      <li>QRコード/バーコードにかざすと自動で読み取り</li>
                      <li>日立部品QRコードの場合は型番・部品名・価格が自動入力されます</li>
                    </ol>
                    <p style={{ marginTop: 8, color: 'var(--text3)', fontSize: 13 }}>💡 読み取れない場合はAI画像読み取りをお試しください</p>
                  </div>
                )},
                { key: 'ai', icon: '🤖', title: 'AI画像読み取り', content: (
                  <div>
                    <ol>
                      <li>新規登録フォームの画像エリアで写真を撮影</li>
                      <li>撮影後、自動でAIが文字を解析します</li>
                      <li>型番、部品名、価格などが自動入力されます</li>
                    </ol>
                    <p style={{ marginTop: 8, color: 'var(--text3)', fontSize: 13 }}>💡 読み取り精度が低い場合は、明るい場所で文字が鮮明に写るよう撮影してください。必要に応じて手動で修正できます。</p>
                  </div>
                )},
                { key: 'search', icon: '🔍', title: '物品を検索・閲覧する', content: (
                  <ul>
                    <li><b>検索バー</b> — 物品名・バーコード・カテゴリ・メモ・保管場所で検索できます</li>
                    <li><b>フィルター</b> — カテゴリ、ロケーション、ステータスで絞り込み</li>
                    <li><b>物品をタップ</b> — 展開して個別アイテムを表示</li>
                    <li><b>「詳細」ボタン</b> — 画像・メモ・バーコードなど全情報を表示</li>
                  </ul>
                )},
                { key: 'edit', icon: '✏️', title: '物品を編集・削除する', content: (
                  <ul>
                    <li>展開した行の<b>「編集」</b>ボタンで編集フォームを開きます</li>
                    <li><b>「削除」</b>ボタンで削除（確認ダイアログあり）</li>
                    <li>詳細モーダルからも編集・削除が可能です</li>
                  </ul>
                )},
                { key: 'stocktake', icon: '📋', title: '棚卸し', content: (
                  <ol>
                    <li>棚卸しタブをタップして<b>棚卸しモードを開始</b></li>
                    <li><b>「スキャンで確認」</b> → QRコードをスキャンして確認済みにする</li>
                    <li>スキャンできない場合は<b>「手動検索」</b>で物品名を検索して確認</li>
                    <li><b>未確認リスト</b>から直接チェックも可能</li>
                    <li><b>進捗バー</b>で確認状況をリアルタイムに確認</li>
                    <li><b>「終了」</b>ボタンで棚卸しモードを終了</li>
                  </ol>
                )},
                { key: 'settings', icon: '⚙️', title: '設定', content: (
                  <ul>
                    <li><b>CSV出力</b> — 在庫データをCSVファイルでエクスポート</li>
                    <li><b>ゴミ箱</b> — 削除した物品の確認・復元・完全削除</li>
                    <li><b>カテゴリ管理</b> — カテゴリの追加・削除</li>
                    <li><b>保管場所管理</b> — 保管場所の追加・削除・並べ替え</li>
                  </ul>
                )},
                { key: 'faq', icon: '❓', title: 'よくある質問（FAQ）', content: (
                  <div className="help-faq">
                    <div className="help-faq-item">
                      <div className="help-faq-q">Q: スキャンが反応しない</div>
                      <div className="help-faq-a">Safariで開いているか確認し、カメラの使用許可が有効になっているか確認してください。</div>
                    </div>
                    <div className="help-faq-item">
                      <div className="help-faq-q">Q: AI読取が失敗する</div>
                      <div className="help-faq-a">明るい場所で、文字が鮮明に写るように撮影してください。ブレや影があると精度が下がります。</div>
                    </div>
                    <div className="help-faq-item">
                      <div className="help-faq-q">Q: データが表示されない</div>
                      <div className="help-faq-a">画面を下に引っ張って更新するか、アプリを再読み込みしてください。</div>
                    </div>
                    <div className="help-faq-item">
                      <div className="help-faq-q">Q: iPhoneのホーム画面に追加したい</div>
                      <div className="help-faq-a">Safariの共有ボタン（□↑）をタップし、「ホーム画面に追加」を選択してください。</div>
                    </div>
                  </div>
                )},
              ].map(section => (
                <div key={section.key} className="help-section">
                  <div className="help-section-header" onClick={() => setHelpOpen(h => ({ ...h, [section.key]: !h[section.key] }))}>
                    <span className="help-section-icon">{section.icon}</span>
                    <span className="help-section-title">{section.title}</span>
                    <span className="help-section-chevron">{helpOpen[section.key] ? '▼' : '▶'}</span>
                  </div>
                  {helpOpen[section.key] && (
                    <div className="help-section-body">{section.content}</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ===== Job Form Modal ===== */}
      {showJobForm && (
        <div className="modal-bg" onClick={e => { if (e.target.className === 'modal-bg') setShowJobForm(false) }}>
          <div className="modal">
            <div className="modal-header">
              <h2>{editJob ? '案件を編集' : '新規案件'}</h2>
              <button className="modal-close" onClick={() => setShowJobForm(false)}>✕</button>
            </div>
            <div className="field">
              <label>案件名 *</label>
              <input type="text" value={jobForm.title} onChange={e => setJobForm(f => ({ ...f, title: e.target.value }))} placeholder="例: エアコン修理 / 冷蔵庫 出張点検" />
            </div>
            <div className="field">
              <label>ステータス</label>
              <select value={jobForm.status} onChange={e => setJobForm(f => ({ ...f, status: e.target.value }))}>
                {JOB_STATUSES.map(s => <option key={s} value={s}>{JOB_STATUS_LABELS[s]}</option>)}
              </select>
            </div>
            <div className="field" style={{ position: 'relative' }}>
              <label>顧客</label>
              {jobForm.customer_id ? (
                <div className="selected-customer">
                  <span className="selected-customer-name">{jobForm.customer_name || customers.find(c => c.id === jobForm.customer_id)?.name || '顧客'}</span>
                  <button type="button" className="selected-customer-clear" onClick={() => setJobForm(f => ({ ...f, customer_id: null, customer_name: '' }))}>✕</button>
                </div>
              ) : (
                <>
                  <input type="text" value={jobCustomerSearch} onChange={e => { setJobCustomerSearch(e.target.value); setShowJobCustDropdown(true) }} onFocus={() => setShowJobCustDropdown(true)} placeholder="顧客を検索（名前・電話）" autoComplete="off" />
                  {showJobCustDropdown && jobCustomerSearch.length >= 1 && (
                    <div className="suggest-box customer-suggest">
                      {jobCustomerResults.map(c => (
                        <div key={c.id} className="suggest-item" onMouseDown={() => { setJobForm(f => ({ ...f, customer_id: c.id, customer_name: c.name || '' })); setJobCustomerSearch(''); setShowJobCustDropdown(false) }}>
                          <span className="suggest-customer-name">{c.name}</span>
                          {c.phone1 && <span className="suggest-customer-sub">{c.phone1}</span>}
                        </div>
                      ))}
                      {jobCustomerResults.length === 0 && <div className="suggest-item disabled">該当なし（顧客タブで登録できます）</div>}
                    </div>
                  )}
                </>
              )}
            </div>
            <div className="field-row">
              <div className="field"><label>メーカー</label><input type="text" value={jobForm.maker} onChange={e => setJobForm(f => ({ ...f, maker: e.target.value }))} placeholder="日立 など" /></div>
              <div className="field"><label>型番</label><input type="text" value={jobForm.model_number} onChange={e => setJobForm(f => ({ ...f, model_number: e.target.value }))} /></div>
            </div>
            <div className="field">
              <label>製品名</label>
              <input type="text" value={jobForm.product_name} onChange={e => setJobForm(f => ({ ...f, product_name: e.target.value }))} placeholder="エアコン / 冷蔵庫 など" />
            </div>
            <div className="field">
              <label>症状・依頼内容</label>
              <textarea value={jobForm.failure_detail} onChange={e => setJobForm(f => ({ ...f, failure_detail: e.target.value }))} rows={2} />
            </div>
            <div className="field-row">
              <div className="field"><label>訪問予定</label><input type="datetime-local" value={jobForm.scheduled_at} onChange={e => setJobForm(f => ({ ...f, scheduled_at: e.target.value }))} /></div>
              <div className="field"><label>次回訪問</label><input type="datetime-local" value={jobForm.next_visit_at} onChange={e => setJobForm(f => ({ ...f, next_visit_at: e.target.value }))} /></div>
            </div>
            <div className="field-row">
              <div className="field"><label>保証期限</label><input type="date" value={jobForm.warranty_end_date} onChange={e => setJobForm(f => ({ ...f, warranty_end_date: e.target.value }))} /></div>
              <div className="field"><label>金額（円）</label><input type="number" value={jobForm.amount_yen} onChange={e => setJobForm(f => ({ ...f, amount_yen: e.target.value }))} min="0" placeholder="未定" /></div>
            </div>
            <div className="field">
              <label>メモ</label>
              <textarea value={jobForm.notes} onChange={e => setJobForm(f => ({ ...f, notes: e.target.value }))} rows={2} />
            </div>

            {editJob ? (
              <div className="field">
                <label>使用部品（在庫から引当）</label>
                {jobParts.length > 0 && (
                  <div className="job-parts-list">
                    {jobParts.map(p => (
                      <div key={p.id} className="job-part-row">
                        <span className="job-part-name">{p.name || '(名称なし)'}</span>
                        <input className="job-part-qty" type="number" min="1" value={p.qty} onChange={e => updateJobPartQty(p, e.target.value)} />
                        <span className="job-part-price">¥{((p.unit_price || 0) * (p.qty || 1)).toLocaleString()}</span>
                        <button type="button" className="del-x" onClick={() => removeJobPart(p.id)}>×</button>
                      </div>
                    ))}
                    <div className="job-parts-total">
                      <span>部品小計</span>
                      <span>¥{jobPartsTotal.toLocaleString()}</span>
                      <button type="button" className="btn sm" onClick={() => setJobForm(f => ({ ...f, amount_yen: String(jobPartsTotal) }))}>金額に反映</button>
                    </div>
                  </div>
                )}
                <div style={{ position: 'relative' }}>
                  <input type="text" value={jobPartSearch} onChange={e => { setJobPartSearch(e.target.value); setShowJobPartDropdown(true) }} onFocus={() => setShowJobPartDropdown(true)} placeholder="物品名・バーコードで検索して追加" autoComplete="off" />
                  {showJobPartDropdown && jobPartSearch.length >= 1 && (
                    <div className="suggest-box">
                      {jobPartResults.map(i => (
                        <div key={i.id} className="suggest-item" onMouseDown={() => addJobPart(i)}>
                          <span className="suggest-customer-name">{i.name || '(名前なし)'}</span>
                          <span className="suggest-customer-sub">¥{(i.price || 0).toLocaleString()}{i.loc ? ' / ' + i.loc : ''}</span>
                        </div>
                      ))}
                      {jobPartResults.length === 0 && <div className="suggest-item disabled">該当なし</div>}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <p className="hint">使用部品は、案件を登録した後に追加できます。</p>
            )}

            <div className="modal-actions">
              {editJob && <button className="btn danger" onClick={() => deleteJob(editJob)}>削除</button>}
              <button className="btn" onClick={() => setShowJobForm(false)}>キャンセル</button>
              <button className="btn primary" onClick={saveJob}>{editJob ? '更新' : '登録'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ===== Trash Modal ===== */}
      {showTrash && (
        <div className="modal-bg" onClick={e => { if (e.target.className === 'modal-bg') setShowTrash(false) }}>
          <div className="modal">
            <div className="modal-header">
              <h2>🗑️ ゴミ箱</h2>
              <button className="modal-close" onClick={() => setShowTrash(false)}>✕</button>
            </div>
            <p className="hint">削除した物品は30日後に自動で完全削除されます。それまでは復元できます。</p>
            {trashItems.length > 0 && (
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
                <button className="btn sm danger" onClick={emptyTrash}>ゴミ箱を空にする</button>
              </div>
            )}
            <div className="stocktake-list">
              {trashItems.length === 0 ? (
                <div className="stocktake-done">ゴミ箱は空です</div>
              ) : trashItems.map(item => (
                <div key={item.id} className="stocktake-item">
                  <div className="stocktake-item-left">
                    {item.image_url ? (
                      <img src={item.image_url} alt="" className="item-thumb"
                        onClick={(e) => openViewer(item.image_url, e)}
                        onError={e => { e.target.style.display = 'none' }} />
                    ) : (
                      <div className="item-thumb-empty">📦</div>
                    )}
                    <div className="stocktake-item-info">
                      <div className="stocktake-item-name">{item.name || '(名前なし)'}</div>
                      <div className="stocktake-item-sub">
                        {item.loc && <span className="loc-pill">{item.loc}</span>}
                        {item.deleted_at && <span className="mono">{new Date(item.deleted_at).toLocaleDateString('ja-JP')} 削除</span>}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="btn sm primary" onClick={() => restoreItem(item.id)}>復元</button>
                    <button className="btn sm danger" onClick={() => purgeItem(item)}>完全削除</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

    </div>
    </ErrorBoundary>
  )
}
