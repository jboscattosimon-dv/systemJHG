import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Plus, Trash2, X, Package, Check, RotateCcw } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { formatCurrency } from '../lib/utils'
import { useModalKeyboard } from '../hooks/useModalKeyboard'
import type { Produto } from '../types'

// Sugestão padrão de preço à vista: 80% de lucro em cima do valor pago
// por peça (não em cima do custo já rateado com frete/despesa — é só
// um ponto de partida rápido, o campo continua livre pra digitar).
const MARGEM_SUGERIDA = 0.8

interface TamanhoQtd { tamanho: string; quantidade: string }

interface ItemEntrada {
  id: string
  produtoId: string | null
  nome: string
  quantidade: string
  valorPago: string
  tamanhos: TamanhoQtd[]
  precoVista: string
  precoVistaAuto: boolean
  precoPrazo: string
}

interface ItemCalculado extends ItemEntrada {
  qtdTotal: number
  custoUnitario: number
}

interface ItemResultado {
  produto_id: string
  nome: string
  quantidade: number
  custo_unitario: number
  preco_venda: number
  preco_venda_prazo: number | null
  tem_tamanhos: boolean
}

function uid() { return Math.random().toString(36).slice(2) }
function novoItem(): ItemEntrada {
  return { id: uid(), produtoId: null, nome: '', quantidade: '1', valorPago: '', tamanhos: [], precoVista: '', precoVistaAuto: true, precoPrazo: '' }
}
function qtdItem(item: ItemEntrada): number {
  return item.tamanhos.length > 0
    ? item.tamanhos.reduce((s, t) => s + (Number(t.quantidade) || 0), 0)
    : Number(item.quantidade) || 0
}
function sugestaoPrecoVista(valorPago: string): string {
  const v = Number(valorPago)
  return valorPago.trim() && v >= 0 ? (v * (1 + MARGEM_SUGERIDA)).toFixed(2) : ''
}

export default function EntradaProdutosModal({ produtos, onClose, onSuccess }: {
  produtos: Produto[]
  onClose: () => void
  onSuccess: () => void
}) {
  const [itens, setItens] = useState<ItemEntrada[]>([novoItem()])
  const [buscaAberta, setBuscaAberta] = useState<string | null>(null)
  const [frete, setFrete] = useState('')
  const [despesas, setDespesas] = useState('')
  const [desconto, setDesconto] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [resultado, setResultado] = useState<ItemResultado[] | null>(null)

  const itensCalculados: ItemCalculado[] = useMemo(() => {
    const totalPago = itens.reduce((s, i) => s + (Number(i.valorPago) || 0) * qtdItem(i), 0)
    const freteNum = Number(frete) || 0
    const despesasNum = Number(despesas) || 0
    const descontoNum = Number(desconto) || 0
    return itens.map(item => {
      const qtd = qtdItem(item)
      const valorPago = Number(item.valorPago) || 0
      if (qtd <= 0 || totalPago <= 0) {
        return { ...item, qtdTotal: qtd, custoUnitario: valorPago }
      }
      const proporcao = (valorPago * qtd) / totalPago
      const custoUnitario = valorPago + (proporcao * (freteNum + despesasNum - descontoNum)) / qtd
      return { ...item, qtdTotal: qtd, custoUnitario }
    })
  }, [itens, frete, despesas, desconto])

  const totalPago = itensCalculados.reduce((s, i) => s + (Number(i.valorPago) || 0) * i.qtdTotal, 0)
  const totalExtra = (Number(frete) || 0) + (Number(despesas) || 0) - (Number(desconto) || 0)

  function addItem() {
    setItens(prev => [...prev, novoItem()])
  }

  function removeItem(id: string) {
    setItens(prev => prev.filter(i => i.id !== id))
  }

  function updateItem(id: string, patch: Partial<ItemEntrada>) {
    setItens(prev => prev.map(i => i.id === id ? { ...i, ...patch } : i))
  }

  // Enquanto o preço à vista não for editado à mão, acompanha a sugestão
  // (80% sobre o valor pago) conforme o valor pago muda.
  function updateValorPago(id: string, valor: string) {
    setItens(prev => prev.map(i => i.id === id
      ? { ...i, valorPago: valor, precoVista: i.precoVistaAuto ? sugestaoPrecoVista(valor) : i.precoVista }
      : i
    ))
  }

  function usarSugestaoPreco(id: string) {
    setItens(prev => prev.map(i => i.id === id ? { ...i, precoVistaAuto: true, precoVista: sugestaoPrecoVista(i.valorPago) } : i))
  }

  function selecionarProduto(id: string, p: Produto) {
    updateItem(id, { produtoId: p.id, nome: p.nome })
    setBuscaAberta(null)
  }

  function limparSelecao(id: string) {
    updateItem(id, { produtoId: null, nome: '' })
  }

  function addTamanhoRow(itemId: string) {
    setItens(prev => prev.map(i => i.id === itemId ? { ...i, tamanhos: [...i.tamanhos, { tamanho: '', quantidade: '' }] } : i))
  }

  function updateTamanhoRow(itemId: string, idx: number, campo: 'tamanho' | 'quantidade', valor: string) {
    setItens(prev => prev.map(i => i.id === itemId
      ? { ...i, tamanhos: i.tamanhos.map((t, ti) => ti === idx ? { ...t, [campo]: valor } : t) }
      : i
    ))
  }

  function removeTamanhoRow(itemId: string, idx: number) {
    setItens(prev => prev.map(i => i.id === itemId ? { ...i, tamanhos: i.tamanhos.filter((_, ti) => ti !== idx) } : i))
  }

  function sugestoes(nome: string): Produto[] {
    if (!nome.trim()) return []
    return produtos.filter(p => p.nome.toLowerCase().includes(nome.toLowerCase())).slice(0, 6)
  }

  const itensValidos = itensCalculados.filter(i => i.nome.trim() && i.qtdTotal > 0 && Number(i.valorPago) >= 0)

  async function handleSalvar() {
    if (itensValidos.length === 0) { setError('Adicione ao menos um item com nome, quantidade e valor pago.'); return }
    setSaving(true); setError('')
    const { data, error: err } = await supabase.rpc('registrar_entrada_produtos', {
      p_itens: itensValidos.map(i => ({
        produto_id: i.produtoId,
        nome: i.nome.trim(),
        quantidade: i.qtdTotal,
        valor_pago_unitario: Number(i.valorPago),
        preco_venda: i.precoVista.trim() ? Number(i.precoVista) : null,
        preco_venda_prazo: i.precoPrazo.trim() ? Number(i.precoPrazo) : null,
        tamanhos: i.tamanhos
          .filter(t => t.tamanho.trim() && Number(t.quantidade) > 0)
          .map(t => ({ tamanho: t.tamanho.trim(), quantidade: Number(t.quantidade) })),
      })),
      p_frete: Number(frete) || 0,
      p_despesas: Number(despesas) || 0,
      p_desconto: Number(desconto) || 0,
      p_margem_vista: 0,
      p_margem_prazo: null,
    })
    setSaving(false)
    if (err) { setError(err.message); return }
    setResultado((data ?? []) as ItemResultado[])
    onSuccess()
  }

  function concluir() {
    onClose()
  }

  const modalRef = useModalKeyboard(true, onClose, resultado ? undefined : handleSalvar)

  return (
    <motion.div
      style={{ position: 'fixed', inset: 0, zIndex: 55, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        ref={modalRef}
        className="card"
        style={{ width: '100%', maxWidth: '680px', padding: '28px', maxHeight: '88vh', overflowY: 'auto', overflowX: 'hidden' }}
        initial={{ scale: 0.95, y: 16 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 16 }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
          <div>
            <h2 style={{ fontSize: '18px', color: '#FFFFFF' }}>Nova Entrada de Mercadoria</h2>
            {!resultado && (
              <p style={{ fontSize: '12px', color: '#555', marginTop: '3px' }}>
                O preço à vista já vem sugerido (80% sobre o valor pago) — edite se quiser.
              </p>
            )}
          </div>
          <button className="btn btn-icon" onClick={onClose}><X size={14} /></button>
        </div>

        {resultado ? (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', margin: '18px 0' }}>
              {resultado.map(r => (
                <div key={r.produto_id} style={{
                  display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px',
                  borderRadius: '8px', background: 'rgba(255,255,255,0.03)', border: '1px solid #252525',
                }}>
                  <div style={{ width: '28px', height: '28px', borderRadius: '6px', background: '#1F1F1F', border: '1px solid #2A2A2A', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Package size={13} style={{ color: '#555' }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: '13px', fontWeight: 500, color: '#FFFFFF' }}>{r.nome}</p>
                    <p style={{ fontSize: '11px', color: '#555', marginTop: '2px' }}>
                      +{r.quantidade} un · custo {formatCurrency(r.custo_unitario)}
                      {r.tem_tamanhos && <span style={{ color: '#777' }}> · estoque somado por tamanho</span>}
                    </p>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <p style={{ fontSize: '13px', fontWeight: 600, color: '#FFFFFF' }}>{formatCurrency(r.preco_venda)}</p>
                    {r.preco_venda_prazo != null && <p style={{ fontSize: '11px', color: '#555' }}>{formatCurrency(r.preco_venda_prazo)} a prazo</p>}
                  </div>
                </div>
              ))}
            </div>
            <button className="btn btn-primary btn-full" onClick={concluir}>
              <Check size={14} /> Concluir
            </button>
          </>
        ) : (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', margin: '18px 0' }}>
              {itensCalculados.map(item => {
                const lista = buscaAberta === item.id ? sugestoes(item.nome) : []
                const usaTamanhos = item.tamanhos.length > 0
                return (
                  <div key={item.id} style={{ padding: '12px', borderRadius: '8px', background: 'rgba(255,255,255,0.03)', border: '1px solid #252525' }}>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', marginBottom: '8px' }}>
                      <div style={{ flex: 1, minWidth: 0, position: 'relative' }}>
                        {item.produtoId ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '9px 12px', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: '8px' }}>
                            <span style={{ flex: 1, fontSize: '13px', color: '#FFFFFF', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.nome}</span>
                            <span style={{ fontSize: '10px', color: '#555', flexShrink: 0 }}>existente</span>
                            <button onClick={() => limparSelecao(item.id)} style={{ background: 'transparent', border: 'none', color: '#666', cursor: 'pointer', padding: '2px', display: 'flex', flexShrink: 0 }}>
                              <X size={12} />
                            </button>
                          </div>
                        ) : (
                          <input
                            className="input"
                            placeholder="Nome do produto (novo ou existente)"
                            value={item.nome}
                            onChange={e => updateItem(item.id, { nome: e.target.value })}
                            onFocus={() => setBuscaAberta(item.id)}
                            onBlur={() => setTimeout(() => setBuscaAberta(prev => prev === item.id ? null : prev), 150)}
                            autoComplete="off"
                          />
                        )}
                        {lista.length > 0 && (
                          <div style={{
                            position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 10,
                            display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '160px', overflowY: 'auto',
                            background: '#1F1F1F', border: '1px solid var(--border)', borderRadius: '8px', padding: '6px',
                            boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
                          }}>
                            {lista.map(p => (
                              <button
                                key={p.id}
                                onMouseDown={e => e.preventDefault()}
                                onClick={() => selecionarProduto(item.id, p)}
                                style={{
                                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px',
                                  width: '100%', padding: '7px 9px', borderRadius: '6px', border: 'none', background: 'transparent',
                                  color: '#FFFFFF', fontSize: '12px', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
                                }}
                                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.06)')}
                                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                              >
                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.nome}</span>
                                <span style={{ fontSize: '10px', color: '#555', flexShrink: 0 }}>custo atual {formatCurrency(p.preco_custo)}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      <button className="btn btn-icon" onClick={() => removeItem(item.id)} style={{ flexShrink: 0 }}><Trash2 size={12} /></button>
                    </div>

                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                      {!usaTamanhos && (
                        <input
                          className="input" style={{ flex: '1 1 70px', minWidth: '70px' }} type="number" min={1} placeholder="Qtd"
                          value={item.quantidade} onChange={e => updateItem(item.id, { quantidade: e.target.value })}
                        />
                      )}
                      <input
                        className="input" style={{ flex: '1 1 100px', minWidth: '90px' }} type="number" min={0} step={0.01} placeholder="Vlr pago"
                        value={item.valorPago} onChange={e => updateValorPago(item.id, e.target.value)}
                      />
                      <input
                        className="input" style={{ flex: '1 1 100px', minWidth: '90px' }} type="number" min={0} step={0.01} placeholder="Preço à vista"
                        value={item.precoVista} onChange={e => updateItem(item.id, { precoVista: e.target.value, precoVistaAuto: false })}
                      />
                      {!item.precoVistaAuto && (
                        <button type="button" className="btn btn-icon" title="Usar sugestão (80% sobre valor pago)" onClick={() => usarSugestaoPreco(item.id)}>
                          <RotateCcw size={12} />
                        </button>
                      )}
                      <input
                        className="input" style={{ flex: '1 1 100px', minWidth: '90px' }} type="number" min={0} step={0.01} placeholder="Preço a prazo"
                        value={item.precoPrazo} onChange={e => updateItem(item.id, { precoPrazo: e.target.value })}
                      />
                    </div>

                    <div style={{ marginTop: '10px' }}>
                      {usaTamanhos && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '6px' }}>
                          {item.tamanhos.map((t, idx) => (
                            <div key={idx} style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                              <input
                                className="input" style={{ flex: 1 }} placeholder="Tamanho (P, M, 38...)"
                                value={t.tamanho} onChange={e => updateTamanhoRow(item.id, idx, 'tamanho', e.target.value)}
                              />
                              <input
                                className="input" style={{ width: '80px' }} type="number" min={0} placeholder="Qtd"
                                value={t.quantidade} onChange={e => updateTamanhoRow(item.id, idx, 'quantidade', e.target.value)}
                              />
                              <button className="btn btn-icon" onClick={() => removeTamanhoRow(item.id, idx)}><Trash2 size={12} /></button>
                            </div>
                          ))}
                        </div>
                      )}
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => addTamanhoRow(item.id)} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Plus size={11} /> {usaTamanhos ? 'Tamanho' : 'Definir por tamanho'}
                      </button>
                    </div>

                    {item.qtdTotal > 0 && Number(item.valorPago) >= 0 && (
                      <p style={{ fontSize: '11px', color: '#555', marginTop: '8px' }}>
                        {usaTamanhos && <>{item.qtdTotal} un total · </>}
                        Custo rateado (c/ frete): <strong style={{ color: '#A3A3A3' }}>{formatCurrency(item.custoUnitario)}</strong>
                      </p>
                    )}
                  </div>
                )
              })}
              <button className="btn btn-ghost btn-sm" onClick={addItem} style={{ display: 'flex', alignItems: 'center', gap: '4px', width: 'fit-content' }}>
                <Plus size={11} /> Adicionar item
              </button>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginBottom: '14px' }}>
              <div className="field" style={{ flex: '1 1 130px' }}>
                <label className="label">Frete</label>
                <input className="input" type="number" min={0} step={0.01} placeholder="0,00" value={frete} onChange={e => setFrete(e.target.value)} />
              </div>
              <div className="field" style={{ flex: '1 1 130px' }}>
                <label className="label">Despesas</label>
                <input className="input" type="number" min={0} step={0.01} placeholder="0,00" value={despesas} onChange={e => setDespesas(e.target.value)} />
              </div>
              <div className="field" style={{ flex: '1 1 130px' }}>
                <label className="label">Desconto</label>
                <input className="input" type="number" min={0} step={0.01} placeholder="0,00" value={desconto} onChange={e => setDesconto(e.target.value)} />
              </div>
            </div>

            <div style={{ padding: '14px 16px', background: 'rgba(255,255,255,0.04)', borderRadius: '8px', marginBottom: '18px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '12px', color: '#666' }}>Total pago nas peças</span>
                <span style={{ fontSize: '13px', color: '#A3A3A3' }}>{formatCurrency(totalPago)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '12px', color: '#666' }}>Frete + despesas − desconto</span>
                <span style={{ fontSize: '13px', color: '#A3A3A3' }}>{formatCurrency(totalExtra)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '6px', borderTop: '1px solid #262626' }}>
                <span style={{ fontSize: '13px', color: '#A3A3A3' }}>Total da entrada</span>
                <span style={{ fontSize: '16px', fontWeight: 700, color: '#FFFFFF' }}>{formatCurrency(totalPago + totalExtra)}</span>
              </div>
            </div>

            {error && <p style={{ fontSize: '12px', color: '#666', marginBottom: '12px' }}>{error}</p>}
            <div className="modal-actions" style={{ display: 'flex', gap: '10px' }}>
              <button className="btn btn-secondary" style={{ flex: 1 }} onClick={onClose}>
                Cancelar <span className="shortcut-hint">(Esc)</span>
              </button>
              <button className="btn btn-primary" style={{ flex: 1 }} onClick={handleSalvar} disabled={saving}>
                {saving ? 'Lançando...' : <>Lançar Entrada <span className="shortcut-hint">(F10)</span></>}
              </button>
            </div>
          </>
        )}
      </motion.div>
    </motion.div>
  )
}
