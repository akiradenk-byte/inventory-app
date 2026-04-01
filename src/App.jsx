import { useState, useEffect, useCallback } from 'react'
import { supabase } from './supabase'
import BarcodeScanner from './BarcodeScanner'
import './App.css'

const BC = ['b0','b1','b2','b3','b4','b5','b6','b7','b8']

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

  const [form, setForm] = useState({ bc: '', name: '', cat: '', loc: '', price: 0, note: '' })
  const [newCat, setNewCat] = useState('')
  const [newLoc, setNewLoc] = useState('')
  const [nameSuggest, setNameSuggest] = useState([])
  const [masterTab, setMasterTab] = useState('category')

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
    const q = search.toLowerCase()
    const filtered = items.filter(i => {
      if (q && !i.name.toLowerCase().includes(q) && !(i.bc || '').toLowerCase().includes(q)) return false
      if (catFilter && i.cat !== catFilter) return false
      if (locFilter && i.loc !== locFilter) return false
      if (statusFilter === 'instock' && !i.loc) return false
      if (statusFilter === 'noloc' && i.loc) return false
      return true
    })
    const map = {}
    filtered.forEach(i => {
      const key = i.name + '||' + (i.bc || '')
      if (!map[key]) map[key] = { name: i.name, bc: i.bc || '', cat: i.cat, items: [] }
      map[key].items.push(i)
    })
    return Object.values(map)
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

  const handleScan = useCallback((code) => {
    setShowScanner(false)
    if (scanTarget === 'search') {
      setSearch(code)
      setPage(0)
    } else {
      setFormHidden(false)
      setForm(f => ({ ...f, bc: code }))
    }
  }, [scanTarget])

  const handleScanClose = () => {
    setShowScanner(false)
    setFormHidden(false)
  }

  const saveItem = async () => {
    if (!form.name.trim()) { alert('\u7269\u54c1\u540d\u306f\u5fc5\u9808\u3067\u3059'); return }
    const data = {
      bc: form.bc || '',
      name: form.name.trim(),
      cat: form.cat || '',
      loc: form.loc || '',
      price: parseInt(form.price) || 0,
      note: form.note.trim()
    }
    if (editItem) {
      const { error } = await supabase.from('items').update(data).eq('id', editItem.id)
      if (error) { alert('\u66f4\u65b0\u30a8\u30e9\u30fc: ' + error.message); return }
    } else {
      const { error } = await supabase.from('items').insert(data)
      if (error) { alert('\u767b\u9332\u30a8\u30e9\u30fc: ' + error.message); return }
    }
    setShowAdd(false); setShowEdit(false); setEditItem(null)
    setForm({ bc: '', name: '', cat: '', loc: '', price: 0, note: '' })
    setNameSuggest([])
    fetchAll()
  }

  const delItem = async (id) => {
    if (!confirm('\u3053\u306e1\u70b9\u3092\u524a\u9664\u3057\u307e\u3059\u304b\uff1f')) return
    await supabase.from('transactions').delete().eq('unit_id', id)
    const { error } = await supabase.from('items').delete().eq('id', id)
    if (error) { alert('\u524a\u9664\u30a8\u30e9\u30fc: ' + error.message); return }
    fetchAll()
  }

  const delProduct = async (g) => {
    if (!confirm('\u300c' + g.name + '\u300d\u306e\u5168' + g.items.length + '\u70b9\u3092\u524a\u9664\u3057\u307e\u3059\u304b\uff1f')) return
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
    if (!confirm('\u30ab\u30c6\u30b4\u30ea\u300c' + name + '\u300d\u3092\u524a\u9664\u3057\u307e\u3059\u304b\uff1f')) return
    await supabase.from('categories').delete().eq('name', name); fetchAll()
  }
  const addLoc = async () => {
    if (!newLoc.trim() || locations.includes(newLoc.trim())) return
    await supabase.from('locations').insert({ name: newLoc.trim() })
    setNewLoc(''); fetchAll()
  }
  const delLoc = async (name) => {
    if (!confirm('\u4fdd\u7ba1\u5834\u6240\u300c' + name + '\u300d\u3092\u524a\u9664\u3057\u307e\u3059\u304b\uff1f')) return
    await supabase.from('locations').delete().eq('name', name); fetchAll()
  }

  const exportCSV = () => {
    const header = 'ID,\u30d0\u30fc\u30b3\u30fc\u30c9,\u7269\u54c1\u540d,\u30ab\u30c6\u30b4\u30ea,\u4fdd\u7ba1\u5834\u6240,\u5358\u4fa1,\u30e1\u30e2,\u767b\u9332\u65e5\u6642'
    const rows = items.map(i => [
      i.id, i.bc, '"' + i.name + '"', i.cat, i.loc, i.price, '"' + (i.note || '') + '"', i.created_at
    ].join(','))
    const csv = '\uFEFF' + [header, ...rows].join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    a.download = '\u5728\u5eab_' + new Date().toISOString().slice(0, 10) + '.csv'
    a.click()
  }

  const handleNameInput = (v) => {
    setForm(f => ({ ...f, name: v }))
    if (!v) { setNameSuggest([]); return }
    const names = [...new Set(items.map(i => i.name))]
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
    setForm({ bc: g.bc, name: g.name, cat: g.cat, loc: '', price: g.items[0]?.price || 0, note: '' })
    setAddPreset(g); setShowAdd(true)
  }

  const openAdd = () => {
    setForm({ bc: '', name: '', cat: categories[0] || '', loc: '', price: 0, note: '' })
    setAddPreset(null); setShowAdd(true)
  }

  const openEdit = (item) => {
    setEditItem(item)
    setForm({ bc: item.bc, name: item.name, cat: item.cat, loc: item.loc, price: item.price, note: item.note || '' })
    setShowEdit(true)
  }

  const kinds = new Set(items.map(i => i.name + '_' + (i.bc || ''))).size
  const totalVal = items.reduce((s, i) => s + (i.price || 0), 0)

  if (loading) return <div className="loading">{'\u8aad\u307f\u8fbc\u307f\u4e2d...'}</div>

  return (
    <div className="app">
      <div className="topbar">
        <h1>{'\u5728\u5eab\u7ba1\u7406'}</h1>
        <button className="btn" onClick={() => setShowMasterInline(!showMasterInline)}>
          {showMasterInline ? '\u2715 \u30de\u30b9\u30bf\u30fc\u9589\u3058\u308b' : '\u2699 \u30de\u30b9\u30bf\u30fc\u7ba1\u7406'}
        </button>
        <button className="btn" onClick={exportCSV}>{'CSV\u51fa\u529b'}</button>
        <button className="btn primary" onClick={openAdd}>{'+ \u65b0\u898f\u767b\u9332'}</button>
      </div>

      <div className="stats">
        <div className="stat"><div className="lbl">{'\u7dcf\u767b\u9332\u70b9\u6570'}</div><div className="val">{items.length}</div></div>
        <div className="stat"><div className="lbl">{'\u7269\u54c1\u7a2e\u985e\u6570'}</div><div className="val">{kinds}</div></div>
        <div className="stat"><div className="lbl">{'\u5728\u5eab\u7dcf\u984d'}</div><div className="val sm">{'\u00a5' + totalVal.toLocaleString()}</div></div>
        <div className="stat"><div className="lbl">{'\u30ab\u30c6\u30b4\u30ea\u6570'}</div><div className="val">{categories.length}</div></div>
      </div>

      {showMasterInline && (
        <div className="master-panel">
          <div className="master-tabs">
            <button className={'master-tab' + (masterTab === 'category' ? ' active' : '')} onClick={() => setMasterTab('category')}>{'\u30ab\u30c6\u30b4\u30ea\u7ba1\u7406'}</button>
            <button className={'master-tab' + (masterTab === 'location' ? ' active' : '')} onClick={() => setMasterTab('location')}>{'\u4fdd\u7ba1\u5834\u6240\u7ba1\u7406'}</button>
          </div>
          {masterTab === 'category' && (
            <div className="master-content">
              <div className="master-add">
                <input type="text" value={newCat} onChange={e => setNewCat(e.target.value)} placeholder={'\u65b0\u3057\u3044\u30ab\u30c6\u30b4\u30ea\u540d'} onKeyDown={e => e.key === 'Enter' && addCat()} />
                <button className="btn sm primary" onClick={addCat}>{'\u8ffd\u52a0'}</button>
              </div>
              <div className="master-list">
                {categories.map((c, i) => (
                  <div key={c} className="master-item">
                    <span className={'badge ' + BC[i % BC.length]}>{c}</span>
                    <button className="del-x" onClick={() => delCat(c)}>{'\u00d7'}</button>
                  </div>
                ))}
                {categories.length === 0 && <div className="master-empty">{'\u30ab\u30c6\u30b4\u30ea\u304c\u3042\u308a\u307e\u305b\u3093'}</div>}
              </div>
            </div>
          )}
          {masterTab === 'location' && (
            <div className="master-content">
              <div className="master-add">
                <input type="text" value={newLoc} onChange={e => setNewLoc(e.target.value)} placeholder={'\u65b0\u3057\u3044\u4fdd\u7ba1\u5834\u6240\u540d'} onKeyDown={e => e.key === 'Enter' && addLoc()} />
                <button className="btn sm primary" onClick={addLoc}>{'\u8ffd\u52a0'}</button>
              </div>
              <div className="master-list">
                {locations.map(l => (
                  <div key={l} className="master-item">
                    <span className="master-loc">{l}</span>
                    <button className="del-x" onClick={() => delLoc(l)}>{'\u00d7'}</button>
                  </div>
                ))}
                {locations.length === 0 && <div className="master-empty">{'\u4fdd\u7ba1\u5834\u6240\u304c\u3042\u308a\u307e\u305b\u3093'}</div>}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="toolbar">
        <input type="text" placeholder={'\u7269\u54c1\u540d\u30fb\u30d0\u30fc\u30b3\u30fc\u30c9\u3067\u691c\u7d22...'} value={search} onChange={e => { setSearch(e.target.value); setPage(0) }} />
        <button className="scan-btn" onClick={() => openScanner('search')}>{'\ud83d\udcf7 \u30b9\u30ad\u30e3\u30f3'}</button>
        <select value={catFilter} onChange={e => { setCatFilter(e.target.value); setPage(0) }}>
          <option value="">{'\u5168\u30ab\u30c6\u30b4\u30ea'}</option>
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={locFilter} onChange={e => { setLocFilter(e.target.value); setPage(0) }}>
          <option value="">{'\u5168\u30ed\u30b1\u30fc\u30b7\u30e7\u30f3'}</option>
          {locations.map(l => <option key={l} value={l}>{l}</option>)}
        </select>
        <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(0) }}>
          <option value="">{'\u5168\u30b9\u30c6\u30fc\u30bf\u30b9'}</option>
          <option value="instock">{'\u4fdd\u7ba1\u5834\u6240\u3042\u308a'}</option>
          <option value="noloc">{'\u4fdd\u7ba1\u5834\u6240\u306a\u3057'}</option>
        </select>
      </div>

      <div className="tbl-wrap">
        <table>
          <thead><tr>
            <th></th><th>{'\u7269\u54c1'}</th><th>{'\u30ed\u30b1\u30fc\u30b7\u30e7\u30f3'}</th><th>{'\u30b9\u30c6\u30fc\u30bf\u30b9'}</th><th>{'\u64cd\u4f5c'}</th>
          </tr></thead>
          <tbody>
            {sliced.map(g => {
              const key = g.name + '||' + g.bc
              const isOpen = !!expanded[key]
              const locs = [...new Set(g.items.map(i => i.loc).filter(Boolean))]
              return [
                <tr key={key} className="group-row" onClick={() => setExpanded(e => ({ ...e, [key]: !e[key] }))}>
                  <td><span className={'arrow' + (isOpen ? ' open' : '')}>{'\u25b6'}</span></td>
                  <td className="name-cell">
                    <div>{g.name}</div>
                    <div className="sub-info">
                      {g.cat && <span className={'badge sm ' + BC[catIdx(g.cat)]}>{g.cat}</span>}
                      {g.bc && <span className="mono">{g.bc}</span>}
                      <span className="count-badge">{g.items.length + '\u70b9'}</span>
                    </div>
                  </td>
                  <td>{locs.length > 0 ? locs.map(l => <span key={l} className="loc-pill">{l}</span>) : <span className="no-loc">{'\u672a\u8a2d\u5b9a'}</span>}</td>
                  <td><span className="status-badge instock">{'\u5728\u5eab\u3042\u308a'}</span></td>
                  <td>
                    <div className="action-cell">
                      <button className="btn sm primary" onClick={e => { e.stopPropagation(); openAddSame(g) }}>{'+ \u8ffd\u52a0'}</button>
                      <button className="btn sm danger" onClick={e => { e.stopPropagation(); delProduct(g) }}>{'\u5168\u524a\u9664'}</button>
                    </div>
                  </td>
                </tr>,
                ...(isOpen ? g.items.map(i => (
                  <tr key={i.id} className="detail-row">
                    <td></td>
                    <td>
                      <div className="detail-id">{'ID: ' + i.id.slice(0, 8) + '...'}</div>
                      {i.note && <div className="detail-note">{'\ud83d\udcdd ' + i.note}</div>}
                    </td>
                    <td><span className="loc-pill white">{i.loc || '\u672a\u8a2d\u5b9a'}</span></td>
                    <td><span className="price">{'\u00a5' + (i.price || 0).toLocaleString()}</span></td>
                    <td>
                      <div className="action-cell">
                        <button className="btn sm" onClick={() => openEdit(i)}>{'\u7de8\u96c6'}</button>
                        <button className="btn sm danger" onClick={() => delItem(i.id)}>{'\u524a\u9664'}</button>
                      </div>
                    </td>
                  </tr>
                )) : [])
              ]
            })}
          </tbody>
        </table>
        {sliced.length === 0 && <div className="empty">{'\u8a72\u5f53\u3059\u308b\u7269\u54c1\u304c\u3042\u308a\u307e\u305b\u3093'}</div>}
      </div>

      {totalGroups > PAGE && (
        <div className="pager">
          <button disabled={page === 0} onClick={() => setPage(p => p - 1)}>{'\u524d\u3078'}</button>
          <span>{(page + 1) + ' / ' + (maxPage + 1) + ' \u30da\u30fc\u30b8\uff08' + totalGroups + '\u7a2e\u985e\uff09'}</span>
          <button disabled={page === maxPage} onClick={() => setPage(p => p + 1)}>{'\u6b21\u3078'}</button>
        </div>
      )}
      {totalGroups <= PAGE && <div className="pager"><span>{totalGroups + '\u7a2e\u985e / ' + items.length + '\u70b9'}</span></div>}

      {showScanner && <BarcodeScanner onScan={handleScan} onClose={handleScanClose} />}

      {(showAdd || showEdit) && !formHidden && (
        <div className="modal-bg" onClick={e => { if (e.target.className === 'modal-bg') { setShowAdd(false); setShowEdit(false); setNameSuggest([]) } }}>
          <div className="modal">
            <div className="modal-header">
              <h2>{showEdit ? '\u7269\u54c1\u7de8\u96c6' : addPreset ? '\u8ffd\u52a0\u767b\u9332\uff08\u540c\u4e00\u7269\u54c1\uff09' : '\u65b0\u898f\u7269\u54c1\u767b\u9332'}</h2>
              <button className="modal-close" onClick={() => { setShowAdd(false); setShowEdit(false); setNameSuggest([]) }}>{'\u2715'}</button>
            </div>
            <div className="field">
              <label>{'\u30d0\u30fc\u30b3\u30fc\u30c9'}</label>
              <div style={{ display: 'flex', gap: 6 }}>
                <input type="text" value={form.bc} onChange={e => setForm(f => ({ ...f, bc: e.target.value }))} placeholder={'\u30d0\u30fc\u30b3\u30fc\u30c9\u756a\u53f7\uff08\u4efb\u610f\uff09'} style={{ flex: 1 }} />
                <button className="scan-btn" onClick={() => openScanner('form')}>{'\ud83d\udcf7'}</button>
              </div>
            </div>
            <div className="field" style={{ position: 'relative' }}>
              <label>{'\u7269\u54c1\u540d *'}</label>
              <input type="text" value={form.name} onChange={e => handleNameInput(e.target.value)} placeholder={'\u7269\u54c1\u540d\u3092\u5165\u529b'} autoComplete="off" />
              {nameSuggest.length > 0 && (
                <div className="suggest-box">
                  {nameSuggest.map(n => <div key={n} className="suggest-item" onMouseDown={() => selectSuggestion(n)}>{n}</div>)}
                </div>
              )}
            </div>
            <div className="field-row">
              <div className="field">
                <label>{'\u30ab\u30c6\u30b4\u30ea'}</label>
                <select value={form.cat} onChange={e => setForm(f => ({ ...f, cat: e.target.value }))}>
                  <option value="">{'\u672a\u5206\u985e'}</option>
                  {categories.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="field">
                <label>{'\u30ed\u30b1\u30fc\u30b7\u30e7\u30f3'}</label>
                <select value={form.loc} onChange={e => setForm(f => ({ ...f, loc: e.target.value }))}>
                  <option value="">{'\u672a\u6307\u5b9a'}</option>
                  {locations.map(l => <option key={l} value={l}>{l}</option>)}
                </select>
              </div>
            </div>
            <div className="field">
              <label>{'\u5358\u4fa1\uff08\u5186\uff09'}</label>
              <input type="number" value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} min="0" />
            </div>
            <div className="field">
              <label>{'\u30e1\u30e2'}</label>
              <textarea value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} placeholder={'\u81ea\u7531\u8a18\u5165'} rows={2} />
            </div>
            <p className="hint">{'\u203b \u767b\u9332\u3054\u3068\u306b\u56fa\u6709ID\u304c\u5272\u308a\u5f53\u3066\u3089\u308c\u307e\u3059\uff081\u767b\u9332=1\u70b9\uff09'}</p>
            <div className="modal-actions">
              <button className="btn" onClick={() => { setShowAdd(false); setShowEdit(false); setNameSuggest([]) }}>{'\u30ad\u30e3\u30f3\u30bb\u30eb'}</button>
              <button className="btn primary" onClick={saveItem}>{showEdit ? '\u66f4\u65b0' : '\u767b\u9332'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}