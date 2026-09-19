import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Lock, Unlock, ArrowUpRight, ArrowDownRight, X, ArrowDownToLine, ArrowUpFromLine } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { formatCurrency, formatDate } from '../lib/utils'
import { useModalKeyboard } from '../hooks/useModalKeyboard'
import type { SessaoCaixa, MovimentoCaixa } from '../types'

type ModalTipo = null | 'abrir' | 'sangria' | 'suprimento' | 'fechar'

export default function Caixa() {
  const { user } = useAuth()
  const [sessao, setSessao] = useState<SessaoCaixa | null>(null)
  const [movimentos, setMovimentos] = useState<MovimentoCaixa[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState<ModalTipo>(null)
  const [valorInput, setValorInput] = useState('')
  const [descricaoInput, setDescricaoInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [resultadoFechamento, setResultadoFechamento] = useState<SessaoCaixa | null>(null)

  const carregar = useCallback(async () => {
    if (!user) return
    setLoading(true)
    const { data: sess } = await supabase
      .from('sessoes_caixa')
      .select('*')
      .eq('usuario_id', user.id)
      .eq('status', 'aberto')
      .maybeSingle()

    setSessao((sess as SessaoCaixa) ?? null)

    if (sess) {
      const { data: movs } = await supabase
        .from('movimentos_caixa')
        .select('*')
        .eq('sessao_caixa_id', sess.id)
        .order('created_at', { ascending: false })
      setMovimentos((movs ?? []) as MovimentoCaixa[])
    } else {
      setMovimentos([])
    }
    setLoading(false)
  }, [user])

  useEffect(() => { carregar() }, [carregar])

  const entradas = movimentos.filter(m => m.tipo === 'entrada').reduce((s, m) => s + m.valor, 0)
  const saidas   = movimentos.filter(m => m.tipo === 'saida').reduce((s, m) => s + m.valor, 0)
  const saldoAtual = (sessao?.valor_inicial ?? 0) + entradas - saidas

  function abrirModal(tipo: ModalTipo) {
    setError(''); setValorInput(''); setDescricaoInput(''); setModal(tipo)
  }

  async function confirmarAbrirCaixa() {
    setSaving(true); setError('')
    const { error: err } = await supabase.rpc('abrir_caixa', { p_valor_inicial: Number(valorInput) || 0 })
    setSaving(false)
    if (err) { setError(err.message); return }
    setModal(null)
    carregar()
  }

  async function confirmarMovimento(tipo: 'sangria' | 'suprimento') {
    if (!valorInput || Number(valorInput) <= 0) { setError('Informe um valor válido.'); return }
    setSaving(true); setError('')
    const { error: err } = await supabase.rpc('registrar_movimento_caixa', {
      p_tipo: tipo === 'sangria' ? 'saida' : 'entrada',
      p_categoria: tipo,
      p_descricao: descricaoInput || (tipo === 'sangria' ? 'Sangria' : 'Suprimento'),
      p_valor: Number(valorInput),
    })
    setSaving(false)
    if (err) { setError(err.message); return }
    setModal(null)
    carregar()
  }

  async function confirmarFecharCaixa() {
    if (!sessao) return
    setSaving(true); setError('')
    const { error: err } = await supabase.rpc('fechar_caixa', {
      p_sessao_id: sessao.id,
      p_valor_informado: Number(valorInput) || 0,
      p_observacao: descricaoInput || null,
    })
    setSaving(false)
    if (err) { setError(err.message); return }

    const { data: fechada } = await supabase.from('sessoes_caixa').select('*').eq('id', sessao.id).single()
    setResultadoFechamento(fechada as SessaoCaixa)
    setModal(null)
    carregar()
  }

  function confirmarModal() {
    if (modal === 'abrir') confirmarAbrirCaixa()
    else if (modal === 'fechar') confirmarFecharCaixa()
    else if (modal) confirmarMovimento(modal)
  }

  const modalRef = useModalKeyboard(!!modal, () => setModal(null), confirmarModal)
  const resultadoRef = useModalKeyboard(!!resultadoFechamento, () => setResultadoFechamento(null))

  if (loading) {
    return <div className="page"><p style={{ color: '#444', fontSize: '13px' }}>Carregando...</p></div>
  }

  return (
    <div className="page">
      <div className="page-header-row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '28px' }}>
        <div>
          <h1 style={{ fontSize: '24px', color: '#FFFFFF' }}>Caixa</h1>
          <p style={{ fontSize: '13px', color: '#555', marginTop: '3px' }}>
            {sessao ? `Aberto desde ${formatDate(sessao.aberto_em)}` : 'Nenhum caixa aberto'}
          </p>
        </div>
        {sessao ? (
          <button className="btn btn-secondary" onClick={() => abrirModal('fechar')} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Lock size={14} /> Fechar Caixa
          </button>
        ) : (
          <button className="btn btn-primary" onClick={() => abrirModal('abrir')} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Unlock size={14} /> Abrir Caixa
          </button>
        )}
      </div>

      {!sessao ? (
        <div className="card" style={{ padding: '56px', textAlign: 'center' }}>
          <p style={{ fontSize: '14px', color: '#555' }}>O caixa está fechado.</p>
          <p style={{ fontSize: '12px', color: '#444', marginTop: '6px' }}>
            Abra o caixa para poder vender em Vendas e registrar movimentos.
          </p>
        </div>
      ) : (
        <>
          <div className="stat-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '24px' }}>
            {[
              { label: 'Valor inicial', value: formatCurrency(sessao.valor_inicial) },
              { label: 'Entradas',      value: formatCurrency(entradas) },
              { label: 'Saídas',        value: formatCurrency(saidas) },
              { label: 'Saldo atual',   value: formatCurrency(saldoAtual) },
            ].map(s => (
              <div className="card" key={s.label}>
                <span style={{ fontSize: '11px', color: '#444', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{s.label}</span>
                <p style={{ fontSize: '22px', fontWeight: 700, color: '#FFFFFF', marginTop: '10px', fontFamily: 'DM Sans, sans-serif' }}>{s.value}</p>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: '10px', marginBottom: '24px' }}>
            <button className="btn btn-secondary" onClick={() => abrirModal('sangria')} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <ArrowUpFromLine size={14} /> Sangria
            </button>
            <button className="btn btn-secondary" onClick={() => abrirModal('suprimento')} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <ArrowDownToLine size={14} /> Suprimento
            </button>
          </div>

          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '16px 24px', borderBottom: '1px solid #222' }}>
              <span style={{ fontSize: '13px', fontWeight: 600, color: '#FFFFFF' }}>Movimentos da sessão</span>
            </div>
            {movimentos.length === 0 ? (
              <div style={{ padding: '48px', textAlign: 'center', color: '#444', fontSize: '13px' }}>
                Nenhum movimento ainda.
              </div>
            ) : movimentos.map((m, i) => (
              <div
                key={m.id}
                style={{
                  display: 'grid', gridTemplateColumns: '1fr 120px 100px 110px',
                  padding: '13px 24px', alignItems: 'center',
                  borderBottom: i < movimentos.length - 1 ? '1px solid #1A1A1A' : 'none',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {m.tipo === 'entrada'
                    ? <ArrowUpRight size={13} style={{ color: '#FFFFFF' }} />
                    : <ArrowDownRight size={13} style={{ color: '#555' }} />}
                  <span style={{ fontSize: '13px', color: m.tipo === 'entrada' ? '#FFFFFF' : '#A3A3A3' }}>{m.descricao}</span>
                </div>
                <span style={{ fontSize: '12px', color: '#555', textTransform: 'capitalize' }}>{m.categoria}</span>
                <span style={{ fontSize: '12px', color: '#444' }}>{formatDate(m.data)}</span>
                <span style={{ fontSize: '14px', fontWeight: 600, color: m.tipo === 'entrada' ? '#FFFFFF' : '#555' }}>
                  {m.tipo === 'saida' ? '−' : '+'}{formatCurrency(m.valor)}
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Modais */}
      <AnimatePresence>
        {modal && (
          <motion.div
            style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          >
            <motion.div
              ref={modalRef}
              className="card"
              style={{ width: '100%', maxWidth: '400px', padding: '28px' }}
              initial={{ scale: 0.95, y: 16 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 16 }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '24px' }}>
                <h2 style={{ fontSize: '18px', color: '#FFFFFF' }}>
                  {modal === 'abrir' && 'Abrir Caixa'}
                  {modal === 'sangria' && 'Sangria (retirada)'}
                  {modal === 'suprimento' && 'Suprimento (aporte)'}
                  {modal === 'fechar' && 'Fechar Caixa'}
                </h2>
                <button className="btn btn-icon" onClick={() => setModal(null)}><X size={14} /></button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {modal === 'fechar' && (
                  <div style={{ padding: '14px 16px', background: 'rgba(255,255,255,0.04)', borderRadius: '8px', fontSize: '13px', color: '#A3A3A3' }}>
                    Saldo esperado no sistema: <strong style={{ color: '#FFFFFF' }}>{formatCurrency(saldoAtual)}</strong>
                  </div>
                )}
                <div className="field">
                  <label className="label">
                    {modal === 'abrir' ? 'Valor inicial (R$)' : modal === 'fechar' ? 'Valor contado no caixa (R$)' : 'Valor (R$)'}
                  </label>
                  <input className="input" type="number" min={0} step={0.01} placeholder="0,00" value={valorInput} onChange={e => setValorInput(e.target.value)} />
                </div>
                {(modal === 'sangria' || modal === 'suprimento' || modal === 'fechar') && (
                  <div className="field">
                    <label className="label">{modal === 'fechar' ? 'Observação' : 'Descrição'}</label>
                    <input className="input" placeholder="opcional" value={descricaoInput} onChange={e => setDescricaoInput(e.target.value)} />
                  </div>
                )}
                {error && <p style={{ fontSize: '12px', color: '#666' }}>{error}</p>}
                <div style={{ display: 'flex', gap: '10px', marginTop: '4px' }}>
                  <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setModal(null)}>Cancelar (Esc)</button>
                  <button
                    className="btn btn-primary"
                    style={{ flex: 1 }}
                    disabled={saving}
                    onClick={confirmarModal}
                  >
                    {saving ? 'Salvando...' : 'Confirmar (F10)'}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Resultado do fechamento */}
      <AnimatePresence>
        {resultadoFechamento && (
          <motion.div
            style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          >
            <motion.div ref={resultadoRef} className="card" style={{ width: '100%', maxWidth: '400px', padding: '28px' }} initial={{ scale: 0.95, y: 16 }} animate={{ scale: 1, y: 0 }}>
              <h2 style={{ fontSize: '18px', color: '#FFFFFF', marginBottom: '20px' }}>Caixa fechado</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '13px', color: '#A3A3A3' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Saldo esperado</span>
                  <strong style={{ color: '#FFFFFF' }}>{formatCurrency(resultadoFechamento.saldo_esperado ?? 0)}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Valor contado</span>
                  <strong style={{ color: '#FFFFFF' }}>{formatCurrency(resultadoFechamento.valor_informado ?? 0)}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '10px', borderTop: '1px solid #222' }}>
                  <span>Diferença</span>
                  <strong style={{ color: (resultadoFechamento.diferenca ?? 0) === 0 ? '#FFFFFF' : '#A3A3A3' }}>
                    {formatCurrency(resultadoFechamento.diferenca ?? 0)}
                  </strong>
                </div>
              </div>
              <button className="btn btn-primary btn-full" style={{ marginTop: '24px' }} onClick={() => setResultadoFechamento(null)}>
                Fechar
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
