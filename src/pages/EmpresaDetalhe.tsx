import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowLeft, Building2, Copy, Check, UserCheck, UserPlus, UserMinus, Shield, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { formatDate } from '../lib/utils'
import { useModalKeyboard } from '../hooks/useModalKeyboard'
import { TELAS_CONFIGURAVEIS } from '../components/layout/Sidebar'
import type { Empresa, UsuarioListado, PapelUsuario } from '../types'

const TODAS_TELAS_KEYS = TELAS_CONFIGURAVEIS.flatMap(g => g.itens.map(i => i.key))

const PAPEL_LABEL: Record<PapelUsuario, string> = {
  super_admin: 'Super Admin', administrador: 'Administrador', gerente: 'Gerente', atendente: 'Atendente', profissional: 'Profissional',
}

export default function EmpresaDetalhe() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [empresa, setEmpresa] = useState<Empresa | null>(null)
  const [usuarios, setUsuarios] = useState<UsuarioListado[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [codigoCopiado, setCodigoCopiado] = useState(false)

  const [permUser, setPermUser] = useState<UsuarioListado | null>(null)
  const [permSelecionadas, setPermSelecionadas] = useState<Set<string>>(new Set())
  const [permSaving, setPermSaving] = useState(false)
  const [permError, setPermError] = useState('')

  function carregar() {
    if (!id) return
    setLoading(true)
    Promise.all([
      supabase.from('empresas').select('*').eq('id', id).single(),
      supabase.rpc('listar_usuarios'),
    ]).then(([{ data: emp }, { data: users, error: err }]) => {
      setEmpresa((emp as Empresa) ?? null)
      if (err) setError(err.message)
      setUsuarios((users ?? []) as UsuarioListado[])
      setLoading(false)
    })
  }

  useEffect(() => { carregar() }, [id])

  async function vincular(usuarioId: string, papelAtual: PapelUsuario) {
    if (!id) return
    setBusyId(usuarioId); setError('')
    const { error: err } = await supabase.rpc('atualizar_papel_usuario', {
      p_usuario_id: usuarioId, p_papel: papelAtual, p_profissional_id: null, p_ativo: true, p_empresa_id: id,
    })
    setBusyId(null)
    if (err) { setError(err.message); return }
    carregar()
  }

  async function desvincular(usuarioId: string, papelAtual: PapelUsuario) {
    if (!window.confirm('Desvincular esse usuário da loja? Ele deixa de acessar os dados dela até ser vinculado de novo.')) return
    setBusyId(usuarioId); setError('')
    const { error: err } = await supabase.rpc('atualizar_papel_usuario', {
      p_usuario_id: usuarioId, p_papel: papelAtual, p_profissional_id: null, p_ativo: true, p_empresa_id: null,
    })
    setBusyId(null)
    if (err) { setError(err.message); return }
    carregar()
  }

  function abrirPermissoes(u: UsuarioListado) {
    setPermUser(u)
    setPermSelecionadas(new Set(u.telas_permitidas ?? TODAS_TELAS_KEYS))
    setPermError('')
  }

  function togglePermissao(key: string) {
    setPermSelecionadas(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key); else next.add(key)
      return next
    })
  }

  async function salvarPermissoes() {
    if (!permUser) return
    setPermSaving(true); setPermError('')
    const todasMarcadas = permSelecionadas.size === TODAS_TELAS_KEYS.length
    const { error: err } = await supabase.rpc('atualizar_telas_permitidas', {
      p_usuario_id: permUser.usuario_id,
      p_telas: todasMarcadas ? null : Array.from(permSelecionadas),
    })
    setPermSaving(false)
    if (err) { setPermError(err.message); return }
    setPermUser(null)
    carregar()
  }

  const modalPermRef = useModalKeyboard(!!permUser, () => setPermUser(null), salvarPermissoes)

  function copiarCodigo() {
    if (!empresa?.codigo) return
    navigator.clipboard?.writeText(empresa.codigo).then(() => {
      setCodigoCopiado(true)
      setTimeout(() => setCodigoCopiado(false), 1500)
    })
  }

  const vinculados = usuarios.filter(u => u.empresa_id === id)
  const pendentes = usuarios.filter(u => !u.empresa_id && u.papel !== 'super_admin' && u.ativo)

  if (loading) {
    return <div className="page"><p style={{ color: '#444', fontSize: '13px' }}>Carregando...</p></div>
  }
  if (!empresa) {
    return <div className="page"><p style={{ color: '#444', fontSize: '13px' }}>Loja não encontrada.</p></div>
  }

  return (
    <div className="page">
      <button
        onClick={() => navigate('/empresas')}
        style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#666', background: 'none', border: 'none', cursor: 'pointer', marginBottom: '20px', padding: 0 }}
      >
        <ArrowLeft size={13} /> Empresas
      </button>

      <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '28px' }}>
        <div style={{
          width: '44px', height: '44px', borderRadius: '10px',
          background: '#262626', border: '1px solid #333',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <Building2 size={18} style={{ color: '#A3A3A3' }} />
        </div>
        <div style={{ flex: 1 }}>
          <h1 style={{ fontSize: '22px', color: '#FFFFFF' }}>{empresa.nome}</h1>
          <p style={{ fontSize: '12px', color: '#555', marginTop: '2px' }}>Desde {formatDate(empresa.created_at)} · {empresa.email ?? 'sem e-mail de contato'}</p>
        </div>
        <button
          onClick={copiarCodigo}
          title="Copiar código"
          style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            fontSize: '13px', fontFamily: 'monospace', color: '#A3A3A3',
            background: 'rgba(255,255,255,0.04)', border: '1px solid #2A2A2A', borderRadius: '8px',
            padding: '10px 14px', cursor: 'pointer',
          }}
        >
          {codigoCopiado ? <Check size={13} /> : <Copy size={13} />}
          {empresa.codigo ?? '—'}
        </button>
      </div>

      {error && <p style={{ fontSize: '12px', color: '#666', marginBottom: '16px' }}>{error}</p>}

      {/* Vinculados */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
        <UserCheck size={14} style={{ color: '#555' }} />
        <p style={{ fontSize: '13px', fontWeight: 600, color: '#FFFFFF' }}>Usuários desta loja</p>
        <span style={{ fontSize: '11px', color: '#555' }}>({vinculados.length})</span>
      </div>
      <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: '28px' }}>
        <div className="list-header" style={{
          display: 'grid', gridTemplateColumns: '1fr 140px 100px 100px 90px 90px',
          padding: '10px 24px', borderBottom: '1px solid #222',
          fontSize: '10px', fontWeight: 600, color: '#444', textTransform: 'uppercase', letterSpacing: '0.1em',
          background: 'rgba(0,0,0,0.2)',
        }}>
          <span>E-mail</span><span>Papel</span><span>Ativo</span><span>Desde</span><span>Permissões</span><span></span>
        </div>
        {vinculados.length === 0 ? (
          <div style={{ padding: '32px', textAlign: 'center', color: '#444', fontSize: '13px' }}>Nenhum usuário vinculado ainda.</div>
        ) : vinculados.map((u, i) => (
          <motion.div
            key={u.usuario_id}
            className="list-row"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.02 }}
            style={{
              display: 'grid', gridTemplateColumns: '1fr 140px 100px 100px 90px 90px',
              padding: '12px 24px', alignItems: 'center',
              borderBottom: i < vinculados.length - 1 ? '1px solid #1A1A1A' : 'none',
              opacity: busyId === u.usuario_id ? 0.6 : 1,
            }}
          >
            <span style={{ fontSize: '13px', color: '#FFFFFF' }}>{u.email}</span>
            <span style={{ fontSize: '12px', color: '#A3A3A3' }}>{PAPEL_LABEL[u.papel]}</span>
            <span style={{ fontSize: '11px', color: u.ativo ? '#A3A3A3' : '#444' }}>{u.ativo ? 'Ativo' : 'Inativo'}</span>
            <span style={{ fontSize: '12px', color: '#444' }}>{formatDate(u.criado_em)}</span>
            {u.papel === 'gerente' ? (
              <button className="btn btn-secondary btn-sm" onClick={() => abrirPermissoes(u)} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Shield size={12} /> Telas
              </button>
            ) : <span />}
            <button
              className="btn btn-icon"
              title="Desvincular da loja"
              onClick={() => desvincular(u.usuario_id, u.papel)}
              disabled={busyId === u.usuario_id}
            >
              <UserMinus size={12} />
            </button>
          </motion.div>
        ))}
      </div>

      {/* Pendentes */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
        <UserPlus size={14} style={{ color: '#555' }} />
        <p style={{ fontSize: '13px', fontWeight: 600, color: '#FFFFFF' }}>Aguardando vínculo (qualquer loja)</p>
        <span style={{ fontSize: '11px', color: '#555' }}>({pendentes.length})</span>
      </div>
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="list-header" style={{
          display: 'grid', gridTemplateColumns: '1fr 140px 100px',
          padding: '10px 24px', borderBottom: '1px solid #222',
          fontSize: '10px', fontWeight: 600, color: '#444', textTransform: 'uppercase', letterSpacing: '0.1em',
          background: 'rgba(0,0,0,0.2)',
        }}>
          <span>E-mail</span><span>Desde</span><span></span>
        </div>
        {pendentes.length === 0 ? (
          <div style={{ padding: '32px', textAlign: 'center', color: '#444', fontSize: '13px' }}>Nenhum cadastro esperando vínculo.</div>
        ) : pendentes.map((u, i) => (
          <motion.div
            key={u.usuario_id}
            className="list-row"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.02 }}
            style={{
              display: 'grid', gridTemplateColumns: '1fr 140px 100px',
              padding: '12px 24px', alignItems: 'center',
              borderBottom: i < pendentes.length - 1 ? '1px solid #1A1A1A' : 'none',
              opacity: busyId === u.usuario_id ? 0.6 : 1,
            }}
          >
            <span style={{ fontSize: '13px', color: '#FFFFFF' }}>{u.email}</span>
            <span style={{ fontSize: '12px', color: '#444' }}>{formatDate(u.criado_em)}</span>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => vincular(u.usuario_id, u.papel)}
              disabled={busyId === u.usuario_id}
            >
              Vincular aqui
            </button>
          </motion.div>
        ))}
      </div>

      {/* Modal: Permissões de tela */}
      <AnimatePresence>
        {permUser && (
          <motion.div
            style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          >
            <motion.div ref={modalPermRef} className="card" style={{ width: '100%', maxWidth: '480px', padding: '28px', maxHeight: '85vh', overflowY: 'auto', overflowX: 'hidden' }}
              initial={{ scale: 0.95, y: 16 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                <h2 style={{ fontSize: '18px', color: '#FFFFFF' }}>Permissões de tela</h2>
                <button className="btn btn-icon" onClick={() => setPermUser(null)}><X size={14} /></button>
              </div>
              <p style={{ fontSize: '13px', color: '#A3A3A3', marginBottom: '18px' }}>{permUser.email}</p>

              <div style={{ display: 'flex', gap: '8px', marginBottom: '18px' }}>
                <button className="btn btn-ghost btn-sm" onClick={() => setPermSelecionadas(new Set(TODAS_TELAS_KEYS))}>Marcar todas</button>
                <button className="btn btn-ghost btn-sm" onClick={() => setPermSelecionadas(new Set())}>Desmarcar todas</button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '20px' }}>
                {TELAS_CONFIGURAVEIS.map(grupo => (
                  <div key={grupo.grupo}>
                    <p style={{ fontSize: '10px', color: '#555', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' }}>{grupo.grupo}</p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {grupo.itens.map(item => (
                        <label key={item.key} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#FFFFFF', cursor: 'pointer' }}>
                          <input type="checkbox" checked={permSelecionadas.has(item.key)} onChange={() => togglePermissao(item.key)} />
                          {item.label}
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              {permError && <p style={{ fontSize: '12px', color: '#666', marginBottom: '12px' }}>{permError}</p>}
              <div className="modal-actions" style={{ display: 'flex', gap: '10px' }}>
                <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setPermUser(null)}>
                  Cancelar <span className="shortcut-hint">(Esc)</span>
                </button>
                <button className="btn btn-primary" style={{ flex: 1 }} onClick={salvarPermissoes} disabled={permSaving}>
                  {permSaving ? 'Salvando...' : <>Salvar <span className="shortcut-hint">(F10)</span></>}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
