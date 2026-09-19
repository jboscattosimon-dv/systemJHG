import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ShoppingCart, Wallet, Percent, Users, Package, Scissors, Calendar, AlertTriangle, Printer,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { formatCurrency, formatDate, formatDateTime } from '../lib/utils'
import { type Periodo, rangeFor } from '../lib/periodo'

const CATEGORIAS_PRODUTO = ['bebidas', 'pomadas', 'petiscos', 'outros']
const STATUS_COMISSAO = ['pendente', 'aprovada', 'paga', 'cancelada']
const STATUS_AGENDA = ['pendente', 'confirmado', 'em_atendimento', 'concluido', 'cancelado', 'nao_compareceu']

type Aba = 'vendas' | 'caixa' | 'comissoes' | 'clientes' | 'produtos' | 'profissionais' | 'agenda'

const ABAS: { id: Aba; label: string; icon: typeof ShoppingCart }[] = [
  { id: 'vendas',        label: 'Vendas',        icon: ShoppingCart },
  { id: 'caixa',         label: 'Caixa',         icon: Wallet },
  { id: 'comissoes',     label: 'Comissões',     icon: Percent },
  { id: 'clientes',      label: 'Clientes',      icon: Users },
  { id: 'produtos',      label: 'Produtos',      icon: Package },
  { id: 'profissionais', label: 'Profissionais', icon: Scissors },
  { id: 'agenda',        label: 'Agenda',        icon: Calendar },
]

interface LinhaVal { nome: string; total: number; qtd: number }

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card">
      <span style={{ fontSize: '11px', color: '#444', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</span>
      <p style={{ fontSize: '22px', fontWeight: 700, color: '#FFFFFF', marginTop: '10px', fontFamily: 'DM Sans, sans-serif' }}>{value}</p>
    </div>
  )
}

function Tabela({ colunas, linhas, vazio }: { colunas: string[]; linhas: (string | number)[][]; vazio: string }) {
  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <div className="list-header" style={{
        display: 'grid', gridTemplateColumns: `1fr repeat(${colunas.length - 1}, 120px)`,
        padding: '10px 24px', borderBottom: '1px solid #222',
        fontSize: '10px', fontWeight: 600, color: '#444', textTransform: 'uppercase', letterSpacing: '0.1em',
        background: 'rgba(0,0,0,0.2)',
      }}>
        {colunas.map(c => <span key={c}>{c}</span>)}
      </div>
      {linhas.length === 0 ? (
        <div style={{ padding: '40px', textAlign: 'center', color: '#444', fontSize: '13px' }}>{vazio}</div>
      ) : linhas.map((l, i) => (
        <div key={i} className="list-row" style={{
          display: 'grid', gridTemplateColumns: `1fr repeat(${colunas.length - 1}, 120px)`,
          padding: '11px 24px', alignItems: 'center',
          borderBottom: i < linhas.length - 1 ? '1px solid #1A1A1A' : 'none',
          fontSize: '13px', color: '#A3A3A3',
        }}>
          {l.map((v, j) => (
            <span key={j} style={{ color: j === 0 ? '#FFFFFF' : '#A3A3A3', fontWeight: j === 0 ? 500 : 400 }}>
              {j > 0 && <b className="mobile-only-label">{colunas[j]}: </b>}{v}
            </span>
          ))}
        </div>
      ))}
    </div>
  )
}

export default function Relatorios() {
  const [aba, setAba] = useState<Aba>('vendas')
  const [periodo, setPeriodo] = useState<Periodo>('mes')
  const [ref, setRef] = useState(new Date())
  const [custom, setCustom] = useState({ inicio: rangeFor('mes', new Date(), { inicio: '', fim: '' })[0], fim: rangeFor('mes', new Date(), { inicio: '', fim: '' })[1] })
  const [loading, setLoading] = useState(true)

  const [itensVenda, setItensVenda] = useState<any[]>([])
  const [sessoesCaixa, setSessoesCaixa] = useState<any[]>([])
  const [usuariosMap, setUsuariosMap] = useState<Record<string, string>>({})
  const [comissoesPeriodo, setComissoesPeriodo] = useState<any[]>([])
  const [clientes, setClientes] = useState<any[]>([])
  const [produtos, setProdutos] = useState<any[]>([])
  const [movimentacoes, setMovimentacoes] = useState<any[]>([])
  const [agendamentos, setAgendamentos] = useState<any[]>([])
  const [profissionais, setProfissionais] = useState<{ id: string; nome: string }[]>([])

  // Filtros específicos por aba
  const [filtroProfissionalId, setFiltroProfissionalId] = useState('')
  const [filtroFormaPagamento, setFiltroFormaPagamento] = useState('')
  const [filtroStatusComissao, setFiltroStatusComissao] = useState('')
  const [filtroCategoria, setFiltroCategoria] = useState('')
  const [filtroStatusAgenda, setFiltroStatusAgenda] = useState('')
  const [buscaCliente, setBuscaCliente] = useState('')

  const [inicio, fim] = rangeFor(periodo, ref, custom)

  const carregar = useCallback(async () => {
    setLoading(true)
    const inicioTS = `${inicio}T00:00:00`
    const fimTS = `${fim}T23:59:59`

    const [
      { data: itens },
      { data: sessoes },
      { data: comissoes },
      { data: cli },
      { data: prod },
      { data: movs },
      { data: agend },
      { data: profs },
    ] = await Promise.all([
      supabase.from('itens_comanda').select('tipo, nome, referencia_id, preco_unitario, quantidade, profissional_id, profissional:profissionais(nome), comanda:comandas(id, data, status, forma_pagamento, cliente_id, cliente_nome)'),
      supabase.from('sessoes_caixa').select('*').order('aberto_em', { ascending: false }),
      supabase.from('comissoes').select('*, profissional:profissionais(nome)').gte('created_at', inicioTS).lte('created_at', fimTS),
      supabase.from('clientes').select('*'),
      supabase.from('produtos').select('*'),
      supabase.from('movimentacoes_estoque').select('*, produto:produtos(nome)').gte('created_at', inicioTS).lte('created_at', fimTS).order('created_at', { ascending: false }).limit(100),
      supabase.from('agendamentos').select('status, profissional_id, profissional:profissionais(nome), servico:servicos(nome)').gte('data_hora', inicioTS).lte('data_hora', fimTS),
      supabase.from('profissionais').select('id, nome').order('nome'),
    ])

    setItensVenda((itens ?? []).filter((i: any) => i.comanda?.status === 'fechada' && i.comanda?.data >= inicio && i.comanda?.data <= fim))
    setSessoesCaixa((sessoes ?? []).filter((s: any) => s.aberto_em.slice(0, 10) >= inicio && s.aberto_em.slice(0, 10) <= fim))
    setComissoesPeriodo((comissoes ?? []) as any[])
    setClientes((cli ?? []) as any[])
    setProdutos((prod ?? []) as any[])
    setMovimentacoes((movs ?? []) as any[])
    setAgendamentos((agend ?? []) as any[])
    setProfissionais((profs ?? []) as { id: string; nome: string }[])

    const usuarios = await supabase.rpc('listar_usuarios')
    if (usuarios.data) {
      const map: Record<string, string> = {}
      ;(usuarios.data as any[]).forEach(u => { map[u.usuario_id] = u.email })
      setUsuariosMap(map)
    }

    setLoading(false)
  }, [inicio, fim])

  useEffect(() => { carregar() }, [carregar])

  // ── Filtros aplicados ──────────────────────────────────────
  const itensVendaFiltrados = itensVenda.filter((i: any) =>
    (!filtroProfissionalId || i.profissional_id === filtroProfissionalId) &&
    (!filtroFormaPagamento || i.comanda?.forma_pagamento === filtroFormaPagamento)
  )
  const comissoesFiltradas = comissoesPeriodo.filter((c: any) =>
    (!filtroProfissionalId || c.profissional_id === filtroProfissionalId) &&
    (!filtroStatusComissao || c.status === filtroStatusComissao)
  )
  const produtosFiltrados = produtos.filter((p: any) => !filtroCategoria || p.categoria === filtroCategoria)
  const agendamentosFiltrados = agendamentos.filter((a: any) =>
    (!filtroProfissionalId || a.profissional_id === filtroProfissionalId) &&
    (!filtroStatusAgenda || a.status === filtroStatusAgenda)
  )
  const formasPagamentoDisponiveis = [...new Set(itensVenda.map((i: any) => i.comanda?.forma_pagamento).filter(Boolean))] as string[]

  // ── Agregações de vendas ──────────────────────────────────
  const comandaMap = new Map<string, { total: number; forma_pagamento: string; cliente_id: string; cliente_nome: string }>()
  const porServico: Record<string, LinhaVal> = {}
  const porProduto: Record<string, LinhaVal> = {}
  const porProfissional: Record<string, LinhaVal> = {}
  itensVendaFiltrados.forEach((i: any) => {
    const valor = i.preco_unitario * i.quantidade
    const cId = i.comanda?.id
    if (cId) {
      const ex = comandaMap.get(cId) ?? { total: 0, forma_pagamento: i.comanda.forma_pagamento ?? '—', cliente_id: i.comanda.cliente_id, cliente_nome: i.comanda.cliente_nome ?? 'Balcão' }
      ex.total += valor
      comandaMap.set(cId, ex)
    }
    const alvo = i.tipo === 'servico' ? porServico : porProduto
    if (!alvo[i.nome]) alvo[i.nome] = { nome: i.nome, total: 0, qtd: 0 }
    alvo[i.nome].total += valor
    alvo[i.nome].qtd += i.quantidade
    if (i.profissional?.nome) {
      if (!porProfissional[i.profissional.nome]) porProfissional[i.profissional.nome] = { nome: i.profissional.nome, total: 0, qtd: 0 }
      porProfissional[i.profissional.nome].total += valor
      porProfissional[i.profissional.nome].qtd += i.tipo === 'servico' ? 1 : 0
    }
  })
  const totalVendido = [...comandaMap.values()].reduce((s, c) => s + c.total, 0)
  const numVendas = comandaMap.size
  const ticketMedio = numVendas > 0 ? totalVendido / numVendas : 0
  const porFormaPagamento: Record<string, LinhaVal> = {}
  const porCliente: Record<string, LinhaVal> = {}
  comandaMap.forEach(c => {
    if (!porFormaPagamento[c.forma_pagamento]) porFormaPagamento[c.forma_pagamento] = { nome: c.forma_pagamento, total: 0, qtd: 0 }
    porFormaPagamento[c.forma_pagamento].total += c.total
    porFormaPagamento[c.forma_pagamento].qtd += 1
    if (!porCliente[c.cliente_nome]) porCliente[c.cliente_nome] = { nome: c.cliente_nome, total: 0, qtd: 0 }
    porCliente[c.cliente_nome].total += c.total
    porCliente[c.cliente_nome].qtd += 1
  })
  const top = (rec: Record<string, LinhaVal>, n = 10) => Object.values(rec).sort((a, b) => b.total - a.total).slice(0, n)

  // ── Caixa ──────────────────────────────────────────────────
  const totalEntradasCaixa = sessoesCaixa.reduce((s, x) => s + (x.saldo_esperado != null ? (x.saldo_esperado - x.valor_inicial) : 0), 0)
  const totalDiferencas = sessoesCaixa.reduce((s, x) => s + (x.diferenca ?? 0), 0)

  // ── Comissões ────────────────────────────────────────────
  const comissaoPorProf: Record<string, { nome: string; gerado: number; pendente: number; aprovada: number; paga: number }> = {}
  comissoesFiltradas.forEach((c: any) => {
    const nome = c.profissional?.nome ?? '—'
    if (!comissaoPorProf[nome]) comissaoPorProf[nome] = { nome, gerado: 0, pendente: 0, aprovada: 0, paga: 0 }
    comissaoPorProf[nome].gerado += c.valor_comissao
    if (c.status === 'pendente') comissaoPorProf[nome].pendente += c.valor_comissao
    if (c.status === 'aprovada') comissaoPorProf[nome].aprovada += c.valor_comissao
    if (c.status === 'paga') comissaoPorProf[nome].paga += c.valor_comissao
  })

  // ── Clientes ─────────────────────────────────────────────
  const novosClientes = clientes.filter(c => c.created_at.slice(0, 10) >= inicio && c.created_at.slice(0, 10) <= fim).length
  const clientesAtivos = clientes.filter(c => c.ativo).length
  const clientesInativos = clientes.filter(c => !c.ativo).length
  const porClienteFiltrado = Object.values(porCliente).filter(c => c.nome.toLowerCase().includes(buscaCliente.toLowerCase()))

  // ── Produtos ─────────────────────────────────────────────
  const estoqueBaixo = produtosFiltrados.filter(p => p.estoque_atual <= p.estoque_minimo && p.ativo)
  const idsVendidos = new Set(itensVenda.filter((i: any) => i.tipo === 'produto').map((i: any) => i.referencia_id))
  const produtosSemVenda = produtosFiltrados.filter(p => p.ativo && !idsVendidos.has(p.id))

  // ── Profissionais (combina vendas + comissao) ───────────
  const profissionaisNomes = new Set([...Object.keys(porProfissional), ...Object.keys(comissaoPorProf)])
  const relatorioProfissionais = [...profissionaisNomes].map(nome => {
    const venda = porProfissional[nome] ?? { total: 0, qtd: 0 }
    const com = comissaoPorProf[nome] ?? { gerado: 0 }
    return { nome, atendimentos: venda.qtd, faturamento: venda.total, comissao: com.gerado, ticketMedio: venda.qtd > 0 ? venda.total / venda.qtd : 0 }
  }).sort((a, b) => b.faturamento - a.faturamento)

  // ── Agenda ───────────────────────────────────────────────
  const totalAgend = agendamentosFiltrados.length
  const concluidos = agendamentosFiltrados.filter((a: any) => a.status === 'concluido').length
  const cancelados = agendamentosFiltrados.filter((a: any) => a.status === 'cancelado').length
  const naoCompareceu = agendamentosFiltrados.filter((a: any) => a.status === 'nao_compareceu').length
  const finalizados = concluidos + cancelados + naoCompareceu
  const taxaComparecimento = finalizados > 0 ? (concluidos / finalizados) * 100 : 0
  const agendaPorProf: Record<string, { nome: string; total: number; concluidos: number; cancelados: number }> = {}
  agendamentosFiltrados.forEach((a: any) => {
    const nome = a.profissional?.nome ?? '—'
    if (!agendaPorProf[nome]) agendaPorProf[nome] = { nome, total: 0, concluidos: 0, cancelados: 0 }
    agendaPorProf[nome].total += 1
    if (a.status === 'concluido') agendaPorProf[nome].concluidos += 1
    if (a.status === 'cancelado' || a.status === 'nao_compareceu') agendaPorProf[nome].cancelados += 1
  })

  return (
    <div className="page">
      <div className="page-header-row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
        <div>
          <h1 style={{ fontSize: '24px', color: '#FFFFFF' }}>Relatórios</h1>
          <p style={{ fontSize: '13px', color: '#555', marginTop: '3px' }}>{inicio} até {fim}</p>
        </div>
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          {(['mes', 'trimestre', 'ano', 'personalizado'] as Periodo[]).map(p => (
            <button
              key={p}
              onClick={() => setPeriodo(p)}
              style={{
                padding: '6px 14px', borderRadius: '99px', fontFamily: 'inherit',
                border: periodo === p ? '1px solid #FFFFFF' : '1px solid #2A2A2A',
                background: periodo === p ? 'rgba(255,255,255,0.08)' : 'transparent',
                color: periodo === p ? '#FFFFFF' : '#555',
                fontSize: '12px', cursor: 'pointer', textTransform: 'capitalize',
              }}
            >
              {p}
            </button>
          ))}
          <button className="btn btn-secondary btn-sm no-print" onClick={() => window.print()} style={{ display: 'flex', alignItems: 'center', gap: '6px', marginLeft: '6px' }}>
            <Printer size={13} /> Imprimir / PDF
          </button>
        </div>
      </div>

      {periodo === 'personalizado' && (
        <div className="no-print" style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
          <div className="field">
            <label className="label">De</label>
            <input className="input" type="date" value={custom.inicio} onChange={e => setCustom(c => ({ ...c, inicio: e.target.value }))} />
          </div>
          <div className="field">
            <label className="label">Até</label>
            <input className="input" type="date" value={custom.fim} onChange={e => setCustom(c => ({ ...c, fim: e.target.value }))} />
          </div>
        </div>
      )}
      {periodo !== 'personalizado' && (
        <div className="no-print" style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
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

      <RelatoriosEstilos />

      <div className="no-print" style={{ display: 'flex', gap: '2px', padding: '4px', background: '#1A1A1A', border: '1px solid #252525', borderRadius: '9px', width: 'fit-content', marginBottom: '16px', flexWrap: 'wrap' }}>
        {ABAS.map(a => {
          const Icon = a.icon
          return (
            <button
              key={a.id}
              onClick={() => setAba(a.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                padding: '7px 14px', borderRadius: '7px',
                border: aba === a.id ? '1px solid #FFFFFF' : '1px solid transparent',
                background: aba === a.id ? 'rgba(255,255,255,0.07)' : 'transparent',
                color: aba === a.id ? '#FFFFFF' : '#555',
                fontSize: '13px', fontWeight: aba === a.id ? 600 : 400,
                cursor: 'pointer', transition: 'all 0.15s', fontFamily: 'inherit',
              }}
            >
              <Icon size={13} /> {a.label}
            </button>
          )
        })}
      </div>

      {/* Filtros específicos da aba */}
      <div className="no-print" style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '20px' }}>
        {(aba === 'vendas' || aba === 'comissoes' || aba === 'profissionais' || aba === 'agenda') && (
          <select className="input" style={{ width: '200px' }} value={filtroProfissionalId} onChange={e => setFiltroProfissionalId(e.target.value)}>
            <option value="">Todos os profissionais</option>
            {profissionais.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
          </select>
        )}
        {aba === 'vendas' && (
          <select className="input" style={{ width: '200px' }} value={filtroFormaPagamento} onChange={e => setFiltroFormaPagamento(e.target.value)}>
            <option value="">Todas as formas de pagamento</option>
            {formasPagamentoDisponiveis.map(f => <option key={f} value={f}>{f}</option>)}
          </select>
        )}
        {aba === 'comissoes' && (
          <select className="input" style={{ width: '200px' }} value={filtroStatusComissao} onChange={e => setFiltroStatusComissao(e.target.value)}>
            <option value="">Todos os status</option>
            {STATUS_COMISSAO.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        )}
        {aba === 'clientes' && (
          <input className="input" style={{ width: '240px' }} placeholder="Buscar cliente..." value={buscaCliente} onChange={e => setBuscaCliente(e.target.value)} />
        )}
        {aba === 'produtos' && (
          <select className="input" style={{ width: '200px' }} value={filtroCategoria} onChange={e => setFiltroCategoria(e.target.value)}>
            <option value="">Todas as categorias</option>
            {CATEGORIAS_PRODUTO.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        )}
        {aba === 'agenda' && (
          <select className="input" style={{ width: '200px' }} value={filtroStatusAgenda} onChange={e => setFiltroStatusAgenda(e.target.value)}>
            <option value="">Todos os status</option>
            {STATUS_AGENDA.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        )}
      </div>

      {loading ? (
        <div className="card" style={{ padding: '56px', textAlign: 'center', color: '#444', fontSize: '13px' }}>Carregando...</div>
      ) : (
        <AnimatePresence mode="wait">
          <motion.div id="area-impressao" key={aba} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>

            {aba === 'vendas' && (
              <>
                <div className="stat-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '20px' }}>
                  <Stat label="Total vendido" value={formatCurrency(totalVendido)} />
                  <Stat label="Nº de vendas" value={String(numVendas)} />
                  <Stat label="Ticket médio" value={formatCurrency(ticketMedio)} />
                </div>
                <p style={{ fontSize: '12px', color: '#555', margin: '20px 0 8px' }}>Por forma de pagamento</p>
                <Tabela colunas={['Forma', 'Vendas', 'Total']} vazio="Sem vendas no período." linhas={top(porFormaPagamento).map(f => [f.nome, f.qtd, formatCurrency(f.total)])} />
                <p style={{ fontSize: '12px', color: '#555', margin: '20px 0 8px' }}>Por profissional</p>
                <Tabela colunas={['Profissional', 'Atendimentos', 'Faturamento']} vazio="Sem vendas no período." linhas={top(porProfissional).map(f => [f.nome, f.qtd, formatCurrency(f.total)])} />
                <p style={{ fontSize: '12px', color: '#555', margin: '20px 0 8px' }}>Top serviços</p>
                <Tabela colunas={['Serviço', 'Qtd', 'Total']} vazio="Sem vendas no período." linhas={top(porServico).map(f => [f.nome, f.qtd, formatCurrency(f.total)])} />
                <p style={{ fontSize: '12px', color: '#555', margin: '20px 0 8px' }}>Top produtos</p>
                <Tabela colunas={['Produto', 'Qtd', 'Total']} vazio="Sem vendas no período." linhas={top(porProduto).map(f => [f.nome, f.qtd, formatCurrency(f.total)])} />
                <p style={{ fontSize: '12px', color: '#555', margin: '20px 0 8px' }}>Top clientes</p>
                <Tabela colunas={['Cliente', 'Compras', 'Total gasto']} vazio="Sem vendas no período." linhas={top(porCliente).map(f => [f.nome, f.qtd, formatCurrency(f.total)])} />
              </>
            )}

            {aba === 'caixa' && (
              <>
                <div className="stat-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '20px' }}>
                  <Stat label="Sessões no período" value={String(sessoesCaixa.length)} />
                  <Stat label="Movimentado (entradas líquidas)" value={formatCurrency(totalEntradasCaixa)} />
                  <Stat label="Soma das diferenças" value={formatCurrency(totalDiferencas)} />
                </div>
                {sessoesCaixa.some(s => Math.abs(s.diferenca ?? 0) > 0) && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 16px', background: 'rgba(255,255,255,0.04)', border: '1px solid #333', borderRadius: '8px', marginBottom: '16px', fontSize: '12px', color: '#A3A3A3' }}>
                    <AlertTriangle size={13} /> Há sessões fechadas com diferença entre o valor esperado e o contado.
                  </div>
                )}
                <Tabela
                  colunas={['Operador', 'Aberto em', 'Inicial', 'Esperado', 'Informado', 'Diferença', 'Status']}
                  vazio="Nenhuma sessão de caixa no período."
                  linhas={sessoesCaixa.map(s => [
                    usuariosMap[s.usuario_id] ?? s.usuario_id.slice(0, 8),
                    formatDateTime(s.aberto_em),
                    formatCurrency(s.valor_inicial),
                    s.saldo_esperado != null ? formatCurrency(s.saldo_esperado) : '—',
                    s.valor_informado != null ? formatCurrency(s.valor_informado) : '—',
                    s.diferenca != null ? formatCurrency(s.diferenca) : '—',
                    s.status,
                  ])}
                />
              </>
            )}

            {aba === 'comissoes' && (
              <>
                <div className="stat-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '20px' }}>
                  <Stat label="Total gerado" value={formatCurrency(Object.values(comissaoPorProf).reduce((s, c) => s + c.gerado, 0))} />
                  <Stat label="Pago" value={formatCurrency(Object.values(comissaoPorProf).reduce((s, c) => s + c.paga, 0))} />
                  <Stat label="Pendente + Aprovada" value={formatCurrency(Object.values(comissaoPorProf).reduce((s, c) => s + c.pendente + c.aprovada, 0))} />
                </div>
                <Tabela
                  colunas={['Profissional', 'Gerado', 'Pendente', 'Aprovada', 'Paga']}
                  vazio="Nenhuma comissão no período (ou seu papel não tem acesso a esse dado)."
                  linhas={Object.values(comissaoPorProf).sort((a, b) => b.gerado - a.gerado).map(c => [c.nome, formatCurrency(c.gerado), formatCurrency(c.pendente), formatCurrency(c.aprovada), formatCurrency(c.paga)])}
                />
              </>
            )}

            {aba === 'clientes' && (
              <>
                <div className="stat-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '20px' }}>
                  <Stat label="Novos no período" value={String(novosClientes)} />
                  <Stat label="Ativos" value={String(clientesAtivos)} />
                  <Stat label="Inativos" value={String(clientesInativos)} />
                  <Stat label="Ticket médio geral" value={formatCurrency(ticketMedio)} />
                </div>
                <p style={{ fontSize: '12px', color: '#555', margin: '20px 0 8px' }}>Clientes que mais gastam no período</p>
                <Tabela
                  colunas={['Cliente', 'Compras', 'Total gasto']}
                  vazio={buscaCliente ? 'Nenhum cliente encontrado.' : 'Sem vendas no período.'}
                  linhas={porClienteFiltrado.sort((a, b) => b.total - a.total).slice(0, 15).map(f => [f.nome, f.qtd, formatCurrency(f.total)])}
                />
              </>
            )}

            {aba === 'produtos' && (
              <>
                <div className="stat-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '20px' }}>
                  <Stat label="Estoque baixo" value={String(estoqueBaixo.length)} />
                  <Stat label="Sem venda no período" value={String(produtosSemVenda.length)} />
                  <Stat label="Movimentações no período" value={String(movimentacoes.length)} />
                </div>
                <p style={{ fontSize: '12px', color: '#555', margin: '20px 0 8px' }}>Mais vendidos</p>
                <Tabela colunas={['Produto', 'Qtd', 'Total']} vazio="Sem vendas no período." linhas={top(porProduto).map(f => [f.nome, f.qtd, formatCurrency(f.total)])} />
                <p style={{ fontSize: '12px', color: '#555', margin: '20px 0 8px' }}>Estoque baixo</p>
                <Tabela colunas={['Produto', 'Atual', 'Mínimo']} vazio="Nenhum produto abaixo do mínimo." linhas={estoqueBaixo.map(p => [p.nome, p.estoque_atual, p.estoque_minimo])} />
                <p style={{ fontSize: '12px', color: '#555', margin: '20px 0 8px' }}>Sem venda no período</p>
                <Tabela colunas={['Produto', 'Estoque atual', '']} vazio="Todos os produtos ativos venderam no período." linhas={produtosSemVenda.map(p => [p.nome, p.estoque_atual, ''])} />
                <p style={{ fontSize: '12px', color: '#555', margin: '20px 0 8px' }}>Movimentações recentes</p>
                <Tabela colunas={['Produto', 'Tipo', 'Qtd', 'Quando']} vazio="Nenhuma movimentação no período." linhas={movimentacoes.slice(0, 20).map((m: any) => [m.produto?.nome ?? '—', m.tipo, m.quantidade, formatDate(m.created_at)])} />
              </>
            )}

            {aba === 'profissionais' && (
              <Tabela
                colunas={['Profissional', 'Atendimentos', 'Faturamento', 'Comissão', 'Ticket médio']}
                vazio="Sem dados no período."
                linhas={relatorioProfissionais.map(p => [p.nome, p.atendimentos, formatCurrency(p.faturamento), formatCurrency(p.comissao), formatCurrency(p.ticketMedio)])}
              />
            )}

            {aba === 'agenda' && (
              <>
                <div className="stat-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '20px' }}>
                  <Stat label="Agendamentos" value={String(totalAgend)} />
                  <Stat label="Concluídos" value={String(concluidos)} />
                  <Stat label="Cancelados / Faltas" value={String(cancelados + naoCompareceu)} />
                  <Stat label="Taxa de comparecimento" value={`${taxaComparecimento.toFixed(0)}%`} />
                </div>
                <Tabela
                  colunas={['Profissional', 'Total', 'Concluídos', 'Cancelados/Faltas']}
                  vazio="Sem agendamentos no período."
                  linhas={Object.values(agendaPorProf).sort((a, b) => b.total - a.total).map(p => [p.nome, p.total, p.concluidos, p.cancelados])}
                />
              </>
            )}
          </motion.div>
        </AnimatePresence>
      )}
    </div>
  )
}

function RelatoriosEstilos() {
  return (
    <style>{`
      @media print {
        .no-print { display: none !important; }
        aside, header { display: none !important; }
        body * { visibility: hidden; }
        #area-impressao, #area-impressao * { visibility: visible; }
        #area-impressao { position: absolute; inset: 0; margin: 0; padding: 12px; }
      }
    `}</style>
  )
}
