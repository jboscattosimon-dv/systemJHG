import { useState, useMemo } from 'react'
import { motion } from 'framer-motion'
import { X, Search, ChevronLeft, ChevronRight, Check, Tag } from 'lucide-react'
import type { Produto, ProdutoCategoria } from '../types'

const CAT_LABEL: Record<ProdutoCategoria, string> = {
  bebidas: 'Bebidas', pomadas: 'Pomadas', petiscos: 'Petiscos', outros: 'Outros',
}

const POR_PAGINA = 10

export default function SelecionarProdutosEtiquetaModal({ produtos, onClose, onConfirmar }: {
  produtos: Produto[]
  onClose: () => void
  onConfirmar: (selecionados: Produto[]) => void
}) {
  const [busca, setBusca] = useState('')
  const [categoria, setCategoria] = useState('')
  const [pagina, setPagina] = useState(1)
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set())

  const categorias = useMemo(() => [...new Set(produtos.map(p => p.categoria))], [produtos])

  const filtrados = useMemo(() =>
    produtos.filter(p =>
      (!busca || p.nome.toLowerCase().includes(busca.toLowerCase()) || (p.sku ?? '').toLowerCase().includes(busca.toLowerCase())) &&
      (!categoria || p.categoria === categoria)
    ),
    [produtos, busca, categoria]
  )

  const totalPaginas = Math.max(1, Math.ceil(filtrados.length / POR_PAGINA))
  const paginaAtual = Math.min(pagina, totalPaginas)
  const itensPagina = filtrados.slice((paginaAtual - 1) * POR_PAGINA, paginaAtual * POR_PAGINA)

  function mudarPagina(delta: number) {
    setPagina(p => Math.min(totalPaginas, Math.max(1, p + delta)))
  }

  function toggle(id: string) {
    setSelecionados(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  function toggleTodosFiltrados() {
    setSelecionados(prev => prev.size === filtrados.length ? new Set() : new Set(filtrados.map(p => p.id)))
  }

  function confirmar() {
    onConfirmar(produtos.filter(p => selecionados.has(p.id)))
  }

  return (
    <motion.div
      style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        className="card"
        style={{ width: '100%', maxWidth: '520px', padding: '28px', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}
        initial={{ scale: 0.95, y: 16 }} animate={{ scale: 1, y: 0 }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px', flexShrink: 0 }}>
          <h2 style={{ fontSize: '18px', color: '#FFFFFF' }}>Selecionar produtos</h2>
          <button className="btn btn-icon" onClick={onClose}><X size={14} /></button>
        </div>

        <div style={{ display: 'flex', gap: '8px', marginBottom: '14px', flexShrink: 0 }}>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '8px', padding: '9px 14px', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: '8px' }}>
            <Search size={13} style={{ color: '#444', flexShrink: 0 }} />
            <input
              className="input-bare"
              style={{ flex: 1, minWidth: 0, background: 'transparent', border: 'none', outline: 'none', fontSize: '13px', color: '#FFFFFF', fontFamily: 'inherit' }}
              placeholder="Buscar produto..."
              value={busca}
              onChange={e => { setBusca(e.target.value); setPagina(1) }}
              autoComplete="off"
            />
          </div>
          <select
            className="input" style={{ width: '160px' }}
            value={categoria}
            onChange={e => { setCategoria(e.target.value); setPagina(1) }}
          >
            <option value="">Todas categorias</option>
            {categorias.map(c => <option key={c} value={c}>{CAT_LABEL[c]}</option>)}
          </select>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px', flexShrink: 0 }}>
          <span style={{ fontSize: '11px', color: '#555' }}>{selecionados.size} selecionado{selecionados.size === 1 ? '' : 's'} de {filtrados.length}</span>
          {filtrados.length > 0 && (
            <button className="btn btn-ghost btn-sm" onClick={toggleTodosFiltrados} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Check size={11} /> {selecionados.size === filtrados.length ? 'Desmarcar todos (filtrados)' : 'Selecionar todos (filtrados)'}
            </button>
          )}
        </div>

        <div style={{ flex: 1, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: '8px', minHeight: '200px' }}>
          {itensPagina.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', color: '#444', fontSize: '13px' }}>Nenhum produto encontrado.</div>
          ) : itensPagina.map((p, i) => (
            <label
              key={p.id}
              style={{
                display: 'flex', alignItems: 'center', gap: '10px',
                padding: '10px 14px',
                borderBottom: i < itensPagina.length - 1 ? '1px solid #1F1F1F' : 'none',
                fontSize: '13px', color: '#A3A3A3', cursor: 'pointer',
              }}
            >
              <input type="checkbox" checked={selecionados.has(p.id)} onChange={() => toggle(p.id)} />
              <span style={{ flex: 1, color: '#FFFFFF', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.nome}</span>
              <span style={{ fontSize: '12px', color: '#555', flexShrink: 0 }}>{p.estoque_atual} {p.unidade}</span>
            </label>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px', margin: '12px 0', flexShrink: 0 }}>
          <button className="btn btn-icon" onClick={() => mudarPagina(-1)} disabled={paginaAtual <= 1}><ChevronLeft size={14} /></button>
          <span style={{ fontSize: '12px', color: '#666' }}>Página {paginaAtual} de {totalPaginas}</span>
          <button className="btn btn-icon" onClick={() => mudarPagina(1)} disabled={paginaAtual >= totalPaginas}><ChevronRight size={14} /></button>
        </div>

        <div className="modal-actions" style={{ display: 'flex', gap: '10px', flexShrink: 0 }}>
          <button className="btn btn-secondary" style={{ flex: 1 }} onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" style={{ flex: 1 }} onClick={confirmar} disabled={selecionados.size === 0}>
            <Tag size={13} /> Continuar ({selecionados.size})
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}
