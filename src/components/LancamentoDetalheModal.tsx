import { useState } from 'react'
import { motion } from 'framer-motion'
import { X, ArrowUpRight, ArrowDownRight, Trash2 } from 'lucide-react'
import { formatCurrency, formatDate } from '../lib/utils'
import { useModalKeyboard } from '../hooks/useModalKeyboard'
import type { MovimentoCaixa } from '../types'

// Detalhe de um lançamento sem venda associada (manual, sangria,
// suprimento, entrada de mercadoria...) — a linha da lista corta a
// descrição, aqui mostra ela inteira, mais a opção de excluir.
export default function LancamentoDetalheModal({ movimento, onClose, onDelete }: {
  movimento: MovimentoCaixa
  onClose: () => void
  onDelete?: () => Promise<void> | void
}) {
  const [excluindo, setExcluindo] = useState(false)
  const [error, setError] = useState('')

  async function handleExcluir() {
    if (!onDelete) return
    if (!window.confirm('Excluir este lançamento? Essa ação não pode ser desfeita.')) return
    setExcluindo(true); setError('')
    try {
      await onDelete()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível excluir.')
      setExcluindo(false)
    }
  }

  const modalRef = useModalKeyboard(true, onClose)

  return (
    <motion.div
      style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        ref={modalRef}
        className="card"
        style={{ width: '100%', maxWidth: '440px', padding: '28px', maxHeight: '85vh', overflowY: 'auto' }}
        initial={{ scale: 0.95, y: 16 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 16 }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {movimento.tipo === 'entrada'
              ? <ArrowUpRight size={16} style={{ color: '#FFFFFF' }} />
              : <ArrowDownRight size={16} style={{ color: '#555' }} />}
            <h2 style={{ fontSize: '18px', color: '#FFFFFF' }}>{movimento.tipo === 'entrada' ? 'Entrada' : 'Saída'}</h2>
          </div>
          <button className="btn btn-icon" onClick={onClose}><X size={14} /></button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: '14px 0' }}>
          <span style={{ fontSize: '11px', padding: '3px 9px', borderRadius: '99px', border: '1px solid #2A2A2A', color: '#777', textTransform: 'capitalize' }}>
            {movimento.categoria}
          </span>
          <span style={{ fontSize: '11px', color: '#555' }}>{formatDate(movimento.data)}</span>
        </div>

        <p style={{
          fontSize: '13px', color: '#A3A3A3', lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
          background: 'rgba(255,255,255,0.03)', border: '1px solid #252525', borderRadius: '8px', padding: '14px 16px',
          marginBottom: '18px',
        }}>
          {movimento.descricao}
        </p>

        <div style={{ padding: '14px 16px', background: 'rgba(255,255,255,0.04)', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', marginBottom: '18px' }}>
          <span style={{ fontSize: '13px', color: '#A3A3A3' }}>Valor</span>
          <span style={{ fontSize: '18px', fontWeight: 700, color: movimento.tipo === 'entrada' ? '#FFFFFF' : '#A3A3A3' }}>
            {movimento.tipo === 'saida' ? '−' : '+'}{formatCurrency(movimento.valor)}
          </span>
        </div>

        {error && <p style={{ fontSize: '12px', color: '#666', marginBottom: '12px' }}>{error}</p>}

        <div style={{ display: 'flex', gap: '10px' }}>
          <button className="btn btn-secondary" style={{ flex: 1 }} onClick={onClose}>Fechar</button>
          {onDelete && (
            <button className="btn btn-secondary" style={{ flex: 1, color: '#A3A3A3', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }} onClick={handleExcluir} disabled={excluindo}>
              <Trash2 size={13} /> {excluindo ? 'Excluindo...' : 'Excluir'}
            </button>
          )}
        </div>
      </motion.div>
    </motion.div>
  )
}
