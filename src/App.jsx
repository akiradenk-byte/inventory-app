import { useState, useEffect, useCallback, useRef, Component } from 'react'
import { supabase } from './supabase'
import BarcodeScanner from './BarcodeScanner'
import './App.css'

// ===== ログイン画面 =====
function LoginScreen() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [loading, setLoading] = useState(false)
  const [isSignUp, setIsSignUp] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setSuccess('')
    setLoading(true)

    if (isSignUp) {
      if (password.length < 6) {
        setError('パスワードは6文字以上で入力してください')
        setLoading(false)
        return
      }
      const { error: signUpError } = await supabase.auth.signUp({ email, password })
      setLoading(false)
      if (signUpError) {
        setError('登録に失敗しました: ' + signUpError.message)
      } else {
        setSuccess('確認メールを送信しました。メール内のリンクをクリックしてから、ログインしてください。')
        setIsSignUp(false)
      }
    } else {
      const { error: authError } = await supabase.auth.signInWithPassword({ email, password })
      setLoading(false)
      if (authError) {
        setError('ログインに失敗しました: ' + authError.message)
      }
    }
  }

  return (
    <div className="login-screen">
      <div className="login-card">
        <img src="/icon-192.png" alt="在庫管理" className="login-logo" />
        <h1 className="login-title">在庫管理</h1>
        <p className="login-subtitle">{isSignUp ? '新規アカウント登録' : 'ログインしてください'}</p>
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
              placeholder={isSignUp ? '6文字以上のパスワード' : 'パスワード'}
              autoComplete={isSignUp ? 'new-password' : 'current-password'}
              required
            />
          </div>
          {error && <div className="login-error">{error}</div>}
          {success && <div className="login-success">{success}</div>}
          <button type="submit" className="btn primary login-btn" disabled={loading}>
            {loading ? '処理中...' : (isSignUp ? '新規登録' : 'ログイン')}
          </button>
        </form>
        <button className="login-switch" onClick={() => { setIsSignUp(!isSignUp); setError(''); setSuccess('') }}>
          {isSignUp ? 'アカウントをお持ちの方はこちら' : '新規アカウント登録はこちら'}
        </button>
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

function isHitachiUrl(code) {
  try {
    const u = new URL(code)
    const h = u.hostname.toLowerCase()
    return h.includes('hitachi-gls') || h.includes('hitachi-cm') || h.includes('hitachi.co.jp')
  } catch { return false }
}

export default function App() {
  // Auth
  const [session, setSession] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s)
      setAuthLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s)
      if (!s) setAuthLoading(false)
    })
    return () => subscription.unsubscribe()
  }, [])

  const handleLogout = async () => {
    if (!confirm('ログアウトしますか？')) return
    await supabase.auth.signOut()
    setSession(null)
  }

  if (authLoading) return <div className="loading">読み込み中...</div>
  if (!session) return <LoginScreen />

  return <AppMain session={session} onLogout={handleLogout} />
}

function AppMain({ session, onLogout }) {
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

  // Fullscreen image viewer
  const [viewerImage, setViewerImage] = useState(null)

  // Part info fetching
  const [fetchingPart, setFetchingPart] = useState(false)

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

  // Pull to refresh
  const [pullDistance, setPullDistance] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const touchStartY = useRef(0)
  const contentRef = useRef(null)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    const [{ data: itemsData }, { data: catsData }, { data: locsData }] = await Promise.all([
      supabase.from('items').select('*').order('created_at', { ascending: false }),
      supabase.from('categories').select('*').order('name'),
      supabase.from('locations').select('*').order('name'),
    ])
    setItems(itemsData || [])
    setCategories((catsData || []).map(c => c.name))
    setLocations((locsData || []).map(l => l.name))
    setLoading(false)
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  // Pull to refresh handlers
  const handleTouchStart = (e) => {
    if (contentRef.current && contentRef.current.scrollTop === 0) {
      touchStartY.current = e.touches[0].clientY
    } else {
      touchStartY.current = 0
    }
  }

  const handleTouchMove = (e) => {
    if (!touchStartY.current) return
    const diff = e.touches[0].clientY - touchStartY.current
    if (diff > 0 && diff < 120) {
      setPullDistance(diff)
    }
  }

  const handleTouchEnd = async () => {
    if (pullDistance > 60) {
      setRefreshing(true)
      setPullDistance(0)
      await fetchAll()
      setRefreshing(false)
    } else {
      setPullDistance(0)
    }
    touchStartY.current = 0
  }

  const getGroups = () => {
    try {
      const q = search.toLowerCase()
      const filtered = items.filter(i => {
        if (q && !(i.name || '').toLowerCase().includes(q) && !(i.bc || '').toLowerCase().includes(q)) return false
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

  const fetchHitachiPartInfo = async (url) => {
    try {
      setFetchingPart(true)
      const resp = await fetch('/api/fetch-part-info?url=' + encodeURIComponent(url))
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
      if (scanTarget === 'search') {
        setSearch(code)
        setPage(0)
        setActiveTab('home')
      } else {
        const urlStr = (code || '').trim()
        let name = ''
        let cat = ''
        let note = ''

        try {
          const url = new URL(urlStr.toLowerCase().startsWith('http') ? urlStr : 'http://' + urlStr)
          const hostname = url.hostname.toLowerCase()

          if (hostname.includes('hitachi-gls') || hostname.includes('hitachi-cm')) {
            const params = url.searchParams
            const pno = params.get('pno') || params.get('PNO') || params.get('Pno') || ''
            const cno = params.get('cno') || params.get('CNO') || params.get('Cno') || ''

            if (pno) {
              name = pno.toUpperCase() + (cno ? ' ' + cno : '')
              cat = 'HITACHI'
            }

            fetchHitachiPartInfo(urlStr).then(info => {
              if (info && (info.partName || info.referenceNo || info.price)) {
                // 価格を数値に変換 (例: "¥6,050" → 6050)
                let priceNum = 0
                if (info.price) {
                  const priceMatch = info.price.replace(/[¥￥,\s]/g, '').match(/\d+/)
                  if (priceMatch) priceNum = parseInt(priceMatch[0], 10)
                }
                setForm(f => ({
                  ...f,
                  name: info.partName ? (pno.toUpperCase() + ' ' + info.partName) : f.name,
                  ...(priceNum > 0 ? { price: priceNum } : {}),
                  note: [
                    info.partName ? '部品名: ' + info.partName : '',
                    info.referenceNo ? '照合番号: ' + info.referenceNo : '',
                  ].filter(Boolean).join(' / '),
                }))
              }
            })
          }
        } catch (e) {}

        setForm(f => ({
          ...f,
          bc: code,
          ...(name ? { name } : {}),
          ...(cat ? { cat } : {}),
          ...(note ? { note } : {}),
        }))
      }
    } catch (err) {
      console.error('handleScan error:', err)
      alert('スキャンエラー: ' + err.message)
    }
  }, [scanTarget])

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

  const saveItem = async () => {
    if (!(form.name || '').trim()) { alert('物品名は必須です'); return }
    const data = {
      bc: form.bc || '',
      name: (form.name || '').trim(),
      cat: form.cat || '',
      loc: form.loc || '',
      price: parseInt(form.price) || 0,
      note: (form.note || '').trim(),
      condition: form.condition || null,
    }
    let savedId = null
    if (editItem) {
      const { error } = await supabase.from('items').update(data).eq('id', editItem.id)
      if (error) { alert('更新エラー: ' + error.message); return }
      savedId = editItem.id
    } else {
      const { data: newItem, error } = await supabase.from('items').insert(data).select().single()
      if (error) { alert('登録エラー: ' + error.message); return }
      savedId = newItem?.id
    }
    if (savedId && imageFile) {
      const url = await uploadImage(savedId, imageFile)
      if (url) {
        await supabase.from('items').update({ image_url: url }).eq('id', savedId)
      }
    } else if (savedId && imagePreview === null && editItem?.image_url) {
      await supabase.from('items').update({ image_url: null }).eq('id', savedId)
    }
    setShowAdd(false); setShowEdit(false); setEditItem(null)
    setForm({ bc: '', name: '', cat: '', loc: '', price: 0, note: '', image_url: '', condition: '' })
    setNameSuggest([])
    setImageFile(null)
    setImagePreview(null)
    fetchAll()
  }

  const delItem = async (id) => {
    if (!confirm('この1点を削除しますか？')) return
    await supabase.from('transactions').delete().eq('unit_id', id)
    const { error } = await supabase.from('items').delete().eq('id', id)
    if (error) { alert('削除エラー: ' + error.message); return }
    setDetailItem(null)
    fetchAll()
  }

  const delProduct = async (g) => {
    if (!confirm('「' + g.name + '」の全' + g.items.length + '点を削除しますか？')) return
    for (const item of g.items) {
      await supabase.from('transactions').delete().eq('unit_id', item.id)
      await supabase.from('items').delete().eq('id', item.id)
    }
    fetchAll()
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
    if (!newLoc.trim() || locations.includes(newLoc.trim())) return
    await supabase.from('locations').insert({ name: newLoc.trim() })
    setNewLoc(''); fetchAll()
  }
  const delLoc = async (name) => {
    if (!confirm('保管場所「' + name + '」を削除しますか？')) return
    await supabase.from('locations').delete().eq('name', name); fetchAll()
  }

  const exportCSV = () => {
    const header = 'ID,バーコード,物品名,カテゴリ,保管場所,単価,メモ,登録日時'
    const rows = items.map(i => [
      i.id, i.bc, '"' + (i.name || '') + '"', i.cat, i.loc, i.price, '"' + (i.note || '') + '"', i.created_at
    ].join(','))
    const csv = '\uFEFF' + [header, ...rows].join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    a.download = '在庫_' + new Date().toISOString().slice(0, 10) + '.csv'
    a.click()
  }

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
    setForm({ bc: '', name: '', cat: categories[0] || '', loc: '', price: 0, note: '', image_url: '' })
    setAddPreset(null); setImageFile(null); setImagePreview(null); setShowAdd(true)
  }

  const openEdit = (item) => {
    setEditItem(item)
    setForm({ bc: item.bc || '', name: item.name || '', cat: item.cat || '', loc: item.loc || '', price: item.price || 0, note: item.note || '', image_url: item.image_url || '', condition: item.condition || '' })
    setImageFile(null)
    setImagePreview(item.image_url || null)
    setDetailItem(null)
    setShowEdit(true)
  }

  const openDetail = (item) => { setDetailItem(item) }

  const kinds = new Set(items.map(i => (i.name || '') + '_' + (i.bc || ''))).size
  const totalVal = items.reduce((s, i) => s + (i.price || 0), 0)

  const shortId = (id) => {
    try { return String(id || '').slice(0, 8) }
    catch { return '?' }
  }

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
    const matched = items.filter(i =>
      (i.bc && i.bc.toLowerCase() === codeLower) ||
      (i.bc && codeLower.includes(i.bc.toLowerCase())) ||
      (i.bc && i.bc.toLowerCase().includes(codeLower))
    )

    if (matched.length > 0) {
      matched.forEach(i => confirmItem(i.id))
      const first = matched[0]
      setScanHistory(prev => [first, ...prev.filter(h => h.id !== first.id)].slice(0, 5))
      if (navigator.vibrate) navigator.vibrate(200)
      setLastScanResult({ ok: true, name: first.name, count: matched.length, image_url: first.image_url })
    } else {
      if (navigator.vibrate) navigator.vibrate([100, 50, 100])
      setLastScanResult({ ok: false, code: code.length > 40 ? code.slice(0, 40) + '...' : code })
    }

    if (lastScanTimerRef.current) clearTimeout(lastScanTimerRef.current)
    lastScanTimerRef.current = setTimeout(() => setLastScanResult(null), 2500)
  }, [items])

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
            {activeTab === 'settings' && '設定'}
          </div>
          <div className="header-actions">
            {activeTab === 'home' && (
              <button className="btn icon-btn" onClick={openAdd}>+</button>
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
                  placeholder="物品名・バーコードで検索..."
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
                {locations.map(l => <option key={l} value={l}>{l}</option>)}
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
      {(pullDistance > 0 || refreshing) && (
        <div className="pull-indicator" style={{ height: refreshing ? 40 : Math.min(pullDistance * 0.5, 40) }}>
          {refreshing ? <div className="pull-spinner" /> : (pullDistance > 60 ? '↻ 離して更新' : '↓ 引いて更新')}
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
                      <div key={i.id || Math.random()} className="detail-card" onClick={() => openDetail(i)}>
                        <div className="item-info">
                          <div className="detail-id">{'ID: ' + shortId(i.id) + '...'}</div>
                          {i.note && <div className="detail-note">{'📝 ' + i.note}</div>}
                        </div>
                        <span className="loc-pill">{i.loc || '未設定'}</span>
                        <span className="price">{'¥' + (i.price || 0).toLocaleString()}</span>
                        <div className="action-cell">
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
              setForm({ bc: '', name: '', cat: categories[0] || '', loc: '', price: 0, note: '', image_url: '' })
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
                      const cnt = items.filter(i => !confirmedIds.has(i.id) && i.loc === l).length
                      return <option key={l} value={l}>{l} ({cnt}件)</option>
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
                  <div className="master-list">
                    {locations.map(l => (
                      <div key={l} className="master-item">
                        <span className="master-loc">{l}</span>
                        <button className="del-x" onClick={() => delLoc(l)}>×</button>
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
                <span className="settings-row-label" style={{ fontSize: 13 }}>{session?.user?.email || '—'}</span>
              </div>
              <div className="settings-row" onClick={onLogout}>
                <span className="settings-row-icon">🚪</span>
                <span className="settings-row-label" style={{ color: 'var(--danger)' }}>ログアウト</span>
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
        <button className={'tab-item' + (activeTab === 'stocktake' ? ' active' : '')} onClick={() => setActiveTab('stocktake')}>
          <span className="tab-icon">📋</span>
          <span className="tab-label">棚卸し</span>
        </button>
        <button className={'tab-item' + (activeTab === 'settings' ? ' active' : '')} onClick={() => setActiveTab('settings')}>
          <span className="tab-icon">⚙️</span>
          <span className="tab-label">設定</span>
        </button>
      </div>

      {/* ===== Scanner Modal ===== */}
      {showScanner && <BarcodeScanner onScan={handleScan} onClose={handleScanClose} />}

      {/* ===== Stocktake Scanner (continuous) ===== */}
      {stocktakeScanning && (
        <BarcodeScanner continuous={true} onScan={handleStocktakeScan} onClose={() => setStocktakeScanning(false)} />
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
                <span className="detail-value mono" style={{ wordBreak: 'break-all', fontSize: '12px' }}>{detailItem.bc || '—'}</span>
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
        <div className="modal-bg" onClick={e => { if (e.target.className === 'modal-bg') { setShowAdd(false); setShowEdit(false); setNameSuggest([]) } }}>
          <div className="modal">
            <div className="modal-header">
              <h2>{showEdit ? '物品編集' : addPreset ? '追加登録（同一物品）' : '新規物品登録'}</h2>
              <button className="modal-close" onClick={() => { setShowAdd(false); setShowEdit(false); setNameSuggest([]); setImageFile(null); setImagePreview(null) }}>✕</button>
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
                  {locations.map(l => <option key={l} value={l}>{l}</option>)}
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
              <button className="btn" onClick={() => { setShowAdd(false); setShowEdit(false); setNameSuggest([]); setImageFile(null); setImagePreview(null) }}>キャンセル</button>
              <button className="btn primary" onClick={saveItem}>{showEdit ? '更新' : '登録'}</button>
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
                placeholder="物品名・バーコードで検索..."
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

    </div>
    </ErrorBoundary>
  )
}
