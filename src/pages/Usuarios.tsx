import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { ExternalLink, UserX, UserCheck, Shield, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { usePerfil } from '../hooks/usePerfil'
import { useModalKeyboard } from '../hooks/useModalKeyboard'
import { formatDate, initials } from '../lib/utils'
import { TELAS_CONFIGURAVEIS } from '../components/layout/Sidebar'
import type { UsuarioListado, PapelUsuario, Profissional, Empresa } from '../types'

const PAPEL_LABEL: Record<PapelUsuario, string> = {
  super_admin: 'Super Admin', administrador: 'Administrador', gerente: 'Gerente', atendente: 'Atendente', profissional: 'Profissional',
}

const TODAS_TELAS_KEYS = TELAS_CONFIGURAVEIS.flatMap(g => g.itens.map(i => i.key))

export default function Usuarios() {
  const { papel: meuPapel } = usePerfil()
  const souSuperAdmin = meuPapel === 'super_admin'

  const [usuarios, setUsuarios] = useState<UsuarioListado[]>([])
  const [profissionais, setProfissionais] = useState<Profissional[]>([])
  const [empresas, setEmpresas] = useState<Empresa[]>([])
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [error, setError] = useState('')

  function carregar() {
    setLoading(true)
    supabase.rpc('listar_usuarios').then(({ data, error: err }) => {
      if (err) { setError(err.message); setLoading(false); return }
      setUsuarios((data ?? []) as UsuarioListado[])
      setLoading(false)
    })
    if (souSuperAdmin) {
      supabase.from('empresas').select('*').eq('ativo', true).order('nome')
        .then(({ data }) => { if (data) setEmpresas(data as Empresa[]) })
    } else {
      supabase.from('profissionais').select('*').order('nome')
        .then(({ data }) => { if (data) setProfissionais(data as Profissional[]) })
    }
  }

  useEffect(() => { carregar() }, [souSuperAdmin])

  async function salvar(u: UsuarioListado, campo: 'papel' | 'profissional_id' | 'ativo' | 'empresa_id', valor: string | boolean) {
    const atualizado = { ...u, [campo]: valor === '' ? null : valor }
    setUsuarios(prev => prev.map(x => x.usuario_id === u.usuario_id ? atualizado : x))
    setSavingId(u.usuario_id)
    const { error: err } = await supabase.rpc('atualizar_papel_usuario', {
      p_usuario_id: u.usuario_id,
      p_papel: atualizado.papel,
      p_profissional_id: atualizado.profissional_id || null,
      p_ativo: atualizado.ativo,
      p_empresa_id: atualizado.empresa_id || null,
    })
    setSavingId(null)
    if (err) { setError(err.message); carregar(); return }
    carregar()
  }

  async function definirAtivoPendente(usuarioId: string, ativo: boolean) {
    setSavingId(usuarioId); setError('')
    const { error: err } = await supabase.rpc('definir_ativo_usuario_pendente', { p_usuario_id: usuarioId, p_ativo: ativo })
    setSavingId(null)
    if (err) { setError(err.message); return }
    carregar()
  }

  const [papelPendente, setPapelPendente] = useState<Record<string, PapelUsuario>>({})

  async function vincularComPapel(u: UsuarioListado, empresaId: string) {
    const papel = papelPendente[u.usuario_id] ?? 'atendente'
    setSavingId(u.usuario_id); setError('')
    const { error: err } = await supabase.rpc('atualizar_papel_usuario', {
      p_usuario_id: u.usuario_id, p_papel: papel, p_profissional_id: null, p_ativo: true, p_empresa_id: empresaId,
    })
    setSavingId(null)
    if (err) { setError(err.message); return }
    carregar()
  }

  const [permUser, setPermUser] = useState<UsuarioListado | null>(null)
  const [permSelecionadas, setPermSelecionadas] = useState<Set<string>>(new Set())
  const [permSaving, setPermSaving] = useState(false)
  const [permError, setPermError] = useState('')

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

  if (souSuperAdmin) {
    const pendentes = usuarios.filter(u => !u.empresa_id && u.papel !== 'super_admin' && u.ativo)
    const rejeitados = usuarios.filter(u => !u.empresa_id && u.papel !== 'super_admin' && !u.ativo)

    return (
      <div className="page">
        <div style={{ marginBottom: '24px' }}>
          <h1 style={{ fontSize: '24px', color: '#FFFFFF' }}>Pendências</h1>
          <p style={{ fontSize: '13px', color: '#555', marginTop: '3px' }}>
            Logins ainda sem loja — vincule aqui ou abra a loja certa em Empresas pra fazer isso lá.
          </p>
        </div>

        {error && <p style={{ fontSize: '12px', color: '#666', marginBottom: '16px' }}>{error}</p>}

        <div className="card desktop-row" style={{ padding: 0, overflow: 'hidden' }}>
          <div className="list-header" style={{
            display: 'grid', gridTemplateColumns: '1fr 130px 140px 200px 40px',
            padding: '10px 24px', borderBottom: '1px solid #222',
            fontSize: '10px', fontWeight: 600, color: '#444', textTransform: 'uppercase', letterSpacing: '0.1em',
            background: 'rgba(0,0,0,0.2)',
          }}>
            <span>E-mail</span><span>Desde</span><span>Papel</span><span>Vincular a</span><span></span>
          </div>

          {loading ? (
            <div style={{ padding: '56px', textAlign: 'center', color: '#444', fontSize: '13px' }}>Carregando...</div>
          ) : pendentes.length === 0 ? (
            <div style={{ padding: '56px', textAlign: 'center', color: '#444', fontSize: '13px' }}>
              Nenhum cadastro esperando vínculo com loja.
            </div>
          ) : pendentes.map((u, i) => (
            <motion.div
              key={u.usuario_id}
              className="list-row"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.02 }}
              style={{
                display: 'grid', gridTemplateColumns: '1fr 130px 140px 200px 40px',
                padding: '12px 24px', alignItems: 'center',
                borderBottom: i < pendentes.length - 1 ? '1px solid #1A1A1A' : 'none',
                opacity: savingId === u.usuario_id ? 0.6 : 1,
              }}
            >
              <span style={{ fontSize: '13px', color: '#FFFFFF' }}>{u.email}</span>
              <span style={{ fontSize: '12px', color: '#444' }}>{formatDate(u.criado_em)}</span>
              <select
                className="input"
                style={{ fontSize: '12px', padding: '6px 8px' }}
                value={papelPendente[u.usuario_id] ?? 'atendente'}
                onChange={e => setPapelPendente(prev => ({ ...prev, [u.usuario_id]: e.target.value as PapelUsuario }))}
              >
                {Object.entries(PAPEL_LABEL).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
              </select>
              <select
                className="input"
                style={{ fontSize: '12px', padding: '6px 8px' }}
                value=""
                onChange={e => e.target.value && vincularComPapel(u, e.target.value)}
              >
                <option value="">Selecionar loja...</option>
                {empresas.map(emp => <option key={emp.id} value={emp.id}>{emp.nome} ({emp.codigo})</option>)}
              </select>
              <button
                className="btn btn-icon" title="Rejeitar cadastro"
                onClick={() => window.confirm(`Rejeitar o cadastro de ${u.email}? Ele deixa de aparecer aqui e fica inativo até você reativar.`) && definirAtivoPendente(u.usuario_id, false)}
                disabled={savingId === u.usuario_id}
              >
                <UserX size={13} />
              </button>
            </motion.div>
          ))}
        </div>

        {/* Cards (mobile) */}
        {!loading && pendentes.length > 0 && (
          <div className="entity-grid mobile-only-grid" style={{ gap: '16px' }}>
            {pendentes.map((u, i) => (
              <motion.div
                key={u.usuario_id}
                className="card entity-card"
                initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}
                style={{ opacity: savingId === u.usuario_id ? 0.6 : 1 }}
              >
                <div className="entity-header" style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                  <div className="entity-avatar" style={{
                    width: '44px', height: '44px', borderRadius: '50%',
                    background: '#262626', border: '1px solid #333',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '14px', fontWeight: 700, color: '#A3A3A3', flexShrink: 0,
                  }}>
                    {initials(u.email.split('@')[0])}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <h3 className="entity-title" style={{
                      fontSize: '15px', fontWeight: 600, color: '#FFFFFF', fontFamily: 'DM Sans, sans-serif',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>{u.email}</h3>
                    <p className="entity-subtle" style={{ fontSize: '11px', color: '#444', marginTop: '2px' }}>Desde {formatDate(u.criado_em)}</p>
                  </div>
                </div>
                <div className="entity-divider" style={{ height: '1px', background: '#222', margin: '16px 0' }} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div>
                    <p style={{ fontSize: '10px', color: '#444', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '6px' }}>Papel</p>
                    <select
                      className="input"
                      style={{ fontSize: '13px' }}
                      value={papelPendente[u.usuario_id] ?? 'atendente'}
                      onChange={e => setPapelPendente(prev => ({ ...prev, [u.usuario_id]: e.target.value as PapelUsuario }))}
                    >
                      {Object.entries(PAPEL_LABEL).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
                    </select>
                  </div>
                  <div>
                    <p style={{ fontSize: '10px', color: '#444', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '6px' }}>Vincular a</p>
                    <select
                      className="input"
                      style={{ fontSize: '13px' }}
                      value=""
                      onChange={e => e.target.value && vincularComPapel(u, e.target.value)}
                    >
                      <option value="">Selecionar loja...</option>
                      {empresas.map(emp => <option key={emp.id} value={emp.id}>{emp.nome} ({emp.codigo})</option>)}
                    </select>
                  </div>
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => window.confirm(`Rejeitar o cadastro de ${u.email}? Ele deixa de aparecer aqui e fica inativo até você reativar.`) && definirAtivoPendente(u.usuario_id, false)}
                    disabled={savingId === u.usuario_id}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                  >
                    <UserX size={13} /> Rejeitar cadastro
                  </button>
                </div>
              </motion.div>
            ))}
          </div>
        )}
        {!loading && pendentes.length === 0 && (
          <div className="card mobile-only-grid" style={{ padding: '56px', textAlign: 'center', color: '#444', fontSize: '13px' }}>
            Nenhum cadastro esperando vínculo com loja.
          </div>
        )}

        {rejeitados.length > 0 && (
          <>
            <p style={{ fontSize: '13px', fontWeight: 600, color: '#FFFFFF', margin: '28px 0 12px' }}>Rejeitados ({rejeitados.length})</p>
            <div className="card desktop-row" style={{ padding: 0, overflow: 'hidden' }}>
              {rejeitados.map((u, i) => (
                <motion.div
                  key={u.usuario_id}
                  className="list-row"
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.02 }}
                  style={{
                    display: 'grid', gridTemplateColumns: '1fr 130px 40px',
                    padding: '12px 24px', alignItems: 'center',
                    borderBottom: i < rejeitados.length - 1 ? '1px solid #1A1A1A' : 'none',
                    opacity: savingId === u.usuario_id ? 0.6 : 1,
                  }}
                >
                  <span style={{ fontSize: '13px', color: '#666' }}>{u.email}</span>
                  <span style={{ fontSize: '12px', color: '#444' }}>{formatDate(u.criado_em)}</span>
                  <button
                    className="btn btn-icon" title="Reativar (volta pra fila de pendências)"
                    onClick={() => definirAtivoPendente(u.usuario_id, true)}
                    disabled={savingId === u.usuario_id}
                  >
                    <UserCheck size={13} />
                  </button>
                </motion.div>
              ))}
            </div>
            <div className="entity-grid mobile-only-grid" style={{ gap: '16px' }}>
              {rejeitados.map((u, i) => (
                <motion.div
                  key={u.usuario_id}
                  className="card entity-card"
                  initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}
                  style={{ opacity: savingId === u.usuario_id ? 0.6 : 1 }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
                    <div style={{ minWidth: 0 }}>
                      <p className="entity-title" style={{ fontSize: '13px', color: '#666', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.email}</p>
                      <p className="entity-subtle" style={{ fontSize: '11px', color: '#444', marginTop: '2px' }}>Desde {formatDate(u.criado_em)}</p>
                    </div>
                    <button
                      className="btn btn-icon" title="Reativar (volta pra fila de pendências)"
                      onClick={() => definirAtivoPendente(u.usuario_id, true)}
                      disabled={savingId === u.usuario_id}
                    >
                      <UserCheck size={13} />
                    </button>
                  </div>
                </motion.div>
              ))}
            </div>
          </>
        )}

        <p style={{ fontSize: '12px', color: '#444', marginTop: '20px' }}>
          Pra ver ou desvincular quem já está numa loja, abra a loja em{' '}
          <Link to="/empresas" style={{ color: '#A3A3A3', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            Empresas <ExternalLink size={11} />
          </Link>.
        </p>
      </div>
    )
  }

  const colunas = '1fr 140px 180px 80px 100px 110px'

  return (
    <div className="page">
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '24px', color: '#FFFFFF' }}>Usuários</h1>
        <p style={{ fontSize: '13px', color: '#555', marginTop: '3px' }}>
          Papéis, profissional vinculado e ativo/inativo da sua equipe
        </p>
      </div>

      {error && <p style={{ fontSize: '12px', color: '#666', marginBottom: '16px' }}>{error}</p>}

      <div className="card desktop-row" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="list-header" style={{
          display: 'grid', gridTemplateColumns: colunas,
          padding: '10px 24px', borderBottom: '1px solid #222',
          fontSize: '10px', fontWeight: 600, color: '#444', textTransform: 'uppercase', letterSpacing: '0.1em',
          background: 'rgba(0,0,0,0.2)',
        }}>
          <span>E-mail</span>
          <span>Papel</span>
          <span>Vinculado a</span>
          <span>Ativo</span>
          <span>Desde</span>
          <span>Permissões</span>
        </div>

        {loading ? (
          <div style={{ padding: '56px', textAlign: 'center', color: '#444', fontSize: '13px' }}>Carregando...</div>
        ) : usuarios.length === 0 ? (
          <div style={{ padding: '56px', textAlign: 'center', color: '#444', fontSize: '13px' }}>
            Nenhum usuário encontrado (ou você não tem permissão pra ver essa tela).
          </div>
        ) : usuarios.map((u, i) => (
          <motion.div
            key={u.usuario_id}
            className="list-row"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.02 }}
            style={{
              display: 'grid', gridTemplateColumns: colunas,
              padding: '12px 24px', alignItems: 'center',
              borderBottom: i < usuarios.length - 1 ? '1px solid #1A1A1A' : 'none',
              opacity: savingId === u.usuario_id ? 0.6 : 1,
            }}
          >
            <span style={{ fontSize: '13px', color: '#FFFFFF' }}>{u.email}</span>

            <select
              className="input"
              style={{ fontSize: '12px', padding: '6px 8px' }}
              value={u.papel}
              onChange={e => salvar(u, 'papel', e.target.value)}
              disabled={u.papel === 'super_admin'}
            >
              {Object.entries(PAPEL_LABEL)
                .filter(([k]) => k !== 'super_admin')
                .map(([k, label]) => <option key={k} value={k}>{label}</option>)}
            </select>

            <select
              className="input"
              style={{ fontSize: '12px', padding: '6px 8px' }}
              value={u.profissional_id ?? ''}
              onChange={e => salvar(u, 'profissional_id', e.target.value)}
            >
              <option value="">Nenhum profissional</option>
              {profissionais.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
            </select>

            <input type="checkbox" checked={u.ativo} onChange={e => salvar(u, 'ativo', e.target.checked)} />
            <span style={{ fontSize: '12px', color: '#444' }}>{formatDate(u.criado_em)}</span>
            <button className="btn btn-secondary btn-sm" onClick={() => abrirPermissoes(u)} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Shield size={12} /> Telas
            </button>
          </motion.div>
        ))}
      </div>

      {/* Cards (mobile) */}
      {!loading && usuarios.length > 0 && (
        <div className="entity-grid mobile-only-grid" style={{ gap: '16px' }}>
          {usuarios.map((u, i) => (
            <motion.div
              key={u.usuario_id}
              className="card entity-card"
              initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}
              style={{ opacity: savingId === u.usuario_id ? 0.6 : 1 }}
            >
              <div className="entity-header" style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                <div className="entity-avatar" style={{
                  width: '44px', height: '44px', borderRadius: '50%',
                  background: '#262626', border: '1px solid #333',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '14px', fontWeight: 700, color: '#A3A3A3', flexShrink: 0,
                }}>
                  {initials(u.email.split('@')[0])}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h3 className="entity-title" style={{
                    fontSize: '15px', fontWeight: 600, color: '#FFFFFF', fontFamily: 'DM Sans, sans-serif',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>{u.email}</h3>
                  <p className="entity-subtle" style={{ fontSize: '11px', color: '#444', marginTop: '2px' }}>Desde {formatDate(u.criado_em)}</p>
                </div>
              </div>

              <div className="entity-divider" style={{ height: '1px', background: '#222', margin: '16px 0' }} />

              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div>
                  <p style={{ fontSize: '10px', color: '#444', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '6px' }}>Papel</p>
                  <select
                    className="input"
                    style={{ fontSize: '13px' }}
                    value={u.papel}
                    onChange={e => salvar(u, 'papel', e.target.value)}
                    disabled={u.papel === 'super_admin'}
                  >
                    {Object.entries(PAPEL_LABEL)
                      .filter(([k]) => k !== 'super_admin')
                      .map(([k, label]) => <option key={k} value={k}>{label}</option>)}
                  </select>
                </div>
                <div>
                  <p style={{ fontSize: '10px', color: '#444', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '6px' }}>Profissional vinculado</p>
                  <select
                    className="input"
                    style={{ fontSize: '13px' }}
                    value={u.profissional_id ?? ''}
                    onChange={e => salvar(u, 'profissional_id', e.target.value)}
                  >
                    <option value="">Nenhum profissional</option>
                    {profissionais.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
                  </select>
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#A3A3A3', cursor: 'pointer' }}>
                  <input type="checkbox" checked={u.ativo} onChange={e => salvar(u, 'ativo', e.target.checked)} />
                  Ativo
                </label>
                <button className="btn btn-secondary btn-sm" onClick={() => abrirPermissoes(u)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                  <Shield size={12} /> Permissões de tela
                </button>
              </div>
            </motion.div>
          ))}
        </div>
      )}
      {!loading && usuarios.length === 0 && (
        <div className="card mobile-only-grid" style={{ padding: '56px', textAlign: 'center', color: '#444', fontSize: '13px' }}>
          Nenhum usuário encontrado (ou você não tem permissão pra ver essa tela).
        </div>
      )}

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
