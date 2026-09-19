import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, X, Building2, Copy, Check, ChevronRight } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { formatDate } from '../lib/utils'
import { useModalKeyboard } from '../hooks/useModalKeyboard'
import type { Empresa } from '../types'

const FORM_INICIAL = { nome: '', cnpj: '', telefone: '', email: '' }

export default function Empresas() {
  const navigate = useNavigate()
  const [empresas, setEmpresas] = useState<Empresa[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState(FORM_INICIAL)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [codigoCopiado, setCodigoCopiado] = useState<string | null>(null)

  function copiarCodigo(codigo: string) {
    navigator.clipboard?.writeText(codigo).then(() => {
      setCodigoCopiado(codigo)
      setTimeout(() => setCodigoCopiado(null), 1500)
    })
  }

  function carregar() {
    setLoading(true)
    supabase.from('empresas').select('*').order('created_at', { ascending: false })
      .then(({ data }) => { setEmpresas((data ?? []) as Empresa[]); setLoading(false) })
  }

  useEffect(() => { carregar() }, [])

  async function handleSave() {
    if (!form.nome.trim()) { setError('Nome é obrigatório.'); return }
    setSaving(true); setError('')
    const { error: err } = await supabase.from('empresas').insert({
      nome: form.nome, cnpj: form.cnpj || null, telefone: form.telefone || null, email: form.email || null,
    })
    setSaving(false)
    if (err) { setError(err.message); return }
    setForm(FORM_INICIAL)
    setShowModal(false)
    carregar()
  }

  async function toggleAtivo(id: string, ativo: boolean) {
    setEmpresas(prev => prev.map(e => e.id === id ? { ...e, ativo: !ativo } : e))
    await supabase.from('empresas').update({ ativo: !ativo }).eq('id', id)
  }

  const modalRef = useModalKeyboard(showModal, () => setShowModal(false), handleSave)

  return (
    <div className="page">
      <div className="page-header-row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '28px' }}>
        <div>
          <h1 style={{ fontSize: '24px', color: '#FFFFFF' }}>Empresas</h1>
          <p style={{ fontSize: '13px', color: '#555', marginTop: '3px' }}>
            {empresas.filter(e => e.ativo).length} ativas · {empresas.length} cadastradas
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => { setError(''); setShowModal(true) }} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Plus size={14} strokeWidth={2.5} /> Nova Loja
        </button>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="list-header" style={{
          display: 'grid', gridTemplateColumns: '1fr 130px 160px 90px 20px',
          padding: '10px 24px', borderBottom: '1px solid #222',
          fontSize: '10px', fontWeight: 600, color: '#444', textTransform: 'uppercase', letterSpacing: '0.1em',
          background: 'rgba(0,0,0,0.2)',
        }}>
          <span>Loja</span><span>Código</span><span>E-mail</span><span>Status</span><span></span>
        </div>

        {loading ? (
          <div style={{ padding: '56px', textAlign: 'center', color: '#444', fontSize: '13px' }}>Carregando...</div>
        ) : empresas.length === 0 ? (
          <div style={{ padding: '56px', textAlign: 'center', color: '#444', fontSize: '13px' }}>Nenhuma loja cadastrada ainda.</div>
        ) : empresas.map((e, i) => (
          <motion.div
            key={e.id}
            className="list-row"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.03 }}
            onClick={() => navigate(`/empresas/${e.id}`)}
            style={{
              display: 'grid', gridTemplateColumns: '1fr 130px 160px 90px 20px',
              padding: '14px 24px', alignItems: 'center',
              borderBottom: i < empresas.length - 1 ? '1px solid #1F1F1F' : 'none',
              cursor: 'pointer',
            }}
            whileHover={{ backgroundColor: 'rgba(255,255,255,0.02)' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{
                width: '32px', height: '32px', borderRadius: '8px',
                background: '#262626', border: '1px solid #333',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                <Building2 size={14} style={{ color: '#A3A3A3' }} />
              </div>
              <div>
                <span style={{ fontSize: '13px', fontWeight: 500, color: '#FFFFFF' }}>{e.nome}</span>
                <p style={{ fontSize: '11px', color: '#555' }}>Desde {formatDate(e.created_at)}</p>
              </div>
            </div>
            <button
              onClick={ev => { ev.stopPropagation(); e.codigo && copiarCodigo(e.codigo) }}
              title="Copiar código"
              style={{
                display: 'flex', alignItems: 'center', gap: '6px', width: 'fit-content',
                fontSize: '11px', fontFamily: 'monospace', color: '#A3A3A3',
                background: 'rgba(255,255,255,0.04)', border: '1px solid #2A2A2A', borderRadius: '6px',
                padding: '4px 8px', cursor: 'pointer',
              }}
            >
              {codigoCopiado === e.codigo ? <Check size={11} /> : <Copy size={11} />}
              {e.codigo ?? '—'}
            </button>
            <span style={{ fontSize: '13px', color: '#555' }}>{e.email ?? '—'}</span>
            <button
              onClick={ev => { ev.stopPropagation(); toggleAtivo(e.id, e.ativo) }}
              style={{
                fontSize: '10px', padding: '3px 9px', borderRadius: '99px', width: 'fit-content',
                border: e.ativo ? '1px solid rgba(255,255,255,0.2)' : '1px dashed #333',
                background: 'transparent', color: e.ativo ? '#A3A3A3' : '#444', cursor: 'pointer',
              }}
            >
              {e.ativo ? 'Ativa' : 'Inativa'}
            </button>
            <ChevronRight size={14} style={{ color: '#333' }} />
          </motion.div>
        ))}
      </div>

      <AnimatePresence>
        {showModal && (
          <motion.div
            style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          >
            <motion.div ref={modalRef} className="card" style={{ width: '100%', maxWidth: '420px', padding: '28px' }}
              initial={{ scale: 0.95, y: 16 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '24px' }}>
                <h2 style={{ fontSize: '18px', color: '#FFFFFF' }}>Nova Loja</h2>
                <button className="btn btn-icon" onClick={() => setShowModal(false)}><X size={14} /></button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div className="field">
                  <label className="label">Nome da loja *</label>
                  <input className="input" placeholder="Ex: Barbearia do João" value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div className="field">
                    <label className="label">CNPJ</label>
                    <input className="input" placeholder="opcional" value={form.cnpj} onChange={e => setForm(f => ({ ...f, cnpj: e.target.value }))} />
                  </div>
                  <div className="field">
                    <label className="label">Telefone</label>
                    <input className="input" placeholder="opcional" value={form.telefone} onChange={e => setForm(f => ({ ...f, telefone: e.target.value }))} />
                  </div>
                </div>
                <div className="field">
                  <label className="label">E-mail de contato</label>
                  <input className="input" type="email" placeholder="opcional" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
                </div>
                {error && <p style={{ fontSize: '12px', color: '#666' }}>{error}</p>}
                <p style={{ fontSize: '11px', color: '#444' }}>
                  Depois de criar, abra a loja pra vincular o primeiro login administrador dela.
                </p>
                <div style={{ display: 'flex', gap: '10px', marginTop: '4px' }}>
                  <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setShowModal(false)}>Cancelar (Esc)</button>
                  <button className="btn btn-primary" style={{ flex: 1 }} onClick={handleSave} disabled={saving}>
                    {saving ? 'Salvando...' : 'Cadastrar (F10)'}
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
