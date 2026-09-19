import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import { Percent } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { formatCurrency, formatDate } from '../lib/utils'
import type { Comissao, ComissaoStatus, Profissional } from '../types'

const STATUS_LABEL: Record<ComissaoStatus, string> = {
  pendente: 'Pendente', aprovada: 'Aprovada', paga: 'Paga', cancelada: 'Cancelada',
}
const STATUS_CLASS: Record<ComissaoStatus, string> = {
  pendente: 'badge badge-pending', aprovada: 'badge badge-confirmed',
  paga: 'badge badge-done', cancelada: 'badge badge-canceled',
}
const PROXIMO_STATUS: Partial<Record<ComissaoStatus, ComissaoStatus>> = {
  pendente: 'aprovada', aprovada: 'paga',
}
const PROXIMO_LABEL: Partial<Record<ComissaoStatus, string>> = {
  pendente: 'Aprovar', aprovada: 'Marcar como paga',
}

type FiltroStatus = 'todas' | ComissaoStatus

export default function Comissoes() {
  const [comissoes, setComissoes] = useState<(Comissao & { created_at: string })[]>([])
  const [profissionais, setProfissionais] = useState<Profissional[]>([])
  const [filtroProf, setFiltroProf] = useState('')
  const [filtroStatus, setFiltroStatus] = useState<FiltroStatus>('todas')
  const [loading, setLoading] = useState(true)

  const carregar = useCallback(() => {
    setLoading(true)
    supabase.from('comissoes').select('*, profissional:profissionais(*)').order('created_at', { ascending: false }).limit(200)
      .then(({ data }) => { setComissoes((data ?? []) as (Comissao & { created_at: string })[]); setLoading(false) })
  }, [])

  useEffect(() => {
    carregar()
    supabase.from('profissionais').select('*').order('nome')
      .then(({ data }) => { if (data) setProfissionais(data as Profissional[]) })
  }, [carregar])

  const filtradas = comissoes
    .filter(c => !filtroProf || c.profissional_id === filtroProf)
    .filter(c => filtroStatus === 'todas' || c.status === filtroStatus)

  const totalGerado   = filtradas.reduce((s, c) => s + c.valor_comissao, 0)
  const totalPendente = filtradas.filter(c => c.status === 'pendente').reduce((s, c) => s + c.valor_comissao, 0)
  const totalPaga     = filtradas.filter(c => c.status === 'paga').reduce((s, c) => s + c.valor_comissao, 0)

  async function avancarStatus(c: Comissao) {
    const proximo = PROXIMO_STATUS[c.status]
    if (!proximo) return
    setComissoes(prev => prev.map(x => x.id === c.id ? { ...x, status: proximo } : x))
    await supabase.from('comissoes').update({ status: proximo }).eq('id', c.id)
  }

  async function cancelar(c: Comissao) {
    setComissoes(prev => prev.map(x => x.id === c.id ? { ...x, status: 'cancelada' } : x))
    await supabase.from('comissoes').update({ status: 'cancelada' }).eq('id', c.id)
  }

  return (
    <div className="page">
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '24px', color: '#FFFFFF' }}>Comissões</h1>
        <p style={{ fontSize: '13px', color: '#555', marginTop: '3px' }}>Geradas automaticamente pelas vendas do PDV</p>
      </div>

      <div className="stat-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '20px' }}>
        {[
          { label: 'Total gerado',   value: totalGerado },
          { label: 'Pendente',      value: totalPendente },
          { label: 'Paga',          value: totalPaga },
        ].map(s => (
          <div className="card" key={s.label}>
            <span style={{ fontSize: '11px', color: '#444', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{s.label}</span>
            <p style={{ fontSize: '22px', fontWeight: 700, color: '#FFFFFF', marginTop: '10px', fontFamily: 'DM Sans, sans-serif' }}>{formatCurrency(s.value)}</p>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', flexWrap: 'wrap' }}>
        <select className="input" style={{ width: 'auto' }} value={filtroProf} onChange={e => setFiltroProf(e.target.value)}>
          <option value="">Todos os profissionais</option>
          {profissionais.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
        </select>
        <div style={{ display: 'flex', gap: '6px' }}>
          {(['todas', 'pendente', 'aprovada', 'paga', 'cancelada'] as FiltroStatus[]).map(f => (
            <button
              key={f}
              onClick={() => setFiltroStatus(f)}
              style={{
                padding: '6px 14px', borderRadius: '99px', fontFamily: 'inherit',
                border: filtroStatus === f ? '1px solid #FFFFFF' : '1px solid #2A2A2A',
                background: filtroStatus === f ? 'rgba(255,255,255,0.08)' : 'transparent',
                color: filtroStatus === f ? '#FFFFFF' : '#555',
                fontSize: '12px', cursor: 'pointer', transition: 'all 0.15s', textTransform: 'capitalize',
              }}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="list-header" style={{
          display: 'grid', gridTemplateColumns: '1fr 100px 90px 90px 100px 140px',
          padding: '10px 24px', borderBottom: '1px solid #222',
          fontSize: '10px', fontWeight: 600, color: '#444', textTransform: 'uppercase', letterSpacing: '0.1em',
          background: 'rgba(0,0,0,0.2)',
        }}>
          <span>Profissional</span><span>Base</span><span>%</span><span>Comissão</span><span>Status</span><span></span>
        </div>

        {loading ? (
          <div style={{ padding: '56px', textAlign: 'center', color: '#444', fontSize: '13px' }}>Carregando...</div>
        ) : filtradas.length === 0 ? (
          <div style={{ padding: '56px', textAlign: 'center', color: '#444', fontSize: '13px' }}>Nenhuma comissão encontrada.</div>
        ) : filtradas.map((c, i) => (
          <motion.div
            key={c.id}
            className="list-row"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.02 }}
            style={{
              display: 'grid', gridTemplateColumns: '1fr 100px 90px 90px 100px 140px',
              padding: '13px 24px', alignItems: 'center',
              borderBottom: i < filtradas.length - 1 ? '1px solid #1A1A1A' : 'none',
            }}
          >
            <div>
              <span style={{ fontSize: '13px', fontWeight: 500, color: '#FFFFFF' }}>{c.profissional?.nome ?? '—'}</span>
              <p style={{ fontSize: '11px', color: '#444' }}>{formatDate(c.created_at)}</p>
            </div>
            <span style={{ fontSize: '12px', color: '#666' }}>{formatCurrency(c.valor_base)}</span>
            <span style={{ fontSize: '12px', color: '#666', display: 'flex', alignItems: 'center', gap: '2px' }}>
              <Percent size={10} /> {c.percentual}
            </span>
            <span style={{ fontSize: '13px', fontWeight: 600, color: '#FFFFFF' }}>{formatCurrency(c.valor_comissao)}</span>
            <span className={STATUS_CLASS[c.status]}>{STATUS_LABEL[c.status]}</span>
            <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
              {PROXIMO_STATUS[c.status] && (
                <button className="btn btn-secondary btn-sm" onClick={() => avancarStatus(c)}>{PROXIMO_LABEL[c.status]}</button>
              )}
              {(c.status === 'pendente' || c.status === 'aprovada') && (
                <button className="btn btn-icon" title="Cancelar" onClick={() => cancelar(c)}>×</button>
              )}
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  )
}
