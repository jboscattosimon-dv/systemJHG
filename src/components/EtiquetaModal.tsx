import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import JsBarcode from 'jsbarcode'
import { X, Printer } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { formatCurrency, gerarCodigoProduto } from '../lib/utils'
import type { Produto } from '../types'

// Padrão da folha Pimaco A4348: 96 etiquetas de 31x17mm (deitada) por
// folha A4, em 6 colunas x 16 linhas. Margens ajustáveis pra calibrar
// na impressora — centralizadas por padrão (6×31mm=186mm de 210mm de
// largura, 16×17mm=272mm de 297mm de altura).
const LAYOUT_PADRAO = {
  colunas: 6,
  linhas: 16,
  largura: 31,
  altura: 17,
  margemTop: 12.5,
  margemLeft: 10.5,
  gapH: 0,
  gapV: 0,
  // Compensação fina por coluna (mm): soma progressiva por índice de coluna,
  // pra corrigir desvio acumulado (ex: folha com pequena folga entre etiquetas
  // que o grid não captura, ou arredondamento de impressão). 0 = desligado.
  compensacaoColuna: 0,
}

interface Copia {
  chave: string
  produto: Produto
  tamanho?: string
}

// Chave da quantidade: uma por produto (sem tamanho) ou uma por
// combinação produto+tamanho (produto com estoque por tamanho).
function chaveQtd(produtoId: string, tamanho?: string) {
  return `${produtoId}::${tamanho ?? ''}`
}

// Etiqueta por padrão = quantidade em estoque (por tamanho, quando o
// produto tiver; senão o total do produto) — editável depois.
function quantidadesPadrao(produtos: Produto[]): Record<string, number> {
  const padrao: Record<string, number> = {}
  produtos.forEach(p => {
    if (p.tamanhos && p.tamanhos.length > 0) {
      p.tamanhos.forEach(t => { padrao[chaveQtd(p.id, t.tamanho)] = t.quantidade })
    } else {
      padrao[chaveQtd(p.id)] = Math.max(1, p.estoque_atual)
    }
  })
  return padrao
}

export default function EtiquetaModal({ produtos, onClose, onSkuGerado, permitirAjusteQuantidade = true }: {
  produtos: Produto[]
  onClose: () => void
  onSkuGerado: (id: string, sku: string) => void
  // Tela de Produtos só quer imprimir com a quantidade em estoque, sem
  // mostrar/editar números — esse ajuste fica só na impressão pelos
  // Relatórios.
  permitirAjusteQuantidade?: boolean
}) {
  const [codigos, setCodigos] = useState<Record<string, string>>({})
  const [quantidades, setQuantidades] = useState<Record<string, number>>(() => quantidadesPadrao(produtos))
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

  function setQtd(produtoId: string, tamanho: string | undefined, valor: number) {
    setQuantidades(q => ({ ...q, [chaveQtd(produtoId, tamanho)]: Math.max(0, valor) }))
  }

  const copias: Copia[] = produtos.flatMap(p => {
    if (p.tamanhos && p.tamanhos.length > 0) {
      return p.tamanhos.flatMap(t => {
        const qtd = quantidades[chaveQtd(p.id, t.tamanho)] ?? 0
        return Array.from({ length: qtd }, (_, i) => ({ chave: `${p.id}-${t.tamanho}-${i}`, produto: p, tamanho: t.tamanho }))
      })
    }
    const qtd = quantidades[chaveQtd(p.id)] ?? 0
    return Array.from({ length: qtd }, (_, i) => ({ chave: `${p.id}-${i}`, produto: p }))
  })
  const porPagina = Math.max(1, layout.colunas * layout.linhas)
  const paginas: Copia[][] = []
  for (let i = 0; i < copias.length; i += porPagina) paginas.push(copias.slice(i, i + porPagina))

  useEffect(() => {
    copias.forEach(c => {
      const codigo = codigos[c.produto.id]
      const svg = refs.current[c.chave]
      if (codigo && svg) {
        // height mais alto (era 18) + menos "peso" no texto/margem embaixo
        // do código = mais barra de verdade depois de escalar, mais fácil
        // de focar e ler com câmera de celular.
        JsBarcode(svg, codigo, { format: 'CODE128', width: 1, height: 30, fontSize: 7, margin: 1, displayValue: true })

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
          svg.style.maxHeight = `${layout.altura * 0.68}mm`
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
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
          <h2 style={{ fontSize: '18px', color: '#FFFFFF' }}>
            {multiplo ? `Etiquetas — ${produtos.length} produtos` : `Etiqueta — ${produtos[0]?.nome}`}
          </h2>
          <button className="btn btn-icon" onClick={onClose}><X size={14} /></button>
        </div>
        {permitirAjusteQuantidade ? (
          <>
            <p style={{ fontSize: '12px', color: '#555', marginBottom: '16px' }}>
              Quantidade de cópias já vem preenchida com o estoque (por tamanho, quando tiver) — ajuste se quiser imprimir menos.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '16px' }}>
              {produtos.map(p => {
                const temTamanhos = p.tamanhos && p.tamanhos.length > 0
                return (
                  <div key={p.id} style={{ padding: '8px 0', borderBottom: '1px solid #1F1F1F' }}>
                    <span style={{ fontSize: '13px', color: '#FFFFFF', display: 'block', marginBottom: temTamanhos ? '8px' : 0 }}>{p.nome}</span>
                    {!temTamanhos ? (
                      <label style={{ fontSize: '11px', color: '#666', display: 'flex', alignItems: 'center', gap: '6px', width: 'fit-content' }}>
                        Cópias
                        <input
                          className="input" type="number" min={0} max={999}
                          style={{ width: '64px' }}
                          value={quantidades[chaveQtd(p.id)] ?? 0}
                          onChange={e => setQtd(p.id, undefined, Number(e.target.value))}
                        />
                      </label>
                    ) : (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                        {p.tamanhos!.map(t => (
                          <label key={t.tamanho} style={{ fontSize: '11px', color: '#666', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            {t.tamanho}
                            <input
                              className="input" type="number" min={0} max={999}
                              style={{ width: '56px' }}
                              value={quantidades[chaveQtd(p.id, t.tamanho)] ?? 0}
                              onChange={e => setQtd(p.id, t.tamanho, Number(e.target.value))}
                            />
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </>
        ) : (
          <p style={{ fontSize: '12px', color: '#555', marginBottom: '16px' }}>
            Imprimindo {totalEtiquetas} etiqueta{totalEtiquetas === 1 ? '' : 's'}, uma por unidade em estoque.
          </p>
        )}

        <details style={{ marginBottom: '16px' }}>
          <summary style={{ fontSize: '12px', color: '#666', cursor: 'pointer', marginBottom: '10px' }}>
            Folha de etiquetas (padrão: Pimaco A4348 — 96 etiquetas 31×17mm, 6×16)
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
            {campoLayout('Compensação por coluna (mm)', 'compensacaoColuna', 0.1)}
          </div>
          <p style={{ fontSize: '11px', color: '#444', marginTop: '8px' }}>
            {porPagina} etiquetas por folha · {paginas.length} folha{paginas.length === 1 ? '' : 's'} · Se a primeira impressão sair desalinhada, ajuste as margens aqui e imprima de novo. Se só as últimas colunas ficarem desalinhadas (código de barras cortando pra esquerda), aumente aos poucos a "Compensação por coluna" — ela empurra cada coluna um pouco mais pra direita conforme se afasta da primeira.
          </p>
        </details>

        <div id="area-impressao">
          <div className="etiquetas-preview-zoom">
            {paginas.map((pagina, pIdx) => (
              <div
                key={pIdx}
                className="folha-etiquetas"
                style={{
                  position: 'relative',
                  width: '210mm',
                  height: `${layout.margemTop + layout.linhas * (layout.altura + layout.gapV)}mm`,
                  background: '#fff',
                  marginBottom: pIdx < paginas.length - 1 ? '20px' : 0,
                }}
              >
                {pagina.map((c, idx) => {
                  const col = idx % layout.colunas
                  const row = Math.floor(idx / layout.colunas)
                  const left = layout.margemLeft + col * (layout.largura + layout.gapH) + col * layout.compensacaoColuna
                  const top = layout.margemTop + row * (layout.altura + layout.gapV)
                  return (
                    <div
                      key={c.chave}
                      className="etiqueta-fisica"
                      style={{
                        position: 'absolute',
                        left: `${left}mm`, top: `${top}mm`,
                        width: `${layout.largura}mm`, height: `${layout.altura}mm`,
                        display: 'flex', flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'center',
                        overflow: 'hidden', padding: '0.3mm 0.3mm 0.3mm 0.8mm', boxSizing: 'border-box', textAlign: 'left',
                      }}
                    >
                      <p style={{ fontSize: '7px', fontWeight: 600, color: '#111', lineHeight: 1.05, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', width: '100%' }}>
                        {c.produto.nome}{c.tamanho ? ` — ${c.tamanho}` : ''}
                      </p>
                      <p style={{ fontSize: '6.5px', fontWeight: 700, color: '#111', lineHeight: 1.1 }}>
                        {formatCurrency(c.produto.preco_venda)}
                      </p>
                      <svg ref={el => { refs.current[c.chave] = el }} style={{ display: 'block', width: '100%' }} />
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        </div>

        <button className="btn btn-primary btn-full" onClick={() => window.print()} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginTop: '16px' }} disabled={totalEtiquetas === 0}>
          <Printer size={14} /> Imprimir {totalEtiquetas > 0 ? `(${totalEtiquetas})` : ''}
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
