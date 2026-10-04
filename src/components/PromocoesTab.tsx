import { useState, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, X, Pencil, Trash2, Percent, Package, Pause, Play } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { formatCurrency, formatDate } from '../lib/utils'
import { precoVistaComRegra } from '../lib/promocoes'
import { useModalKeyboard } from '../hooks/useModalKeyboard'
import type { Produto, Promocao } from '../types'

type ModoDesconto = 'padrao' | 'percentual' | 'fixo'
interface ItemForm { produto_id: string; modo: ModoDesconto; valor: string }
type StatusPromocao = 'ativa' | 'agendada' | 'encerrada' | 'pausada'

const STATUS_LABEL: Record<StatusPromocao, string> = {
  ativa: 'Ativa', agendada: 'Agendada', encerrada: 'Encerrada', pausada: 'Pausada',
}

function hojeLocal(offsetDias = 0): string {
  const d = new Date()
  d.setDate(d.getDate() + offsetDias)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dia = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dia}`
}

// Vigência é só por data — no dia seguinte ao fim a promoção some do PDV
// sozinha (ver promocoes_vigentes no banco). "Pausada" é o ativo=false manual.
function statusPromocao(p: Promocao): StatusPromocao {
  const hoje = hojeLocal()
  if (p.data_fim < hoje) return 'encerrada'
  if (!p.ativo) return 'pausada'
  if (p.data_inicio > hoje) return 'agendada'
  return 'ativa'
}

const FORM_VAZIO = { nome: '', desconto_percentual: '', data_inicio: '', data_fim: '' }

interface Props {
  produtos: Produto[]
  souAtendente: boolean
  // Produtos marcados no catálogo pra já abrir uma promoção nova com eles.
  produtosIniciais: string[] | null
  onProdutosIniciaisConsumidos: () => void
}

export default function PromocoesTab({ produtos, souAtendente, produtosIniciais, onProdutosIniciaisConsumidos }: Props) {
  const [promocoes, setPromocoes] = useState<Promocao[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState(FORM_VAZIO)
  const [itens, setItens] = useState<ItemForm[]>([])
  const [buscaProduto, setBuscaProduto] = useState('')
  const [saving, setSaving] = useState(false)
  const [erroModal, setErroModal] = useState('')

  const produtoPorId = useMemo(() => new Map(produtos.map(p => [p.id, p])), [produtos])

  function carregar() {
    return supabase.from('promocoes').select('*, itens:promocao_itens(*)').order('data_inicio', { ascending: false })
      .then(({ data, error: err }) => {
        if (err) setError(err.message)
        setPromocoes((data ?? []) as Promocao[])
        setLoading(false)
      })
  }

  useEffect(() => { carregar() }, [])

  useEffect(() => {
    if (!produtosIniciais || souAtendente) return
    abrirNova(produtosIniciais)
    onProdutosIniciaisConsumidos()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [produtosIniciais])

  function abrirNova(produtoIds: string[] = []) {
    setEditId(null)
    setForm({ ...FORM_VAZIO, data_inicio: hojeLocal(), data_fim: hojeLocal(7) })
    setItens(produtoIds.map(id => ({ produto_id: id, modo: 'padrao', valor: '' })))
    setBuscaProduto(''); setErroModal('')
    setShowModal(true)
  }

  function abrirEdicao(p: Promocao) {
    setEditId(p.id)
    setForm({
      nome: p.nome,
      desconto_percentual: String(p.desconto_percentual),
      data_inicio: p.data_inicio,
      data_fim: p.data_fim,
    })
    setItens((p.itens ?? []).map(i => (
      i.preco_promocional != null ? { produto_id: i.produto_id, modo: 'fixo', valor: String(i.preco_promocional) }
      : i.desconto_percentual != null ? { produto_id: i.produto_id, modo: 'percentual', valor: String(i.desconto_percentual) }
      : { produto_id: i.produto_id, modo: 'padrao', valor: '' }
    )))
    setBuscaProduto(''); setErroModal('')
    setShowModal(true)
  }

  function fecharModal() {
    setShowModal(false)
    setEditId(null)
  }

  function addItem(p: Produto) {
    setItens(prev => prev.some(i => i.produto_id === p.id) ? prev : [...prev, { produto_id: p.id, modo: 'padrao', valor: '' }])
    setBuscaProduto('')
  }

  function updateItem(produtoId: string, patch: Partial<ItemForm>) {
    setItens(prev => prev.map(i => i.produto_id === produtoId ? { ...i, ...patch } : i))
  }

  function removeItem(produtoId: string) {
    setItens(prev => prev.filter(i => i.produto_id !== produtoId))
  }

  const descontoPadrao = Number(form.desconto_percentual) || 0

  function precoFinalItem(item: ItemForm, produto: Produto): number {
    if (item.modo === 'fixo') return precoVistaComRegra(produto.preco_venda, { desconto_percentual: null, preco_promocional: Number(item.valor) || 0 })
    const pct = item.modo === 'percentual' ? Number(item.valor) || 0 : descontoPadrao
    return precoVistaComRegra(produto.preco_venda, { desconto_percentual: pct, preco_promocional: null })
  }

  const produtosBusca = useMemo(() => {
    const termo = buscaProduto.trim().toLowerCase()
    if (!termo) return []
    const jaNaLista = new Set(itens.map(i => i.produto_id))
    return produtos
      .filter(p => p.ativo && !jaNaLista.has(p.id))
      .filter(p => p.nome.toLowerCase().includes(termo) || (p.sku ?? '').toLowerCase().includes(termo))
      .slice(0, 8)
  }, [produtos, buscaProduto, itens])

  async function salvar() {
    if (!form.nome.trim()) { setErroModal('Dê um nome pra promoção.'); return }
    if (!form.data_inicio || !form.data_fim) { setErroModal('Informe a data de início e de fim.'); return }
    if (form.data_fim < form.data_inicio) { setErroModal('A data de fim não pode ser antes do início.'); return }
    if (descontoPadrao < 0 || descontoPadrao > 100) { setErroModal('O desconto padrão deve ficar entre 0% e 100%.'); return }
    if (itens.length === 0) { setErroModal('Adicione pelo menos um produto.'); return }
    for (const item of itens) {
      const nome = produtoPorId.get(item.produto_id)?.nome ?? 'produto'
      if (item.modo === 'padrao') continue
      const v = Number(item.valor)
      if (item.valor.trim() === '' || !Number.isFinite(v) || v < 0) { setErroModal(`Informe o desconto de "${nome}".`); return }
      if (item.modo === 'percentual' && v > 100) { setErroModal(`O desconto de "${nome}" deve ficar entre 0% e 100%.`); return }
    }
    if (descontoPadrao === 0 && itens.some(i => i.modo === 'padrao')) {
      setErroModal('Há produtos usando o desconto padrão, mas ele está em 0%.'); return
    }

    setSaving(true); setErroModal('')
    const payload = {
      nome: form.nome.trim(),
      desconto_percentual: descontoPadrao,
      data_inicio: form.data_inicio,
      data_fim: form.data_fim,
    }

    let promocaoId = editId
    if (editId) {
      const { error: err } = await supabase.from('promocoes').update(payload).eq('id', editId)
      if (err) { setErroModal(err.message); setSaving(false); return }
      const { error: errDel } = await supabase.from('promocao_itens').delete().eq('promocao_id', editId)
      if (errDel) { setErroModal(errDel.message); setSaving(false); return }
    } else {
      const { data, error: err } = await supabase.from('promocoes').insert({ ...payload, ativo: true }).select('id').single()
      if (err) { setErroModal(err.message); setSaving(false); return }
      promocaoId = (data as { id: string }).id
    }

    const { error: errItens } = await supabase.from('promocao_itens').insert(itens.map(i => ({
      promocao_id: promocaoId,
      produto_id: i.produto_id,
      desconto_percentual: i.modo === 'percentual' ? Number(i.valor) : null,
      preco_promocional: i.modo === 'fixo' ? Number(i.valor) : null,
    })))
    if (errItens) { setErroModal(errItens.message); setSaving(false); return }

    await carregar()
    setSaving(false)
    fecharModal()
  }

  async function toggleAtivo(p: Promocao) {
    setPromocoes(prev => prev.map(x => x.id === p.id ? { ...x, ativo: !p.ativo } : x))
    const { error: err } = await supabase.from('promocoes').update({ ativo: !p.ativo }).eq('id', p.id)
    if (err) { setError(err.message); carregar() }
  }

  async function excluir(p: Promocao) {
    if (!window.confirm(`Excluir a promoção "${p.nome}"? Vendas já feitas não mudam.`)) return
    const { error: err } = await supabase.from('promocoes').delete().eq('id', p.id)
    if (err) { setError(err.message); return }
    setPromocoes(prev => prev.filter(x => x.id !== p.id))
  }

  const modalRef = useModalKeyboard(showModal, fecharModal, salvar)

  const chipStatus = (status: StatusPromocao) => (
    <span style={{
      fontSize: '10px', padding: '3px 9px', borderRadius: '99px', width: 'fit-content', whiteSpace: 'nowrap',
      border: status === 'ativa' ? '1px solid rgba(255,255,255,0.35)' : status === 'agendada' ? '1px solid #333' : '1px dashed #333',
      background: status === 'ativa' ? 'rgba(255,255,255,0.08)' : 'transparent',
      color: status === 'ativa' ? '#FFFFFF' : status === 'agendada' ? '#A3A3A3' : '#555',
    }}>
      {STATUS_LABEL[status]}
    </span>
  )

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '20px', flexWrap: 'wrap' }}>
        <p style={{ fontSize: '12px', color: '#555', maxWidth: '520px' }}>
          O preço promocional vale no PDV e no condicional só entre as datas da promoção — no dia seguinte ao fim, volta sozinho ao preço normal.
        </p>
        {!souAtendente && (
          <button className="btn btn-primary" onClick={() => abrirNova()} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Plus size={14} strokeWidth={2.5} /> Nova Promoção
          </button>
        )}
      </div>

      {error && <p style={{ fontSize: '12px', color: '#666', marginBottom: '16px' }}>{error}</p>}

      {loading ? (
        <div className="card" style={{ padding: '56px', textAlign: 'center', color: '#444', fontSize: '13px' }}>Carregando...</div>
      ) : promocoes.length === 0 ? (
        <div className="card" style={{ padding: '56px', textAlign: 'center', color: '#444', fontSize: '13px' }}>Nenhuma promoção cadastrada.</div>
      ) : (
        <div className="entity-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(280px, 100%), 1fr))', gap: '16px' }}>
          {promocoes.map((p, i) => {
            const status = statusPromocao(p)
            const qtdItens = p.itens?.length ?? 0
            return (
              <motion.div
                key={p.id}
                className="card entity-card"
                initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}
                style={{ opacity: status === 'encerrada' ? 0.6 : 1 }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                  <div style={{
                    width: '40px', height: '40px', borderRadius: '10px', flexShrink: 0,
                    background: '#262626', border: '1px solid #333',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Percent size={16} style={{ color: '#A3A3A3' }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#FFFFFF', fontFamily: 'DM Sans, sans-serif', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.nome}</h3>
                    <p style={{ fontSize: '11px', color: '#555', marginTop: '2px' }}>
                      {formatDate(p.data_inicio)} até {formatDate(p.data_fim)}
                    </p>
                  </div>
                  {chipStatus(status)}
                </div>

                <div style={{ height: '1px', background: '#222', margin: '14px 0' }} />

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px' }}>
                  <div>
                    <p style={{ fontSize: '10px', color: '#444', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '2px' }}>Desconto padrão</p>
                    <p style={{ fontSize: '13px', color: '#A3A3A3' }}>{Number(p.desconto_percentual)}%</p>
                  </div>
                  <div>
                    <p style={{ fontSize: '10px', color: '#444', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '2px' }}>Produtos</p>
                    <p style={{ fontSize: '13px', color: '#A3A3A3' }}>{qtdItens}</p>
                  </div>
                </div>

                {!souAtendente && (
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px' }}>
                    {status !== 'encerrada' && (
                      <button className="btn btn-icon" title={p.ativo ? 'Pausar promoção' : 'Reativar promoção'} onClick={() => toggleAtivo(p)}>
                        {p.ativo ? <Pause size={12} /> : <Play size={12} />}
                      </button>
                    )}
                    <button className="btn btn-icon" title="Editar" onClick={() => abrirEdicao(p)}>
                      <Pencil size={12} />
                    </button>
                    <button className="btn btn-icon" title="Excluir" onClick={() => excluir(p)}>
                      <Trash2 size={12} />
                    </button>
                  </div>
                )}
              </motion.div>
            )
          })}
        </div>
      )}

      <AnimatePresence>
        {showModal && (
          <motion.div
            style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          >
            <motion.div
              ref={modalRef}
              className="card"
              style={{ width: '100%', maxWidth: '620px', padding: '28px', maxHeight: '88vh', overflowY: 'auto' }}
              initial={{ scale: 0.95, y: 16 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 16 }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '24px' }}>
                <h2 style={{ fontSize: '18px', color: '#FFFFFF' }}>{editId ? 'Editar Promoção' : 'Nova Promoção'}</h2>
                <button className="btn btn-icon" onClick={fecharModal}><X size={14} /></button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div className="field">
                  <label className="label">Nome *</label>
                  <input className="input" placeholder="Ex: Queima de estoque inverno" value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px' }}>
                  <div className="field">
                    <label className="label">Início *</label>
                    <input className="input" type="date" value={form.data_inicio} onChange={e => setForm(f => ({ ...f, data_inicio: e.target.value }))} />
                  </div>
                  <div className="field">
                    <label className="label">Fim *</label>
                    <input className="input" type="date" min={form.data_inicio || undefined} value={form.data_fim} onChange={e => setForm(f => ({ ...f, data_fim: e.target.value }))} />
                  </div>
                  <div className="field">
                    <label className="label">Desconto padrão (%)</label>
                    <input className="input" type="number" min={0} max={100} step={0.5} placeholder="Ex: 20" value={form.desconto_percentual} onChange={e => setForm(f => ({ ...f, desconto_percentual: e.target.value }))} />
                  </div>
                </div>

                <div className="field">
                  <label className="label">Produtos da promoção</label>
                  <div style={{ position: 'relative' }}>
                    <input
                      className="input"
                      placeholder="Buscar produto por nome ou SKU para adicionar"
                      value={buscaProduto}
                      onChange={e => setBuscaProduto(e.target.value)}
                      autoComplete="off"
                    />
                    {produtosBusca.length > 0 && (
                      <div style={{
                        position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 10,
                        display: 'flex', flexDirection: 'column', gap: '2px', maxHeight: '240px', overflowY: 'auto',
                        background: '#1F1F1F', border: '1px solid var(--border)', borderRadius: '8px', padding: '6px',
                        boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
                      }}>
                        {produtosBusca.map(p => (
                          <button
                            key={p.id}
                            onClick={() => addItem(p)}
                            style={{
                              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px',
                              width: '100%', padding: '7px 9px', borderRadius: '6px', border: 'none', background: 'transparent',
                              color: '#FFFFFF', fontSize: '12px', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
                            }}
                            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.06)')}
                            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                          >
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {p.nome}{p.sku && <span style={{ color: '#555' }}> #{p.sku}</span>}
                            </span>
                            <span style={{ fontSize: '11px', color: '#A3A3A3', flexShrink: 0 }}>{formatCurrency(p.preco_venda)}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {itens.length === 0 ? (
                    <p style={{ fontSize: '12px', color: '#444', marginTop: '10px' }}>
                      Nenhum produto ainda. Dica: no catálogo, marque vários produtos e use "Criar promoção".
                    </p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '10px' }}>
                      {itens.map(item => {
                        const produto = produtoPorId.get(item.produto_id)
                        if (!produto) return null
                        const precoFinal = precoFinalItem(item, produto)
                        return (
                          <div key={item.produto_id} style={{
                            display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap',
                            padding: '10px 12px', borderRadius: '8px',
                            background: 'rgba(255,255,255,0.03)', border: '1px solid #252525',
                          }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: '1 1 180px', minWidth: 0 }}>
                              {produto.foto_url ? (
                                <img src={produto.foto_url} alt="" style={{ width: '28px', height: '28px', borderRadius: '6px', objectFit: 'cover', flexShrink: 0, border: '1px solid #2A2A2A' }} />
                              ) : (
                                <div style={{ width: '28px', height: '28px', borderRadius: '6px', background: '#1F1F1F', border: '1px solid #2A2A2A', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                  <Package size={13} style={{ color: '#444' }} />
                                </div>
                              )}
                              <div style={{ minWidth: 0 }}>
                                <p style={{ fontSize: '12px', fontWeight: 500, color: '#FFFFFF', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{produto.nome}</p>
                                <p style={{ fontSize: '11px', color: '#555', marginTop: '2px' }}>
                                  <span style={{ textDecoration: precoFinal < produto.preco_venda ? 'line-through' : 'none' }}>{formatCurrency(produto.preco_venda)}</span>
                                  {precoFinal < produto.preco_venda && <strong style={{ color: '#FFFFFF', marginLeft: '6px' }}>{formatCurrency(precoFinal)}</strong>}
                                </p>
                              </div>
                            </div>
                            <select
                              className="input"
                              style={{ width: '130px', padding: '6px 8px', fontSize: '12px' }}
                              value={item.modo}
                              onChange={e => updateItem(item.produto_id, { modo: e.target.value as ModoDesconto, valor: '' })}
                            >
                              <option value="padrao">Padrão ({descontoPadrao}%)</option>
                              <option value="percentual">Desconto %</option>
                              <option value="fixo">Preço fixo</option>
                            </select>
                            {item.modo !== 'padrao' && (
                              <input
                                className="input"
                                style={{ width: '90px', padding: '6px 8px', fontSize: '12px' }}
                                type="number" min={0} max={item.modo === 'percentual' ? 100 : undefined} step={item.modo === 'percentual' ? 0.5 : 0.01}
                                placeholder={item.modo === 'percentual' ? '%' : 'R$'}
                                value={item.valor}
                                onChange={e => updateItem(item.produto_id, { valor: e.target.value })}
                              />
                            )}
                            <button className="btn btn-icon" title="Tirar da promoção" onClick={() => removeItem(item.produto_id)}><Trash2 size={12} /></button>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>

                {erroModal && <p style={{ fontSize: '12px', color: '#666' }}>{erroModal}</p>}
                <div style={{ display: 'flex', gap: '10px', marginTop: '4px' }}>
                  <button className="btn btn-secondary" style={{ flex: 1 }} onClick={fecharModal}>Cancelar (Esc)</button>
                  <button className="btn btn-primary" style={{ flex: 1 }} onClick={salvar} disabled={saving}>
                    {saving ? 'Salvando...' : `${editId ? 'Salvar' : 'Criar promoção'} (F10)`}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
