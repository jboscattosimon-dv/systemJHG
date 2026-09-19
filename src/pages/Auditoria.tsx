import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { ChevronDown, ChevronRight as ChevronRightIcon, User } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { formatDateTime } from '../lib/utils'
import type { Auditoria as AuditoriaRow } from '../types'

const ACAO_LABEL: Record<string, string> = { insert: 'Criação', update: 'Alteração', delete: 'Exclusão' }
const MODULOS = ['comandas', 'sessoes_caixa', 'contas_pagar', 'contas_receber', 'agendamentos']
const CAMPOS_IGNORADOS = new Set(['created_at', 'updated_at', 'empresa_id', 'id'])

function formatarValor(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—'
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

function rotuloRegistro(l: AuditoriaRow): string {
  const alvo = (l.dados_depois ?? l.dados_antes) as Record<string, unknown> | undefined
  const nome = alvo?.descricao ?? alvo?.nome ?? alvo?.cliente_nome
  if (typeof nome === 'string' && nome.trim()) return nome
  return l.registro_id ? `#${l.registro_id.slice(0, 8)}` : '—'
}

function diffCampos(l: AuditoriaRow): { campo: string; de: unknown; para: unknown }[] {
  const antes = (l.dados_antes ?? {}) as Record<string, unknown>
  const depois = (l.dados_depois ?? {}) as Record<string, unknown>
  const chaves = new Set([...Object.keys(antes), ...Object.keys(depois)])
  const linhas: { campo: string; de: unknown; para: unknown }[] = []
  chaves.forEach(k => {
    if (CAMPOS_IGNORADOS.has(k)) return
    const de = antes[k]
    const para = depois[k]
    if (l.acao === 'update' && JSON.stringify(de) === JSON.stringify(para)) return
    linhas.push({ campo: k, de, para })
  })
  return linhas.sort((a, b) => a.campo.localeCompare(b.campo))
}

export default function Auditoria() {
  const [logs, setLogs] = useState<AuditoriaRow[]>([])
  const [usuariosMap, setUsuariosMap] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [filtroModulo, setFiltroModulo] = useState('')
  const [expandido, setExpandido] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    let query = supabase.from('auditoria').select('*').order('created_at', { ascending: false }).limit(200)
    if (filtroModulo) query = query.eq('modulo', filtroModulo)
    query.then(({ data }) => { setLogs((data ?? []) as AuditoriaRow[]); setLoading(false) })

    supabase.rpc('listar_usuarios').then(({ data }) => {
      if (!data) return
      const map: Record<string, string> = {}
      ;(data as any[]).forEach(u => { map[u.usuario_id] = u.email })
      setUsuariosMap(map)
    })
  }, [filtroModulo])

  return (
    <div className="page">
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '24px', color: '#FFFFFF' }}>Auditoria</h1>
        <p style={{ fontSize: '13px', color: '#555', marginTop: '3px' }}>
          Histórico de criação, alteração e exclusão nos módulos sensíveis (visível só pra admin/gerente)
        </p>
      </div>

      <div style={{ display: 'flex', gap: '6px', marginBottom: '20px', flexWrap: 'wrap' }}>
        <button
          onClick={() => setFiltroModulo('')}
          style={{
            padding: '6px 14px', borderRadius: '99px', fontFamily: 'inherit',
            border: filtroModulo === '' ? '1px solid #FFFFFF' : '1px solid #2A2A2A',
            background: filtroModulo === '' ? 'rgba(255,255,255,0.08)' : 'transparent',
            color: filtroModulo === '' ? '#FFFFFF' : '#555',
            fontSize: '12px', cursor: 'pointer',
          }}
        >
          Todos
        </button>
        {MODULOS.map(m => (
          <button
            key={m}
            onClick={() => setFiltroModulo(m)}
            style={{
              padding: '6px 14px', borderRadius: '99px', fontFamily: 'inherit',
              border: filtroModulo === m ? '1px solid #FFFFFF' : '1px solid #2A2A2A',
              background: filtroModulo === m ? 'rgba(255,255,255,0.08)' : 'transparent',
              color: filtroModulo === m ? '#FFFFFF' : '#555',
              fontSize: '12px', cursor: 'pointer',
            }}
          >
            {m}
          </button>
        ))}
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="list-header" style={{
          display: 'grid', gridTemplateColumns: '24px 120px 90px 1fr 180px 160px',
          padding: '10px 24px', borderBottom: '1px solid #222',
          fontSize: '10px', fontWeight: 600, color: '#444', textTransform: 'uppercase', letterSpacing: '0.1em',
          background: 'rgba(0,0,0,0.2)',
        }}>
          <span></span><span>Módulo</span><span>Ação</span><span>Registro</span><span>Usuário</span><span>Data/hora</span>
        </div>

        {loading ? (
          <div style={{ padding: '56px', textAlign: 'center', color: '#444', fontSize: '13px' }}>Carregando...</div>
        ) : logs.length === 0 ? (
          <div style={{ padding: '56px', textAlign: 'center', color: '#444', fontSize: '13px' }}>
            Nenhum registro encontrado (ou seu usuário não tem permissão pra ver a auditoria).
          </div>
        ) : logs.map((l, i) => {
          const diffs = diffCampos(l)
          return (
          <div key={l.id}>
            <motion.div
              className="list-row"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.01 }}
              onClick={() => setExpandido(expandido === l.id ? null : l.id)}
              style={{
                display: 'grid', gridTemplateColumns: '24px 120px 90px 1fr 180px 160px',
                padding: '12px 24px', alignItems: 'center', cursor: 'pointer',
                borderBottom: expandido === l.id ? 'none' : (i < logs.length - 1 ? '1px solid #1A1A1A' : 'none'),
              }}
            >
              {expandido === l.id ? <ChevronDown size={13} style={{ color: '#555' }} /> : <ChevronRightIcon size={13} style={{ color: '#555' }} />}
              <span style={{ fontSize: '13px', color: '#FFFFFF' }}>{l.modulo}</span>
              <span style={{ fontSize: '12px', color: '#A3A3A3' }}>{ACAO_LABEL[l.acao]}</span>
              <span style={{ fontSize: '12px', color: '#A3A3A3', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{rotuloRegistro(l)}</span>
              <span style={{ fontSize: '12px', color: '#A3A3A3', display: 'flex', alignItems: 'center', gap: '6px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                <User size={11} style={{ color: '#444', flexShrink: 0 }} />
                {l.usuario_id ? (usuariosMap[l.usuario_id] ?? l.usuario_id.slice(0, 8)) : '—'}
              </span>
              <span style={{ fontSize: '12px', color: '#444' }}>{formatDateTime(l.created_at)}</span>
            </motion.div>
            {expandido === l.id && (
              <div style={{ padding: '4px 24px 20px 50px', borderBottom: i < logs.length - 1 ? '1px solid #1A1A1A' : 'none', background: 'rgba(0,0,0,0.15)' }}>
                {diffs.length === 0 ? (
                  <p style={{ fontSize: '12px', color: '#444' }}>Nenhum campo relevante mudou.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    {diffs.map(d => (
                      <div key={d.campo} style={{ display: 'grid', gridTemplateColumns: '160px 1fr', fontSize: '12px', alignItems: 'baseline' }}>
                        <span style={{ color: '#666' }}>{d.campo}</span>
                        {l.acao === 'insert' ? (
                          <span style={{ color: '#A3A3A3' }}>{formatarValor(d.para)}</span>
                        ) : l.acao === 'delete' ? (
                          <span style={{ color: '#666', textDecoration: 'line-through' }}>{formatarValor(d.de)}</span>
                        ) : (
                          <span>
                            <span style={{ color: '#666', textDecoration: 'line-through' }}>{formatarValor(d.de)}</span>
                            {' → '}
                            <span style={{ color: '#FFFFFF' }}>{formatarValor(d.para)}</span>
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )})}
      </div>
    </div>
  )
}
