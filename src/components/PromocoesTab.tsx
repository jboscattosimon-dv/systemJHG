import { useState, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, X, Pencil, Trash2, Percent, Package, Pause, Play } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { formatCurrency, formatDate } from '../lib/utils'
import { useModalKeyboard } from '../hooks/useModalKeyboard'
import type { Produto, Promocao, PromocaoItem } from '../types'

// Enquanto não personalizado, o item segue o desconto padrão lá de cima
// (os três campos são recalculados a partir dele). Ao mexer em qualquer
// campo do item ele vira personalizado e guarda os valores digitados.
interface ItemForm { produto_id: string; personalizado: boolean; pct: string; vista: string; prazo: string }
type ValoresItem = Pick<ItemForm, 'pct' | 'vista' | 'prazo'>
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

function fmt(n: number): string {
  return String(Math.round(n * 100) / 100)
}

function valoresPorPercentual(produto: Produto, pct: number): ValoresItem {
  return {
    pct: fmt(pct),
    vista: fmt(produto.preco_venda * (1 - pct / 100)),
    prazo: produto.preco_venda_prazo != null ? fmt(produto.preco_venda_prazo * (1 - pct / 100)) : '',
  }
}

// Monta o formulário a partir do que está salvo no banco.
function itemFormDoBanco(item: PromocaoItem, produto: Produto | undefined): ItemForm {
  const base = { produto_id: item.produto_id }
  if (!produto) return { ...base, personalizado: false, pct: '', vista: '', prazo: '' }
  if (item.preco_promocional != null) {
    const pv = produto.preco_venda
    const vista = Number(item.preco_promocional)
    const prazo = item.preco_promocional_prazo != null ? fmt(Number(item.preco_promocional_prazo))
      : produto.preco_venda_prazo != null && pv > 0 ? fmt(produto.preco_venda_prazo * vista / pv) : ''
    return { ...base, personalizado: true, vista: fmt(vista), prazo, pct: pv > 0 ? fmt((1 - vista / pv) * 100) : '' }
  }
  if (item.desconto_percentual != null) {
    return { ...base, personalizado: true, ...valoresPorPercentual(produto, Number(item.desconto_percentual)) }
  }
  return { ...base, personalizado: false, pct: '', vista: '', prazo: '' }
}

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
    setItens(produtoIds.map(id => ({ produto_id: id, personalizado: false, pct: '', vista: '', prazo: '' })))
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
    setItens((p.itens ?? []).map(i => itemFormDoBanco(i, produtoPorId.get(i.produto_id))))
    setBuscaProduto(''); setErroModal('')
    setShowModal(true)
  }

  function fecharModal() {
    setShowModal(false)
    setEditId(null)
  }

  function addItem(p: Produto) {
    setItens(prev => prev.some(i => i.produto_id === p.id) ? prev : [...prev, { produto_id: p.id, personalizado: false, pct: '', vista: '', prazo: '' }])
    setBuscaProduto('')
  }

  function removeItem(produtoId: string) {
    setItens(prev => prev.filter(i => i.produto_id !== produtoId))
  }

  const descontoPadrao = Number(form.desconto_percentual) || 0

  // O que aparece nos campos do item: o digitado, ou o calculado pelo padrão.
  function valoresItem(item: ItemForm, produto: Produto): ValoresItem {
    return item.personalizado ? item : valoresPorPercentual(produto, descontoPadrao)
  }

  function alterarItem(item: ItemForm, produto: Produto, campo: keyof ValoresItem, valor: string) {
    const atual = valoresItem(item, produto)
    const pv = produto.preco_venda
    const ppz = produto.preco_venda_prazo
    const n = Number(valor)
    const vazio = valor.trim() === '' || !Number.isFinite(n)
    let novo: ValoresItem
    if (campo === 'pct') {
      // % → recalcula à vista e a prazo
      novo = vazio ? { pct: valor, vista: '', prazo: '' } : { ...valoresPorPercentual(produto, n), pct: valor }
    } else if (campo === 'vista') {
      // À vista → a prazo acompanha na mesma proporção, e o % é recalculado
      novo = {
        vista: valor,
        pct: !vazio && pv > 0 ? fmt((1 - n / pv) * 100) : '',
        prazo: !vazio && ppz != null && pv > 0 ? fmt(ppz * n / pv) : atual.prazo,
      }
    } else {
      novo = { ...atual, prazo: valor }
    }
    setItens(prev => prev.map(i => i.produto_id === item.produto_id ? { ...i, ...novo, personalizado: true } : i))
  }

  function voltarAoPadrao(produtoId: string) {
    setItens(prev => prev.map(i => i.produto_id === produtoId ? { ...i, personalizado: false } : i))
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
      const produto = produtoPorId.get(item.produto_id)
      if (!item.personalizado || !produto) continue
      const vista = Number(item.vista)
      if (item.vista.trim() === '' || !Number.isFinite(vista) || vista < 0) { setErroModal(`Informe o preço à vista de "${produto.nome}".`); return }
      if (vista > produto.preco_venda) { setErroModal(`O preço à vista de "${produto.nome}" ficou maior que o normal.`); return }
      if (item.prazo.trim() !== '') {
        const prazo = Number(item.prazo)
        if (!Number.isFinite(prazo) || prazo < 0) { setErroModal(`Preço a prazo inválido em "${produto.nome}".`); return }
      }
    }
    if (descontoPadrao === 0 && itens.some(i => !i.personalizado)) {
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

    // Item no padrão salva tudo nulo (segue o % da promoção); personalizado
    // salva os preços digitados — o % do item é só exibição.
    const { error: errItens } = await supabase.from('promocao_itens').insert(itens.map(i => ({
      promocao_id: promocaoId,
      produto_id: i.produto_id,
      desconto_percentual: null,
      preco_promocional: i.personalizado ? Number(i.vista) : null,
      preco_promocional_prazo: i.personalizado && i.prazo.trim() !== '' ? Number(i.prazo) : null,
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
                initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 10) * 0.04 }}
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
              style={{ width: '100%', maxWidth: '620px', padding: 'clamp(18px, 5vw, 28px)', maxHeight: '88vh', overflowY: 'auto', overflowX: 'hidden' }}
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
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(150px, 100%), 1fr))', gap: '12px' }}>
                  <div className="field" style={{ minWidth: 0 }}>
                    <label className="label">Início *</label>
                    <input className="input" type="date" value={form.data_inicio} onChange={e => setForm(f => ({ ...f, data_inicio: e.target.value }))} />
                  </div>
                  <div className="field" style={{ minWidth: 0 }}>
                    <label className="label">Fim *</label>
                    <input className="input" type="date" min={form.data_inicio || undefined} value={form.data_fim} onChange={e => setForm(f => ({ ...f, data_fim: e.target.value }))} />
                  </div>
                  <div className="field" style={{ minWidth: 0 }}>
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
                        const valores = valoresItem(item, produto)
                        const semPrazo = produto.preco_venda_prazo == null
                        const campo = (rotulo: string, chave: keyof ValoresItem, step: string, desabilitado = false) => (
                          <div style={{ minWidth: 0 }}>
                            <label style={{ display: 'block', fontSize: '10px', color: '#555', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '4px' }}>{rotulo}</label>
                            <input
                              className="input"
                              style={{ padding: '8px 10px', minHeight: '38px' }}
                              type="number" inputMode="decimal" min={0} step={step}
                              placeholder={desabilitado ? '—' : undefined}
                              disabled={desabilitado}
                              value={desabilitado ? '' : valores[chave]}
                              onChange={e => alterarItem(item, produto, chave, e.target.value)}
                            />
                          </div>
                        )
                        return (
                          <div key={item.produto_id} style={{
                            padding: '10px 12px', borderRadius: '8px',
                            background: 'rgba(255,255,255,0.03)', border: '1px solid #252525',
                          }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                              {produto.foto_url ? (
                                <img src={produto.foto_url} alt="" style={{ width: '28px', height: '28px', borderRadius: '6px', objectFit: 'cover', flexShrink: 0, border: '1px solid #2A2A2A' }} />
                              ) : (
                                <div style={{ width: '28px', height: '28px', borderRadius: '6px', background: '#1F1F1F', border: '1px solid #2A2A2A', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                  <Package size={13} style={{ color: '#444' }} />
                                </div>
                              )}
                              <div style={{ minWidth: 0, flex: 1 }}>
                                <p style={{ fontSize: '12px', fontWeight: 500, color: '#FFFFFF', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{produto.nome}</p>
                                <p style={{ fontSize: '11px', color: '#555', marginTop: '2px' }}>
                                  Normal: {formatCurrency(produto.preco_venda)} à vista
                                  {!semPrazo && ` · ${formatCurrency(produto.preco_venda_prazo!)} a prazo`}
                                </p>
                              </div>
                              {item.personalizado && (
                                <button type="button" className="btn btn-ghost btn-sm" style={{ padding: '4px 8px', minHeight: 0, fontSize: '11px' }} onClick={() => voltarAoPadrao(item.produto_id)}>
                                  Usar padrão
                                </button>
                              )}
                              <button className="btn btn-icon" title="Tirar da promoção" onClick={() => removeItem(item.produto_id)}><Trash2 size={12} /></button>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '0.8fr 1fr 1fr', gap: '8px', marginTop: '10px' }}>
                              {campo('Desconto %', 'pct', '0.5')}
                              {campo('Promo à vista', 'vista', '0.01')}
                              {campo('Promo a prazo', 'prazo', '0.01', semPrazo)}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>

                {erroModal && <p style={{ fontSize: '12px', color: '#666' }}>{erroModal}</p>}
                <div className="modal-actions" style={{ display: 'flex', gap: '10px', marginTop: '4px' }}>
                  <button className="btn btn-secondary" style={{ flex: 1, minWidth: 0 }} onClick={fecharModal}>
                    Cancelar <span className="shortcut-hint">(Esc)</span>
                  </button>
                  <button className="btn btn-primary" style={{ flex: 1, minWidth: 0 }} onClick={salvar} disabled={saving}>
                    {saving ? 'Salvando...' : <>{editId ? 'Salvar' : 'Criar promoção'} <span className="shortcut-hint">(F10)</span></>}
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
