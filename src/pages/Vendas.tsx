import { useState, useEffect, useMemo, type KeyboardEvent } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ShoppingCart, Plus, Minus, Trash2, X, Check, Search, Package, ScanLine } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { formatCurrency } from '../lib/utils'
import ScannerCamera from '../components/ScannerCamera'
import { useModalKeyboard } from '../hooks/useModalKeyboard'
import type { Cliente, ItemComanda, PagamentoMetodo, Produto, Profissional } from '../types'

const PAGAMENTOS: { id: PagamentoMetodo; label: string }[] = [
  { id: 'pix',       label: 'Pix'            },
  { id: 'credito',   label: 'Cartão Crédito' },
  { id: 'debito',    label: 'Cartão Débito'  },
  { id: 'dinheiro',  label: 'Dinheiro'       },
  { id: 'parcelado', label: 'Parcelado'      },
]

function uid() { return Math.random().toString(36).slice(2) }

export default function Vendas() {
  const [search, setSearch]   = useState('')
  const [produtos, setProdutos] = useState<Produto[]>([])
  const [profissionais, setProfissionais] = useState<Profissional[]>([])
  const [profissionalId, setProfissionalId] = useState('')

  const [cart, setCart]           = useState<ItemComanda[]>([])
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [clienteId, setClienteId] = useState('')
  const [clienteBusca, setClienteBusca] = useState('')
  const [showNovoCliente, setShowNovoCliente] = useState(false)
  const [novoClienteForm, setNovoClienteForm] = useState({ nome: '', telefone: '' })
  const [savingCliente, setSavingCliente] = useState(false)
  const [erroCliente, setErroCliente] = useState('')
  const [pagamento, setPagamento] = useState<PagamentoMetodo>('pix')
  const [numeroParcelas, setNumeroParcelas] = useState(2)
  const [parceladoTipo, setParceladoTipo] = useState<'dinheiro' | 'cartao'>('dinheiro')
  const [taxasCartao, setTaxasCartao] = useState<Record<number, number>>({})
  const [showPayModal, setShowPayModal] = useState(false)
  const [done, setDone]         = useState(false)
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState('')
  const [showScanner, setShowScanner] = useState(false)
  const [scanAviso, setScanAviso] = useState('')
  const [tamanhoPicker, setTamanhoPicker] = useState<Produto | null>(null)

  // No crédito ou parcelado, produto com preço a prazo cadastrado cobra esse valor em vez do preço à vista.
  function precoEfetivo(item: ItemComanda): number {
    if ((pagamento !== 'credito' && pagamento !== 'parcelado') || item.tipo !== 'produto') return item.preco_unitario
    const prod = produtos.find(p => p.id === item.referencia_id)
    return prod?.preco_venda_prazo ?? item.preco_unitario
  }

  const total = cart.reduce((s, i) => s + precoEfetivo(i) * i.quantidade, 0)

  function carregarProdutos() {
    return supabase.from('produtos').select('*, tamanhos:produto_tamanhos(*)').eq('ativo', true).order('nome')
      .then(({ data }) => { if (data) setProdutos(data as Produto[]) })
  }

  useEffect(() => {
    carregarProdutos()

    supabase.from('profissionais').select('*').eq('ativo', true).order('nome')
      .then(({ data }) => { if (data) setProfissionais(data as Profissional[]) })

    supabase.from('clientes').select('*').eq('ativo', true).order('nome')
      .then(({ data }) => { if (data) setClientes(data as Cliente[]) })

    supabase.from('taxas_cartao_parcelado').select('parcelas, taxa_percentual')
      .then(({ data }) => {
        if (!data) return
        const next: Record<number, number> = {}
        data.forEach(t => { next[t.parcelas] = Number(t.taxa_percentual) })
        setTaxasCartao(next)
      })
  }, [])

  const parcelasComTaxaDisponiveis = Object.keys(taxasCartao).map(Number).sort((a, b) => a - b)
  const taxaCartaoSelecionada = parceladoTipo === 'cartao' ? (taxasCartao[numeroParcelas] ?? 0) : 0
  const totalComTaxaCartao = taxaCartaoSelecionada > 0 ? total / (1 - taxaCartaoSelecionada / 100) : total

  const clientesFiltrados = useMemo(() =>
    clienteBusca ? clientes.filter(c => c.nome.toLowerCase().includes(clienteBusca.toLowerCase()) || c.telefone.includes(clienteBusca)) : [],
    [clientes, clienteBusca]
  )

  function selecionarCliente(c: Cliente) {
    setClienteId(c.id)
    setClienteBusca('')
  }

  function limparCliente() {
    setClienteId('')
    setClienteBusca('')
  }

  function abrirNovoCliente() {
    setNovoClienteForm({ nome: clienteBusca, telefone: '' })
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
    setClienteBusca('')
    setShowNovoCliente(false)
  }

  const produtosFiltrados = useMemo(() =>
    produtos.filter(p =>
      p.nome.toLowerCase().includes(search.toLowerCase()) ||
      (p.sku ?? '').toLowerCase().includes(search.toLowerCase())
    ).sort((a, b) => a.nome.localeCompare(b.nome)),
    [produtos, search]
  )

  function buscarPorCodigo(codigo: string): Produto | undefined {
    const alvo = codigo.trim().toLowerCase()
    if (!alvo) return undefined
    return produtos.find(p => (p.sku ?? '').toLowerCase() === alvo)
  }

  function handleCodigoLido(codigo: string) {
    const produto = buscarPorCodigo(codigo)
    if (produto) {
      addProduto(produto)
      setScanAviso('')
    } else {
      setScanAviso(`Nenhum produto com o código "${codigo}".`)
      setTimeout(() => setScanAviso(''), 3000)
    }
  }

  function handleSearchKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Enter') return
    const produto = buscarPorCodigo(search)
    if (produto) {
      addProduto(produto)
      setSearch('')
    }
  }

  // Produto com tamanho cadastrado pede pra escolher qual antes de entrar na comanda.
  function addProduto(p: Produto) {
    if (p.tamanhos && p.tamanhos.length > 0) { setTamanhoPicker(p); return }
    setCart(prev => {
      const ex = prev.find(i => i.tipo === 'produto' && i.referencia_id === p.id && !i.tamanho)
      if (ex) return prev.map(i => i.id === ex.id ? { ...i, quantidade: i.quantidade + 1 } : i)
      return [...prev, { id: uid(), tipo: 'produto', referencia_id: p.id, nome: p.nome, quantidade: 1, preco_unitario: p.preco_venda, profissional_id: profissionalId || undefined }]
    })
  }

  function addProdutoComTamanho(p: Produto, tamanho: string) {
    setCart(prev => {
      const ex = prev.find(i => i.tipo === 'produto' && i.referencia_id === p.id && i.tamanho === tamanho)
      if (ex) return prev.map(i => i.id === ex.id ? { ...i, quantidade: i.quantidade + 1 } : i)
      return [...prev, { id: uid(), tipo: 'produto', referencia_id: p.id, nome: p.nome, tamanho, quantidade: 1, preco_unitario: p.preco_venda, profissional_id: profissionalId || undefined }]
    })
    setTamanhoPicker(null)
  }

  function changeQty(id: string, delta: number) {
    setCart(prev => prev
      .map(i => i.id === id ? { ...i, quantidade: Math.max(0, i.quantidade + delta) } : i)
      .filter(i => i.quantidade > 0))
  }

  function removeItem(id: string) {
    setCart(prev => prev.filter(i => i.id !== id))
  }

  async function finalizarVenda() {
    if (pagamento === 'parcelado' && !clienteId) {
      setError('Selecione um cliente cadastrado pra vender parcelado.')
      return
    }
    if (pagamento === 'parcelado' && parceladoTipo === 'cartao' && !taxasCartao[numeroParcelas]) {
      setError('Selecione uma quantidade de parcelas com taxa configurada.')
      return
    }
    setSaving(true); setError('')
    const clienteSelecionado = clientes.find(c => c.id === clienteId)
    const { error: err } = await supabase.rpc('finalizar_venda', {
      p_cliente_nome: clienteSelecionado?.nome ?? (clienteBusca || null),
      p_cliente_id: clienteId || null,
      p_forma_pagamento: pagamento,
      p_itens: cart.map(i => ({
        tipo: i.tipo,
        referencia_id: i.referencia_id,
        nome: i.nome,
        tamanho: i.tamanho ?? null,
        quantidade: i.quantidade,
        preco_unitario: precoEfetivo(i),
        profissional_id: i.profissional_id ?? null,
      })),
      p_total_parcelas: pagamento === 'parcelado' ? numeroParcelas : 1,
      p_taxa_cartao_percentual: taxaCartaoSelecionada,
    })

    setSaving(false)
    if (err) { setError(err.message); return }

    setDone(true)
    setCart([])
    limparCliente()
    setShowPayModal(false)
    setParceladoTipo('dinheiro')
    setNumeroParcelas(2)
    setTimeout(() => setDone(false), 2500)
    carregarProdutos()
  }

  const modalRef = useModalKeyboard(showPayModal, () => setShowPayModal(false), finalizarVenda)
  const modalTamanhoRef = useModalKeyboard(!!tamanhoPicker, () => setTamanhoPicker(null))
  const modalNovoClienteRef = useModalKeyboard(showNovoCliente, () => setShowNovoCliente(false), salvarNovoCliente)

  return (
    <div className="page pdv-layout" style={{ display: 'flex', gap: '24px', height: 'calc(100vh - 64px)', paddingBottom: '0', overflow: 'hidden' }}>

      {/* Left — catalog */}
      <div className="pdv-catalog" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Search */}
        <div className="pdv-toolbar" style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px', flexShrink: 0 }}>
          <div style={{
            flex: 1,
            display: 'flex', alignItems: 'center', gap: '8px',
            padding: '9px 14px',
            background: 'var(--surface-2)',
            border: '1px solid var(--border)',
            borderRadius: '8px',
          }}>
            <Search size={13} style={{ color: '#444', flexShrink: 0 }} />
            <input
              className="input-bare"
              style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', fontSize: '13px', color: '#FFFFFF', fontFamily: 'inherit' }}
              placeholder="Buscar produto, ou ler código..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              autoComplete="off"
              autoFocus
            />
            {search && (
              <button onClick={() => setSearch('')} style={{ background: 'none', border: 'none', color: '#444', cursor: 'pointer', padding: '2px', display: 'flex' }}>
                <X size={12} />
              </button>
            )}
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

        {scanAviso && (
          <p style={{ fontSize: '12px', color: '#666', marginTop: '-8px', marginBottom: '12px', flexShrink: 0 }}>{scanAviso}</p>
        )}

        {/* Content area — catálogo de produtos */}
        <div className="pdv-catalog-content" style={{ flex: 1, overflowY: 'auto', paddingBottom: '16px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: '12px' }}>
            {!search.trim() ? (
              <div style={{ gridColumn: '1/-1', padding: '56px', textAlign: 'center', color: '#444', fontSize: '13px' }}>
                Busque um produto pelo nome ou código pra adicionar à venda.
              </div>
            ) : produtosFiltrados.length === 0 ? (
              <div style={{ gridColumn: '1/-1', padding: '56px', textAlign: 'center', color: '#444', fontSize: '13px' }}>
                Nenhum produto encontrado.
              </div>
            ) : produtosFiltrados.map(p => {
              const baixo = p.estoque_atual <= p.estoque_minimo
              const temTamanhos = p.tamanhos && p.tamanhos.length > 0
              return (
                <motion.button
                  key={p.id}
                  onClick={() => addProduto(p)}
                  className="card-sm"
                  style={{ cursor: 'pointer', border: '1px solid #2A2A2A', textAlign: 'left', transition: 'all 0.15s', fontFamily: 'inherit', width: '100%' }}
                  whileHover={{ borderColor: '#444', background: '#242424' }}
                  whileTap={{ scale: 0.97 }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '6px' }}>
                    <Package size={11} style={{ color: '#555' }} />
                    <span style={{ fontSize: '9px', color: '#555', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                      Produto
                    </span>
                  </div>
                  <p style={{ fontSize: '13px', fontWeight: 600, color: '#FFFFFF', marginBottom: '4px' }}>{p.nome}</p>
                  {temTamanhos ? (
                    <p style={{ fontSize: '11px', color: '#555', display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                      {p.tamanhos!.map(t => (
                        <span key={t.tamanho} style={{
                          padding: '1px 6px', borderRadius: '99px',
                          background: t.quantidade > 0 ? 'rgba(255,255,255,0.06)' : 'transparent',
                          border: '1px solid #2A2A2A', color: t.quantidade > 0 ? '#A3A3A3' : '#444',
                        }}>
                          {t.tamanho}:{t.quantidade}
                        </span>
                      ))}
                    </p>
                  ) : (
                    <p style={{ fontSize: '11px', color: baixo ? '#A3A3A3' : '#555' }}>
                      {p.estoque_atual} {p.unidade} em estoque
                    </p>
                  )}
                  <p style={{ fontSize: '16px', fontWeight: 700, color: '#FFFFFF', marginTop: '10px' }}>
                    {formatCurrency(p.preco_venda)}
                  </p>
                </motion.button>
              )
            })}
          </div>
        </div>
      </div>

      {/* Right — cart */}
      <div className="pdv-cart" style={{
        width: '320px', flexShrink: 0,
        background: '#1A1A1A',
        border: '1px solid #252525',
        borderRadius: '12px',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflow: 'hidden',
      }}>
        <div style={{ padding: '18px 20px', borderBottom: '1px solid #222', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <ShoppingCart size={15} style={{ color: '#555' }} />
            <span style={{ fontSize: '13px', fontWeight: 600, color: '#FFFFFF' }}>Vendas</span>
            {cart.length > 0 && (
              <span style={{
                marginLeft: 'auto', fontSize: '11px', padding: '2px 8px',
                borderRadius: '99px', background: 'rgba(255,255,255,0.07)', color: '#A3A3A3',
              }}>
                {cart.length}
              </span>
            )}
          </div>
          {clienteId ? (
            <div style={{ marginTop: '12px', display: 'flex', alignItems: 'center', gap: '8px', padding: '9px 14px', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: '8px' }}>
              <span style={{ flex: 1, fontSize: '13px', color: '#FFFFFF', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {clientes.find(c => c.id === clienteId)?.nome}
              </span>
              <button onClick={limparCliente} style={{ background: 'transparent', border: 'none', color: '#666', cursor: 'pointer', padding: '2px', display: 'flex', flexShrink: 0 }}>
                <X size={13} />
              </button>
            </div>
          ) : (
            <div style={{ position: 'relative', marginTop: '12px' }}>
              <input
                className="input input-bare"
                style={{ fontSize: '13px' }}
                placeholder="Cliente (opcional)"
                value={clienteBusca}
                onChange={e => setClienteBusca(e.target.value)}
                autoComplete="off"
              />
              {clienteBusca && (
                <div style={{
                  position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 10,
                  display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '180px', overflowY: 'auto',
                  background: '#1F1F1F', border: '1px solid var(--border)', borderRadius: '8px', padding: '6px',
                  boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
                }}>
                  {clientesFiltrados.slice(0, 6).map(c => (
                    <button
                      key={c.id}
                      onClick={() => selecionarCliente(c)}
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px',
                        width: '100%', padding: '7px 9px', borderRadius: '6px', border: 'none', background: 'transparent',
                        color: '#FFFFFF', fontSize: '12px', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
                      }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.06)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.nome}</span>
                      <span style={{ fontSize: '10px', color: '#555', flexShrink: 0 }}>{c.telefone}</span>
                    </button>
                  ))}
                  <button
                    onClick={abrirNovoCliente}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '6px',
                      width: '100%', padding: '7px 9px', borderRadius: '6px', border: 'none', background: 'transparent',
                      color: '#A3A3A3', fontSize: '12px', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.06)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <Plus size={11} /> Cadastrar "{clienteBusca}" como cliente
                  </button>
                </div>
              )}
            </div>
          )}
          {profissionais.length > 0 && (
            <select
              className="input"
              style={{ marginTop: '8px', fontSize: '13px' }}
              value={profissionalId}
              onChange={e => setProfissionalId(e.target.value)}
            >
              <option value="">Profissional (comissão)</option>
              {profissionais.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
            </select>
          )}
        </div>

        <div className="pdv-cart-items" style={{ flex: 1, overflowY: 'auto', padding: '12px' }}>
          <AnimatePresence>
            {cart.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 20px', color: '#333', fontSize: '13px' }}>
                Adicione itens à venda
              </div>
            ) : cart.map(item => (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }}
                style={{
                  display: 'flex', alignItems: 'center', gap: '10px',
                  padding: '10px 12px',
                  borderRadius: '8px',
                  marginBottom: '6px',
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid #252525',
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: '12px', fontWeight: 500, color: '#FFFFFF', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {item.nome}{item.tamanho && <span style={{ color: '#777' }}> — {item.tamanho}</span>}
                  </p>
                  <p style={{ fontSize: '11px', color: '#555', marginTop: '2px' }}>
                    {formatCurrency(precoEfetivo(item))}
                    {precoEfetivo(item) !== item.preco_unitario && <span style={{ marginLeft: '4px' }}>(a prazo)</span>}
                  </p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <button
                    onClick={() => changeQty(item.id, -1)}
                    style={{ width: '22px', height: '22px', borderRadius: '5px', border: '1px solid #333', background: 'transparent', color: '#666', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  >
                    <Minus size={10} />
                  </button>
                  <span style={{ fontSize: '13px', fontWeight: 700, color: '#FFFFFF', minWidth: '16px', textAlign: 'center' }}>{item.quantidade}</span>
                  <button
                    onClick={() => changeQty(item.id, 1)}
                    style={{ width: '22px', height: '22px', borderRadius: '5px', border: '1px solid #333', background: 'transparent', color: '#666', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  >
                    <Plus size={10} />
                  </button>
                </div>
                <button onClick={() => removeItem(item.id)} style={{ background: 'transparent', border: 'none', color: '#333', cursor: 'pointer', padding: '2px', display: 'flex' }}>
                  <Trash2 size={12} />
                </button>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        <div style={{ padding: '16px 20px', borderTop: '1px solid #222', flexShrink: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
            <span style={{ fontSize: '13px', color: '#A3A3A3' }}>Total</span>
            <span style={{ fontSize: '20px', fontWeight: 700, color: '#FFFFFF', fontVariantNumeric: 'tabular-nums', fontFamily: 'DM Sans, sans-serif' }}>
              {formatCurrency(total)}
            </span>
          </div>
          <button className="btn btn-primary btn-full" onClick={() => setShowPayModal(true)} disabled={cart.length === 0}>
            Finalizar Venda
          </button>
        </div>
      </div>

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
                    onClick={() => addProdutoComTamanho(tamanhoPicker, t.tamanho)}
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

      {/* Payment modal */}
      <AnimatePresence>
        {showPayModal && (
          <motion.div
            style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          >
            <motion.div
              ref={modalRef}
              className="card"
              style={{ width: '100%', maxWidth: '400px', padding: '28px' }}
              initial={{ scale: 0.95, y: 16 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 16 }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '24px' }}>
                <h2 style={{ fontSize: '18px', color: '#FFFFFF' }}>Forma de Pagamento</h2>
                <button className="btn btn-icon" onClick={() => setShowPayModal(false)}><X size={14} /></button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '24px' }}>
                {PAGAMENTOS.map(p => (
                  <button
                    key={p.id}
                    onClick={() => setPagamento(p.id)}
                    style={{
                      padding: '14px 16px', borderRadius: '8px',
                      border: pagamento === p.id ? '1px solid #FFFFFF' : '1px solid #2A2A2A',
                      background: pagamento === p.id ? 'rgba(255,255,255,0.07)' : 'transparent',
                      color: pagamento === p.id ? '#FFFFFF' : '#666',
                      fontSize: '14px', fontWeight: pagamento === p.id ? 600 : 400,
                      cursor: 'pointer', textAlign: 'left',
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      transition: 'all 0.15s', fontFamily: 'inherit',
                    }}
                  >
                    {p.label}
                    {pagamento === p.id && <Check size={14} />}
                  </button>
                ))}
              </div>

              {pagamento === 'parcelado' && (
                <div style={{ marginBottom: '20px' }}>
                  {!clienteId && (
                    <p style={{ fontSize: '12px', color: '#A3A3A3', marginBottom: '10px' }}>
                      Selecione um cliente cadastrado (não só o nome) pra gerar as parcelas no contas a receber dele.
                    </p>
                  )}

                  <label className="label">Parcelado no</label>
                  <div style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
                    {(['dinheiro', 'cartao'] as const).map(t => (
                      <button
                        key={t}
                        onClick={() => setParceladoTipo(t)}
                        style={{
                          flex: 1, padding: '9px 12px', borderRadius: '8px', fontFamily: 'inherit',
                          border: parceladoTipo === t ? '1px solid #FFFFFF' : '1px solid #2A2A2A',
                          background: parceladoTipo === t ? 'rgba(255,255,255,0.07)' : 'transparent',
                          color: parceladoTipo === t ? '#FFFFFF' : '#666',
                          fontSize: '13px', cursor: 'pointer',
                        }}
                      >
                        {t === 'dinheiro' ? 'Dinheiro (crediário)' : 'Cartão'}
                      </button>
                    ))}
                  </div>

                  {parceladoTipo === 'cartao' ? (
                    parcelasComTaxaDisponiveis.length === 0 ? (
                      <p style={{ fontSize: '12px', color: '#A3A3A3' }}>
                        Nenhuma taxa de cartão configurada ainda. Cadastre em Configurações → Taxas de cartão parcelado.
                      </p>
                    ) : (
                      <>
                        <label className="label">Parcelas (com taxa da maquininha)</label>
                        <select
                          className="input" value={numeroParcelas}
                          onChange={e => setNumeroParcelas(Number(e.target.value))}
                        >
                          {parcelasComTaxaDisponiveis.map(p => (
                            <option key={p} value={p}>{p}x ({taxasCartao[p]}%)</option>
                          ))}
                        </select>
                        <p style={{ fontSize: '11px', color: '#555', marginTop: '6px' }}>
                          Cliente paga {formatCurrency(totalComTaxaCartao)} em {numeroParcelas}x de {formatCurrency(totalComTaxaCartao / numeroParcelas)} (taxa repassada) · loja recebe {formatCurrency(total)}.
                        </p>
                      </>
                    )
                  ) : (
                    <>
                      <label className="label">Número de parcelas</label>
                      <input
                        className="input" type="number" min={2} max={12}
                        value={numeroParcelas}
                        onChange={e => setNumeroParcelas(Math.min(12, Math.max(2, Number(e.target.value) || 2)))}
                      />
                      <p style={{ fontSize: '11px', color: '#555', marginTop: '6px' }}>
                        {numeroParcelas}x de {formatCurrency(total / numeroParcelas)} · 1ª parcela em 30 dias, depois uma por mês.
                      </p>
                    </>
                  )}
                </div>
              )}

              <div style={{ padding: '14px 16px', background: 'rgba(255,255,255,0.04)', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
                <span style={{ fontSize: '13px', color: '#A3A3A3' }}>Total a cobrar</span>
                <span style={{ fontSize: '18px', fontWeight: 700, color: '#FFFFFF' }}>{formatCurrency(taxaCartaoSelecionada > 0 ? totalComTaxaCartao : total)}</span>
              </div>
              {error && <p style={{ fontSize: '12px', color: '#666', marginBottom: '12px' }}>{error}</p>}
              <div className="modal-actions">
                <button
                  className="btn btn-primary btn-full" onClick={finalizarVenda}
                  disabled={
                    saving ||
                    (pagamento === 'parcelado' && !clienteId) ||
                    (pagamento === 'parcelado' && parceladoTipo === 'cartao' && !taxasCartao[numeroParcelas])
                  }
                >
                  {saving ? 'Processando...' : <>Confirmar Pagamento <span className="shortcut-hint">(F10)</span></>}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Success toast */}
      <AnimatePresence>
        {done && (
          <motion.div
            style={{
              position: 'fixed', bottom: '28px', right: '28px', zIndex: 100,
              display: 'flex', alignItems: 'center', gap: '10px',
              padding: '14px 20px',
              background: '#1E1E1E', border: '1px solid #333', borderRadius: '10px',
              boxShadow: '0 8px 32px rgba(0,0,0,0.7)',
            }}
            initial={{ opacity: 0, y: 16, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 16 }}
          >
            <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: 'rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Check size={14} style={{ color: '#FFFFFF' }} />
            </div>
            <div>
              <p style={{ fontSize: '13px', fontWeight: 600, color: '#FFFFFF' }}>Venda registrada!</p>
              <p style={{ fontSize: '11px', color: '#555' }}>Venda finalizada com sucesso.</p>
            </div>
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
    </div>
  )
}
