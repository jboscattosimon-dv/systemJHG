import { useState, useEffect, useCallback, useMemo, type KeyboardEvent } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, X, Minus, Trash2, Search, Package, Check, RotateCcw, ScanLine, Info } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { formatCurrency, formatDate } from '../lib/utils'
import { useModalKeyboard } from '../hooks/useModalKeyboard'
import ScannerCamera from '../components/ScannerCamera'
import type { Condicional, Cliente, Produto, PagamentoMetodo } from '../types'

const PAGAMENTOS: { id: PagamentoMetodo; label: string }[] = [
  { id: 'pix',      label: 'Pix'            },
  { id: 'credito',  label: 'Cartão Crédito' },
  { id: 'debito',   label: 'Cartão Débito'  },
  { id: 'dinheiro', label: 'Dinheiro'       },
]

type Filtro = 'aberto' | 'fechado' | 'todos'
type ItemNovo = { produto_id: string; nome: string; tamanho?: string; quantidade: number; preco_unitario: number }
type Decisao = 'vendido' | 'devolvido'

const STATUS_LABEL: Record<string, string> = { aberto: 'Aberto', fechado: 'Fechado' }

export default function Condicionais() {
  const [condicionais, setCondicionais] = useState<Condicional[]>([])
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [produtos, setProdutos] = useState<Produto[]>([])
  const [loading, setLoading] = useState(true)
  const [filtro, setFiltro] = useState<Filtro>('aberto')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  // Novo condicional
  const [showNovo, setShowNovo] = useState(false)
  const [clienteId, setClienteId] = useState('')
  const [buscaCliente, setBuscaCliente] = useState('')
  const [showNovoCliente, setShowNovoCliente] = useState(false)
  const [novoClienteForm, setNovoClienteForm] = useState({ nome: '', telefone: '' })
  const [savingCliente, setSavingCliente] = useState(false)
  const [erroCliente, setErroCliente] = useState('')
  const [observacao, setObservacao] = useState('')
  const [itensNovo, setItensNovo] = useState<ItemNovo[]>([])
  const [buscaProduto, setBuscaProduto] = useState('')
  const [tamanhoPicker, setTamanhoPicker] = useState<Produto | null>(null)
  const [showScanner, setShowScanner] = useState(false)
  const [scanAviso, setScanAviso] = useState('')

  // Detalhes do condicional (clique no card/linha)
  const [condDetalhe, setCondDetalhe] = useState<Condicional | null>(null)
  const [taxasCartao, setTaxasCartao] = useState<Record<number, number>>({})
  const [mostrarParcelasCartao, setMostrarParcelasCartao] = useState(false)

  // Fechar condicional
  const [condFechar, setCondFechar] = useState<Condicional | null>(null)
  const [decisoes, setDecisoes] = useState<Record<string, Decisao>>({})
  const [pagamento, setPagamento] = useState<PagamentoMetodo>('pix')
  const [descontoTipo, setDescontoTipo] = useState<'percentual' | 'valor'>('percentual')
  const [descontoValorInput, setDescontoValorInput] = useState('')

  const carregar = useCallback(() => {
    setLoading(true)
    supabase.from('condicionais')
      .select('*, cliente:clientes(nome, telefone), itens:itens_condicional(id, produto_id, nome, tamanho, quantidade, preco_unitario, status)')
      .order('criado_em', { ascending: false })
      .then(({ data, error: err }) => {
        if (err) { setError(err.message); setLoading(false); return }
        setCondicionais((data ?? []) as Condicional[])
        setLoading(false)
      })
  }, [])

  useEffect(() => {
    carregar()
    supabase.from('clientes').select('*').eq('ativo', true).order('nome')
      .then(({ data }) => { if (data) setClientes(data as Cliente[]) })
    supabase.from('produtos').select('*, tamanhos:produto_tamanhos(*)').eq('ativo', true).order('nome')
      .then(({ data }) => { if (data) setProdutos(data as Produto[]) })
    supabase.from('taxas_cartao_parcelado').select('parcelas, taxa_percentual')
      .then(({ data }) => {
        if (!data) return
        const next: Record<number, number> = {}
        data.forEach(t => { next[t.parcelas] = Number(t.taxa_percentual) })
        setTaxasCartao(next)
      })
  }, [carregar])

  const parcelasCartaoOrdenadas = Object.keys(taxasCartao).map(Number).sort((a, b) => a - b)

  const filtrados = condicionais.filter(c => filtro === 'todos' ? true : c.status === filtro)
  const totalItem = (i: { quantidade: number; preco_unitario: number }) => i.quantidade * i.preco_unitario
  const totalCondicional = (c: Condicional) => (c.itens ?? []).reduce((s, i) => s + totalItem(i), 0)

  // Preço a prazo por peça (cadastrado no produto) — cai pro preço à vista
  // quando o produto não tem preço a prazo cadastrado.
  function precoPrazoItem(item: { produto_id: string; preco_unitario: number }): number {
    const prod = produtos.find(p => p.id === item.produto_id)
    return prod?.preco_venda_prazo ?? item.preco_unitario
  }
  const totalCondicionalPrazo = (c: Condicional) => (c.itens ?? []).reduce((s, i) => s + precoPrazoItem(i) * i.quantidade, 0)

  const produtosFiltrados = useMemo(() =>
    produtos.filter(p => p.nome.toLowerCase().includes(buscaProduto.toLowerCase())),
    [produtos, buscaProduto]
  )

  const clientesFiltrados = useMemo(() =>
    clientes.filter(c => c.nome.toLowerCase().includes(buscaCliente.toLowerCase()) || c.telefone.includes(buscaCliente)),
    [clientes, buscaCliente]
  )

  function resetNovo() {
    setClienteId(''); setBuscaCliente(''); setObservacao(''); setItensNovo([]); setBuscaProduto(''); setError('')
  }

  function selecionarCliente(c: Cliente) {
    setClienteId(c.id)
    setBuscaCliente('')
  }

  function abrirNovoCliente() {
    setNovoClienteForm({ nome: buscaCliente, telefone: '' })
    setErroCliente('')
    setShowNovoCliente(true)
  }

  async function salvarNovoCliente() {
    if (!novoClienteForm.nome.trim() || !novoClienteForm.telefone.trim()) {
      setErroCliente('Nome e telefone são obrigatórios.'); return
    }
    setSavingCliente(true); setErroCliente('')
    const { data, error: err } = await supabase.from('clientes')
      .insert({ nome: novoClienteForm.nome.trim(), telefone: novoClienteForm.telefone.trim() })
      .select('*').single()
    setSavingCliente(false)
    if (err) { setErroCliente(err.message); return }
    const novoCliente = data as Cliente
    setClientes(prev => [...prev, novoCliente].sort((a, b) => a.nome.localeCompare(b.nome)))
    setClienteId(novoCliente.id)
    setBuscaCliente('')
    setShowNovoCliente(false)
  }

  // Produto com tamanho cadastrado pede pra escolher qual antes de entrar na lista.
  function addItemNovo(p: Produto) {
    if (p.tamanhos && p.tamanhos.length > 0) { setTamanhoPicker(p); setBuscaProduto(''); return }
    setItensNovo(prev => {
      const ex = prev.find(i => i.produto_id === p.id && !i.tamanho)
      if (ex) return prev.map(i => i === ex ? { ...i, quantidade: i.quantidade + 1 } : i)
      return [...prev, { produto_id: p.id, nome: p.nome, quantidade: 1, preco_unitario: p.preco_venda }]
    })
    setBuscaProduto('')
  }

  function addItemNovoComTamanho(p: Produto, tamanho: string) {
    setItensNovo(prev => {
      const ex = prev.find(i => i.produto_id === p.id && i.tamanho === tamanho)
      if (ex) return prev.map(i => i === ex ? { ...i, quantidade: i.quantidade + 1 } : i)
      return [...prev, { produto_id: p.id, nome: p.nome, tamanho, quantidade: 1, preco_unitario: p.preco_venda }]
    })
    setTamanhoPicker(null)
  }

  function changeQtyNovo(produtoId: string, tamanho: string | undefined, delta: number) {
    setItensNovo(prev => prev
      .map(i => (i.produto_id === produtoId && i.tamanho === tamanho) ? { ...i, quantidade: Math.max(0, i.quantidade + delta) } : i)
      .filter(i => i.quantidade > 0))
  }

  function buscarPorCodigo(codigo: string): Produto | undefined {
    const alvo = codigo.trim().toLowerCase()
    if (!alvo) return undefined
    return produtos.find(p => (p.sku ?? '').toLowerCase() === alvo)
  }

  function handleCodigoLido(codigo: string) {
    const produto = buscarPorCodigo(codigo)
    if (produto) {
      addItemNovo(produto)
      setScanAviso('')
    } else {
      setScanAviso(`Nenhum produto com o código "${codigo}".`)
      setTimeout(() => setScanAviso(''), 3000)
    }
  }

  function handleBuscaKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Enter') return
    const produto = buscarPorCodigo(buscaProduto)
    if (produto) addItemNovo(produto)
  }

  const totalNovo = itensNovo.reduce((s, i) => s + i.preco_unitario * i.quantidade, 0)

  async function salvarNovo() {
    if (!clienteId) { setError('Selecione o cliente.'); return }
    if (itensNovo.length === 0) { setError('Adicione ao menos um produto.'); return }
    setSaving(true); setError('')
    const { error: err } = await supabase.rpc('criar_condicional', {
      p_cliente_id: clienteId,
      p_itens: itensNovo.map(i => ({ produto_id: i.produto_id, nome: i.nome, tamanho: i.tamanho ?? null, quantidade: i.quantidade, preco_unitario: i.preco_unitario })),
      p_observacao: observacao || null,
    })
    setSaving(false)
    if (err) { setError(err.message); return }
    setShowNovo(false)
    resetNovo()
    carregar()
  }

  function abrirDetalhe(c: Condicional) {
    setCondDetalhe(c)
    setMostrarParcelasCartao(false)
  }

  function abrirFecharDoDetalhe(c: Condicional) {
    setCondDetalhe(null)
    abrirFechar(c)
  }

  function abrirFechar(c: Condicional) {
    setCondFechar(c)
    setDecisoes({})
    setPagamento('pix')
    setDescontoTipo('percentual')
    setDescontoValorInput('')
    setError('')
  }

  const itensFechar = condFechar?.itens ?? []

  function setDecisao(itemId: string, status: Decisao) {
    setDecisoes(prev => ({ ...prev, [itemId]: status }))
  }

  const todosDecididos = itensFechar.length > 0 && itensFechar.every(i => decisoes[i.id])
  const temVendido = itensFechar.some(i => decisoes[i.id] === 'vendido')

  // No crédito, produto com preço a prazo cadastrado cobra esse valor em vez do preço à vista
  // (mesma regra aplicada de verdade no fechar_condicional, no banco — isso aqui é só a prévia).
  function precoEfetivoFechar(item: { produto_id: string; preco_unitario: number }): number {
    if (pagamento !== 'credito') return item.preco_unitario
    const prod = produtos.find(p => p.id === item.produto_id)
    return prod?.preco_venda_prazo ?? item.preco_unitario
  }

  const totalVendido = itensFechar.filter(i => decisoes[i.id] === 'vendido').reduce((s, i) => s + precoEfetivoFechar(i) * i.quantidade, 0)

  // Desconto à vista sobre os itens vendidos (mesma regra do Vendas: nunca deixa o total negativo).
  const valorDesconto = temVendido ? Math.min(totalVendido, Math.max(0,
    descontoTipo === 'percentual' ? totalVendido * (Number(descontoValorInput) || 0) / 100 : (Number(descontoValorInput) || 0)
  )) : 0
  const totalVendidoComDesconto = totalVendido - valorDesconto

  async function confirmarFechar() {
    if (!condFechar || !todosDecididos) { setError('Decida cada item (vendido ou devolvido) antes de fechar.'); return }
    setSaving(true); setError('')
    const { error: err } = await supabase.rpc('fechar_condicional', {
      p_condicional_id: condFechar.id,
      p_decisoes: itensFechar.map(i => ({ item_id: i.id, status: decisoes[i.id] })),
      p_forma_pagamento: temVendido ? pagamento : null,
      p_desconto: valorDesconto,
    })
    setSaving(false)
    if (err) { setError(err.message); return }
    setCondFechar(null)
    carregar()
  }

  const modalNovoRef = useModalKeyboard(showNovo, () => { setShowNovo(false); resetNovo() }, salvarNovo)
  const modalFecharRef = useModalKeyboard(!!condFechar, () => setCondFechar(null), confirmarFechar)
  const modalTamanhoRef = useModalKeyboard(!!tamanhoPicker, () => setTamanhoPicker(null))
  const modalNovoClienteRef = useModalKeyboard(showNovoCliente, () => setShowNovoCliente(false), salvarNovoCliente)
  const modalDetalheRef = useModalKeyboard(!!condDetalhe, () => setCondDetalhe(null))

  return (
    <div className="page">
      <div className="page-header-row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '24px', color: '#FFFFFF' }}>Condicional</h1>
          <p style={{ fontSize: '13px', color: '#555', marginTop: '3px' }}>
            Produtos que saíram pra cliente decidir em casa
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => { resetNovo(); setShowNovo(true) }} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Plus size={14} strokeWidth={2.5} /> Novo Condicional
        </button>
      </div>

      <div style={{ display: 'flex', gap: '6px', marginBottom: '20px' }}>
        {(['aberto', 'fechado', 'todos'] as Filtro[]).map(f => (
          <button
            key={f}
            onClick={() => setFiltro(f)}
            style={{
              padding: '6px 14px', borderRadius: '99px', fontFamily: 'inherit',
              border: filtro === f ? '1px solid #FFFFFF' : '1px solid #2A2A2A',
              background: filtro === f ? 'rgba(255,255,255,0.08)' : 'transparent',
              color: filtro === f ? '#FFFFFF' : '#555',
              fontSize: '12px', cursor: 'pointer', transition: 'all 0.15s', textTransform: 'capitalize',
            }}
          >
            {f}
          </button>
        ))}
      </div>

      {error && !showNovo && !condFechar && <p style={{ fontSize: '12px', color: '#666', marginBottom: '16px' }}>{error}</p>}

      <div className="card desktop-row" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="list-header" style={{
          display: 'grid', gridTemplateColumns: '1fr 100px 130px 110px 100px',
          padding: '10px 24px', borderBottom: '1px solid #222',
          fontSize: '10px', fontWeight: 600, color: '#444', textTransform: 'uppercase', letterSpacing: '0.1em',
          background: 'rgba(0,0,0,0.2)',
        }}>
          <span>Cliente</span><span>Itens</span><span>Total</span><span>Status</span><span></span>
        </div>

        {loading ? (
          <div style={{ padding: '56px', textAlign: 'center', color: '#444', fontSize: '13px' }}>Carregando...</div>
        ) : filtrados.length === 0 ? (
          <div style={{ padding: '56px', textAlign: 'center', color: '#444', fontSize: '13px' }}>Nenhum condicional encontrado.</div>
        ) : filtrados.map((c, i) => (
          <motion.div
            key={c.id}
            className="list-row"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.03 }}
            onClick={() => abrirDetalhe(c)}
            style={{
              display: 'grid', gridTemplateColumns: '1fr 100px 130px 110px 100px',
              padding: '14px 24px', alignItems: 'center', cursor: 'pointer',
              borderBottom: i < filtrados.length - 1 ? '1px solid #1F1F1F' : 'none',
            }}
          >
            <div>
              <span style={{ fontSize: '13px', fontWeight: 500, color: '#FFFFFF' }}>{c.cliente?.nome ?? '—'}</span>
              <p style={{ fontSize: '11px', color: '#555' }}>{formatDate(c.criado_em)}</p>
            </div>
            <span style={{ fontSize: '13px', color: '#A3A3A3' }}>{(c.itens ?? []).length}</span>
            <span style={{ fontSize: '13px', fontWeight: 600, color: '#FFFFFF' }}>{formatCurrency(totalCondicional(c))}</span>
            <span className={c.status === 'fechado' ? 'badge badge-done' : 'badge badge-pending'}>
              {STATUS_LABEL[c.status]}
            </span>
            {c.status === 'aberto' ? (
              <button className="btn btn-secondary btn-sm" onClick={e => { e.stopPropagation(); abrirFechar(c) }}>Fechar</button>
            ) : <span />}
          </motion.div>
        ))}
      </div>

      {/* Cards (mobile) */}
      {!loading && filtrados.length > 0 && (
        <div className="entity-grid mobile-only-grid" style={{ gap: '16px' }}>
          {filtrados.map((c, i) => (
            <motion.div
              key={c.id}
              className="card entity-card"
              initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}
              onClick={() => abrirDetalhe(c)}
              style={{ cursor: 'pointer' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px' }}>
                <div style={{ minWidth: 0 }}>
                  <p className="entity-title" style={{ fontSize: '14px', color: '#FFFFFF', fontWeight: 600 }}>{c.cliente?.nome ?? '—'}</p>
                  <p className="entity-subtle" style={{ fontSize: '11px', color: '#555', marginTop: '2px' }}>{formatDate(c.criado_em)} · {(c.itens ?? []).length} itens</p>
                </div>
                <span className={c.status === 'fechado' ? 'badge badge-done' : 'badge badge-pending'}>
                  {STATUS_LABEL[c.status]}
                </span>
              </div>
              <div className="entity-divider" style={{ height: '1px', background: '#222', margin: '14px 0' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '16px', fontWeight: 700, color: '#FFFFFF' }}>{formatCurrency(totalCondicional(c))}</span>
                {c.status === 'aberto' && (
                  <button className="btn btn-secondary btn-sm" onClick={e => { e.stopPropagation(); abrirFechar(c) }}>Fechar</button>
                )}
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Modal: Detalhes do Condicional (clique no card/linha) */}
      <AnimatePresence>
        {condDetalhe && (
          <motion.div
            style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          >
            <motion.div ref={modalDetalheRef} className="card" style={{ width: '100%', maxWidth: '480px', padding: '28px', maxHeight: '85vh', overflowY: 'auto', overflowX: 'hidden' }}
              initial={{ scale: 0.95, y: 16 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4px' }}>
                <div>
                  <h2 style={{ fontSize: '18px', color: '#FFFFFF' }}>{condDetalhe.cliente?.nome ?? '—'}</h2>
                  <p style={{ fontSize: '12px', color: '#555', marginTop: '2px' }}>{condDetalhe.cliente?.telefone}</p>
                </div>
                <button className="btn btn-icon" onClick={() => setCondDetalhe(null)}><X size={14} /></button>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: '14px 0' }}>
                <span className={condDetalhe.status === 'fechado' ? 'badge badge-done' : 'badge badge-pending'}>
                  {STATUS_LABEL[condDetalhe.status]}
                </span>
                <span style={{ fontSize: '11px', color: '#555' }}>
                  Saiu em {formatDate(condDetalhe.criado_em)}
                  {condDetalhe.fechado_em && ` · Fechado em ${formatDate(condDetalhe.fechado_em)}`}
                </span>
              </div>

              {condDetalhe.observacao && (
                <p style={{ fontSize: '12px', color: '#A3A3A3', background: 'rgba(255,255,255,0.03)', border: '1px solid #252525', borderRadius: '8px', padding: '10px 12px', marginBottom: '14px' }}>
                  {condDetalhe.observacao}
                </p>
              )}

              <p style={{ fontSize: '10px', color: '#555', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' }}>
                Roupas levadas ({(condDetalhe.itens ?? []).length})
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '18px' }}>
                {(condDetalhe.itens ?? []).map(item => (
                  <div key={item.id} style={{
                    display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px',
                    borderRadius: '8px', background: 'rgba(255,255,255,0.03)', border: '1px solid #252525',
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: '13px', fontWeight: 500, color: '#FFFFFF' }}>
                        {item.nome}{item.tamanho && <span style={{ color: '#777' }}> — {item.tamanho}</span>}
                      </p>
                      <p style={{ fontSize: '11px', color: '#555', marginTop: '2px' }}>
                        {item.quantidade}x {formatCurrency(item.preco_unitario)} à vista
                        {precoPrazoItem(item) !== item.preco_unitario && (
                          <span> · {formatCurrency(precoPrazoItem(item))} a prazo</span>
                        )}
                      </p>
                    </div>
                    {condDetalhe.status === 'fechado' && (
                      <span style={{ fontSize: '11px', color: item.status === 'vendido' ? '#A3A3A3' : '#666' }}>
                        {item.status === 'vendido' ? 'Vendido' : item.status === 'devolvido' ? 'Devolvido' : 'Pendente'}
                      </span>
                    )}
                  </div>
                ))}
              </div>

              <div style={{ padding: '14px 16px', background: 'rgba(255,255,255,0.04)', borderRadius: '8px', marginBottom: '18px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '13px', color: '#A3A3A3' }}>Total levado (à vista)</span>
                  <span style={{ fontSize: '18px', fontWeight: 700, color: '#FFFFFF' }}>{formatCurrency(totalCondicional(condDetalhe))}</span>
                </div>
                {totalCondicionalPrazo(condDetalhe) !== totalCondicional(condDetalhe) && (
                  <div style={{ marginTop: '6px', paddingTop: '6px', borderTop: '1px solid #262626' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '12px', color: '#666', display: 'flex', alignItems: 'center', gap: '5px' }}>
                        Se fosse a prazo
                        {parcelasCartaoOrdenadas.length > 0 && (
                          <button
                            onClick={() => setMostrarParcelasCartao(v => !v)}
                            title="Ver parcelas no cartão"
                            style={{ background: 'none', border: 'none', padding: 0, display: 'flex', color: mostrarParcelasCartao ? '#FFFFFF' : '#555', cursor: 'pointer' }}
                          >
                            <Info size={12} />
                          </button>
                        )}
                      </span>
                      <span style={{ fontSize: '14px', fontWeight: 600, color: '#A3A3A3' }}>{formatCurrency(totalCondicionalPrazo(condDetalhe))}</span>
                    </div>
                    {mostrarParcelasCartao && (
                      <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px dashed #262626', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <p style={{ fontSize: '10px', color: '#555', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '2px' }}>
                          Parcelado no cartão (taxa repassada)
                        </p>
                        {parcelasCartaoOrdenadas.map(p => {
                          const taxa = taxasCartao[p]
                          const totalComTaxa = totalCondicionalPrazo(condDetalhe) / (1 - taxa / 100)
                          return (
                            <div key={p} style={{ display: 'flex', justifyContent: 'space-between' }}>
                              <span style={{ fontSize: '11px', color: '#666' }}>{p}x ({taxa}%)</span>
                              <span style={{ fontSize: '11px', color: '#A3A3A3' }}>{p}x de {formatCurrency(totalComTaxa / p)} · total {formatCurrency(totalComTaxa)}</span>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="modal-actions" style={{ display: 'flex', gap: '10px' }}>
                <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setCondDetalhe(null)}>
                  Voltar <span className="shortcut-hint">(Esc)</span>
                </button>
                {condDetalhe.status === 'aberto' && (
                  <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => abrirFecharDoDetalhe(condDetalhe)}>
                    Fechar Condicional
                  </button>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modal: Novo Condicional */}
      <AnimatePresence>
        {showNovo && (
          <motion.div
            style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          >
            <motion.div ref={modalNovoRef} className="card" style={{ width: '100%', maxWidth: '560px', padding: '28px', maxHeight: '88vh', overflowY: 'auto', overflowX: 'hidden' }}
              initial={{ scale: 0.95, y: 16 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
                <h2 style={{ fontSize: '18px', color: '#FFFFFF' }}>Novo Condicional</h2>
                <button className="btn btn-icon" onClick={() => { setShowNovo(false); resetNovo() }}><X size={14} /></button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div className="field">
                  <label className="label">Cliente *</label>
                  {clienteId ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '9px 14px', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: '8px' }}>
                      <span style={{ flex: 1, fontSize: '13px', color: '#FFFFFF', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {clientes.find(c => c.id === clienteId)?.nome}
                      </span>
                      <button onClick={() => setClienteId('')} style={{ background: 'transparent', border: 'none', color: '#666', cursor: 'pointer', padding: '2px', display: 'flex', flexShrink: 0 }}>
                        <X size={13} />
                      </button>
                    </div>
                  ) : (
                    <>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '9px 14px', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: '8px' }}>
                        <Search size={13} style={{ color: '#444', flexShrink: 0 }} />
                        <input
                          className="input-bare"
                          style={{ flex: 1, minWidth: 0, background: 'transparent', border: 'none', outline: 'none', fontSize: '13px', color: '#FFFFFF', fontFamily: 'inherit' }}
                          placeholder="Nome ou telefone do cliente..."
                          value={buscaCliente}
                          onChange={e => setBuscaCliente(e.target.value)}
                          autoComplete="off"
                        />
                      </div>
                      {buscaCliente ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '180px', overflowY: 'auto', border: '1px solid var(--border)', borderRadius: '8px', padding: '6px', marginTop: '6px' }}>
                          {clientesFiltrados.slice(0, 6).map(c => (
                            <button
                              key={c.id}
                              onClick={() => selecionarCliente(c)}
                              style={{
                                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px',
                                width: '100%', padding: '8px 10px', borderRadius: '6px', border: 'none', background: 'transparent',
                                color: '#FFFFFF', fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
                              }}
                              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')}
                              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                            >
                              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.nome}</span>
                              <span style={{ fontSize: '11px', color: '#555', flexShrink: 0 }}>{c.telefone}</span>
                            </button>
                          ))}
                          <button
                            onClick={abrirNovoCliente}
                            style={{
                              display: 'flex', alignItems: 'center', gap: '6px',
                              width: '100%', padding: '8px 10px', borderRadius: '6px', border: 'none', background: 'transparent',
                              color: '#A3A3A3', fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
                            }}
                            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')}
                            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                          >
                            <Plus size={12} /> Cadastrar "{buscaCliente}" como novo cliente
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={abrirNovoCliente}
                          className="btn btn-ghost btn-sm"
                          style={{ marginTop: '6px', display: 'flex', alignItems: 'center', gap: '4px', width: 'fit-content' }}
                        >
                          <Plus size={11} /> Cadastrar novo cliente
                        </button>
                      )}
                    </>
                  )}
                </div>

                <div className="field">
                  <label className="label">Buscar produto</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '8px', padding: '9px 14px', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: '8px' }}>
                      <Search size={13} style={{ color: '#444', flexShrink: 0 }} />
                      <input
                        className="input-bare"
                        style={{ flex: 1, minWidth: 0, background: 'transparent', border: 'none', outline: 'none', fontSize: '13px', color: '#FFFFFF', fontFamily: 'inherit' }}
                        placeholder="Nome do produto, ou ler código..."
                        value={buscaProduto}
                        onChange={e => setBuscaProduto(e.target.value)}
                        onKeyDown={handleBuscaKeyDown}
                        autoComplete="off"
                      />
                    </div>
                    <button
                      onClick={() => setShowScanner(true)}
                      title="Ler código com a câmera"
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        width: '38px', height: '38px', flexShrink: 0,
                        background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: '8px',
                        color: '#A3A3A3', cursor: 'pointer',
                      }}
                    >
                      <ScanLine size={15} />
                    </button>
                  </div>
                  {scanAviso && <p style={{ fontSize: '11px', color: '#666', marginTop: '6px' }}>{scanAviso}</p>}
                </div>

                {buscaProduto && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '200px', overflowY: 'auto', border: '1px solid var(--border)', borderRadius: '8px', padding: '6px' }}>
                    {produtosFiltrados.length === 0 ? (
                      <p style={{ fontSize: '12px', color: '#555', padding: '8px' }}>Nenhum produto encontrado.</p>
                    ) : produtosFiltrados.slice(0, 8).map(p => (
                      <button
                        key={p.id}
                        onClick={() => addItemNovo(p)}
                        style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px',
                          width: '100%', padding: '8px 10px', borderRadius: '6px', border: 'none', background: 'transparent',
                          color: '#FFFFFF', fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
                        }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                      >
                        <span style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, overflow: 'hidden', flex: 1 }}>
                          <Package size={12} style={{ color: '#555', flexShrink: 0 }} />
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.nome}</span>
                        </span>
                        {p.tamanhos && p.tamanhos.length > 0 ? (
                          <span style={{ display: 'flex', gap: '3px', flexShrink: 0 }}>
                            {p.tamanhos.map(t => (
                              <span key={t.tamanho} style={{ fontSize: '10px', padding: '1px 5px', borderRadius: '99px', border: '1px solid #2A2A2A', color: t.quantidade > 0 ? '#A3A3A3' : '#444' }}>
                                {t.tamanho}:{t.quantidade}
                              </span>
                            ))}
                          </span>
                        ) : (
                          <span style={{ fontSize: '11px', color: '#555', flexShrink: 0 }}>{p.estoque_atual} em estoque</span>
                        )}
                        <span style={{ color: '#A3A3A3', flexShrink: 0 }}>{formatCurrency(p.preco_venda)}</span>
                      </button>
                    ))}
                  </div>
                )}

                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {itensNovo.length === 0 ? (
                    <p style={{ fontSize: '12px', color: '#444', textAlign: 'center', padding: '16px' }}>Nenhum produto adicionado ainda.</p>
                  ) : itensNovo.map(item => (
                    <div key={`${item.produto_id}-${item.tamanho ?? ''}`} style={{
                      display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px',
                      borderRadius: '8px', background: 'rgba(255,255,255,0.03)', border: '1px solid #252525',
                    }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: '12px', fontWeight: 500, color: '#FFFFFF', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {item.nome}{item.tamanho && <span style={{ color: '#777' }}> — {item.tamanho}</span>}
                        </p>
                        <p style={{ fontSize: '11px', color: '#555', marginTop: '2px' }}>{formatCurrency(item.preco_unitario)}</p>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <button onClick={() => changeQtyNovo(item.produto_id, item.tamanho, -1)} style={{ width: '22px', height: '22px', borderRadius: '5px', border: '1px solid #333', background: 'transparent', color: '#666', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <Minus size={10} />
                        </button>
                        <span style={{ fontSize: '13px', fontWeight: 700, color: '#FFFFFF', minWidth: '16px', textAlign: 'center' }}>{item.quantidade}</span>
                        <button onClick={() => changeQtyNovo(item.produto_id, item.tamanho, 1)} style={{ width: '22px', height: '22px', borderRadius: '5px', border: '1px solid #333', background: 'transparent', color: '#666', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <Plus size={10} />
                        </button>
                      </div>
                      <button onClick={() => changeQtyNovo(item.produto_id, item.tamanho, -item.quantidade)} style={{ background: 'transparent', border: 'none', color: '#333', cursor: 'pointer', padding: '2px', display: 'flex' }}>
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ))}
                </div>

                {itensNovo.length > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 4px', borderTop: '1px solid #222' }}>
                    <span style={{ fontSize: '13px', color: '#A3A3A3' }}>Total levado</span>
                    <span style={{ fontSize: '16px', fontWeight: 700, color: '#FFFFFF' }}>{formatCurrency(totalNovo)}</span>
                  </div>
                )}

                <div className="field">
                  <label className="label">Observação</label>
                  <input className="input" placeholder="opcional" value={observacao} onChange={e => setObservacao(e.target.value)} />
                </div>

                {error && <p style={{ fontSize: '12px', color: '#666' }}>{error}</p>}
                <div className="modal-actions" style={{ display: 'flex', gap: '10px', marginTop: '4px' }}>
                  <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => { setShowNovo(false); resetNovo() }}>
                    Cancelar <span className="shortcut-hint">(Esc)</span>
                  </button>
                  <button className="btn btn-primary" style={{ flex: 1 }} onClick={salvarNovo} disabled={saving}>
                    {saving ? 'Salvando...' : <>Registrar Saída <span className="shortcut-hint">(F10)</span></>}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modal: Novo Cliente (cadastro rápido) */}
      <AnimatePresence>
        {showNovoCliente && (
          <motion.div
            style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          >
            <motion.div
              ref={modalNovoClienteRef}
              className="card"
              style={{ width: '100%', maxWidth: '360px', padding: '24px' }}
              initial={{ scale: 0.95, y: 16 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 16 }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '18px' }}>
                <h2 style={{ fontSize: '16px', color: '#FFFFFF' }}>Novo Cliente</h2>
                <button className="btn btn-icon" onClick={() => setShowNovoCliente(false)}><X size={14} /></button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div className="field">
                  <label className="label">Nome *</label>
                  <input className="input" value={novoClienteForm.nome} onChange={e => setNovoClienteForm(f => ({ ...f, nome: e.target.value }))} />
                </div>
                <div className="field">
                  <label className="label">Telefone *</label>
                  <input className="input" placeholder="(00) 00000-0000" value={novoClienteForm.telefone} onChange={e => setNovoClienteForm(f => ({ ...f, telefone: e.target.value }))} />
                </div>
                {erroCliente && <p style={{ fontSize: '12px', color: '#666' }}>{erroCliente}</p>}
                <div className="modal-actions" style={{ display: 'flex', gap: '10px' }}>
                  <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setShowNovoCliente(false)}>
                    Cancelar <span className="shortcut-hint">(Esc)</span>
                  </button>
                  <button className="btn btn-primary" style={{ flex: 1 }} onClick={salvarNovoCliente} disabled={savingCliente}>
                    {savingCliente ? 'Salvando...' : <>Cadastrar <span className="shortcut-hint">(F10)</span></>}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modal: escolher tamanho */}
      <AnimatePresence>
        {tamanhoPicker && (
          <motion.div
            style={{ position: 'fixed', inset: 0, zIndex: 55, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          >
            <motion.div
              ref={modalTamanhoRef}
              className="card"
              style={{ width: '100%', maxWidth: '360px', padding: '24px' }}
              initial={{ scale: 0.95, y: 16 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 16 }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <h2 style={{ fontSize: '16px', color: '#FFFFFF' }}>Escolher tamanho</h2>
                <button className="btn btn-icon" onClick={() => setTamanhoPicker(null)}><X size={14} /></button>
              </div>
              <p style={{ fontSize: '13px', color: '#A3A3A3', marginBottom: '18px' }}>{tamanhoPicker.nome}</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {tamanhoPicker.tamanhos!.map(t => (
                  <button
                    key={t.tamanho}
                    onClick={() => addItemNovoComTamanho(tamanhoPicker, t.tamanho)}
                    disabled={t.quantidade <= 0}
                    style={{
                      padding: '10px 16px', borderRadius: '8px', fontFamily: 'inherit',
                      border: '1px solid #2A2A2A', background: 'transparent',
                      color: t.quantidade > 0 ? '#FFFFFF' : '#444',
                      fontSize: '13px', fontWeight: 600,
                      cursor: t.quantidade > 0 ? 'pointer' : 'not-allowed',
                      opacity: t.quantidade > 0 ? 1 : 0.5,
                    }}
                  >
                    {t.tamanho} <span style={{ fontWeight: 400, color: '#777', marginLeft: '4px' }}>({t.quantidade})</span>
                  </button>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Camera scanner */}
      <AnimatePresence>
        {showScanner && (
          <ScannerCamera
            onScan={codigo => { setShowScanner(false); handleCodigoLido(codigo) }}
            onClose={() => setShowScanner(false)}
          />
        )}
      </AnimatePresence>

      {/* Modal: Fechar Condicional */}
      <AnimatePresence>
        {condFechar && (
          <motion.div
            style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          >
            <motion.div ref={modalFecharRef} className="card" style={{ width: '100%', maxWidth: '520px', padding: '28px', maxHeight: '88vh', overflowY: 'auto', overflowX: 'hidden' }}
              initial={{ scale: 0.95, y: 16 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                <h2 style={{ fontSize: '18px', color: '#FFFFFF' }}>Fechar Condicional</h2>
                <button className="btn btn-icon" onClick={() => setCondFechar(null)}><X size={14} /></button>
              </div>
              <p style={{ fontSize: '13px', color: '#A3A3A3', marginBottom: '20px' }}>{condFechar.cliente?.nome}</p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '18px' }}>
                {itensFechar.map(item => {
                  const decisao = decisoes[item.id]
                  return (
                    <div key={item.id} style={{
                      display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px',
                      borderRadius: '8px', background: 'rgba(255,255,255,0.03)', border: '1px solid #252525',
                    }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: '13px', fontWeight: 500, color: '#FFFFFF' }}>
                          {item.nome}{item.tamanho && <span style={{ color: '#777' }}> — {item.tamanho}</span>}
                        </p>
                        <p style={{ fontSize: '11px', color: '#555', marginTop: '2px' }}>
                          {item.quantidade}x {formatCurrency(decisao === 'vendido' ? precoEfetivoFechar(item) : item.preco_unitario)}
                          {decisao === 'vendido' && precoEfetivoFechar(item) !== item.preco_unitario && <span style={{ marginLeft: '4px' }}>(a prazo)</span>}
                        </p>
                      </div>
                      <button
                        onClick={() => setDecisao(item.id, 'vendido')}
                        style={{
                          display: 'flex', alignItems: 'center', gap: '5px', padding: '7px 12px', borderRadius: '6px', fontFamily: 'inherit',
                          border: decisao === 'vendido' ? '1px solid #FFFFFF' : '1px solid #333',
                          background: decisao === 'vendido' ? 'rgba(255,255,255,0.1)' : 'transparent',
                          color: decisao === 'vendido' ? '#FFFFFF' : '#666', fontSize: '12px', cursor: 'pointer', transition: 'all 0.15s',
                        }}
                      >
                        <Check size={11} /> Vendido
                      </button>
                      <button
                        onClick={() => setDecisao(item.id, 'devolvido')}
                        style={{
                          display: 'flex', alignItems: 'center', gap: '5px', padding: '7px 12px', borderRadius: '6px', fontFamily: 'inherit',
                          border: decisao === 'devolvido' ? '1px solid #FFFFFF' : '1px solid #333',
                          background: decisao === 'devolvido' ? 'rgba(255,255,255,0.1)' : 'transparent',
                          color: decisao === 'devolvido' ? '#FFFFFF' : '#666', fontSize: '12px', cursor: 'pointer', transition: 'all 0.15s',
                        }}
                      >
                        <RotateCcw size={11} /> Devolvido
                      </button>
                    </div>
                  )
                })}
              </div>

              {temVendido && (
                <div className="field" style={{ marginBottom: '18px' }}>
                  <label className="label">Forma de pagamento (itens vendidos)</label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {PAGAMENTOS.map(p => (
                      <button
                        key={p.id}
                        onClick={() => setPagamento(p.id)}
                        style={{
                          padding: '10px 14px', borderRadius: '8px', fontFamily: 'inherit',
                          border: pagamento === p.id ? '1px solid #FFFFFF' : '1px solid #2A2A2A',
                          background: pagamento === p.id ? 'rgba(255,255,255,0.07)' : 'transparent',
                          color: pagamento === p.id ? '#FFFFFF' : '#666',
                          fontSize: '13px', cursor: 'pointer', textAlign: 'left',
                          display: 'flex', justifyContent: 'space-between', alignItems: 'center', transition: 'all 0.15s',
                        }}
                      >
                        {p.label}
                        {pagamento === p.id && <Check size={13} />}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {temVendido && (
                <div className="field" style={{ marginBottom: '18px' }}>
                  <label className="label">Desconto à vista (opcional)</label>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <div style={{ display: 'flex', border: '1px solid #2A2A2A', borderRadius: '8px', overflow: 'hidden', flexShrink: 0 }}>
                      {(['percentual', 'valor'] as const).map(t => (
                        <button
                          key={t}
                          onClick={() => setDescontoTipo(t)}
                          style={{
                            padding: '9px 12px', border: 'none', fontFamily: 'inherit', cursor: 'pointer',
                            background: descontoTipo === t ? 'rgba(255,255,255,0.1)' : 'transparent',
                            color: descontoTipo === t ? '#FFFFFF' : '#666', fontSize: '13px',
                          }}
                        >
                          {t === 'percentual' ? '%' : 'R$'}
                        </button>
                      ))}
                    </div>
                    <input
                      className="input" type="number" min={0} step={0.01} placeholder="0"
                      style={{ flex: 1 }}
                      value={descontoValorInput}
                      onChange={e => setDescontoValorInput(e.target.value)}
                    />
                  </div>
                  {valorDesconto > 0 && (
                    <p style={{ fontSize: '11px', color: '#555', marginTop: '6px' }}>
                      Desconto de {formatCurrency(valorDesconto)} · total com desconto {formatCurrency(totalVendidoComDesconto)}.
                    </p>
                  )}
                </div>
              )}

              <div style={{ padding: '14px 16px', background: 'rgba(255,255,255,0.04)', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', marginBottom: '18px' }}>
                <span style={{ fontSize: '13px', color: '#A3A3A3' }}>Total a cobrar (vendidos)</span>
                <span style={{ fontSize: '18px', fontWeight: 700, color: '#FFFFFF' }}>{formatCurrency(totalVendidoComDesconto)}</span>
              </div>

              {error && <p style={{ fontSize: '12px', color: '#666', marginBottom: '12px' }}>{error}</p>}
              <div className="modal-actions" style={{ display: 'flex', gap: '10px' }}>
                <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setCondFechar(null)}>
                  Cancelar <span className="shortcut-hint">(Esc)</span>
                </button>
                <button className="btn btn-primary" style={{ flex: 1 }} onClick={confirmarFechar} disabled={saving || !todosDecididos}>
                  {saving ? 'Processando...' : <>Confirmar Fechamento <span className="shortcut-hint">(F10)</span></>}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
