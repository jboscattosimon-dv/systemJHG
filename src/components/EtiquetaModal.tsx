import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import JsBarcode from 'jsbarcode'
import { X, Printer } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { formatCurrency, gerarCodigoProduto } from '../lib/utils'
import type { Produto } from '../types'

// Padrão da folha Pimaco A4348: 96 etiquetas de 17x31mm por folha A4,
// em 12 colunas x 8 linhas. Margens ajustáveis pra calibrar na impressora.
const LAYOUT_PADRAO = {
  colunas: 12,
  linhas: 8,
  largura: 17,
  altura: 31,
  margemTop: 24.5,
  margemLeft: 3,
  gapH: 0,
  gapV: 0,
}

interface Copia {
  chave: string
  produto: Produto
}

export default function EtiquetaModal({ produtos, onClose, onSkuGerado }: {
  produtos: Produto[]
  onClose: () => void
  onSkuGerado: (id: string, sku: string) => void
}) {
  const [codigos, setCodigos] = useState<Record<string, string>>({})
  const [quantidades, setQuantidades] = useState<Record<string, number>>(
    () => Object.fromEntries(produtos.map(p => [p.id, 1]))
  )
  const [layout, setLayout] = useState(LAYOUT_PADRAO)
  const refs = useRef<Record<string, SVGSVGElement | null>>({})

  useEffect(() => {
    setCodigos(prev => {
      const next = { ...prev }
      produtos.forEach(p => { if (p.sku) next[p.id] = p.sku })
      return next
    })
    produtos.filter(p => !p.sku).forEach(p => {
      const novoCodigo = gerarCodigoProduto(p.id)
      setCodigos(prev => ({ ...prev, [p.id]: novoCodigo }))
      supabase.from('produtos').update({ sku: novoCodigo }).eq('id', p.id).then(() => onSkuGerado(p.id, novoCodigo))
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [produtos.map(p => p.id).join(',')])

  const copias: Copia[] = produtos.flatMap(p =>
    Array.from({ length: quantidades[p.id] ?? 1 }, (_, i) => ({ chave: `${p.id}-${i}`, produto: p }))
  )
  const porPagina = Math.max(1, layout.colunas * layout.linhas)
  const paginas: Copia[][] = []
  for (let i = 0; i < copias.length; i += porPagina) paginas.push(copias.slice(i, i + porPagina))

  useEffect(() => {
    copias.forEach(c => {
      const codigo = codigos[c.produto.id]
      const svg = refs.current[c.chave]
      if (codigo && svg) {
        JsBarcode(svg, codigo, { format: 'CODE128', width: 1, height: 18, fontSize: 8, margin: 2, displayValue: true })

        // JsBarcode desenha em pixels fixos (a largura cresce com o tamanho
        // do código) — sem isso, um SKU mais longo sai mais largo que a
        // etiqueta e é cortado pela vizinha. Faz o SVG escalar pra caber.
        const w = svg.getAttribute('width')
        const h = svg.getAttribute('height')
        if (w && h) {
          svg.setAttribute('viewBox', `0 0 ${w} ${h}`)
          svg.setAttribute('width', '100%')
          svg.setAttribute('height', 'auto')
          svg.style.maxWidth = '100%'
          svg.style.maxHeight = `${layout.altura * 0.55}mm`
        }
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [codigos, quantidades, produtos, layout])

  const totalEtiquetas = copias.length
  const multiplo = produtos.length > 1

  function campoLayout(label: string, chave: keyof typeof layout, step = 1) {
    return (
      <div>
        <label style={{ fontSize: '10px', color: '#666', display: 'block', marginBottom: '3px' }}>{label}</label>
        <input
          className="input" type="number" min={0} step={step}
          style={{ fontSize: '12px', padding: '6px 8px' }}
          value={layout[chave]}
          onChange={e => setLayout(l => ({ ...l, [chave]: Number(e.target.value) }))}
        />
      </div>
    )
  }

  return (
    <motion.div
      style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <EtiquetaEstilos />
      <motion.div className="card no-print-hide" style={{ width: '100%', maxWidth: '640px', padding: '28px', maxHeight: '85vh', overflowY: 'auto' }}
        initial={{ scale: 0.95, y: 16 }} animate={{ scale: 1, y: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
          <h2 style={{ fontSize: '18px', color: '#FFFFFF' }}>
            {multiplo ? `Etiquetas — ${produtos.length} produtos` : `Etiqueta — ${produtos[0]?.nome}`}
          </h2>
          <button className="btn btn-icon" onClick={onClose}><X size={14} /></button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
          {produtos.map(p => (
            <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '8px 0', borderBottom: '1px solid #1F1F1F' }}>
              <span style={{ flex: 1, fontSize: '13px', color: '#FFFFFF', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.nome}</span>
              <label style={{ fontSize: '11px', color: '#666', display: 'flex', alignItems: 'center', gap: '6px' }}>
                Cópias
                <input
                  className="input" type="number" min={1} max={200}
                  style={{ width: '64px' }}
                  value={quantidades[p.id] ?? 1}
                  onChange={e => setQuantidades(q => ({ ...q, [p.id]: Math.max(1, Number(e.target.value)) }))}
                />
              </label>
            </div>
          ))}
        </div>

        <details style={{ marginBottom: '16px' }}>
          <summary style={{ fontSize: '12px', color: '#666', cursor: 'pointer', marginBottom: '10px' }}>
            Folha de etiquetas (padrão: Pimaco A4348 — 96 etiquetas 17×31mm)
          </summary>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', marginTop: '10px' }}>
            {campoLayout('Colunas', 'colunas')}
            {campoLayout('Linhas', 'linhas')}
            {campoLayout('Largura (mm)', 'largura', 0.5)}
            {campoLayout('Altura (mm)', 'altura', 0.5)}
            {campoLayout('Margem superior (mm)', 'margemTop', 0.5)}
            {campoLayout('Margem esquerda (mm)', 'margemLeft', 0.5)}
            {campoLayout('Espaço horizontal (mm)', 'gapH', 0.5)}
            {campoLayout('Espaço vertical (mm)', 'gapV', 0.5)}
          </div>
          <p style={{ fontSize: '11px', color: '#444', marginTop: '8px' }}>
            {porPagina} etiquetas por folha · {paginas.length} folha{paginas.length === 1 ? '' : 's'} · Se a primeira impressão sair desalinhada, ajuste as margens aqui e imprima de novo.
          </p>
        </details>

        <div id="area-impressao">
          <div className="etiquetas-preview-zoom">
            {paginas.map((pagina, pIdx) => (
              <div
                key={pIdx}
                className="folha-etiquetas"
                style={{
                  display: 'grid',
                  gridTemplateColumns: `repeat(${layout.colunas}, ${layout.largura}mm)`,
                  gridAutoRows: `${layout.altura}mm`,
                  columnGap: `${layout.gapH}mm`,
                  rowGap: `${layout.gapV}mm`,
                  paddingTop: `${layout.margemTop}mm`,
                  paddingLeft: `${layout.margemLeft}mm`,
                  background: '#fff',
                  marginBottom: pIdx < paginas.length - 1 ? '20px' : 0,
                }}
              >
                {pagina.map(c => (
                  <div
                    key={c.chave}
                    className="etiqueta-fisica"
                    style={{
                      width: `${layout.largura}mm`, height: `${layout.altura}mm`,
                      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                      overflow: 'hidden', padding: '0.5mm', boxSizing: 'border-box', textAlign: 'center',
                    }}
                  >
                    <p style={{ fontSize: '6px', fontWeight: 600, color: '#111', lineHeight: 1.1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', width: '100%' }}>
                      {c.produto.nome}
                    </p>
                    <p style={{ fontSize: '7px', fontWeight: 700, color: '#111', lineHeight: 1.2 }}>
                      {formatCurrency(c.produto.preco_venda)}
                    </p>
                    <svg ref={el => { refs.current[c.chave] = el }} style={{ display: 'block', width: '100%' }} />
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>

        <button className="btn btn-primary btn-full" onClick={() => window.print()} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginTop: '16px' }}>
          <Printer size={14} /> Imprimir {totalEtiquetas > 1 ? `(${totalEtiquetas})` : ''}
        </button>
      </motion.div>
    </motion.div>
  )
}

function EtiquetaEstilos() {
  return (
    <style>{`
      #area-impressao { margin-bottom: 8px; }
      .etiquetas-preview-zoom { zoom: 1.8; }

      @media print {
        @page { size: A4; margin: 0; }
        body * { visibility: hidden; }
        #area-impressao, #area-impressao * { visibility: visible; }
        #area-impressao {
          position: fixed; inset: 0; margin: 0; padding: 0;
        }
        .etiquetas-preview-zoom { zoom: 1; }
        .folha-etiquetas { break-after: page; }
        .folha-etiquetas:last-child { break-after: auto; }
        .etiqueta-fisica { break-inside: avoid; }
      }
    `}</style>
  )
}
