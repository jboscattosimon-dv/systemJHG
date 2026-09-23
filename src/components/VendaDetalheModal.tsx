import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { X, Package, Trash2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { formatCurrency, formatDate } from '../lib/utils'
import { useModalKeyboard } from '../hooks/useModalKeyboard'
import type { Comanda, ItemComanda } from '../types'

// Detalhe de uma venda (comanda) a partir do movimento de caixa que ela
// gerou — usado ao clicar num lançamento de "venda" em Caixa/Financeiro.
// Busca os itens da comanda e, pros itens tipo "produto", a foto
// cadastrada (serviço não tem foto).
export default function VendaDetalheModal({ comandaId, onClose, onDelete }: {
  comandaId: string
  onClose: () => void
  onDelete?: () => Promise<void> | void
}) {
  const [comanda, setComanda] = useState<Comanda | null>(null)
  const [itens, setItens] = useState<ItemComanda[]>([])
  const [fotos, setFotos] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [excluindo, setExcluindo] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelado = false
    setLoading(true)
    Promise.all([
      supabase.from('comandas').select('*').eq('id', comandaId).single(),
      supabase.from('itens_comanda').select('*').eq('comanda_id', comandaId),
    ]).then(async ([{ data: comandaData }, { data: itensData }]) => {
      if (cancelado) return
      const itensCarregados = (itensData ?? []) as ItemComanda[]
      const idsProdutos = [...new Set(itensCarregados.filter(i => i.tipo === 'produto').map(i => i.referencia_id))]
      let mapaFotos: Record<string, string> = {}
      if (idsProdutos.length > 0) {
        const { data: produtosData } = await supabase.from('produtos').select('id, foto_url').in('id', idsProdutos)
        mapaFotos = Object.fromEntries(
          ((produtosData ?? []) as { id: string; foto_url: string | null }[])
            .filter(p => p.foto_url)
            .map(p => [p.id, p.foto_url as string])
        )
      }
      if (cancelado) return
      setComanda(comandaData as Comanda)
      setItens(itensCarregados)
      setFotos(mapaFotos)
      setLoading(false)
    })
    return () => { cancelado = true }
  }, [comandaId])

  const modalRef = useModalKeyboard(true, onClose)
  const total = itens.reduce((s, i) => s + i.preco_unitario * i.quantidade, 0)

  async function handleExcluir() {
    if (!onDelete) return
    if (!window.confirm('Excluir o lançamento financeiro dessa venda? Isso não desfaz a venda nem devolve o estoque, só remove o lançamento.')) return
    setExcluindo(true); setError('')
    try {
      await onDelete()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível excluir.')
      setExcluindo(false)
    }
  }

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
          <div>
            <h2 style={{ fontSize: '18px', color: '#FFFFFF' }}>Detalhe da venda</h2>
            {comanda && (
              <p style={{ fontSize: '12px', color: '#555', marginTop: '2px' }}>
                {comanda.cliente_nome ?? 'Balcão'} · {formatDate(comanda.created_at ?? comanda.data)}
              </p>
            )}
          </div>
          <button className="btn btn-icon" onClick={onClose}><X size={14} /></button>
        </div>

        {loading ? (
          <p style={{ fontSize: '13px', color: '#555', padding: '32px 0', textAlign: 'center' }}>Carregando...</p>
        ) : itens.length === 0 ? (
          <p style={{ fontSize: '13px', color: '#555', padding: '32px 0', textAlign: 'center' }}>Nenhum item encontrado.</p>
        ) : (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', margin: '18px 0' }}>
              {itens.map(item => {
                const foto = item.tipo === 'produto' ? fotos[item.referencia_id] : undefined
                return (
                  <div key={item.id} style={{
                    display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px',
                    borderRadius: '8px', background: 'rgba(255,255,255,0.03)', border: '1px solid #252525',
                  }}>
                    {foto ? (
                      <img src={foto} alt="" style={{ width: '32px', height: '32px', borderRadius: '6px', objectFit: 'cover', flexShrink: 0, border: '1px solid #2A2A2A' }} />
                    ) : (
                      <div style={{ width: '32px', height: '32px', borderRadius: '6px', background: '#1F1F1F', border: '1px solid #2A2A2A', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Package size={14} style={{ color: '#555' }} />
                      </div>
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: '13px', fontWeight: 500, color: '#FFFFFF' }}>
                        {item.nome}{item.tamanho && <span style={{ color: '#777' }}> — {item.tamanho}</span>}
                      </p>
                      <p style={{ fontSize: '11px', color: '#555', marginTop: '2px' }}>{item.quantidade}x {formatCurrency(item.preco_unitario)}</p>
                    </div>
                    <span style={{ fontSize: '13px', fontWeight: 600, color: '#A3A3A3', flexShrink: 0 }}>
                      {formatCurrency(item.preco_unitario * item.quantidade)}
                    </span>
                  </div>
                )
              })}
            </div>
            <div style={{ padding: '14px 16px', background: 'rgba(255,255,255,0.04)', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', marginBottom: onDelete ? '18px' : 0 }}>
              <span style={{ fontSize: '13px', color: '#A3A3A3' }}>Total</span>
              <span style={{ fontSize: '18px', fontWeight: 700, color: '#FFFFFF' }}>{formatCurrency(comanda?.total ?? total)}</span>
            </div>

            {error && <p style={{ fontSize: '12px', color: '#666', marginBottom: '12px' }}>{error}</p>}

            {onDelete && (
              <button className="btn btn-secondary" style={{ width: '100%', color: '#A3A3A3', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }} onClick={handleExcluir} disabled={excluindo}>
                <Trash2 size={13} /> {excluindo ? 'Excluindo...' : 'Excluir lançamento'}
              </button>
            )}
          </>
        )}
      </motion.div>
    </motion.div>
  )
}
