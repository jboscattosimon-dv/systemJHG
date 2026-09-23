import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  AreaChart, Area, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid,
} from 'recharts'
import { TrendingUp, TrendingDown, DollarSign, Plus, ArrowUpRight, ArrowDownRight, ChevronDown, ChevronUp } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { formatCurrency, formatDate } from '../lib/utils'
import { useModalKeyboard } from '../hooks/useModalKeyboard'
import { type Periodo, rangeFor } from '../lib/periodo'
import VendaDetalheModal from '../components/VendaDetalheModal'
import LancamentoDetalheModal from '../components/LancamentoDetalheModal'
import type { MovimentoCaixa } from '../types'

const GRAFICO_KEY = 'financeiro_grafico_aberto'

const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: { value: number; dataKey: string }[]; label?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: '#1E1E1E', border: '1px solid #333', borderRadius: '8px', padding: '12px 14px', fontSize: '13px' }}>
      <p style={{ color: '#666', marginBottom: '6px', fontSize: '11px' }}>{label}</p>
      {payload.map(p => (
        <p key={p.dataKey} style={{ color: p.dataKey === 'entrada' ? '#FFFFFF' : '#A3A3A3', marginBottom: '2px' }}>
          {p.dataKey === 'entrada' ? 'Entradas' : 'Saídas'}: {formatCurrency(p.value)}
        </p>
      ))}
    </div>
  )
}

export default function Financeiro() {
  const [movimentos, setMovimentos] = useState<MovimentoCaixa[]>([])
  const [chartData, setChartData] = useState<{ dia: string; entrada: number; saida: number }[]>([])
  const [aPagar, setAPagar] = useState({ aberto: 0, vencido: 0 })
  const [aReceber, setAReceber] = useState({ aberto: 0, vencido: 0 })
  const [showModal, setShowModal]   = useState(false)
  const [form, setForm] = useState({ tipo: 'saida', categoria: '', descricao: '', valor: '' })
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [lancamentoSelecionado, setLancamentoSelecionado] = useState<MovimentoCaixa | null>(null)
  const [periodo, setPeriodo] = useState<Periodo>('mes')
  const [ref, setRef] = useState(new Date())
  const [custom, setCustom] = useState({ inicio: new Date().toISOString().split('T')[0], fim: new Date().toISOString().split('T')[0] })
  const [graficoAberto, setGraficoAberto] = useState(() => {
    try { return localStorage.getItem(GRAFICO_KEY) !== '0' } catch { return true }
  })

  const [inicio, fim] = rangeFor(periodo, ref, custom)

  const hoje = new Date().toISOString().split('T')[0]
  const movHoje    = movimentos.filter(m => m.data === hoje)
  const entradas   = movimentos.filter(m => m.tipo === 'entrada').reduce((s, m) => s + m.valor, 0)
  const saidas     = movimentos.filter(m => m.tipo === 'saida').reduce((s, m) => s + m.valor, 0)
  const lucro      = entradas - saidas
  const entradasHoje = movHoje.filter(m => m.tipo === 'entrada').reduce((s, m) => s + m.valor, 0)

  function carregarMovimentos() {
    supabase.from('movimentos_caixa').select('*').gte('data', inicio).lte('data', fim).order('created_at', { ascending: false })
      .then(({ data }) => { setMovimentos((data ?? []) as MovimentoCaixa[]) })
  }

  function toggleGrafico() {
    setGraficoAberto(prev => {
      const next = !prev
      try { localStorage.setItem(GRAFICO_KEY, next ? '1' : '0') } catch { /* ignore */ }
      return next
    })
  }

  useEffect(() => {
    carregarMovimentos()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inicio, fim])

  useEffect(() => {
    const seteDiasAtras = new Date(Date.now() - 6 * 86400000).toISOString().split('T')[0]
    supabase.from('movimentos_caixa').select('tipo, valor, data').gte('data', seteDiasAtras)
      .then(({ data }) => {
        const porDia: Record<string, { entrada: number; saida: number }> = {}
        for (let i = 6; i >= 0; i--) {
          const d = new Date(Date.now() - i * 86400000)
          porDia[d.toISOString().split('T')[0]] = { entrada: 0, saida: 0 }
        }
        ;((data ?? []) as { tipo: string; valor: number; data: string }[]).forEach(m => {
          if (porDia[m.data]) porDia[m.data][m.tipo === 'entrada' ? 'entrada' : 'saida'] += m.valor
        })
        setChartData(Object.entries(porDia).map(([data, v]) => ({
          dia: DIAS_SEMANA[new Date(`${data}T12:00:00`).getDay()], ...v,
        })))
      })

    const hoje2 = new Date().toISOString().split('T')[0]
    supabase.from('contas_pagar').select('valor, valor_pago, status, data_vencimento').in('status', ['aberta', 'parcial'])
      .then(({ data }) => {
        const rows = (data ?? []) as { valor: number; valor_pago: number; data_vencimento: string }[]
        setAPagar({
          aberto: rows.reduce((s, c) => s + (c.valor - c.valor_pago), 0),
          vencido: rows.filter(c => c.data_vencimento < hoje2).reduce((s, c) => s + (c.valor - c.valor_pago), 0),
        })
      })
    supabase.from('contas_receber').select('valor, valor_pago, status, data_vencimento').in('status', ['aberta', 'parcial'])
      .then(({ data }) => {
        const rows = (data ?? []) as { valor: number; valor_pago: number; data_vencimento: string }[]
        setAReceber({
          aberto: rows.reduce((s, c) => s + (c.valor - c.valor_pago), 0),
          vencido: rows.filter(c => c.data_vencimento < hoje2).reduce((s, c) => s + (c.valor - c.valor_pago), 0),
        })
      })
  }, [])

  async function handleSave() {
    if (!form.descricao || !form.valor) return
    setSaving(true); setFormError('')
    const { error: err } = await supabase.rpc('registrar_movimento_caixa', {
      p_tipo: form.tipo, p_categoria: form.categoria || form.tipo,
      p_descricao: form.descricao, p_valor: Number(form.valor),
    })
    setSaving(false)
    if (err) { setFormError(err.message); return }
    carregarMovimentos()
    setForm({ tipo: 'saida', categoria: '', descricao: '', valor: '' })
    setShowModal(false)
  }

  async function handleExcluirLancamento() {
    if (!lancamentoSelecionado) return
    const { error: err } = await supabase.rpc('excluir_movimento_caixa', { p_id: lancamentoSelecionado.id })
    if (err) throw new Error(err.message)
    setMovimentos(prev => prev.filter(m => m.id !== lancamentoSelecionado.id))
    setLancamentoSelecionado(null)
  }

  const modalRef = useModalKeyboard(showModal, () => setShowModal(false), handleSave)

  return (
    <div className="page">
      {/* Header */}
      <div className="page-header-row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ fontSize: '24px', color: '#FFFFFF' }}>Financeiro</h1>
          <p style={{ fontSize: '13px', color: '#555', marginTop: '3px' }}>{inicio} até {fim}</p>
        </div>
        <button className="btn btn-secondary" onClick={() => { setFormError(''); setShowModal(true) }} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Plus size={14} /> Lançar Saída
        </button>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center', marginBottom: '20px' }}>
        {(['mes', 'trimestre', 'ano', 'personalizado'] as Periodo[]).map(p => (
          <button
            key={p}
            onClick={() => setPeriodo(p)}
            style={{
              padding: '6px 14px', borderRadius: '99px', fontFamily: 'inherit',
              border: periodo === p ? '1px solid #FFFFFF' : '1px solid #2A2A2A',
              background: periodo === p ? 'rgba(255,255,255,0.08)' : 'transparent',
              color: periodo === p ? '#FFFFFF' : '#555',
              fontSize: '12px', cursor: 'pointer', transition: 'all 0.15s', textTransform: 'capitalize',
            }}
          >
            {p}
          </button>
        ))}
        {periodo === 'personalizado' ? (
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginLeft: '4px' }}>
            <input className="input" type="date" style={{ padding: '6px 10px', fontSize: '12px' }} value={custom.inicio} onChange={e => setCustom(c => ({ ...c, inicio: e.target.value }))} />
            <span style={{ color: '#444', fontSize: '12px' }}>até</span>
            <input className="input" type="date" style={{ padding: '6px 10px', fontSize: '12px' }} value={custom.fim} onChange={e => setCustom(c => ({ ...c, fim: e.target.value }))} />
          </div>
        ) : (
          <div style={{ display: 'flex', gap: '6px', marginLeft: '4px' }}>
            <button className="btn btn-secondary btn-sm" onClick={() => setRef(d => {
              const n = new Date(d)
              if (periodo === 'mes') n.setMonth(n.getMonth() - 1)
              else if (periodo === 'trimestre') n.setMonth(n.getMonth() - 3)
              else n.setFullYear(n.getFullYear() - 1)
              return n
            })}>← Anterior</button>
            <button className="btn btn-secondary btn-sm" onClick={() => setRef(new Date())}>Hoje</button>
            <button className="btn btn-secondary btn-sm" onClick={() => setRef(d => {
              const n = new Date(d)
              if (periodo === 'mes') n.setMonth(n.getMonth() + 1)
              else if (periodo === 'trimestre') n.setMonth(n.getMonth() + 3)
              else n.setFullYear(n.getFullYear() + 1)
              return n
            })}>Próximo →</button>
          </div>
        )}
      </div>

      {/* Stats */}
      <div className="stat-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '16px', marginBottom: '24px' }}>
        {[
          { label: 'Entradas (total)', value: formatCurrency(entradas), icon: TrendingUp, suffix: `Hoje: ${formatCurrency(entradasHoje)}` },
          { label: 'Saídas (total)',   value: formatCurrency(saidas),   icon: TrendingDown, suffix: '' },
          { label: 'Lucro Líquido',    value: formatCurrency(lucro),    icon: DollarSign, suffix: '' },
          { label: 'A Pagar',          value: formatCurrency(aPagar.aberto),   icon: TrendingDown, suffix: aPagar.vencido > 0 ? `${formatCurrency(aPagar.vencido)} vencido` : '' },
          { label: 'A Receber',        value: formatCurrency(aReceber.aberto), icon: TrendingUp, suffix: aReceber.vencido > 0 ? `${formatCurrency(aReceber.vencido)} vencido` : '' },
        ].map((s, i) => {
          const Icon = s.icon
          return (
            <motion.div
              key={s.label}
              className="card"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.07 }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                <Icon size={15} style={{ color: '#555' }} />
                <span style={{ fontSize: '11px', color: '#444', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  {s.label}
                </span>
              </div>
              <p style={{ fontSize: '24px', fontWeight: 700, color: '#FFFFFF', fontFamily: 'DM Sans, sans-serif', letterSpacing: '-0.02em' }}>
                {s.value}
              </p>
              {s.suffix && <p style={{ fontSize: '11px', color: '#444', marginTop: '4px' }}>{s.suffix}</p>}
            </motion.div>
          )
        })}
      </div>

      {/* Chart */}
      <motion.div
        className="card"
        style={{ marginBottom: '24px' }}
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <button
          onClick={toggleGrafico}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%',
            background: 'transparent', border: 'none', cursor: 'pointer', padding: 0,
            marginBottom: graficoAberto ? '20px' : 0, fontFamily: 'inherit',
          }}
        >
          <span style={{ fontSize: '13px', fontWeight: 600, color: '#FFFFFF' }}>Últimos 7 dias</span>
          {graficoAberto ? <ChevronUp size={15} style={{ color: '#555' }} /> : <ChevronDown size={15} style={{ color: '#555' }} />}
        </button>
        {graficoAberto && (
          <>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="gEntrada" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#FFFFFF" stopOpacity={0.08} />
                    <stop offset="95%" stopColor="#FFFFFF" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gSaida" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#666666" stopOpacity={0.08} />
                    <stop offset="95%" stopColor="#666666" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1F1F1F" vertical={false} />
                <XAxis dataKey="dia" tick={{ fontSize: 11, fill: '#444' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#444' }} axisLine={false} tickLine={false} tickFormatter={v => `R$${v}`} />
                <Tooltip content={<CustomTooltip />} />
                <Area type="monotone" dataKey="entrada" stroke="#FFFFFF" strokeWidth={1.5} fill="url(#gEntrada)" dot={false} />
                <Area type="monotone" dataKey="saida"   stroke="#444444" strokeWidth={1.5} fill="url(#gSaida)"   dot={false} />
              </AreaChart>
            </ResponsiveContainer>
            <div style={{ display: 'flex', gap: '20px', marginTop: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#666' }}>
                <div style={{ width: '16px', height: '2px', background: '#FFFFFF', borderRadius: '1px' }} /> Entradas
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#666' }}>
                <div style={{ width: '16px', height: '2px', background: '#444', borderRadius: '1px' }} /> Saídas
              </div>
            </div>
          </>
        )}
      </motion.div>

      {/* Movements */}
      <motion.div
        className="card"
        style={{ padding: 0, overflow: 'hidden' }}
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
      >
        <div style={{ padding: '16px 24px', borderBottom: '1px solid #222' }}>
          <span style={{ fontSize: '13px', fontWeight: 600, color: '#FFFFFF' }}>Lançamentos</span>
        </div>
        <div className="list-header" style={{
          display: 'grid',
          gridTemplateColumns: '1fr 120px 100px 110px',
          padding: '10px 24px',
          borderBottom: '1px solid #1A1A1A',
          fontSize: '10px', fontWeight: 600, color: '#444',
          textTransform: 'uppercase', letterSpacing: '0.1em',
          background: 'rgba(0,0,0,0.2)',
        }}>
          <span>Descrição</span>
          <span>Categoria</span>
          <span>Data</span>
          <span>Valor</span>
        </div>
        {movimentos.length === 0 ? (
          <div style={{ padding: '48px', textAlign: 'center', color: '#444', fontSize: '13px' }}>
            Nenhum lançamento no período.
          </div>
        ) : movimentos.map((m, i) => (
          <div
            key={m.id}
            className="list-row"
            onClick={() => setLancamentoSelecionado(m)}
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 120px 100px 110px',
              padding: '13px 24px',
              borderBottom: i < movimentos.length - 1 ? '1px solid #1A1A1A' : 'none',
              alignItems: 'center',
              cursor: 'pointer',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
              {m.tipo === 'entrada'
                ? <ArrowUpRight size={13} style={{ color: '#FFFFFF', flexShrink: 0 }} />
                : <ArrowDownRight size={13} style={{ color: '#555', flexShrink: 0 }} />
              }
              <span style={{
                fontSize: '13px', color: m.tipo === 'entrada' ? '#FFFFFF' : '#A3A3A3', fontWeight: m.tipo === 'entrada' ? 500 : 400,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {m.descricao}
              </span>
            </div>
            <span style={{ fontSize: '12px', color: '#555', textTransform: 'capitalize' }}>{m.categoria}</span>
            <span style={{ fontSize: '12px', color: '#444' }}>{formatDate(m.data)}</span>
            <span style={{ fontSize: '14px', fontWeight: 600, color: m.tipo === 'entrada' ? '#FFFFFF' : '#555', fontFamily: 'DM Sans, sans-serif' }}>
              {m.tipo === 'saida' ? '−' : '+'}{formatCurrency(m.valor)}
            </span>
          </div>
        ))}
      </motion.div>

      {/* Modal saída */}
      {showModal && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}
        >
          <div ref={modalRef} className="card" style={{ width: '100%', maxWidth: '400px', padding: '28px' }}>
            <h2 style={{ fontSize: '18px', color: '#FFFFFF', marginBottom: '20px' }}>Lançar Movimento</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div className="field">
                <label className="label">Tipo</label>
                <select className="input" value={form.tipo} onChange={e => setForm(f => ({ ...f, tipo: e.target.value }))}>
                  <option value="entrada">Entrada</option>
                  <option value="saida">Saída</option>
                </select>
              </div>
              <div className="field">
                <label className="label">Categoria</label>
                <input className="input" placeholder="Ex: comissão, custo fixo..." value={form.categoria} onChange={e => setForm(f => ({ ...f, categoria: e.target.value }))} />
              </div>
              <div className="field">
                <label className="label">Descrição *</label>
                <input className="input" placeholder="Descrição do lançamento" value={form.descricao} onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))} />
              </div>
              <div className="field">
                <label className="label">Valor (R$) *</label>
                <input className="input" type="number" min={0} step={0.01} placeholder="0,00" value={form.valor} onChange={e => setForm(f => ({ ...f, valor: e.target.value }))} />
              </div>
              {formError && <p style={{ fontSize: '12px', color: '#666' }}>{formError}</p>}
              <div style={{ display: 'flex', gap: '10px', marginTop: '4px' }}>
                <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setShowModal(false)}>Cancelar (Esc)</button>
                <button className="btn btn-primary" style={{ flex: 1 }} onClick={handleSave} disabled={saving}>
                  {saving ? 'Salvando...' : 'Confirmar (F10)'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Detalhe do lançamento (clique numa linha) */}
      <AnimatePresence>
        {lancamentoSelecionado && (
          lancamentoSelecionado.comanda_id ? (
            <VendaDetalheModal
              comandaId={lancamentoSelecionado.comanda_id}
              onClose={() => setLancamentoSelecionado(null)}
              onDelete={handleExcluirLancamento}
            />
          ) : (
            <LancamentoDetalheModal
              movimento={lancamentoSelecionado}
              onClose={() => setLancamentoSelecionado(null)}
              onDelete={handleExcluirLancamento}
            />
          )
        )}
      </AnimatePresence>
    </div>
  )
}
