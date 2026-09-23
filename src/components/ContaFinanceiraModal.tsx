import { useState } from 'react'
import { motion } from 'framer-motion'
import { X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useModalKeyboard } from '../hooks/useModalKeyboard'
import type { ContaFinanceira } from '../types'

export default function ContaFinanceiraModal({ conta, onClose, onSaved }: {
  conta: ContaFinanceira | null
  onClose: () => void
  onSaved: () => void
}) {
  const [nome, setNome] = useState(conta?.nome ?? '')
  const [tipo, setTipo] = useState<'caixa' | 'banco'>(conta?.tipo ?? 'banco')
  const [saldoInicial, setSaldoInicial] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSave() {
    if (!nome.trim()) { setError('Informe o nome da conta.'); return }
    setSaving(true); setError('')

    if (conta) {
      const { error: err } = await supabase.from('contas_financeiras').update({ nome: nome.trim(), tipo }).eq('id', conta.id)
      if (err) { setError(err.message); setSaving(false); return }
    } else {
      const { data, error: err } = await supabase.from('contas_financeiras').insert({ nome: nome.trim(), tipo }).select('id').single()
      if (err) { setError(err.message); setSaving(false); return }
      const novaId = (data as { id: string }).id
      if (saldoInicial.trim() && Number(saldoInicial) > 0) {
        const { error: capErr } = await supabase.rpc('registrar_capital_inicial', {
          p_conta_financeira_id: novaId, p_valor: Number(saldoInicial),
        })
        if (capErr) { setError(`Conta criada, mas o saldo inicial falhou: ${capErr.message}`); setSaving(false); onSaved(); return }
      }
    }
    setSaving(false)
    onSaved()
    onClose()
  }

  const modalRef = useModalKeyboard(true, onClose, handleSave)

  return (
    <motion.div
      style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        ref={modalRef}
        className="card"
        style={{ width: '100%', maxWidth: '380px', padding: '28px' }}
        initial={{ scale: 0.95, y: 16 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 16 }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
          <h2 style={{ fontSize: '18px', color: '#FFFFFF' }}>{conta ? 'Editar Conta' : 'Nova Conta Financeira'}</h2>
          <button className="btn btn-icon" onClick={onClose}><X size={14} /></button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div className="field">
            <label className="label">Nome</label>
            <input className="input" placeholder="Ex: Banco Itaú" value={nome} onChange={e => setNome(e.target.value)} autoFocus />
          </div>
          <div className="field">
            <label className="label">Tipo</label>
            <select className="input" value={tipo} onChange={e => setTipo(e.target.value as 'caixa' | 'banco')}>
              <option value="banco">Banco</option>
              <option value="caixa">Caixa</option>
            </select>
          </div>
          {!conta && (
            <div className="field">
              <label className="label">Saldo inicial (opcional)</label>
              <input className="input" type="number" min={0} step={0.01} placeholder="0,00" value={saldoInicial} onChange={e => setSaldoInicial(e.target.value)} />
            </div>
          )}
          {error && <p style={{ fontSize: '12px', color: '#666' }}>{error}</p>}
          <div style={{ display: 'flex', gap: '10px', marginTop: '4px' }}>
            <button className="btn btn-secondary" style={{ flex: 1 }} onClick={onClose}>Cancelar (Esc)</button>
            <button className="btn btn-primary" style={{ flex: 1 }} onClick={handleSave} disabled={saving}>
              {saving ? 'Salvando...' : 'Salvar (F10)'}
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  )
}
