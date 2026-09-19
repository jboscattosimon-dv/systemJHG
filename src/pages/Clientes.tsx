import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, Search, X, Phone, Pencil } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { formatDate, initials } from '../lib/utils'
import { useModalKeyboard } from '../hooks/useModalKeyboard'
import type { Cliente } from '../types'

const FORM_INICIAL = { nome: '', telefone: '', email: '', cpf: '', data_nascimento: '', endereco: '', observacoes: '' }

export default function Clientes() {
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [mostrarInativos, setMostrarInativos] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState(FORM_INICIAL)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    supabase.from('clientes').select('*').order('nome')
      .then(({ data }) => { setClientes((data ?? []) as Cliente[]); setLoading(false) })
  }, [])

  const filtered = clientes
    .filter(c => mostrarInativos || c.ativo)
    .filter(c =>
      c.nome.toLowerCase().includes(search.toLowerCase()) ||
      c.telefone.includes(search)
    )

  async function handleSave() {
    if (!form.nome.trim() || !form.telefone.trim()) {
      setError('Nome e telefone são obrigatórios.')
      return
    }
    setSaving(true); setError('')
    const payload = {
      nome: form.nome,
      telefone: form.telefone,
      email: form.email || null,
      cpf: form.cpf || null,
      data_nascimento: form.data_nascimento || null,
      endereco: form.endereco || null,
      observacoes: form.observacoes || null,
    }
    if (editId) {
      const { data, error: err } = await supabase.from('clientes').update(payload).eq('id', editId).select('*').single()
      if (err) { setError(err.message); setSaving(false); return }
      if (data) setClientes(prev => prev.map(c => c.id === editId ? (data as Cliente) : c))
    } else {
      const { data, error: err } = await supabase.from('clientes').insert(payload).select('*').single()
      if (err) { setError(err.message); setSaving(false); return }
      if (data) setClientes(prev => [...prev, data as Cliente])
    }
    fecharModal()
    setSaving(false)
  }

  function abrirNovo() {
    setEditId(null)
    setForm(FORM_INICIAL)
    setError('')
    setShowModal(true)
  }

  function abrirEdicao(c: Cliente) {
    setEditId(c.id)
    setForm({
      nome: c.nome, telefone: c.telefone, email: c.email ?? '', cpf: c.cpf ?? '',
      data_nascimento: c.data_nascimento ?? '', endereco: c.endereco ?? '', observacoes: c.observacoes ?? '',
    })
    setError('')
    setShowModal(true)
  }

  function fecharModal() {
    setShowModal(false)
    setEditId(null)
    setForm(FORM_INICIAL)
  }

  async function toggleAtivo(id: string, ativo: boolean) {
    setClientes(prev => prev.map(c => c.id === id ? { ...c, ativo: !ativo } : c))
    await supabase.from('clientes').update({ ativo: !ativo }).eq('id', id)
  }

  const modalRef = useModalKeyboard(showModal, fecharModal, handleSave)

  return (
    <div className="page">
      {/* Header */}
      <div className="page-header-row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '28px' }}>
        <div>
          <h1 style={{ fontSize: '24px', color: '#FFFFFF' }}>Clientes</h1>
          <p style={{ fontSize: '13px', color: '#555', marginTop: '3px' }}>
            {clientes.filter(c => c.ativo).length} ativos · {clientes.length} cadastrados
          </p>
        </div>
        <button className="btn btn-primary" onClick={abrirNovo} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Plus size={14} strokeWidth={2.5} /> Novo Cliente
        </button>
      </div>

      {/* Search */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '10px',
        padding: '11px 14px',
        background: '#1A1A1A',
        border: '1px solid #252525',
        borderRadius: '8px',
        marginBottom: '20px',
      }}>
        <Search size={14} style={{ color: '#444', flexShrink: 0 }} />
        <input
          style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', fontSize: '13px', color: '#FFFFFF', fontFamily: 'inherit' }}
          placeholder="Buscar por nome ou telefone..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        {search && (
          <button onClick={() => setSearch('')} style={{ background: 'none', border: 'none', color: '#555', cursor: 'pointer', padding: '2px' }}>
            <X size={13} />
          </button>
        )}
        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#666', cursor: 'pointer', flexShrink: 0, paddingLeft: '10px', borderLeft: '1px solid #252525' }}>
          <input type="checkbox" checked={mostrarInativos} onChange={e => setMostrarInativos(e.target.checked)} />
          Mostrar inativos
        </label>
      </div>

      {/* Table (desktop) */}
      <div className="card desktop-row" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="list-header" style={{
          display: 'grid',
          gridTemplateColumns: '1fr 160px 180px 110px 90px 40px',
          padding: '10px 24px',
          borderBottom: '1px solid #222',
          fontSize: '10px', fontWeight: 600, color: '#444',
          textTransform: 'uppercase', letterSpacing: '0.1em',
          background: 'rgba(0,0,0,0.2)',
        }}>
          <span>Nome</span>
          <span>Telefone</span>
          <span>E-mail</span>
          <span>Cadastro</span>
          <span>Status</span>
          <span></span>
        </div>

        {loading ? (
          <div style={{ padding: '56px', textAlign: 'center', color: '#444', fontSize: '13px' }}>
            Carregando...
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: '56px', textAlign: 'center', color: '#444', fontSize: '13px' }}>
            Nenhum cliente encontrado.
          </div>
        ) : filtered.map((c, i) => (
          <motion.div
            key={c.id}
            className="list-row"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: i * 0.03 }}
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 160px 180px 110px 90px 40px',
              padding: '14px 24px',
              borderBottom: i < filtered.length - 1 ? '1px solid #1F1F1F' : 'none',
              alignItems: 'center',
              transition: 'background 0.12s',
            }}
            whileHover={{ backgroundColor: 'rgba(255,255,255,0.02)' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{
                width: '32px', height: '32px',
                borderRadius: '50%',
                background: '#262626',
                border: '1px solid #333',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '11px', fontWeight: 700, color: '#A3A3A3',
                flexShrink: 0,
              }}>
                {initials(c.nome)}
              </div>
              <span style={{ fontSize: '13px', fontWeight: 500, color: '#FFFFFF' }}>{c.nome}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: '#A3A3A3' }}>
              <Phone size={11} style={{ color: '#444' }} /> {c.telefone}
            </div>
            <div style={{ fontSize: '13px', color: '#555' }}>
              {c.email ?? <span style={{ color: '#333' }}>—</span>}
            </div>
            <div style={{ fontSize: '12px', color: '#444' }}>{formatDate(c.created_at)}</div>
            <div>
              <button
                onClick={() => toggleAtivo(c.id, c.ativo)}
                style={{
                  fontSize: '10px', padding: '3px 9px', borderRadius: '99px',
                  border: c.ativo ? '1px solid rgba(255,255,255,0.2)' : '1px dashed #333',
                  background: 'transparent',
                  color: c.ativo ? '#A3A3A3' : '#444',
                  cursor: 'pointer',
                }}
              >
                {c.ativo ? 'Ativo' : 'Inativo'}
              </button>
            </div>
            <button className="btn btn-icon" title="Editar" onClick={() => abrirEdicao(c)}>
              <Pencil size={12} />
            </button>
          </motion.div>
        ))}
      </div>

      {/* Cards (mobile) */}
      {!loading && filtered.length > 0 && (
        <div className="entity-grid mobile-only-grid" style={{ gap: '16px' }}>
          {filtered.map((c, i) => (
            <motion.div
              key={c.id}
              className="card entity-card"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
            >
              <div className="entity-header" style={{ display: 'flex', alignItems: 'flex-start', gap: '14px' }}>
                <div className="entity-avatar" style={{
                  width: '44px', height: '44px',
                  borderRadius: '50%',
                  background: '#262626',
                  border: '1px solid #333',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '14px', fontWeight: 700, color: '#A3A3A3',
                  flexShrink: 0,
                }}>
                  {initials(c.nome)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
                    <h3 className="entity-title" style={{
                      fontSize: '15px', fontWeight: 600, color: '#FFFFFF', fontFamily: 'DM Sans, sans-serif',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0,
                    }}>{c.nome}</h3>
                    <span style={{
                      fontSize: '10px', padding: '2px 8px', borderRadius: '99px', flexShrink: 0,
                      border: c.ativo ? '1px solid rgba(255,255,255,0.2)' : '1px dashed #333',
                      color: c.ativo ? '#A3A3A3' : '#444',
                    }}>
                      {c.ativo ? 'Ativo' : 'Inativo'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Phone size={11} style={{ color: '#444' }} />
                    <span style={{ fontSize: '12px', color: '#666' }}>{c.telefone}</span>
                  </div>
                  {c.email && (
                    <p className="entity-subtle" style={{ fontSize: '11px', color: '#444', marginTop: '4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {c.email}
                    </p>
                  )}
                </div>
              </div>

              <div className="entity-divider" style={{ height: '1px', background: '#222', margin: '16px 0' }} />

              <div className="entity-footer" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div className="entity-subtle">
                  <p style={{ fontSize: '10px', color: '#444', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '4px' }}>Cadastro</p>
                  <p style={{ fontSize: '13px', color: '#A3A3A3' }}>{formatDate(c.created_at)}</p>
                </div>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button className="btn btn-icon" title="Editar" onClick={() => abrirEdicao(c)}>
                    <Pencil size={12} />
                  </button>
                  <button className="btn btn-secondary btn-sm" onClick={() => toggleAtivo(c.id, c.ativo)}>
                    {c.ativo ? 'Desativar' : 'Ativar'}
                  </button>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}
      {!loading && filtered.length === 0 && (
        <div className="card mobile-only-grid" style={{ padding: '56px', textAlign: 'center', color: '#444', fontSize: '13px' }}>
          Nenhum cliente encontrado.
        </div>
      )}

      {/* Modal */}
      <AnimatePresence>
        {showModal && (
          <motion.div
            style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          >
            <motion.div
              ref={modalRef}
              className="card"
              style={{ width: '100%', maxWidth: '460px', padding: '28px', maxHeight: '85vh', overflowY: 'auto' }}
              initial={{ scale: 0.95, y: 16 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 16 }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '24px' }}>
                <h2 style={{ fontSize: '18px', color: '#FFFFFF' }}>{editId ? 'Editar Cliente' : 'Novo Cliente'}</h2>
                <button className="btn btn-icon" onClick={fecharModal}><X size={14} /></button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div className="field">
                  <label className="label">Nome *</label>
                  <input className="input" placeholder="Nome completo" value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div className="field">
                    <label className="label">Telefone *</label>
                    <input className="input" placeholder="(11) 99999-9999" value={form.telefone} onChange={e => setForm(f => ({ ...f, telefone: e.target.value }))} />
                  </div>
                  <div className="field">
                    <label className="label">CPF</label>
                    <input className="input" placeholder="000.000.000-00" value={form.cpf} onChange={e => setForm(f => ({ ...f, cpf: e.target.value }))} />
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div className="field">
                    <label className="label">E-mail</label>
                    <input className="input" type="email" placeholder="email@exemplo.com" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
                  </div>
                  <div className="field">
                    <label className="label">Nascimento</label>
                    <input className="input" type="date" value={form.data_nascimento} onChange={e => setForm(f => ({ ...f, data_nascimento: e.target.value }))} />
                  </div>
                </div>
                <div className="field">
                  <label className="label">Endereço</label>
                  <input className="input" placeholder="Rua, número, bairro..." value={form.endereco} onChange={e => setForm(f => ({ ...f, endereco: e.target.value }))} />
                </div>
                <div className="field">
                  <label className="label">Observações</label>
                  <input className="input" placeholder="Preferências, alergias, etc." value={form.observacoes} onChange={e => setForm(f => ({ ...f, observacoes: e.target.value }))} />
                </div>
                {error && <p style={{ fontSize: '12px', color: '#666' }}>{error}</p>}
                <div style={{ display: 'flex', gap: '10px', marginTop: '4px' }}>
                  <button className="btn btn-secondary" style={{ flex: 1 }} onClick={fecharModal}>Cancelar (Esc)</button>
                  <button className="btn btn-primary" style={{ flex: 1 }} onClick={handleSave} disabled={saving}>
                    {saving ? 'Salvando...' : `${editId ? 'Salvar' : 'Cadastrar'} (F10)`}
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
