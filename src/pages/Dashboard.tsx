import { useEffect, useState, type MouseEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Calendar, Users, DollarSign, TrendingUp, TrendingDown, Wallet, Plus, Clock, ChevronRight } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { formatCurrency } from '../lib/utils'
import type { Agendamento } from '../types'

const STATUS_LABEL: Record<string, string> = {
  pendente:   'Pendente',
  confirmado: 'Confirmado',
  concluido:  'Concluído',
  cancelado:  'Cancelado',
}

const STATUS_CLASS: Record<string, string> = {
  pendente:   'badge badge-pending',
  confirmado: 'badge badge-confirmed',
  concluido:  'badge badge-done',
  cancelado:  'badge badge-canceled',
}

interface RankItem { nome: string; total: number }

function handleGlowMove(e: MouseEvent<HTMLDivElement>) {
  const rect = e.currentTarget.getBoundingClientRect()
  e.currentTarget.style.setProperty('--mx', `${((e.clientX - rect.left) / rect.width) * 100}%`)
  e.currentTarget.style.setProperty('--my', `${((e.clientY - rect.top) / rect.height) * 100}%`)
}

export default function Dashboard() {
  const navigate = useNavigate()
  const [agenda, setAgenda] = useState<Agendamento[]>([])
  const [loading, setLoading] = useState(true)
  const [financeiro, setFinanceiro] = useState({ faturamentoMes: 0, despesasMes: 0, aReceber: 0, aPagar: 0, saldoCaixa: 0, caixaAberto: false })
  const [topServicos, setTopServicos] = useState<RankItem[]>([])
  const [topProfissionais, setTopProfissionais] = useState<RankItem[]>([])

  const hora = new Date().getHours()
  const saudacao = hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite'
  const dataStr = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })

  useEffect(() => {
    const today = new Date().toISOString().split('T')[0]
    supabase
      .from('agendamentos')
      .select('*, cliente:clientes(*), profissional:profissionais(*), servico:servicos(*)')
      .gte('data_hora', `${today}T00:00:00`)
      .lte('data_hora', `${today}T23:59:59`)
      .order('data_hora')
      .then(({ data }) => {
        setAgenda((data ?? []) as Agendamento[])
        setLoading(false)
      })

    const primeiroDiaMes = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]

    supabase.from('movimentos_caixa').select('tipo, valor').gte('data', primeiroDiaMes)
      .then(({ data }) => {
        const rows = (data ?? []) as { tipo: string; valor: number }[]
        const faturamentoMes = rows.filter(r => r.tipo === 'entrada').reduce((s, r) => s + r.valor, 0)
        const despesasMes = rows.filter(r => r.tipo === 'saida').reduce((s, r) => s + r.valor, 0)
        setFinanceiro(f => ({ ...f, faturamentoMes, despesasMes }))
      })

    supabase.from('contas_receber').select('valor, valor_pago').in('status', ['aberta', 'parcial'])
      .then(({ data }) => {
        const total = ((data ?? []) as { valor: number; valor_pago: number }[]).reduce((s, c) => s + (c.valor - c.valor_pago), 0)
        setFinanceiro(f => ({ ...f, aReceber: total }))
      })
    supabase.from('contas_pagar').select('valor, valor_pago').in('status', ['aberta', 'parcial'])
      .then(({ data }) => {
        const total = ((data ?? []) as { valor: number; valor_pago: number }[]).reduce((s, c) => s + (c.valor - c.valor_pago), 0)
        setFinanceiro(f => ({ ...f, aPagar: total }))
      })

    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      supabase.from('sessoes_caixa').select('*').eq('usuario_id', user.id).eq('status', 'aberto').maybeSingle()
        .then(async ({ data: sessao }) => {
          if (!sessao) { setFinanceiro(f => ({ ...f, caixaAberto: false })); return }
          const { data: movs } = await supabase.from('movimentos_caixa').select('tipo, valor').eq('sessao_caixa_id', sessao.id)
          const rows = (movs ?? []) as { tipo: string; valor: number }[]
          const saldo = sessao.valor_inicial
            + rows.filter(r => r.tipo === 'entrada').reduce((s, r) => s + r.valor, 0)
            - rows.filter(r => r.tipo === 'saida').reduce((s, r) => s + r.valor, 0)
          setFinanceiro(f => ({ ...f, saldoCaixa: saldo, caixaAberto: true }))
        })
    })

    supabase
      .from('itens_comanda')
      .select('tipo, nome, preco_unitario, quantidade, profissional:profissionais(nome), comanda:comandas(data, status)')
      .then(({ data }) => {
        const rows = ((data ?? []) as any[]).filter(i => i.comanda?.status === 'fechada' && i.comanda?.data >= primeiroDiaMes)

        const servicos: Record<string, number> = {}
        const profissionaisMap: Record<string, number> = {}
        rows.forEach(i => {
          const valor = i.preco_unitario * i.quantidade
          if (i.tipo === 'servico') servicos[i.nome] = (servicos[i.nome] ?? 0) + valor
          if (i.profissional?.nome) profissionaisMap[i.profissional.nome] = (profissionaisMap[i.profissional.nome] ?? 0) + valor
        })
        setTopServicos(Object.entries(servicos).map(([nome, total]) => ({ nome, total })).sort((a, b) => b.total - a.total).slice(0, 5))
        setTopProfissionais(Object.entries(profissionaisMap).map(([nome, total]) => ({ nome, total })).sort((a, b) => b.total - a.total).slice(0, 5))
      })
  }, [])

  const confirmados = agenda.filter(a => a.status === 'confirmado').length
  const concluidos  = agenda.filter(a => a.status === 'concluido').length
  const cancelados  = agenda.filter(a => a.status === 'cancelado' || a.status === 'nao_compareceu').length
  const faturamentoHoje = agenda
    .filter(a => a.status === 'concluido')
    .reduce((sum, a) => sum + (a.valor ?? a.servico?.preco ?? 0), 0)

  const stats = [
    { label: 'Agendamentos', value: agenda.length, sub: 'hoje', icon: Calendar, to: '/agenda' },
    { label: 'Confirmados',  value: confirmados,   sub: 'aguardando', icon: Users, to: '/agenda' },
    { label: 'Concluídos',   value: concluidos,    sub: 'finalizados', icon: TrendingUp, to: '/agenda' },
    { label: 'Cancelamentos', value: cancelados,   sub: 'hoje', icon: TrendingDown, to: '/agenda' },
    { label: 'Faturamento',  value: formatCurrency(faturamentoHoje), sub: 'hoje', icon: DollarSign, to: '/relatorios' },
  ]

  const statsFinanceiro = [
    { label: 'Faturamento (mês)', value: formatCurrency(financeiro.faturamentoMes), icon: TrendingUp, to: '/relatorios' },
    { label: 'Despesas (mês)',    value: formatCurrency(financeiro.despesasMes),    icon: TrendingDown, to: '/financeiro' },
    { label: 'Lucro estimado',    value: formatCurrency(financeiro.faturamentoMes - financeiro.despesasMes), icon: DollarSign, to: '/dre' },
    { label: 'A Receber',         value: formatCurrency(financeiro.aReceber), icon: TrendingUp, to: '/contas-receber' },
    { label: 'A Pagar',           value: formatCurrency(financeiro.aPagar),   icon: TrendingDown, to: '/contas-pagar' },
    { label: 'Saldo de Caixa',    value: financeiro.caixaAberto ? formatCurrency(financeiro.saldoCaixa) : 'Fechado', icon: Wallet, to: '/caixa' },
  ]

  return (
    <div className="page">
      {/* Header */}
      <motion.div
        style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '36px' }}
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <div>
          <p style={{ fontSize: '11px', color: '#444', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: '6px' }}>
            {dataStr}
          </p>
          <h1 style={{ fontSize: '28px', color: '#FFFFFF', lineHeight: 1.1 }}>{saudacao}</h1>
          <p style={{ fontSize: '14px', color: '#A3A3A3', marginTop: '4px' }}>Resumo do dia.</p>
        </div>

        <button className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Plus size={14} strokeWidth={2.5} /> Novo Agendamento
        </button>
      </motion.div>

      {/* Stat cards */}
      <div className="dashboard-stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '16px', marginBottom: '28px' }}>
        {stats.map((s, i) => {
          const Icon = s.icon
          return (
            <motion.div
              key={s.label}
              className="card glow-card"
              onMouseMove={handleGlowMove}
              onClick={() => navigate(s.to)}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06, duration: 0.3 }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
                <div style={{
                  width: '36px', height: '36px',
                  background: 'rgba(255,255,255,0.06)',
                  borderRadius: '8px',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Icon size={16} style={{ color: '#A3A3A3' }} strokeWidth={1.75} />
                </div>
              </div>
              <p style={{ fontSize: '26px', fontWeight: 700, color: '#FFFFFF', letterSpacing: '-0.02em', fontFamily: 'DM Sans, sans-serif' }}>
                {s.value}
              </p>
              <p style={{ fontSize: '13px', color: '#A3A3A3', marginTop: '4px' }}>{s.label}</p>
              <p style={{ fontSize: '11px', color: '#555', marginTop: '2px' }}>{s.sub}</p>
            </motion.div>
          )
        })}
      </div>

      {/* Financeiro do mês */}
      <div className="dashboard-fin-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '16px', marginBottom: '28px' }}>
        {statsFinanceiro.map((s, i) => {
          const Icon = s.icon
          return (
            <motion.div
              key={s.label}
              className="card glow-card"
              onMouseMove={handleGlowMove}
              onClick={() => navigate(s.to)}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 + i * 0.05, duration: 0.3 }}
            >
              <Icon size={14} style={{ color: '#555', marginBottom: '10px' }} strokeWidth={1.75} />
              <p style={{ fontSize: '18px', fontWeight: 700, color: '#FFFFFF', fontFamily: 'DM Sans, sans-serif' }}>{s.value}</p>
              <p style={{ fontSize: '11px', color: '#666', marginTop: '4px' }}>{s.label}</p>
            </motion.div>
          )
        })}
      </div>

      {/* Rankings do mês */}
      <div className="dashboard-rankings-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '28px' }}>
        <div className="card">
          <p style={{ fontSize: '13px', fontWeight: 600, color: '#FFFFFF', marginBottom: '14px' }}>Serviços mais vendidos (mês)</p>
          {topServicos.length === 0 ? (
            <p style={{ fontSize: '12px', color: '#444' }}>Sem vendas no mês.</p>
          ) : topServicos.map(s => (
            <div key={s.nome} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #1A1A1A' }}>
              <span style={{ fontSize: '13px', color: '#A3A3A3' }}>{s.nome}</span>
              <span style={{ fontSize: '13px', color: '#FFFFFF', fontWeight: 600 }}>{formatCurrency(s.total)}</span>
            </div>
          ))}
        </div>
        <div className="card">
          <p style={{ fontSize: '13px', fontWeight: 600, color: '#FFFFFF', marginBottom: '14px' }}>Profissionais — faturamento (mês)</p>
          {topProfissionais.length === 0 ? (
            <p style={{ fontSize: '12px', color: '#444' }}>Sem vendas no mês.</p>
          ) : topProfissionais.map(p => (
            <div key={p.nome} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #1A1A1A' }}>
              <span style={{ fontSize: '13px', color: '#A3A3A3' }}>{p.nome}</span>
              <span style={{ fontSize: '13px', color: '#FFFFFF', fontWeight: 600 }}>{formatCurrency(p.total)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Agenda do dia */}
      <motion.div
        className="card"
        style={{ padding: 0, overflow: 'hidden' }}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2, duration: 0.3 }}
      >
        {/* Toolbar */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '18px 24px',
          borderBottom: '1px solid #2A2A2A',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Calendar size={15} style={{ color: '#666' }} strokeWidth={1.75} />
            <span style={{ fontSize: '14px', fontWeight: 600, color: '#FFFFFF' }}>Agenda de Hoje</span>
            <span style={{
              fontSize: '11px', fontWeight: 600,
              padding: '2px 8px', borderRadius: '99px',
              background: 'rgba(255,255,255,0.07)', color: '#A3A3A3',
            }}>
              {agenda.length}
            </span>
          </div>
          <button style={{
            display: 'flex', alignItems: 'center', gap: '4px',
            fontSize: '12px', color: '#555', background: 'none', border: 'none',
            cursor: 'pointer', transition: 'color 0.15s',
          }}>
            Ver agenda <ChevronRight size={12} />
          </button>
        </div>

        {/* Table header */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '70px 1fr 160px 140px',
          padding: '10px 24px',
          borderBottom: '1px solid #222',
          fontSize: '10px',
          fontWeight: 600,
          color: '#444',
          textTransform: 'uppercase',
          letterSpacing: '0.1em',
          background: 'rgba(0,0,0,0.2)',
        }}>
          <span>Hora</span>
          <span>Cliente / Serviço</span>
          <span>Profissional</span>
          <span>Status</span>
        </div>

        {/* Rows */}
        {loading ? (
          <div style={{ padding: '48px', textAlign: 'center', color: '#555', fontSize: '13px' }}>
            Carregando...
          </div>
        ) : agenda.map((ag, i) => {
          const hora = new Date(ag.data_hora).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
          return (
            <motion.div
              key={ag.id}
              style={{
                display: 'grid',
                gridTemplateColumns: '70px 1fr 160px 140px',
                padding: '14px 24px',
                borderBottom: i < agenda.length - 1 ? '1px solid #1F1F1F' : 'none',
                cursor: 'pointer',
                transition: 'background 0.12s ease',
              }}
              whileHover={{ backgroundColor: 'rgba(255,255,255,0.02)' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Clock size={11} style={{ color: '#333' }} />
                <span style={{ fontSize: '13px', fontWeight: 700, color: '#FFFFFF', fontVariantNumeric: 'tabular-nums' }}>
                  {hora}
                </span>
              </div>
              <div>
                <p style={{ fontSize: '13px', fontWeight: 500, color: '#FFFFFF' }}>{ag.cliente?.nome}</p>
                <p style={{ fontSize: '11px', color: '#555', marginTop: '2px' }}>{ag.servico?.nome}</p>
              </div>
              <div style={{ fontSize: '13px', color: '#A3A3A3', display: 'flex', alignItems: 'center' }}>
                {ag.profissional?.nome}
              </div>
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <span className={STATUS_CLASS[ag.status] ?? 'badge badge-pending'}>
                  {STATUS_LABEL[ag.status]}
                </span>
              </div>
            </motion.div>
          )
        })}
      </motion.div>
    </div>
  )
}
