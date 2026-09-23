import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, X, AlertTriangle } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { formatCurrency, formatDate } from '../lib/utils'
import { useModalKeyboard } from '../hooks/useModalKeyboard'
import type { ContaPagar, Fornecedor, CategoriaFinanceira, FormaPagamentoCadastro, ContaFinanceira } from '../types'

type Filtro = 'todas' | 'aberta' | 'vencida' | 'paga'

const FORM_INICIAL = {
  fornecedor_id: '', categoria_id: '', descricao: '', valor: '',
  data_vencimento: new Date().toISOString().split('T')[0], total_parcelas: '1', observacao: '',
}

function isVencida(c: ContaPagar) {
  return (c.status === 'aberta' || c.status === 'parcial') && c.data_vencimento < new Date().toISOString().split('T')[0]
}

const STATUS_LABEL: Record<string, string> = { aberta: 'Aberta', parcial: 'Parcial', paga: 'Paga', cancelada: 'Cancelada' }

export default function ContasPagar() {
  const [contas, setContas] = useState<ContaPagar[]>([])
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([])
  const [categorias, setCategorias] = useState<CategoriaFinanceira[]>([])
  const [formasPagamento, setFormasPagamento] = useState<FormaPagamentoCadastro[]>([])
  const [loading, setLoading] = useState(true)
  const [filtro, setFiltro] = useState<Filtro>('todas')

  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState(FORM_INICIAL)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const [contaBaixa, setContaBaixa] = useState<ContaPagar | null>(null)
  const [valorBaixa, setValorBaixa] = useState('')
  const [formaBaixa, setFormaBaixa] = useState('')
  const [contasFinanceiras, setContasFinanceiras] = useState<ContaFinanceira[]>([])
  const [contaFinanceiraBaixa, setContaFinanceiraBaixa] = useState('')

  const carregar = useCallback(() => {
    setLoading(true)
    supabase.from('contas_pagar').select('*, fornecedor:fornecedores(*), categoria:categorias_financeiras(*)').order('data_vencimento')
      .then(({ data }) => { setContas((data ?? []) as ContaPagar[]); setLoading(false) })
  }, [])

  useEffect(() => {
    carregar()
    supabase.from('fornecedores').select('*').eq('ativo', true).order('nome')
      .then(({ data }) => { if (data) setFornecedores(data as Fornecedor[]) })
    supabase.from('categorias_financeiras').select('*').eq('tipo', 'despesa').eq('ativo', true).order('nome')
      .then(({ data }) => { if (data) setCategorias(data as CategoriaFinanceira[]) })
    supabase.from('formas_pagamento').select('*').eq('ativo', true).order('nome')
      .then(({ data }) => { if (data) setFormasPagamento(data as FormaPagamentoCadastro[]) })
    supabase.from('contas_financeiras').select('*').eq('ativo', true).order('nome')
      .then(({ data }) => {
        const lista = (data ?? []) as ContaFinanceira[]
        setContasFinanceiras(lista)
        setContaFinanceiraBaixa(lista.find(c => c.padrao)?.id ?? lista[0]?.id ?? '')
      })
  }, [carregar])

  // Contas sintéticas (que agrupam outras) não recebem lançamento direto — só as analíticas (de detalhe).
  const idsSinteticas = new Set(categorias.map(c => c.categoria_pai_id).filter(Boolean))
  const categoriasSelecionaveis = categorias.filter(c => !idsSinteticas.has(c.id))
  const nomeCategoriaPai = (id: string) => categorias.find(c => c.id === id)?.nome

  const filtradas = contas.filter(c => {
    if (filtro === 'todas') return true
    if (filtro === 'vencida') return isVencida(c)
    return c.status === filtro
  })

  const totalAberto = contas.filter(c => c.status === 'aberta' || c.status === 'parcial').reduce((s, c) => s + (c.valor - c.valor_pago), 0)
  const totalVencido = contas.filter(isVencida).reduce((s, c) => s + (c.valor - c.valor_pago), 0)

  async function handleSave() {
    if (!form.descricao.trim() || !form.valor) { setError('Descrição e valor são obrigatórios.'); return }
    setSaving(true); setError('')
    const { error: err } = await supabase.rpc('criar_conta_pagar', {
      p_fornecedor_id: form.fornecedor_id || null,
      p_categoria_id: form.categoria_id || null,
      p_descricao: form.descricao,
      p_valor_total: Number(form.valor),
      p_data_vencimento: form.data_vencimento,
      p_total_parcelas: Number(form.total_parcelas) || 1,
      p_observacao: form.observacao || null,
    })
    setSaving(false)
    if (err) { setError(err.message); return }
    setForm(FORM_INICIAL)
    setShowModal(false)
    carregar()
  }

  async function confirmarBaixa() {
    if (!contaBaixa) return
    setSaving(true); setError('')
    const { error: err } = await supabase.rpc('baixar_conta_pagar', {
      p_conta_id: contaBaixa.id,
      p_valor_pago: Number(valorBaixa),
      p_forma_pagamento_id: formaBaixa || null,
      p_conta_financeira_id: contaFinanceiraBaixa || null,
    })
    setSaving(false)
    if (err) { setError(err.message); return }
    setContaBaixa(null)
    carregar()
  }

  const modalRef = useModalKeyboard(showModal, () => setShowModal(false), handleSave)
  const modalBaixaRef = useModalKeyboard(!!contaBaixa, () => setContaBaixa(null), confirmarBaixa)

  return (
    <div className="page">
      <div className="page-header-row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '24px', color: '#FFFFFF' }}>Contas a Pagar</h1>
          <p style={{ fontSize: '13px', color: '#555', marginTop: '3px' }}>
            {formatCurrency(totalAberto)} em aberto · {formatCurrency(totalVencido)} vencido
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => { setError(''); setShowModal(true) }} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Plus size={14} strokeWidth={2.5} /> Nova Conta
        </button>
      </div>

      <div style={{ display: 'flex', gap: '6px', marginBottom: '20px' }}>
        {(['todas', 'aberta', 'vencida', 'paga'] as Filtro[]).map(f => (
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

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="list-header" style={{
          display: 'grid', gridTemplateColumns: '1fr 160px 110px 110px 100px 110px',
          padding: '10px 24px', borderBottom: '1px solid #222',
          fontSize: '10px', fontWeight: 600, color: '#444', textTransform: 'uppercase', letterSpacing: '0.1em',
          background: 'rgba(0,0,0,0.2)',
        }}>
          <span>Descrição</span><span>Fornecedor</span><span>Vencimento</span><span>Valor</span><span>Status</span><span></span>
        </div>

        {loading ? (
          <div style={{ padding: '56px', textAlign: 'center', color: '#444', fontSize: '13px' }}>Carregando...</div>
        ) : filtradas.length === 0 ? (
          <div style={{ padding: '56px', textAlign: 'center', color: '#444', fontSize: '13px' }}>Nenhuma conta encontrada.</div>
        ) : filtradas.map((c, i) => {
          const vencida = isVencida(c)
          const saldo = c.valor - c.valor_pago
          return (
            <motion.div
              key={c.id}
              className="list-row"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.03 }}
              style={{
                display: 'grid', gridTemplateColumns: '1fr 160px 110px 110px 100px 110px',
                padding: '14px 24px', alignItems: 'center',
                borderBottom: i < filtradas.length - 1 ? '1px solid #1F1F1F' : 'none',
              }}
            >
              <div>
                <span style={{ fontSize: '13px', fontWeight: 500, color: '#FFFFFF' }}>{c.descricao}</span>
                {c.categoria && <p style={{ fontSize: '11px', color: '#555' }}>{c.categoria.nome}</p>}
              </div>
              <span style={{ fontSize: '13px', color: '#A3A3A3' }}>{c.fornecedor?.nome ?? '—'}</span>
              <span style={{ fontSize: '12px', color: vencida ? '#FFFFFF' : '#666', display: 'flex', alignItems: 'center', gap: '4px' }}>
                {vencida && <AlertTriangle size={11} />} {formatDate(c.data_vencimento)}
              </span>
              <span style={{ fontSize: '13px', fontWeight: 600, color: '#FFFFFF' }}>{formatCurrency(saldo)}</span>
              <span
                className={
                  c.status === 'paga' ? 'badge badge-done'
                  : vencida ? 'badge badge-canceled'
                  : c.status === 'cancelada' ? 'badge badge-canceled'
                  : 'badge badge-pending'
                }
              >
                {vencida ? 'Vencida' : STATUS_LABEL[c.status]}
              </span>
              {c.status === 'aberta' || c.status === 'parcial' ? (
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => { setContaBaixa(c); setValorBaixa(String(saldo)); setFormaBaixa(''); setError('') }}
                >
                  Pagar
                </button>
              ) : <span />}
            </motion.div>
          )
        })}
      </div>

      {/* Modal: Nova Conta */}
      <AnimatePresence>
        {showModal && (
          <motion.div
            style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          >
            <motion.div ref={modalRef} className="card" style={{ width: '100%', maxWidth: '460px', padding: '28px', maxHeight: '85vh', overflowY: 'auto' }}
              initial={{ scale: 0.95, y: 16 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '24px' }}>
                <h2 style={{ fontSize: '18px', color: '#FFFFFF' }}>Nova Conta a Pagar</h2>
                <button className="btn btn-icon" onClick={() => setShowModal(false)}><X size={14} /></button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div className="field">
                  <label className="label">Descrição *</label>
                  <input className="input" placeholder="Ex: Aluguel de setembro" value={form.descricao} onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div className="field">
                    <label className="label">Fornecedor</label>
                    <select className="input" value={form.fornecedor_id} onChange={e => setForm(f => ({ ...f, fornecedor_id: e.target.value }))}>
                      <option value="">Nenhum</option>
                      {fornecedores.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
                    </select>
                  </div>
                  <div className="field">
                    <label className="label">Categoria</label>
                    <select className="input" value={form.categoria_id} onChange={e => setForm(f => ({ ...f, categoria_id: e.target.value }))}>
                      <option value="">Nenhuma</option>
                      {categoriasSelecionaveis.map(c => (
                        <option key={c.id} value={c.id}>
                          {c.categoria_pai_id ? `${nomeCategoriaPai(c.categoria_pai_id)} › ${c.nome}` : c.nome}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                  <div className="field">
                    <label className="label">Valor total *</label>
                    <input className="input" type="number" min={0} step={0.01} placeholder="0,00" value={form.valor} onChange={e => setForm(f => ({ ...f, valor: e.target.value }))} />
                  </div>
                  <div className="field">
                    <label className="label">1º Vencimento</label>
                    <input className="input" type="date" value={form.data_vencimento} onChange={e => setForm(f => ({ ...f, data_vencimento: e.target.value }))} />
                  </div>
                  <div className="field">
                    <label className="label">Parcelas</label>
                    <input className="input" type="number" min={1} max={36} value={form.total_parcelas} onChange={e => setForm(f => ({ ...f, total_parcelas: e.target.value }))} />
                  </div>
                </div>
                <div className="field">
                  <label className="label">Observação</label>
                  <input className="input" placeholder="opcional" value={form.observacao} onChange={e => setForm(f => ({ ...f, observacao: e.target.value }))} />
                </div>
                {error && <p style={{ fontSize: '12px', color: '#666' }}>{error}</p>}
                <div style={{ display: 'flex', gap: '10px', marginTop: '4px' }}>
                  <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setShowModal(false)}>Cancelar (Esc)</button>
                  <button className="btn btn-primary" style={{ flex: 1 }} onClick={handleSave} disabled={saving}>
                    {saving ? 'Salvando...' : 'Cadastrar (F10)'}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modal: Baixa */}
      <AnimatePresence>
        {contaBaixa && (
          <motion.div
            style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          >
            <motion.div ref={modalBaixaRef} className="card" style={{ width: '100%', maxWidth: '380px', padding: '28px' }}
              initial={{ scale: 0.95, y: 16 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
                <h2 style={{ fontSize: '18px', color: '#FFFFFF' }}>Pagar Conta</h2>
                <button className="btn btn-icon" onClick={() => setContaBaixa(null)}><X size={14} /></button>
              </div>
              <p style={{ fontSize: '13px', color: '#A3A3A3', marginBottom: '16px' }}>{contaBaixa.descricao}</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div className="field">
                  <label className="label">Valor a pagar</label>
                  <input className="input" type="number" min={0} step={0.01} value={valorBaixa} onChange={e => setValorBaixa(e.target.value)} />
                </div>
                <div className="field">
                  <label className="label">Forma de pagamento</label>
                  <select className="input" value={formaBaixa} onChange={e => setFormaBaixa(e.target.value)}>
                    <option value="">Selecionar...</option>
                    {formasPagamento.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
                  </select>
                </div>
                {contasFinanceiras.length > 1 && (
                  <div className="field">
                    <label className="label">Conta</label>
                    <select className="input" value={contaFinanceiraBaixa} onChange={e => setContaFinanceiraBaixa(e.target.value)}>
                      {contasFinanceiras.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                    </select>
                  </div>
                )}
                {error && <p style={{ fontSize: '12px', color: '#666' }}>{error}</p>}
                <div style={{ display: 'flex', gap: '10px', marginTop: '4px' }}>
                  <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setContaBaixa(null)}>Cancelar (Esc)</button>
                  <button className="btn btn-primary" style={{ flex: 1 }} onClick={confirmarBaixa} disabled={saving}>
                    {saving ? 'Salvando...' : 'Confirmar (F10)'}
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
