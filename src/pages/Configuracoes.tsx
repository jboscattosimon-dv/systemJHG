import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Save } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { usePerfil } from '../hooks/usePerfil'
import type { Configuracoes as ConfigRow } from '../types'

export default function Configuracoes() {
  const { empresaId, loading: perfilLoading } = usePerfil()
  const [form, setForm] = useState<Partial<ConfigRow>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (!empresaId) { setLoading(false); return }
    supabase.from('configuracoes').select('*').eq('empresa_id', empresaId).single()
      .then(({ data }) => { if (data) setForm(data as ConfigRow); setLoading(false) })
  }, [empresaId])

  async function handleSave() {
    if (!empresaId) return
    setSaving(true); setError(''); setSaved(false)
    const { error: err } = await supabase.from('configuracoes').update({
      nome_empresa: form.nome_empresa,
      cnpj: form.cnpj || null,
      telefone: form.telefone || null,
      endereco: form.endereco || null,
      horario_abertura: form.horario_abertura,
      horario_fechamento: form.horario_fechamento,
      duracao_padrao_min: Number(form.duracao_padrao_min) || 30,
      tolerancia_atraso_min: Number(form.tolerancia_atraso_min) || 10,
      regras_cancelamento: form.regras_cancelamento || null,
      updated_at: new Date().toISOString(),
    }).eq('empresa_id', empresaId)
    setSaving(false)
    if (err) { setError(err.message); return }
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  if (loading || perfilLoading) {
    return <div className="page"><p style={{ color: '#444', fontSize: '13px' }}>Carregando...</p></div>
  }

  if (!empresaId) {
    return (
      <div className="page">
        <p style={{ color: '#444', fontSize: '13px' }}>Sua conta não está vinculada a nenhuma loja, então não há configurações pra mostrar.</p>
      </div>
    )
  }

  return (
    <div className="page" style={{ maxWidth: '640px' }}>
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '24px', color: '#FFFFFF' }}>Configurações</h1>
        <p style={{ fontSize: '13px', color: '#555', marginTop: '3px' }}>Dados da empresa e regras de operação</p>
      </div>

      <motion.div className="card" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} style={{ marginBottom: '20px' }}>
        <p style={{ fontSize: '13px', fontWeight: 600, color: '#FFFFFF', marginBottom: '16px' }}>Empresa</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div className="field">
            <label className="label">Nome</label>
            <input className="input" value={form.nome_empresa ?? ''} onChange={e => setForm(f => ({ ...f, nome_empresa: e.target.value }))} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div className="field">
              <label className="label">CNPJ</label>
              <input className="input" value={form.cnpj ?? ''} onChange={e => setForm(f => ({ ...f, cnpj: e.target.value }))} />
            </div>
            <div className="field">
              <label className="label">Telefone</label>
              <input className="input" value={form.telefone ?? ''} onChange={e => setForm(f => ({ ...f, telefone: e.target.value }))} />
            </div>
          </div>
          <div className="field">
            <label className="label">Endereço</label>
            <input className="input" value={form.endereco ?? ''} onChange={e => setForm(f => ({ ...f, endereco: e.target.value }))} />
          </div>
        </div>
      </motion.div>

      <motion.div className="card" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} style={{ marginBottom: '20px' }}>
        <p style={{ fontSize: '13px', fontWeight: 600, color: '#FFFFFF', marginBottom: '16px' }}>Operação</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div className="field">
              <label className="label">Abertura</label>
              <input className="input" type="time" value={form.horario_abertura ?? ''} onChange={e => setForm(f => ({ ...f, horario_abertura: e.target.value }))} />
            </div>
            <div className="field">
              <label className="label">Fechamento</label>
              <input className="input" type="time" value={form.horario_fechamento ?? ''} onChange={e => setForm(f => ({ ...f, horario_fechamento: e.target.value }))} />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div className="field">
              <label className="label">Duração padrão do serviço (min)</label>
              <input className="input" type="number" min={5} value={form.duracao_padrao_min ?? ''} onChange={e => setForm(f => ({ ...f, duracao_padrao_min: Number(e.target.value) }))} />
            </div>
            <div className="field">
              <label className="label">Tolerância de atraso (min)</label>
              <input className="input" type="number" min={0} value={form.tolerancia_atraso_min ?? ''} onChange={e => setForm(f => ({ ...f, tolerancia_atraso_min: Number(e.target.value) }))} />
            </div>
          </div>
          <div className="field">
            <label className="label">Regras de cancelamento</label>
            <input className="input" placeholder="Ex: cancelamento com até 2h de antecedência" value={form.regras_cancelamento ?? ''} onChange={e => setForm(f => ({ ...f, regras_cancelamento: e.target.value }))} />
          </div>
        </div>
      </motion.div>

      {error && <p style={{ fontSize: '12px', color: '#666', marginBottom: '12px' }}>{error}</p>}
      <button className="btn btn-primary" onClick={handleSave} disabled={saving} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <Save size={14} /> {saving ? 'Salvando...' : saved ? 'Salvo!' : 'Salvar'}
      </button>
    </div>
  )
}
