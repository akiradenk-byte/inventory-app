import { useState, useEffect, useCallback } from 'react'
import { supabase } from './supabase'
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
  const [expanded, setExpanded] = useState({})
  const [page, setPage] = useState(0)
  const PAGE = 30

  // モーダル状態
  const [showAdd, setShowAdd] = useState(false)
  const [showEdit, setShowEdit] = useState(false)
  const [showMaster, setShowMaster] = useState(false)
  const [editItem, setEditItem] = useState(null)
  const [addPreset, setAddPreset] = useState(null)

  // フォーム
  const [form, setForm] = useState({ bc: '', name: '', cat: '', loc: '', price: 0, note: '' })
  const [newCat, setNewCat] = useState('')
  const [newLoc, setNewLoc] = useState('')
  const [nameSuggest, setNameSuggest] = useState([])

  // データ取得
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

  // グループ化
  const getGroups = () => {
    const q = search.toLowerCase()
    const filtered = items.filter(i => {
      if (q && !i.name.toLowerCase().includes(q) && !i.bc.includes(q)) return false
      if (catFilter && i.cat !== catFilter) return false
      if (locFilter && i.loc !== locFilter) return false
      return true
    })
    const map = {}
    filtered.forEach(i => {
      const key = i.name + '||' + i.bc
      if (!map[key]) map[key] = { name: i.name, bc: i.bc, cat: i.cat, items: [] }
      map[key].items.push(i)
    })
    return Object.values(map)
  }

  const groups = getGroups()
  const totalGroups = groups.length
  const maxPage = Math.max(0, Math.ceil(totalGroups / PAGE) - 1)
  const sliced = groups.slice(page * PAGE, (page + 1) * PAGE)

  const catIdx = c => { const i = categories.indexOf(c); return i < 0 ? 0 : i % BC.length }

  // 商品保存
  const saveItem = async () => {
    if (!form.name.trim()) { alert('商品名は必須です'); return }
    const data = { bc: form.bc || 'BC' + Date.now(), name: form.name.trim(), cat: form.cat || categories[0] || '', loc: form.loc || locations[0] || '', price: parseInt(form.price) || 0, note: form.note.trim() }
    if (editItem) {
      await supabase.from('items').update(data).eq('id', editItem.id)
    } else {
      await supabase.from('items').insert(data)
    }
    setShowAdd(false); setShowEdit(false); setEditItem(null)
    setForm({ bc: '', name: '', cat: '', loc: '', price: 0, note: '' })
    fetchAll()
  }

  // 商品削除
  const delItem = async (id) => {
    if (!confirm('この1点を削除しますか？')) return
    await supabase.from('items').delete().eq('id', id)
    fetchAll()
  }

  // カテゴリ・場所追加
  const addCat = async () => {
    if (!newCat.trim() || categories.includes(newCat.trim())) return
    await supabase.from('categories').insert({ name: newCat.trim() })
    setNewCat(''); fetchAll()
  }
  const addLoc = async () => {
    if (!newLoc.trim() || locations.includes(newLoc.trim())) return
    await supabase.from('locations').insert({ name: newLoc.trim() })
    setNewLoc(''); fetchAll()
  }
  const delCat = async (name) => {
    await supabase.from('categories').delete().eq('name', name)
    fetchAll()
  }
  const delLoc = async (name) => {
    await supabase.from('locations').delete().eq('name', name)
    fetchAll()
  }

  // CSV出力
  const exportCSV = () => {
    const header = 'ID,バーコード,商品名,カテゴリ,保管場所,単価,メモ'
    const rows = items.map(i => [i.id, i.bc, `"${i.name}"`, i.cat, i.loc, i.price, `"${i.note}"`].join(','))
    const csv = '\uFEFF' + [header, ...rows].join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    a.download = '在庫_' + new Date().toISOString().slice(0, 10) + '.csv'
    a.click()
  }

  // 名前サジェスト
  const handleNameInput = (v) => {
    setForm(f => ({ ...f, name: v }))
    if (!v) { setNameSuggest([]); return }
    const names = [...new Set(items.map(i => i.name))].filter(n => n.toLowerCase().includes(v.toLowerCase()) && n.toLowerCase() !== v.toLowerCase()).slice(0, 5)
    setNameSuggest(names)
  }

  // 追加登録（同一商品）
  const openAddSame = (g) => {
    setForm({ bc: g.bc, name: g.name, cat: g.cat, loc: locations[0] || '', price: g.items[0]?.price || 0, note: '' })
    setAddPreset(g)
    setShowAdd(true)
  }

  const openAdd = () => {
    setForm({ bc: '', name: '', cat: categories[0] || '', loc: locations[0] || '', price: 0, note: '' })
    setAddPreset(null)
    setShowAdd(true)
  }

  const openEdit = (item) => {
    setEditItem(item)
    setForm({ bc: item.bc, name: item.name, cat: item.cat, loc: item.loc, price: item.price, note: item.note })
    setShowEdit(true)
  }

  // 統計
  const kinds = new Set(items.map(i => i.name + '_' + i.bc)).size
  const totalVal = items.reduce((s, i) => s + i.price, 0)

  if (loading) return <div className="loading">読み込み中...</div>

  return (
    <div className="app">
      {/* ヘッダー */}
      <div className="topbar">
        <h1>在庫管理</h1>
        <button className="btn" onClick={() => setShowMaster(true)}>マスター管理</button>
        <button className="btn" onClick={exportCSV}>CSV出力</button>
        <button className="btn primary" onClick={openAdd}>+ 商品登録</button>
      </div>

      {/* 統計 */}
      <div className="stats">
        <div className="stat"><div className="lbl">総登録点数</div><div className="val">{items.length}</div></div>
        <div className="stat"><div className="lbl">商品種類数</div><div className="val">{kinds}</div></div>
        <div className="stat"><div className="lbl">在庫総額</div><div className="val sm">¥{totalVal.toLocaleString()}</div></div>
        <div className="stat"><div className="lbl">カテゴリ数</div><div className="val">{categories.length}</div></div>
      </div>

      {/* 検索 */}
      <div className="toolbar">
        <input type="text" placeholder="商品名・バーコードで検索..." value={search} onChange={e => { setSearch(e.target.value); setPage(0) }} />
        <select value={catFilter} onChange={e => { setCatFilter(e.target.value); setPage(0) }}>
          <option value="">全カテゴリ</option>
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={locFilter} onChange={e => { setLocFilter(e.target.value); setPage(0) }}>
          <option value="">全保管場所</option>
          {locations.map(l => <option key={l} value={l}>{l}</option>)}
        </select>
      </div>

      {/* テーブル */}
      <div className="tbl-wrap">
        <table>
          <thead><tr>
            <th></th>
            <th>商品名</th>
            <th>バーコード</th>
            <th>カテゴリ</th>
            <th>点数</th>
            <th>保管場所</th>
            <th>操作</th>
          </tr></thead>
          <tbody>
            {sliced.map(g => {
              const key = g.name + '||' + g.bc
              const isOpen = !!expanded[key]
              const locs = [...new Set(g.items.map(i => i.loc))]
              return [
                <tr key={key} className="group-row" onClick={() => setExpanded(e => ({ ...e, [key]: !e[key] }))}>
                  <td><span className={`arrow${isOpen ? ' open' : ''}`}>▶</span></td>
                  <td className="name-cell">{g.name}</td>
                  <td className="mono">{g.bc}</td>
                  <td><span className={`badge ${BC[catIdx(g.cat)]}`}>{g.cat}</span></td>
                  <td><span className="count-badge">{g.items.length}</span></td>
                  <td>{locs.map(l => <span key={l} className="loc-pill">{l}</span>)}</td>
                  <td><button className="btn sm primary" onClick={e => { e.stopPropagation(); openAddSame(g) }}>+ 追加登録</button></td>
                </tr>,
                ...(isOpen ? g.items.map(i => (
                  <tr key={i.id} className="detail-row">
                    <td></td>
                    <td className="detail-note">{i.note || '—'}</td>
                    <td></td><td></td><td></td>
                    <td><span className="loc-pill white">{i.loc}</span> <span className="price">¥{i.price.toLocaleString()}</span></td>
                    <td>
                      <div className="action-cell">
                        <button className="btn sm" onClick={() => openEdit(i)}>編集</button>
                        <button className="btn sm danger" onClick={() => delItem(i.id)}>削除</button>
                      </div>
                    </td>
                  </tr>
                )) : [])
              ]
            })}
          </tbody>
        </table>
        {sliced.length === 0 && <div className="empty">該当する商品がありません</div>}
      </div>

      {/* ページネーション */}
      {totalGroups > PAGE && (
        <div className="pager">
          <button disabled={page === 0} onClick={() => setPage(p => p - 1)}>前へ</button>
          <span>{page + 1} / {maxPage + 1} ページ（{totalGroups}種類）</span>
          <button disabled={page === maxPage} onClick={() => setPage(p => p + 1)}>次へ</button>
        </div>
      )}
      {totalGroups <= PAGE && <div className="pager"><span>{totalGroups}種類 / {items.length}点</span></div>}

      {/* 商品登録・編集モーダル */}
      {(showAdd || showEdit) && (
        <div className="modal-bg" onClick={e => { if (e.target.className === 'modal-bg') { setShowAdd(false); setShowEdit(false); setNameSuggest([]) } }}>
          <div className="modal">
            <h2>{showEdit ? '個別編集' : addPreset ? '追加登録（同一商品）' : '商品登録'}</h2>
            <div className="field">
              <label>バーコード</label>
              <input type="text" value={form.bc} onChange={e => setForm(f => ({ ...f, bc: e.target.value }))} placeholder="バーコード番号（任意）" />
            </div>
            <div className="field" style={{ position: 'relative' }}>
              <label>商品名 *</label>
              <input type="text" value={form.name} onChange={e => handleNameInput(e.target.value)} placeholder="商品名" autoComplete="off" />
              {nameSuggest.length > 0 && (
                <div className="suggest-box">
                  {nameSuggest.map(n => <div key={n} className="suggest-item" onMouseDown={() => { setForm(f => ({ ...f, name: n })); setNameSuggest([]) }}>{n}</div>)}
                </div>
              )}
            </div>
            <div className="field-row">
              <div className="field">
                <label>カテゴリ</label>
                <select value={form.cat} onChange={e => setForm(f => ({ ...f, cat: e.target.value }))}>
                  {categories.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="field">
                <label>保管場所</label>
                <select value={form.loc} onChange={e => setForm(f => ({ ...f, loc: e.target.value }))}>
                  {locations.map(l => <option key={l} value={l}>{l}</option>)}
                </select>
              </div>
            </div>
            <div className="field"><label>単価（円）</label><input type="number" value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} min="0" /></div>
            <div className="field"><label>メモ</label><input type="text" value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} placeholder="任意" /></div>
            <p className="hint">※ 同じ商品名・バーコードでも別の保管場所として重複登録できます</p>
            <div className="modal-actions">
              <button className="btn" onClick={() => { setShowAdd(false); setShowEdit(false); setNameSuggest([]) }}>キャンセル</button>
              <button className="btn primary" onClick={saveItem}>保存</button>
            </div>
          </div>
        </div>
      )}

      {/* マスター管理モーダル */}
      {showMaster && (
        <div className="modal-bg" onClick={e => { if (e.target.className === 'modal-bg') setShowMaster(false) }}>
          <div className="modal">
            <h2>マスター管理</h2>
            <div className="master-grid">
              <div>
                <p className="master-title">カテゴリ</p>
                {categories.map((c, i) => (
                  <div key={c} className="master-item">
                    <span className={`badge ${BC[i % BC.length]}`}>{c}</span>
                    <button className="del-x" onClick={() => delCat(c)}>×</button>
                  </div>
                ))}
                <div className="master-add">
                  <input type="text" value={newCat} onChange={e => setNewCat(e.target.value)} placeholder="新しいカテゴリ" onKeyDown={e => e.key === 'Enter' && addCat()} />
                  <button className="btn sm" onClick={addCat}>追加</button>
                </div>
              </div>
              <div>
                <p className="master-title">保管場所</p>
                {locations.map(l => (
                  <div key={l} className="master-item">
                    <span className="master-loc">{l}</span>
                    <button className="del-x" onClick={() => delLoc(l)}>×</button>
                  </div>
                ))}
                <div className="master-add">
                  <input type="text" value={newLoc} onChange={e => setNewLoc(e.target.value)} placeholder="新しい場所" onKeyDown={e => e.key === 'Enter' && addLoc()} />
                  <button className="btn sm" onClick={addLoc}>追加</button>
                </div>
              </div>
            </div>
            <div className="modal-actions">
              <button className="btn primary" onClick={() => setShowMaster(false)}>閉じる</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
