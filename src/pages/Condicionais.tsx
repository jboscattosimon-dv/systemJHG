import { useState, useEffect, useCallback, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, X, Minus, Trash2, Search, Package, Check, RotateCcw } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { formatCurrency, formatDate } from '../lib/utils'
import { useModalKeyboard } from '../hooks/useModalKeyboard'
import type { Condicional, Cliente, Produto, PagamentoMetodo } from '../types'

const PAGAMENTOS: { id: PagamentoMetodo; label: string }[] = [
  { id: 'pix',      label: 'Pix'            },
  { id: 'credito',  label: 'Cartão Crédito' },
  { id: 'debito',   label: 'Cartão Débito'  },
  { id: 'dinheiro', label: 'Dinheiro'       },
]

type Filtro = 'aberto' | 'fechado' | 'todos'
type ItemNovo = { produto_id: string; nome: string; quantidade: number; preco_unitario: number }
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
  const [observacao, setObservacao] = useState('')
  const [itensNovo, setItensNovo] = useState<ItemNovo[]>([])
  const [buscaProduto, setBuscaProduto] = useState('')

  // Fechar condicional
  const [condFechar, setCondFechar] = useState<Condicional | null>(null)
  const [decisoes, setDecisoes] = useState<Record<string, Decisao>>({})
  const [pagamento, setPagamento] = useState<PagamentoMetodo>('pix')

  const carregar = useCallback(() => {
    setLoading(true)
    supabase.from('condicionais')
      .select('*, cliente:clientes(nome, telefone), itens:itens_condicional(id, produto_id, nome, quantidade, preco_unitario, status)')
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
    supabase.from('produtos').select('*').eq('ativo', true).order('nome')
      .then(({ data }) => { if (data) setProdutos(data as Produto[]) })
  }, [carregar])

  const filtrados = condicionais.filter(c => filtro === 'todos' ? true : c.status === filtro)
  const totalItem = (i: { quantidade: number; preco_unitario: number }) => i.quantidade * i.preco_unitario
  const totalCondicional = (c: Condicional) => (c.itens ?? []).reduce((s, i) => s + totalItem(i), 0)

  const produtosFiltrados = useMemo(() =>
    produtos.filter(p => p.nome.toLowerCase().includes(buscaProduto.toLowerCase())),
    [produtos, buscaProduto]
  )

  function resetNovo() {
    setClienteId(''); setObservacao(''); setItensNovo([]); setBuscaProduto(''); setError('')
  }

  function addItemNovo(p: Produto) {
    setItensNovo(prev => {
      const ex = prev.find(i => i.produto_id === p.id)
      if (ex) return prev.map(i => i.produto_id === p.id ? { ...i, quantidade: i.quantidade + 1 } : i)
      return [...prev, { produto_id: p.id, nome: p.nome, quantidade: 1, preco_unitario: p.preco_venda }]
    })
  }

  function changeQtyNovo(produtoId: string, delta: number) {
    setItensNovo(prev => prev
      .map(i => i.produto_id === produtoId ? { ...i, quantidade: Math.max(0, i.quantidade + delta) } : i)
      .filter(i => i.quantidade > 0))
  }

  const totalNovo = itensNovo.reduce((s, i) => s + i.preco_unitario * i.quantidade, 0)

  async function salvarNovo() {
    if (!clienteId) { setError('Selecione o cliente.'); return }
    if (itensNovo.length === 0) { setError('Adicione ao menos um produto.'); return }
    setSaving(true); setError('')
    const { error: err } = await supabase.rpc('criar_condicional', {
      p_cliente_id: clienteId,
      p_itens: itensNovo.map(i => ({ produto_id: i.produto_id, nome: i.nome, quantidade: i.quantidade, preco_unitario: i.preco_unitario })),
      p_observacao: observacao || null,
    })
    setSaving(false)
    if (err) { setError(err.message); return }
    setShowNovo(false)
    resetNovo()
    carregar()
  }

  function abrirFechar(c: Condicional) {
    setCondFechar(c)
    setDecisoes({})
    setPagamento('pix')
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

  async function confirmarFechar() {
    if (!condFechar || !todosDecididos) { setError('Decida cada item (vendido ou devolvido) antes de fechar.'); return }
    setSaving(true); setError('')
    const { error: err } = await supabase.rpc('fechar_condicional', {
      p_condicional_id: condFechar.id,
      p_decisoes: itensFechar.map(i => ({ item_id: i.id, status: decisoes[i.id] })),
      p_forma_pagamento: temVendido ? pagamento : null,
    })
    setSaving(false)
    if (err) { setError(err.message); return }
    setCondFechar(null)
    carregar()
  }

  const modalNovoRef = useModalKeyboard(showNovo, () => { setShowNovo(false); resetNovo() }, salvarNovo)
  const modalFecharRef = useModalKeyboard(!!condFechar, () => setCondFechar(null), confirmarFechar)

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
            style={{
              display: 'grid', gridTemplateColumns: '1fr 100px 130px 110px 100px',
              padding: '14px 24px', alignItems: 'center',
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
              <button className="btn btn-secondary btn-sm" onClick={() => abrirFechar(c)}>Fechar</button>
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
                  <button className="btn btn-secondary btn-sm" onClick={() => abrirFechar(c)}>Fechar</button>
                )}
              </div>
            </motion.div>
          ))}
        </div>
      )}

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
                  <select className="input" value={clienteId} onChange={e => setClienteId(e.target.value)}>
                    <option value="">Selecionar...</option>
                    {clientes.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                  </select>
                </div>

                <div className="field">
                  <label className="label">Buscar produto</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '9px 14px', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: '8px' }}>
                    <Search size={13} style={{ color: '#444', flexShrink: 0 }} />
                    <input
                      style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', fontSize: '13px', color: '#FFFFFF', fontFamily: 'inherit' }}
                      placeholder="Nome do produto..."
                      value={buscaProduto}
                      onChange={e => setBuscaProduto(e.target.value)}
                    />
                  </div>
                </div>

                {buscaProduto && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '160px', overflowY: 'auto', border: '1px solid var(--border)', borderRadius: '8px', padding: '6px' }}>
                    {produtosFiltrados.length === 0 ? (
                      <p style={{ fontSize: '12px', color: '#555', padding: '8px' }}>Nenhum produto encontrado.</p>
                    ) : produtosFiltrados.slice(0, 8).map(p => (
                      <button
                        key={p.id}
                        onClick={() => { addItemNovo(p); setBuscaProduto('') }}
                        style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px',
                          width: '100%', padding: '8px 10px', borderRadius: '6px', border: 'none', background: 'transparent',
                          color: '#FFFFFF', fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
                        }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                      >
                        <span style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, overflow: 'hidden' }}>
                          <Package size={12} style={{ color: '#555', flexShrink: 0 }} />
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.nome}</span>
                        </span>
                        <span style={{ color: '#A3A3A3', flexShrink: 0 }}>{formatCurrency(p.preco_venda)}</span>
                      </button>
                    ))}
                  </div>
                )}

                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {itensNovo.length === 0 ? (
                    <p style={{ fontSize: '12px', color: '#444', textAlign: 'center', padding: '16px' }}>Nenhum produto adicionado ainda.</p>
                  ) : itensNovo.map(item => (
                    <div key={item.produto_id} style={{
                      display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px',
                      borderRadius: '8px', background: 'rgba(255,255,255,0.03)', border: '1px solid #252525',
                    }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: '12px', fontWeight: 500, color: '#FFFFFF', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.nome}</p>
                        <p style={{ fontSize: '11px', color: '#555', marginTop: '2px' }}>{formatCurrency(item.preco_unitario)}</p>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <button onClick={() => changeQtyNovo(item.produto_id, -1)} style={{ width: '22px', height: '22px', borderRadius: '5px', border: '1px solid #333', background: 'transparent', color: '#666', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <Minus size={10} />
                        </button>
                        <span style={{ fontSize: '13px', fontWeight: 700, color: '#FFFFFF', minWidth: '16px', textAlign: 'center' }}>{item.quantidade}</span>
                        <button onClick={() => changeQtyNovo(item.produto_id, 1)} style={{ width: '22px', height: '22px', borderRadius: '5px', border: '1px solid #333', background: 'transparent', color: '#666', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <Plus size={10} />
                        </button>
                      </div>
                      <button onClick={() => changeQtyNovo(item.produto_id, -item.quantidade)} style={{ background: 'transparent', border: 'none', color: '#333', cursor: 'pointer', padding: '2px', display: 'flex' }}>
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
                        <p style={{ fontSize: '13px', fontWeight: 500, color: '#FFFFFF' }}>{item.nome}</p>
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

              <div style={{ padding: '14px 16px', background: 'rgba(255,255,255,0.04)', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', marginBottom: '18px' }}>
                <span style={{ fontSize: '13px', color: '#A3A3A3' }}>Total a cobrar (vendidos)</span>
                <span style={{ fontSize: '18px', fontWeight: 700, color: '#FFFFFF' }}>{formatCurrency(totalVendido)}</span>
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
