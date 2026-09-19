import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, X, Tags, Wallet, Pencil, Trash2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useModalKeyboard } from '../hooks/useModalKeyboard'
import type { CategoriaFinanceira, CategoriaFinanceiraTipo, FormaPagamentoCadastro } from '../types'

type Secao = 'categorias' | 'formas'

const CAT_FORM_INICIAL = { nome: '', tipo: 'despesa' as CategoriaFinanceiraTipo, categoria_pai_id: '' }
const FORMA_FORM_INICIAL = { nome: '' }

export default function Categorias() {
  const [secao, setSecao] = useState<Secao>('categorias')

  const [categorias, setCategorias] = useState<CategoriaFinanceira[]>([])
  const [showCatModal, setShowCatModal] = useState(false)
  const [catEditando, setCatEditando] = useState<CategoriaFinanceira | null>(null)
  const [catForm, setCatForm] = useState(CAT_FORM_INICIAL)

  const [formas, setFormas] = useState<FormaPagamentoCadastro[]>([])
  const [showFormaModal, setShowFormaModal] = useState(false)
  const [formaEditando, setFormaEditando] = useState<FormaPagamentoCadastro | null>(null)
  const [formaForm, setFormaForm] = useState(FORMA_FORM_INICIAL)

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function carregar() {
    setLoading(true)
    supabase.from('categorias_financeiras').select('*').order('tipo').order('nome')
      .then(({ data }) => { setCategorias((data ?? []) as CategoriaFinanceira[]); setLoading(false) })
    supabase.from('formas_pagamento').select('*').order('nome')
      .then(({ data }) => { setFormas((data ?? []) as FormaPagamentoCadastro[]) })
  }

  useEffect(() => { carregar() }, [])

  function abrirNovaCategoria() {
    setCatEditando(null); setCatForm(CAT_FORM_INICIAL); setError(''); setShowCatModal(true)
  }
  function abrirEditarCategoria(c: CategoriaFinanceira) {
    setCatEditando(c); setCatForm({ nome: c.nome, tipo: c.tipo, categoria_pai_id: c.categoria_pai_id ?? '' }); setError(''); setShowCatModal(true)
  }

  async function salvarCategoria() {
    if (!catForm.nome.trim()) { setError('Nome é obrigatório.'); return }
    setSaving(true); setError('')
    const payload = { nome: catForm.nome, tipo: catForm.tipo, categoria_pai_id: catForm.categoria_pai_id || null }
    const { error: err } = catEditando
      ? await supabase.from('categorias_financeiras').update(payload).eq('id', catEditando.id)
      : await supabase.from('categorias_financeiras').insert(payload)
    setSaving(false)
    if (err) { setError(err.message); return }
    setShowCatModal(false)
    carregar()
  }

  async function toggleAtivoCategoria(c: CategoriaFinanceira) {
    setCategorias(prev => prev.map(x => x.id === c.id ? { ...x, ativo: !x.ativo } : x))
    await supabase.from('categorias_financeiras').update({ ativo: !c.ativo }).eq('id', c.id)
  }

  async function excluirCategoria(c: CategoriaFinanceira) {
    if (!window.confirm(`Excluir a categoria "${c.nome}"? Contas que já usam essa categoria continuam existindo, só perdem o vínculo.`)) return
    const { error: err } = await supabase.from('categorias_financeiras').delete().eq('id', c.id)
    if (err) { setError(err.message); return }
    carregar()
  }

  function abrirNovaForma() {
    setFormaEditando(null); setFormaForm(FORMA_FORM_INICIAL); setError(''); setShowFormaModal(true)
  }
  function abrirEditarForma(f: FormaPagamentoCadastro) {
    setFormaEditando(f); setFormaForm({ nome: f.nome }); setError(''); setShowFormaModal(true)
  }

  async function salvarForma() {
    if (!formaForm.nome.trim()) { setError('Nome é obrigatório.'); return }
    setSaving(true); setError('')
    const { error: err } = formaEditando
      ? await supabase.from('formas_pagamento').update({ nome: formaForm.nome }).eq('id', formaEditando.id)
      : await supabase.from('formas_pagamento').insert({ nome: formaForm.nome })
    setSaving(false)
    if (err) { setError(err.message); return }
    setShowFormaModal(false)
    carregar()
  }

  async function toggleAtivoForma(f: FormaPagamentoCadastro) {
    setFormas(prev => prev.map(x => x.id === f.id ? { ...x, ativo: !x.ativo } : x))
    await supabase.from('formas_pagamento').update({ ativo: !f.ativo }).eq('id', f.id)
  }

  async function excluirForma(f: FormaPagamentoCadastro) {
    if (!window.confirm(`Excluir a forma de pagamento "${f.nome}"? Contas que já usam ela continuam existindo, só perdem o vínculo.`)) return
    const { error: err } = await supabase.from('formas_pagamento').delete().eq('id', f.id)
    if (err) { setError(err.message); return }
    carregar()
  }

  const receitas = categorias.filter(c => c.tipo === 'receita')
  const despesas = categorias.filter(c => c.tipo === 'despesa')

  const modalCatRef = useModalKeyboard(showCatModal, () => setShowCatModal(false), salvarCategoria)
  const modalFormaRef = useModalKeyboard(showFormaModal, () => setShowFormaModal(false), salvarForma)

  return (
    <div className="page">
      <div className="page-header-row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '24px', color: '#FFFFFF' }}>Categorias & Pagamentos</h1>
          <p style={{ fontSize: '13px', color: '#555', marginTop: '3px' }}>
            {secao === 'categorias' ? 'Categorias financeiras da sua loja' : 'Formas de pagamento aceitas'}
          </p>
        </div>
        {secao === 'categorias' ? (
          <button className="btn btn-primary" onClick={abrirNovaCategoria} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Plus size={14} strokeWidth={2.5} /> Nova Categoria
          </button>
        ) : (
          <button className="btn btn-primary" onClick={abrirNovaForma} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Plus size={14} strokeWidth={2.5} /> Nova Forma de Pagamento
          </button>
        )}
      </div>

      <div style={{ display: 'flex', gap: '2px', padding: '4px', background: '#1A1A1A', border: '1px solid #252525', borderRadius: '9px', width: 'fit-content', marginBottom: '24px' }}>
        {(['categorias', 'formas'] as Secao[]).map(sVal => (
          <button
            key={sVal}
            onClick={() => setSecao(sVal)}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              padding: '7px 16px', borderRadius: '7px',
              border: secao === sVal ? '1px solid #FFFFFF' : '1px solid transparent',
              background: secao === sVal ? 'rgba(255,255,255,0.07)' : 'transparent',
              color: secao === sVal ? '#FFFFFF' : '#555',
              fontSize: '13px', fontWeight: secao === sVal ? 600 : 400,
              cursor: 'pointer', transition: 'all 0.15s ease', fontFamily: 'inherit',
            }}
          >
            {sVal === 'categorias' ? <><Tags size={13} /> Categorias</> : <><Wallet size={13} /> Formas de Pagamento</>}
          </button>
        ))}
      </div>

      {error && <p style={{ fontSize: '12px', color: '#666', marginBottom: '16px' }}>{error}</p>}

      <AnimatePresence mode="wait">
        {secao === 'categorias' ? (
          <motion.div key="categorias" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
            {loading ? (
              <div className="card" style={{ padding: '56px', textAlign: 'center', color: '#444', fontSize: '13px' }}>Carregando...</div>
            ) : (
              <>
                <p style={{ fontSize: '12px', color: '#555', margin: '0 0 8px' }}>Receitas</p>
                <ListaCategorias itens={receitas} onEditar={abrirEditarCategoria} onToggle={toggleAtivoCategoria} onExcluir={excluirCategoria} vazio="Nenhuma categoria de receita." />
                <p style={{ fontSize: '12px', color: '#555', margin: '20px 0 8px' }}>Despesas</p>
                <ListaCategorias itens={despesas} onEditar={abrirEditarCategoria} onToggle={toggleAtivoCategoria} onExcluir={excluirCategoria} vazio="Nenhuma categoria de despesa." />
              </>
            )}
          </motion.div>
        ) : (
          <motion.div key="formas" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <div className="list-header" style={{
                display: 'grid', gridTemplateColumns: '1fr 90px 130px',
                padding: '10px 24px', borderBottom: '1px solid #222',
                fontSize: '10px', fontWeight: 600, color: '#444', textTransform: 'uppercase', letterSpacing: '0.1em',
                background: 'rgba(0,0,0,0.2)',
              }}>
                <span>Nome</span><span>Status</span><span></span>
              </div>
              {loading ? (
                <div style={{ padding: '56px', textAlign: 'center', color: '#444', fontSize: '13px' }}>Carregando...</div>
              ) : formas.length === 0 ? (
                <div style={{ padding: '56px', textAlign: 'center', color: '#444', fontSize: '13px' }}>Nenhuma forma de pagamento cadastrada.</div>
              ) : formas.map((f, i) => (
                <motion.div
                  key={f.id}
                  className="list-row"
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.03 }}
                  style={{
                    display: 'grid', gridTemplateColumns: '1fr 90px 130px',
                    padding: '12px 24px', alignItems: 'center',
                    borderBottom: i < formas.length - 1 ? '1px solid #1F1F1F' : 'none',
                  }}
                >
                  <span style={{ fontSize: '13px', color: '#FFFFFF' }}>{f.nome}</span>
                  <button
                    onClick={() => toggleAtivoForma(f)}
                    style={{
                      fontSize: '10px', padding: '3px 9px', borderRadius: '99px', width: 'fit-content',
                      border: f.ativo ? '1px solid rgba(255,255,255,0.2)' : '1px dashed #333',
                      background: 'transparent', color: f.ativo ? '#A3A3A3' : '#444', cursor: 'pointer',
                    }}
                  >
                    {f.ativo ? 'Ativa' : 'Inativa'}
                  </button>
                  <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                    <button className="btn btn-icon" title="Editar" onClick={() => abrirEditarForma(f)}><Pencil size={12} /></button>
                    <button className="btn btn-icon" title="Excluir" onClick={() => excluirForma(f)}><Trash2 size={12} /></button>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modal categoria */}
      <AnimatePresence>
        {showCatModal && (
          <motion.div
            style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          >
            <motion.div ref={modalCatRef} className="card" style={{ width: '100%', maxWidth: '400px', padding: '28px' }}
              initial={{ scale: 0.95, y: 16 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '24px' }}>
                <h2 style={{ fontSize: '18px', color: '#FFFFFF' }}>{catEditando ? 'Editar Categoria' : 'Nova Categoria'}</h2>
                <button className="btn btn-icon" onClick={() => setShowCatModal(false)}><X size={14} /></button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div className="field">
                  <label className="label">Nome *</label>
                  <input className="input" placeholder="Ex: Marketing" value={catForm.nome} onChange={e => setCatForm(f => ({ ...f, nome: e.target.value }))} />
                </div>
                <div className="field">
                  <label className="label">Tipo</label>
                  <select className="input" value={catForm.tipo} onChange={e => setCatForm(f => ({ ...f, tipo: e.target.value as CategoriaFinanceiraTipo, categoria_pai_id: '' }))}>
                    <option value="receita">Receita</option>
                    <option value="despesa">Despesa</option>
                  </select>
                </div>
                <div className="field">
                  <label className="label">Conta sintética (agrupadora)</label>
                  <select className="input" value={catForm.categoria_pai_id} onChange={e => setCatForm(f => ({ ...f, categoria_pai_id: e.target.value }))}>
                    <option value="">Nenhuma — esta é uma conta de detalhe (analítica)</option>
                    {categorias
                      .filter(c => c.tipo === catForm.tipo && !c.categoria_pai_id && c.id !== catEditando?.id)
                      .map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                  </select>
                  <p style={{ fontSize: '11px', color: '#555', marginTop: '6px' }}>
                    Deixe em branco para uma conta sintética (agrupa outras no DRE) ou vincule a uma para criar uma conta analítica (recebe lançamentos).
                  </p>
                </div>
                {error && <p style={{ fontSize: '12px', color: '#666' }}>{error}</p>}
                <div style={{ display: 'flex', gap: '10px', marginTop: '4px' }}>
                  <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setShowCatModal(false)}>Cancelar (Esc)</button>
                  <button className="btn btn-primary" style={{ flex: 1 }} onClick={salvarCategoria} disabled={saving}>
                    {saving ? 'Salvando...' : `${catEditando ? 'Salvar' : 'Cadastrar'} (F10)`}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modal forma de pagamento */}
      <AnimatePresence>
        {showFormaModal && (
          <motion.div
            style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          >
            <motion.div ref={modalFormaRef} className="card" style={{ width: '100%', maxWidth: '380px', padding: '28px' }}
              initial={{ scale: 0.95, y: 16 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '24px' }}>
                <h2 style={{ fontSize: '18px', color: '#FFFFFF' }}>{formaEditando ? 'Editar Forma de Pagamento' : 'Nova Forma de Pagamento'}</h2>
                <button className="btn btn-icon" onClick={() => setShowFormaModal(false)}><X size={14} /></button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div className="field">
                  <label className="label">Nome *</label>
                  <input className="input" placeholder="Ex: Vale-refeição" value={formaForm.nome} onChange={e => setFormaForm({ nome: e.target.value })} />
                </div>
                {error && <p style={{ fontSize: '12px', color: '#666' }}>{error}</p>}
                <div style={{ display: 'flex', gap: '10px', marginTop: '4px' }}>
                  <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setShowFormaModal(false)}>Cancelar (Esc)</button>
                  <button className="btn btn-primary" style={{ flex: 1 }} onClick={salvarForma} disabled={saving}>
                    {saving ? 'Salvando...' : `${formaEditando ? 'Salvar' : 'Cadastrar'} (F10)`}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function ordenarHierarquia(itens: CategoriaFinanceira[]): { c: CategoriaFinanceira; nivel: number }[] {
  const raizes = itens.filter(c => !c.categoria_pai_id)
  const filhas = (id: string) => itens.filter(c => c.categoria_pai_id === id)
  const resultado: { c: CategoriaFinanceira; nivel: number }[] = []
  raizes.forEach(r => {
    resultado.push({ c: r, nivel: 0 })
    filhas(r.id).forEach(f => resultado.push({ c: f, nivel: 1 }))
  })
  return resultado
}

function ListaCategorias({ itens, onEditar, onToggle, onExcluir, vazio }: {
  itens: CategoriaFinanceira[]
  onEditar: (c: CategoriaFinanceira) => void
  onToggle: (c: CategoriaFinanceira) => void
  onExcluir: (c: CategoriaFinanceira) => void
  vazio: string
}) {
  const linhas = ordenarHierarquia(itens)
  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: '4px' }}>
      {linhas.length === 0 ? (
        <div style={{ padding: '32px', textAlign: 'center', color: '#444', fontSize: '13px' }}>{vazio}</div>
      ) : linhas.map(({ c, nivel }, i) => (
        <motion.div
          key={c.id}
          className="list-row"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.03 }}
          style={{
            display: 'grid', gridTemplateColumns: '1fr 90px 130px',
            padding: '12px 24px', alignItems: 'center',
            borderBottom: i < linhas.length - 1 ? '1px solid #1F1F1F' : 'none',
          }}
        >
          <span style={{ fontSize: '13px', color: nivel > 0 ? '#A3A3A3' : '#FFFFFF', fontWeight: nivel > 0 ? 400 : 600, paddingLeft: nivel > 0 ? '18px' : 0 }}>
            {nivel > 0 && '↳ '}{c.nome}
          </span>
          <button
            onClick={() => onToggle(c)}
            style={{
              fontSize: '10px', padding: '3px 9px', borderRadius: '99px', width: 'fit-content',
              border: c.ativo ? '1px solid rgba(255,255,255,0.2)' : '1px dashed #333',
              background: 'transparent', color: c.ativo ? '#A3A3A3' : '#444', cursor: 'pointer',
            }}
          >
            {c.ativo ? 'Ativa' : 'Inativa'}
          </button>
          <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
            <button className="btn btn-icon" title="Editar" onClick={() => onEditar(c)}><Pencil size={12} /></button>
            <button className="btn btn-icon" title="Excluir" onClick={() => onExcluir(c)}><Trash2 size={12} /></button>
          </div>
        </motion.div>
      ))}
    </div>
  )
}
