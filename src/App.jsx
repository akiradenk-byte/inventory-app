import { useState, useEffect, useCallback, useRef, Component } from 'react'
import { supabase } from './supabase'
import BarcodeScanner from './BarcodeScanner'
import './App.css'

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

// 日立ドメイン判定
function isHitachiUrl(code) {
  try {
    const u = new URL(code)
    const h = u.hostname.toLowerCase()
    return h.includes('hitachi-gls') || h.includes('hitachi-cm') || h.includes('hitachi.co.jp')
  } catch { return false }
}

export default function App() {
  const [items, setItems] = useState([])
  const [categories, setCategories] = useState([])
  const [locations, setLocations] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [catFilter, setCatFilter] = useState('')
  const [locFilter, setLocFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [expanded, setExpanded] = useState({})
  const [page, setPage] = useState(0)
  const PAGE = 30

  const [showAdd, setShowAdd] = useState(false)
  const [showEdit, setShowEdit] = useState(false)
  const [showScanner, setShowScanner] = useState(false)
  const [showMasterInline, setShowMasterInline] = useState(false)
  const [scanTarget, setScanTarget] = useState('search')
  const [formHidden, setFormHidden] = useState(false)
  const [editItem, setEditItem] = useState(null)
  const [addPreset, setAddPreset] = useState(null)

  const [form, setForm] = useState({ bc: '', name: '', cat: '', loc: '', price: 0, note: '', image_url: '' })
  const [newCat, setNewCat] = useState('')
  const [newLoc, setNewLoc] = useState('')
  const [nameSuggest, setNameSuggest] = useState([])
  const [masterTab, setMasterTab] = useState('category')

  // 画像関連
  const [imageFile, setImageFile] = useState(null)
  const [imagePreview, setImagePreview] = useState(null)
  const imageInputRef = useRef(null)

  // 詳細モーダル
  const [detailItem, setDetailItem] = useState(null)

  // 部品情報取得中
  const [fetchingPart, setFetchingPart] = useState(false)

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

  const getGroups = () => {
    try {
      const q = search.toLowerCase()
      const filtered = items.filter(i => {
        if (q && !(i.name || '').toLowerCase().includes(q) && !(i.bc || '').toLowerCase().includes(q)) return false
        if (catFilter && i.cat !== catFilter) return false
        if (locFilter && i.loc !== locFilter) return false
        if (statusFilter === 'instock' && !i.loc) return false
        if (statusFilter === 'noloc' && i.loc) return false
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

  // 日立URLの部品情報をAPIで取得
  const fetchHitachiPartInfo = async (url) => {
    try {
      setFetchingPart(true)
      const resp = await fetch('/api/fetch-part-info?url=' + encodeURIComponent(url))
      if (!resp.ok) {
        console.error('fetch-part-info error:', resp.status)
        return null
      }
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

            // APIで詳細情報を非同期取得
            fetchHitachiPartInfo(urlStr).then(info => {
              if (info && (info.partName || info.referenceNo || info.price)) {
                setForm(f => ({
                  ...f,
                  name: info.partName ? (pno.toUpperCase() + ' ' + info.partName) : f.name,
                  note: [
                    info.referenceNo ? '照合番号: ' + info.referenceNo : '',
                    info.price ? '希望価格: ' + info.price : '',
                    info.partNo ? '部品番号: ' + info.partNo : '',
                  ].filter(Boolean).join(' / '),
                }))
              }
            })
          }
        } catch (e) {
          // URL解析失敗は無視
        }

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

  // 画像アップロード
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
      note: (form.note || '').trim()
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
    // 画像アップロード
    if (savedId && imageFile) {
      const url = await uploadImage(savedId, imageFile)
      if (url) {
        await supabase.from('items').update({ image_url: url }).eq('id', savedId)
      }
    } else if (savedId && imagePreview === null && editItem?.image_url) {
      // 画像削除
      await supabase.from('items').update({ image_url: null }).eq('id', savedId)
    }
    setShowAdd(false); setShowEdit(false); setEditItem(null)
    setForm({ bc: '', name: '', cat: '', loc: '', price: 0, note: '', image_url: '' })
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
    setForm({ bc: g.bc, name: g.name, cat: g.cat, loc: '', price: g.items[0]?.price || 0, note: '', image_url: '' })
    setAddPreset(g); setImageFile(null); setImagePreview(null); setShowAdd(true)
  }

  const openAdd = () => {
    setForm({ bc: '', name: '', cat: categories[0] || '', loc: '', price: 0, note: '', image_url: '' })
    setAddPreset(null); setImageFile(null); setImagePreview(null); setShowAdd(true)
  }

  const openEdit = (item) => {
    setEditItem(item)
    setForm({ bc: item.bc || '', name: item.name || '', cat: item.cat || '', loc: item.loc || '', price: item.price || 0, note: item.note || '', image_url: item.image_url || '' })
    setImageFile(null)
    setImagePreview(item.image_url || null)
    setDetailItem(null)
    setShowEdit(true)
  }

  const openDetail = (item) => {
    setDetailItem(item)
  }

  const kinds = new Set(items.map(i => (i.name || '') + '_' + (i.bc || ''))).size
  const totalVal = items.reduce((s, i) => s + (i.price || 0), 0)

  // 安全なID表示
  const shortId = (id) => {
    try {
      return String(id || '').slice(0, 8)
    } catch { return '?' }
  }

  if (loading) return <div className="loading">読み込み中...</div>

  return (
    <ErrorBoundary>
    <div className="app">
      <div className="topbar">
        <h1>在庫管理</h1>
        <button className="btn" onClick={() => setShowMasterInline(!showMasterInline)}>
          {showMasterInline ? '✕ マスター閉じる' : '⚙ マスター管理'}
        </button>
        <button className="btn" onClick={exportCSV}>CSV出力</button>
        <button className="btn primary" onClick={openAdd}>+ 新規登録</button>
      </div>

      <div className="stats">
        <div className="stat"><div className="lbl">総登録点数</div><div className="val">{items.length}</div></div>
        <div className="stat"><div className="lbl">物品種類数</div><div className="val">{kinds}</div></div>
        <div className="stat"><div className="lbl">在庫総額</div><div className="val sm">{'¥' + totalVal.toLocaleString()}</div></div>
        <div className="stat"><div className="lbl">カテゴリ数</div><div className="val">{categories.length}</div></div>
      </div>

      {showMasterInline && (
        <div className="master-panel">
          <div className="master-tabs">
            <button className={'master-tab' + (masterTab === 'category' ? ' active' : '')} onClick={() => setMasterTab('category')}>カテゴリ管理</button>
            <button className={'master-tab' + (masterTab === 'location' ? ' active' : '')} onClick={() => setMasterTab('location')}>保管場所管理</button>
          </div>
          {masterTab === 'category' && (
            <div className="master-content">
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
            <div className="master-content">
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
      )}

      <div className="toolbar">
        <input type="text" placeholder="物品名・バーコードで検索..." value={search} onChange={e => { setSearch(e.target.value); setPage(0) }} />
        <button className="scan-btn" onClick={() => openScanner('search')}>📷 スキャン</button>
        <select value={catFilter} onChange={e => { setCatFilter(e.target.value); setPage(0) }}>
          <option value="">全カテゴリ</option>
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={locFilter} onChange={e => { setLocFilter(e.target.value); setPage(0) }}>
          <option value="">全ロケーション</option>
          {locations.map(l => <option key={l} value={l}>{l}</option>)}
        </select>
        <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(0) }}>
          <option value="">全ステータス</option>
          <option value="instock">保管場所あり</option>
          <option value="noloc">保管場所なし</option>
        </select>
      </div>

      <div className="tbl-wrap">
        <table>
          <thead><tr>
            <th></th><th>物品</th><th>ロケーション</th><th>ステータス</th><th>操作</th>
          </tr></thead>
          <tbody>
            {sliced.map(g => {
              const key = (g.name || '') + '||' + (g.bc || '')
              const isOpen = !!expanded[key]
              const locs = [...new Set((g.items || []).map(i => i.loc).filter(Boolean))]
              const firstItem = g.items?.[0]
              return [
                <tr key={key} className="group-row" onClick={() => setExpanded(e => ({ ...e, [key]: !e[key] }))}>
                  <td>
                    <div className="group-left">
                      {firstItem?.image_url && (
                        <img src={firstItem.image_url} alt="" className="item-thumb" onError={e => { e.target.style.display = 'none' }} />
                      )}
                      <span className={'arrow' + (isOpen ? ' open' : '')}>▶</span>
                    </div>
                  </td>
                  <td className="name-cell">
                    <div>{g.name || '(名前なし)'}</div>
                    <div className="sub-info">
                      {g.cat && <span className={'badge sm ' + BC[catIdx(g.cat)]}>{g.cat}</span>}
                      {g.bc && <span className="mono">{g.bc.length > 30 ? g.bc.slice(0, 30) + '...' : g.bc}</span>}
                      <span className="count-badge">{(g.items || []).length + '点'}</span>
                    </div>
                  </td>
                  <td>{locs.length > 0 ? locs.map(l => <span key={l} className="loc-pill">{l}</span>) : <span className="no-loc">未設定</span>}</td>
                  <td><span className="status-badge instock">在庫あり</span></td>
                  <td>
                    <div className="action-cell">
                      <button className="btn sm primary" onClick={e => { e.stopPropagation(); openAddSame(g) }}>+ 追加</button>
                      <button className="btn sm danger" onClick={e => { e.stopPropagation(); delProduct(g) }}>全削除</button>
                    </div>
                  </td>
                </tr>,
                ...(isOpen ? (g.items || []).map(i => (
                  <tr key={i.id || Math.random()} className="detail-row" onClick={() => openDetail(i)}>
                    <td></td>
                    <td>
                      <div className="detail-id">{'ID: ' + shortId(i.id) + '...'}</div>
                      {i.note && <div className="detail-note">{'📝 ' + i.note}</div>}
                    </td>
                    <td><span className="loc-pill white">{i.loc || '未設定'}</span></td>
                    <td><span className="price">{'¥' + (i.price || 0).toLocaleString()}</span></td>
                    <td>
                      <div className="action-cell">
                        <button className="btn sm" onClick={e => { e.stopPropagation(); openEdit(i) }}>編集</button>
                        <button className="btn sm danger" onClick={e => { e.stopPropagation(); delItem(i.id) }}>削除</button>
                      </div>
                    </td>
                  </tr>
                )) : [])
              ]
            })}
          </tbody>
        </table>
        {sliced.length === 0 && <div className="empty">該当する物品がありません</div>}
      </div>

      {totalGroups > PAGE && (
        <div className="pager">
          <button disabled={page === 0} onClick={() => setPage(p => p - 1)}>前へ</button>
          <span>{(page + 1) + ' / ' + (maxPage + 1) + ' ページ（' + totalGroups + '種類）'}</span>
          <button disabled={page === maxPage} onClick={() => setPage(p => p + 1)}>次へ</button>
        </div>
      )}
      {totalGroups <= PAGE && <div className="pager"><span>{totalGroups + '種類 / ' + items.length + '点'}</span></div>}

      {showScanner && <BarcodeScanner onScan={handleScan} onClose={handleScanClose} />}

      {/* 物品詳細モーダル */}
      {detailItem && (
        <div className="modal-bg" onClick={e => { if (e.target.className === 'modal-bg') setDetailItem(null) }}>
          <div className="modal">
            <div className="modal-header">
              <h2>物品詳細</h2>
              <button className="modal-close" onClick={() => setDetailItem(null)}>✕</button>
            </div>

            {detailItem.image_url && (
              <div className="detail-image-wrap">
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

      {/* 登録・編集モーダル */}
      {(showAdd || showEdit) && !formHidden && (
        <div className="modal-bg" onClick={e => { if (e.target.className === 'modal-bg') { setShowAdd(false); setShowEdit(false); setNameSuggest([]) } }}>
          <div className="modal">
            <div className="modal-header">
              <h2>{showEdit ? '物品編集' : addPreset ? '追加登録（同一物品）' : '新規物品登録'}</h2>
              <button className="modal-close" onClick={() => { setShowAdd(false); setShowEdit(false); setNameSuggest([]); setImageFile(null); setImagePreview(null) }}>✕</button>
            </div>

            {/* 画像 */}
            <div className="field">
              <label>画像</label>
              <input ref={imageInputRef} type="file" accept="image/*" onChange={handleImageChange} style={{ display: 'none' }} />
              {imagePreview ? (
                <div className="image-preview-wrap">
                  <img src={imagePreview} alt="プレビュー" className="image-preview" />
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
              <div style={{ display: 'flex', gap: 6 }}>
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
            <div className="field">
              <label>単価（円）</label>
              <input type="number" value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} min="0" />
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
    </div>
    </ErrorBoundary>
  )
}
