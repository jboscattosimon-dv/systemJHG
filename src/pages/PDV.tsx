import { useState, useEffect, useMemo, type KeyboardEvent } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ShoppingCart, Plus, Minus, Trash2, X, Check, Search, Scissors, Package, ScanLine } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { formatCurrency } from '../lib/utils'
import ScannerCamera from '../components/ScannerCamera'
import { useModalKeyboard } from '../hooks/useModalKeyboard'
import type { ItemComanda, PagamentoMetodo, Produto, Profissional, Servico } from '../types'

const PAGAMENTOS: { id: PagamentoMetodo; label: string }[] = [
  { id: 'pix',      label: 'Pix'            },
  { id: 'credito',  label: 'Cartão Crédito' },
  { id: 'debito',   label: 'Cartão Débito'  },
  { id: 'dinheiro', label: 'Dinheiro'       },
]

function uid() { return Math.random().toString(36).slice(2) }

type ItemCatalogo =
  | { tipo: 'servico'; dado: Servico }
  | { tipo: 'produto'; dado: Produto }

export default function PDV() {
  const [search, setSearch]   = useState('')
  const [servicos, setServicos] = useState<Servico[]>([])
  const [produtos, setProdutos] = useState<Produto[]>([])
  const [profissionais, setProfissionais] = useState<Profissional[]>([])
  const [profissionalId, setProfissionalId] = useState('')

  const [cart, setCart]           = useState<ItemComanda[]>([])
  const [clienteNome, setClienteNome] = useState('')
  const [pagamento, setPagamento] = useState<PagamentoMetodo>('pix')
  const [showPayModal, setShowPayModal] = useState(false)
  const [done, setDone]         = useState(false)
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState('')
  const [showScanner, setShowScanner] = useState(false)
  const [scanAviso, setScanAviso] = useState('')

  // No crédito, produto com preço a prazo cadastrado cobra esse valor em vez do preço à vista.
  function precoEfetivo(item: ItemComanda): number {
    if (pagamento !== 'credito' || item.tipo !== 'produto') return item.preco_unitario
    const prod = produtos.find(p => p.id === item.referencia_id)
    return prod?.preco_venda_prazo ?? item.preco_unitario
  }

  const total = cart.reduce((s, i) => s + precoEfetivo(i) * i.quantidade, 0)

  useEffect(() => {
    supabase.from('servicos').select('*').eq('ativo', true).order('nome')
      .then(({ data }) => { if (data) setServicos(data as Servico[]) })

    supabase.from('produtos').select('*').eq('ativo', true).order('nome')
      .then(({ data }) => { if (data) setProdutos(data as Produto[]) })

    supabase.from('profissionais').select('*').eq('ativo', true).order('nome')
      .then(({ data }) => { if (data) setProfissionais(data as Profissional[]) })
  }, [])

  const servicosFiltrados = useMemo(() =>
    servicos.filter(s => s.nome.toLowerCase().includes(search.toLowerCase())),
    [servicos, search]
  )

  const produtosFiltrados = useMemo(() =>
    produtos.filter(p =>
      p.nome.toLowerCase().includes(search.toLowerCase()) ||
      (p.sku ?? '').toLowerCase().includes(search.toLowerCase())
    ),
    [produtos, search]
  )

  const itensCatalogo = useMemo<ItemCatalogo[]>(() => {
    const s: ItemCatalogo[] = servicosFiltrados.map(dado => ({ tipo: 'servico', dado }))
    const p: ItemCatalogo[] = produtosFiltrados.map(dado => ({ tipo: 'produto', dado }))
    return [...s, ...p].sort((a, b) => a.dado.nome.localeCompare(b.dado.nome))
  }, [servicosFiltrados, produtosFiltrados])

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

  function addServico(s: Servico) {
    setCart(prev => {
      const ex = prev.find(i => i.tipo === 'servico' && i.referencia_id === s.id)
      if (ex) return prev.map(i => i.id === ex.id ? { ...i, quantidade: i.quantidade + 1 } : i)
      return [...prev, { id: uid(), tipo: 'servico', referencia_id: s.id, nome: s.nome, quantidade: 1, preco_unitario: s.preco, profissional_id: profissionalId || undefined }]
    })
  }

  function addProduto(p: Produto) {
    setCart(prev => {
      const ex = prev.find(i => i.tipo === 'produto' && i.referencia_id === p.id)
      if (ex) return prev.map(i => i.id === ex.id ? { ...i, quantidade: i.quantidade + 1 } : i)
      return [...prev, { id: uid(), tipo: 'produto', referencia_id: p.id, nome: p.nome, quantidade: 1, preco_unitario: p.preco_venda, profissional_id: profissionalId || undefined }]
    })
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
    setSaving(true); setError('')
    const { error: err } = await supabase.rpc('finalizar_venda', {
      p_cliente_nome: clienteNome || null,
      p_cliente_id: null,
      p_forma_pagamento: pagamento,
      p_itens: cart.map(i => ({
        tipo: i.tipo,
        referencia_id: i.referencia_id,
        nome: i.nome,
        quantidade: i.quantidade,
        preco_unitario: precoEfetivo(i),
        profissional_id: i.profissional_id ?? null,
      })),
    })

    setSaving(false)
    if (err) { setError(err.message); return }

    setDone(true)
    setCart([])
    setClienteNome('')
    setShowPayModal(false)
    setTimeout(() => setDone(false), 2500)
    supabase.from('produtos').select('*').eq('ativo', true).order('nome')
      .then(({ data }) => { if (data) setProdutos(data as Produto[]) })
  }

  const modalRef = useModalKeyboard(showPayModal, () => setShowPayModal(false), finalizarVenda)

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
            background: '#1A1A1A',
            border: '1px solid #252525',
            borderRadius: '8px',
          }}>
            <Search size={13} style={{ color: '#444', flexShrink: 0 }} />
            <input
              style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', fontSize: '13px', color: '#FFFFFF', fontFamily: 'inherit' }}
              placeholder="Buscar produto ou serviço, ou ler código..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              onKeyDown={handleSearchKeyDown}
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
              background: '#1A1A1A', border: '1px solid #252525', borderRadius: '8px',
              color: '#A3A3A3', cursor: 'pointer',
            }}
          >
            <ScanLine size={15} />
          </button>
        </div>

        {scanAviso && (
          <p style={{ fontSize: '12px', color: '#666', marginTop: '-8px', marginBottom: '12px', flexShrink: 0 }}>{scanAviso}</p>
        )}

        {/* Content area — produtos e serviços juntos, sem separação */}
        <div className="pdv-catalog-content" style={{ flex: 1, overflowY: 'auto', paddingBottom: '16px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: '12px' }}>
            {itensCatalogo.length === 0 ? (
              <div style={{ gridColumn: '1/-1', padding: '56px', textAlign: 'center', color: '#444', fontSize: '13px' }}>
                Nenhum produto ou serviço encontrado.
              </div>
            ) : itensCatalogo.map(item => {
              const baixo = item.tipo === 'produto' && item.dado.estoque_atual <= item.dado.estoque_minimo
              return (
                <motion.button
                  key={`${item.tipo}-${item.dado.id}`}
                  onClick={() => item.tipo === 'servico' ? addServico(item.dado) : addProduto(item.dado)}
                  className="card-sm"
                  style={{ cursor: 'pointer', border: '1px solid #2A2A2A', textAlign: 'left', transition: 'all 0.15s', fontFamily: 'inherit', width: '100%' }}
                  whileHover={{ borderColor: '#444', background: '#242424' }}
                  whileTap={{ scale: 0.97 }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '6px' }}>
                    {item.tipo === 'servico' ? <Scissors size={11} style={{ color: '#555' }} /> : <Package size={11} style={{ color: '#555' }} />}
                    <span style={{ fontSize: '9px', color: '#555', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                      {item.tipo === 'servico' ? 'Serviço' : 'Produto'}
                    </span>
                  </div>
                  <p style={{ fontSize: '13px', fontWeight: 600, color: '#FFFFFF', marginBottom: '4px' }}>{item.dado.nome}</p>
                  <p style={{ fontSize: '11px', color: baixo ? '#A3A3A3' : '#555' }}>
                    {item.tipo === 'servico'
                      ? `${item.dado.duracao_minutos} min`
                      : `${item.dado.estoque_atual} ${item.dado.unidade} em estoque`}
                  </p>
                  <p style={{ fontSize: '16px', fontWeight: 700, color: '#FFFFFF', marginTop: '10px' }}>
                    {formatCurrency(item.tipo === 'servico' ? item.dado.preco : item.dado.preco_venda)}
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
            <span style={{ fontSize: '13px', fontWeight: 600, color: '#FFFFFF' }}>Comanda</span>
            {cart.length > 0 && (
              <span style={{
                marginLeft: 'auto', fontSize: '11px', padding: '2px 8px',
                borderRadius: '99px', background: 'rgba(255,255,255,0.07)', color: '#A3A3A3',
              }}>
                {cart.length}
              </span>
            )}
          </div>
          <input
            className="input"
            style={{ marginTop: '12px', fontSize: '13px' }}
            placeholder="Nome do cliente (opcional)"
            value={clienteNome}
            onChange={e => setClienteNome(e.target.value)}
          />
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
                Adicione itens à comanda
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
                    {item.nome}
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
              <div style={{ padding: '14px 16px', background: 'rgba(255,255,255,0.04)', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
                <span style={{ fontSize: '13px', color: '#A3A3A3' }}>Total a cobrar</span>
                <span style={{ fontSize: '18px', fontWeight: 700, color: '#FFFFFF' }}>{formatCurrency(total)}</span>
              </div>
              {error && <p style={{ fontSize: '12px', color: '#666', marginBottom: '12px' }}>{error}</p>}
              <button className="btn btn-primary btn-full" onClick={finalizarVenda} disabled={saving}>
                {saving ? 'Processando...' : 'Confirmar Pagamento (F10)'}
              </button>
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
              <p style={{ fontSize: '11px', color: '#555' }}>Comanda finalizada com sucesso.</p>
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
