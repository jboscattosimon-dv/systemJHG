import { useState, useEffect, useRef, type ChangeEvent } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, X, Package, Check, Tag, Pencil, Download, Upload, Trash2, FileSpreadsheet } from 'lucide-react'
import * as XLSX from 'xlsx'
import { supabase } from '../lib/supabase'
import { formatCurrency } from '../lib/utils'
import EtiquetaModal from '../components/EtiquetaModal'
import { useModalKeyboard } from '../hooks/useModalKeyboard'
import { useHeaderBusca } from '../hooks/useHeaderBusca'
import type { Produto, ProdutoCategoria } from '../types'

const CAT_LABEL: Record<ProdutoCategoria, string> = {
  bebidas: 'Bebidas', pomadas: 'Pomadas', petiscos: 'Petiscos', outros: 'Outros',
}

const COLUNAS_IMPORTACAO = [
  'Nome', 'Tamanho', 'Estoque', 'Preço de Custo', 'Preço de Venda à Vista', 'Preço de Venda a Prazo',
] as const

interface TamanhoQtd { tamanho: string; quantidade: number }

// Aceita tamanho de letra (P/M/G) ou número (35, 36, 37...), em três formatos:
// "P:2, M:3, G:1"   -> tamanho:quantidade explícito
// "35=8, 36=7"      -> tamanho=quantidade (mesma coisa, com =)
// "M, M, G, M"      -> repete o tamanho uma vez por unidade (como na
//                       planilha antiga) — cada repetição soma 1
function parseTamanhos(valor: unknown): TamanhoQtd[] {
  const texto = String(valor ?? '').trim()
  if (!texto) return []
  const acumulado = new Map<string, number>()
  texto.split(',')
    .map(token => token.trim())
    .filter(Boolean)
    .forEach(token => {
      const [tam, qtd] = token.split(/[:=]/).map(s => s.trim())
      if (!tam) return
      const quantidade = qtd !== undefined && qtd !== '' ? numero(qtd, 1) : 1
      acumulado.set(tam, (acumulado.get(tam) ?? 0) + quantidade)
    })
  return Array.from(acumulado, ([tamanho, quantidade]) => ({ tamanho, quantidade }))
}

function formatarTamanhos(tamanhos: TamanhoQtd[]): string {
  return tamanhos.map(t => `${t.tamanho}:${t.quantidade}`).join(', ')
}

function baixarModeloProdutos() {
  const exemplo = ['Conjunto Eva', 'P:2, M:3', '', 80, 200, 220]
  const ws = XLSX.utils.aoa_to_sheet([COLUNAS_IMPORTACAO as unknown as string[], exemplo])
  ws['!cols'] = COLUNAS_IMPORTACAO.map(() => ({ wch: 24 }))
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Produtos')
  XLSX.writeFile(wb, 'modelo-importacao-produtos.xlsx')
}

function exportarProdutos(produtos: Produto[]) {
  const linhas = produtos.map(p => [
    p.nome,
    formatarTamanhos((p.tamanhos ?? []).map(t => ({ tamanho: t.tamanho, quantidade: t.quantidade }))),
    p.estoque_atual,
    p.preco_custo,
    p.preco_venda,
    p.preco_venda_prazo ?? '',
  ])
  const ws = XLSX.utils.aoa_to_sheet([COLUNAS_IMPORTACAO as unknown as string[], ...linhas])
  ws['!cols'] = COLUNAS_IMPORTACAO.map(() => ({ wch: 24 }))
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Produtos')
  XLSX.writeFile(wb, `produtos-${new Date().toISOString().split('T')[0]}.xlsx`)
}

interface LinhaImportada {
  nome: string
  tamanhos: TamanhoQtd[]
  estoque_total: number
  preco_custo: number
  preco_venda: number
  preco_venda_prazo: number | null
}

function numero(valor: unknown, padrao = 0): number {
  const n = Number(String(valor ?? '').replace(',', '.'))
  return Number.isFinite(n) ? n : padrao
}

// Tira acento, deixa minúsculo e sem espaço nas pontas, pra "Preço de Venda à
// Vista" e "preco de venda a vista" caírem na mesma chave.
function normalizarCabecalho(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

// Cada coluna aceita alguns apelidos, pra planilhas antigas ou digitadas de
// cabeça (sem seguir o modelo à risca) continuarem funcionando.
const ALIASES_COLUNA: Record<'nome' | 'tamanho' | 'estoque' | 'custo' | 'vendaVista' | 'vendaPrazo', string[]> = {
  nome:       ['nome', 'nome do produto', 'produto'],
  tamanho:    ['tamanho', 'tamanhos'],
  estoque:    ['estoque', 'estoque total', 'estoque atual', 'quantidade'],
  custo:      ['preco de custo', 'custo'],
  vendaVista: ['preco de venda a vista', 'preco de venda', 'venda a vista', 'preco venda'],
  vendaPrazo: ['preco de venda a prazo', 'venda a prazo', 'a prazo', 'preco a prazo'],
}

function valorDaColuna(linhaNormalizada: Record<string, unknown>, coluna: keyof typeof ALIASES_COLUNA): unknown {
  for (const alias of ALIASES_COLUNA[coluna]) {
    if (alias in linhaNormalizada) return linhaNormalizada[alias]
  }
  return ''
}

async function lerPlanilhaProdutos(arquivo: File): Promise<{ validas: LinhaImportada[]; erros: string[] }> {
  const buf = await arquivo.arrayBuffer()
  const wb = XLSX.read(buf, { type: 'array' })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const linhas: Record<string, unknown>[] = XLSX.utils.sheet_to_json(ws, { defval: '' })

  const validas: LinhaImportada[] = []
  const erros: string[] = []

  linhas.forEach((linhaBruta, i) => {
    const linha: Record<string, unknown> = {}
    Object.entries(linhaBruta).forEach(([chave, valor]) => { linha[normalizarCabecalho(chave)] = valor })

    const nome = String(valorDaColuna(linha, 'nome') ?? '').trim()
    const precoVenda = numero(valorDaColuna(linha, 'vendaVista'), NaN)
    if (!nome) { erros.push(`Linha ${i + 2}: sem nome do produto, ignorada.`); return }
    if (!Number.isFinite(precoVenda) || precoVenda <= 0) { erros.push(`Linha ${i + 2} (${nome}): preço de venda à vista inválido, ignorada.`); return }

    const tamanhos = parseTamanhos(valorDaColuna(linha, 'tamanho'))
    const estoqueTotal = tamanhos.length > 0
      ? tamanhos.reduce((s, t) => s + t.quantidade, 0)
      : numero(valorDaColuna(linha, 'estoque'), 0)
    const precoPrazoBruto = valorDaColuna(linha, 'vendaPrazo')
    const precoVendaPrazo = precoPrazoBruto !== '' && precoPrazoBruto != null ? numero(precoPrazoBruto, NaN) : null

    validas.push({
      nome,
      tamanhos,
      estoque_total: estoqueTotal,
      preco_custo: numero(valorDaColuna(linha, 'custo'), 0),
      preco_venda: precoVenda,
      preco_venda_prazo: precoVendaPrazo != null && Number.isFinite(precoVendaPrazo) ? precoVendaPrazo : null,
    })
  })

  return { validas, erros }
}

export default function Produtos() {
  const [produtos, setProdutos] = useState<Produto[]>([])
  const { headerBusca: busca } = useHeaderBusca()
  const [showProdModal, setShowProdModal] = useState(false)
  const [editProdId, setEditProdId] = useState<string | null>(null)
  const [prodForm, setProdForm] = useState({
    nome: '', categoria: 'bebidas' as ProdutoCategoria, sku: '', unidade: 'un',
    preco_custo: '', preco_venda: '', preco_venda_prazo: '', estoque_atual: '', estoque_minimo: '', estoque_maximo: '',
    comissao_percentual: '',
  })
  const [prodTamanhos, setProdTamanhos] = useState<{ tamanho: string; quantidade: string }[]>([])

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [produtosEtiqueta, setProdutosEtiqueta] = useState<Produto[] | null>(null)
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set())
  const [importando, setImportando] = useState(false)
  const [resultadoImportacao, setResultadoImportacao] = useState<{ ok: number; erros: string[] } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const temTamanhosForm = prodTamanhos.some(t => t.tamanho.trim())
  const totalTamanhosForm = prodTamanhos.filter(t => t.tamanho.trim()).reduce((s, t) => s + (Number(t.quantidade) || 0), 0)

  const produtosFiltrados = produtos.filter(p =>
    p.nome.toLowerCase().includes(busca.toLowerCase()) ||
    (p.sku ?? '').toLowerCase().includes(busca.toLowerCase())
  )

  async function handleImportarArquivo(e: ChangeEvent<HTMLInputElement>) {
    const arquivo = e.target.files?.[0]
    e.target.value = ''
    if (!arquivo) return
    setImportando(true); setResultadoImportacao(null); setError('')
    try {
      const { validas, erros } = await lerPlanilhaProdutos(arquivo)
      if (validas.length > 0) {
        const { error: err } = await supabase.rpc('importar_produtos', {
          p_produtos: validas.map(v => ({
            nome: v.nome,
            tamanhos: v.tamanhos,
            estoque_total: v.estoque_total,
            preco_custo: v.preco_custo,
            preco_venda: v.preco_venda,
            preco_venda_prazo: v.preco_venda_prazo,
          })),
        })
        if (err) { setError(err.message); setImportando(false); return }
        await carregarProdutos()
      }
      setResultadoImportacao({ ok: validas.length, erros })
    } catch {
      setError('Não foi possível ler o arquivo. Confira se é um .xlsx ou .csv válido.')
    }
    setImportando(false)
  }

  function toggleSelecionado(id: string) {
    setSelecionados(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  function toggleSelecionarTodos() {
    setSelecionados(prev => prev.size === produtosFiltrados.length ? new Set() : new Set(produtosFiltrados.map(p => p.id)))
  }

  function imprimirSelecionados() {
    setProdutosEtiqueta(produtos.filter(p => selecionados.has(p.id)))
  }

  function carregarProdutos() {
    return supabase.from('produtos').select('*, tamanhos:produto_tamanhos(*)').order('nome')
      .then(({ data }) => { setProdutos((data ?? []) as Produto[]); setLoading(false) })
  }

  useEffect(() => {
    carregarProdutos()
  }, [])

  function addTamanhoRow() {
    setProdTamanhos(prev => [...prev, { tamanho: '', quantidade: '0' }])
  }

  function updateTamanhoRow(idx: number, campo: 'tamanho' | 'quantidade', valor: string) {
    setProdTamanhos(prev => prev.map((t, i) => i === idx ? { ...t, [campo]: valor } : t))
  }

  function removeTamanhoRow(idx: number) {
    setProdTamanhos(prev => prev.filter((_, i) => i !== idx))
  }

  async function salvarTamanhosProduto(produtoId: string) {
    await supabase.from('produto_tamanhos').delete().eq('produto_id', produtoId)
    const linhas = prodTamanhos.filter(t => t.tamanho.trim())
    if (linhas.length > 0) {
      await supabase.from('produto_tamanhos').insert(
        linhas.map(t => ({ produto_id: produtoId, tamanho: t.tamanho.trim(), quantidade: Number(t.quantidade) || 0 }))
      )
    }
  }

  async function handleSaveProd() {
    if (!prodForm.nome.trim() || !prodForm.preco_venda) {
      setError('Nome e preço de venda são obrigatórios.'); return
    }
    setSaving(true); setError('')
    const temTamanhos = prodTamanhos.some(t => t.tamanho.trim())
    const payload: Record<string, unknown> = {
      nome: prodForm.nome, categoria: prodForm.categoria,
      sku: prodForm.sku || null,
      unidade: prodForm.unidade || 'un',
      preco_custo: Number(prodForm.preco_custo) || 0,
      preco_venda: Number(prodForm.preco_venda),
      preco_venda_prazo: prodForm.preco_venda_prazo ? Number(prodForm.preco_venda_prazo) : null,
      estoque_minimo: prodForm.estoque_minimo ? Number(prodForm.estoque_minimo) : null,
      estoque_maximo: prodForm.estoque_maximo ? Number(prodForm.estoque_maximo) : null,
      comissao_percentual: prodForm.comissao_percentual ? Number(prodForm.comissao_percentual) : null,
    }
    // Com tamanhos cadastrados, o total vem do trigger (soma dos tamanhos)
    // depois que a gente sincronizar produto_tamanhos logo abaixo.
    if (!temTamanhos) payload.estoque_atual = Number(prodForm.estoque_atual) || 0

    let produtoId = editProdId
    if (editProdId) {
      const { error: err } = await supabase.from('produtos').update(payload).eq('id', editProdId)
      if (err) { setError(err.message); setSaving(false); return }
    } else {
      const { data, error: err } = await supabase.from('produtos').insert({ ...payload, ativo: true }).select('id').single()
      if (err) { setError(err.message); setSaving(false); return }
      produtoId = (data as { id: string }).id
    }
    if (produtoId) await salvarTamanhosProduto(produtoId)
    await carregarProdutos()
    fecharModalProd(); setSaving(false)
  }

  function abrirNovoProd() {
    setEditProdId(null)
    setProdForm({ nome: '', categoria: 'bebidas', sku: '', unidade: 'un', preco_custo: '', preco_venda: '', preco_venda_prazo: '', estoque_atual: '', estoque_minimo: '', estoque_maximo: '', comissao_percentual: '' })
    setProdTamanhos([])
    setError('')
    setShowProdModal(true)
  }

  function abrirEdicaoProd(p: Produto) {
    setEditProdId(p.id)
    setProdForm({
      nome: p.nome, categoria: p.categoria, sku: p.sku ?? '', unidade: p.unidade,
      preco_custo: String(p.preco_custo), preco_venda: String(p.preco_venda),
      preco_venda_prazo: p.preco_venda_prazo != null ? String(p.preco_venda_prazo) : '',
      estoque_atual: String(p.estoque_atual), estoque_minimo: p.estoque_minimo != null ? String(p.estoque_minimo) : '',
      estoque_maximo: p.estoque_maximo != null ? String(p.estoque_maximo) : '',
      comissao_percentual: p.comissao_percentual != null ? String(p.comissao_percentual) : '',
    })
    setProdTamanhos((p.tamanhos ?? []).map(t => ({ tamanho: t.tamanho, quantidade: String(t.quantidade) })))
    setError('')
    setShowProdModal(true)
  }

  function fecharModalProd() {
    setShowProdModal(false)
    setEditProdId(null)
    setProdTamanhos([])
  }

  async function toggleAtivoProd(id: string, ativo: boolean) {
    setProdutos(prev => prev.map(p => p.id === id ? { ...p, ativo: !ativo } : p))
    await supabase.from('produtos').update({ ativo: !ativo }).eq('id', id)
  }

  const modalProdRef = useModalKeyboard(showProdModal, fecharModalProd, handleSaveProd)

  return (
    <div className="page">
      {/* Header */}
      <div className="page-header-row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '28px' }}>
        <div>
          <h1 style={{ fontSize: '24px', color: '#FFFFFF' }}>Produtos</h1>
          <p style={{ fontSize: '13px', color: '#555', marginTop: '3px' }}>Estoque e catálogo da loja</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {produtosFiltrados.length > 0 && (
            <button className="btn btn-secondary btn-sm" onClick={toggleSelecionarTodos} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Check size={12} /> {selecionados.size === produtosFiltrados.length ? 'Desmarcar todos' : 'Selecionar todos'}
            </button>
          )}
          {selecionados.size > 0 && (
            <button className="btn btn-secondary btn-sm" onClick={imprimirSelecionados} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Tag size={12} /> Imprimir etiquetas ({selecionados.size})
            </button>
          )}
          <button className="btn btn-icon" title="Baixar modelo de planilha" onClick={baixarModeloProdutos}>
            <Download size={13} />
          </button>
          {produtos.length > 0 && (
            <button className="btn btn-icon" title="Exportar catálogo atual" onClick={() => exportarProdutos(produtos)}>
              <FileSpreadsheet size={13} />
            </button>
          )}
          <button className="btn btn-icon" title={importando ? 'Importando...' : 'Importar produtos por planilha'} onClick={() => fileInputRef.current?.click()} disabled={importando}>
            <Upload size={13} />
          </button>
          <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleImportarArquivo} style={{ display: 'none' }} />
          <div style={{ width: '1px', height: '20px', background: '#252525', margin: '0 4px' }} />
          <button className="btn btn-primary" onClick={abrirNovoProd} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Plus size={14} strokeWidth={2.5} /> Novo Produto
          </button>
        </div>
      </div>

      {error && <p style={{ fontSize: '12px', color: '#666', marginBottom: '16px' }}>{error}</p>}
      {resultadoImportacao && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          style={{
            display: 'flex', alignItems: 'flex-start', gap: '10px',
            padding: '12px 16px',
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid #333',
            borderRadius: '8px',
            marginBottom: '20px',
          }}
        >
          <Upload size={14} style={{ color: '#A3A3A3', flexShrink: 0, marginTop: '2px' }} />
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: '13px', color: '#A3A3A3' }}>
              <strong style={{ color: '#FFFFFF' }}>{resultadoImportacao.ok} produto{resultadoImportacao.ok === 1 ? '' : 's'}</strong> importado{resultadoImportacao.ok === 1 ? '' : 's'} com sucesso.
              {resultadoImportacao.erros.length > 0 && ` ${resultadoImportacao.erros.length} linha(s) ignorada(s):`}
            </p>
            {resultadoImportacao.erros.length > 0 && (
              <ul style={{ marginTop: '6px', paddingLeft: '18px' }}>
                {resultadoImportacao.erros.map((e, i) => (
                  <li key={i} style={{ fontSize: '11px', color: '#666' }}>{e}</li>
                ))}
              </ul>
            )}
          </div>
          <button className="btn btn-icon" onClick={() => setResultadoImportacao(null)}><X size={12} /></button>
        </motion.div>
      )}
      <div className="card desktop-row" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="list-header" style={{
          display: 'grid',
          gridTemplateColumns: '28px 1fr 100px 120px 120px 90px 80px 76px',
          padding: '10px 24px',
          borderBottom: '1px solid #222',
          fontSize: '10px', fontWeight: 600, color: '#444',
          textTransform: 'uppercase', letterSpacing: '0.1em',
          background: 'rgba(0,0,0,0.2)',
          alignItems: 'center',
        }}>
          <input type="checkbox" checked={produtosFiltrados.length > 0 && selecionados.size === produtosFiltrados.length} onChange={toggleSelecionarTodos} />
          <span>Produto</span><span>Categoria</span><span>Custo</span>
          <span>Venda</span><span>Estoque</span><span>Status</span><span></span>
        </div>

        {loading ? (
          <div style={{ padding: '56px', textAlign: 'center', color: '#444', fontSize: '13px' }}>
            Carregando...
          </div>
        ) : produtosFiltrados.length === 0 ? (
          <div style={{ padding: '56px', textAlign: 'center', color: '#444', fontSize: '13px' }}>
            {busca ? 'Nenhum produto encontrado.' : 'Nenhum produto cadastrado.'}
          </div>
        ) : produtosFiltrados.map((p, i) => {
          const margem = p.preco_custo > 0 ? ((p.preco_venda - p.preco_custo) / p.preco_custo * 100).toFixed(0) : null
          return (
            <motion.div
              key={p.id}
              className="list-row"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.03 }}
              style={{
                display: 'grid',
                gridTemplateColumns: '28px 1fr 100px 120px 120px 90px 80px 76px',
                padding: '14px 24px',
                borderBottom: i < produtosFiltrados.length - 1 ? '1px solid #1F1F1F' : 'none',
                alignItems: 'center',
              }}
              whileHover={{ backgroundColor: 'rgba(255,255,255,0.02)' }}
            >
              <input type="checkbox" checked={selecionados.has(p.id)} onChange={() => toggleSelecionado(p.id)} />
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                <Package size={13} style={{ color: '#444', flexShrink: 0, marginTop: '2px' }} />
                <div style={{ minWidth: 0 }}>
                  <div>
                    <span style={{ fontSize: '13px', fontWeight: 500, color: '#FFFFFF' }}>{p.nome}</span>
                    {p.sku && <span style={{ fontSize: '10px', color: '#444', marginLeft: '8px' }}>#{p.sku}</span>}
                    {margem && <span style={{ fontSize: '10px', color: '#555', marginLeft: '8px' }}>+{margem}% margem</span>}
                    {p.comissao_percentual != null && <span style={{ fontSize: '10px', color: '#555', marginLeft: '8px' }}>comissão {p.comissao_percentual}%</span>}
                  </div>
                  {p.tamanhos && p.tamanhos.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '5px' }}>
                      {p.tamanhos.map(t => (
                        <span key={t.tamanho} style={{
                          fontSize: '10px', padding: '1px 6px', borderRadius: '99px',
                          border: '1px solid #2A2A2A', color: t.quantidade > 0 ? '#777' : '#444',
                        }}>
                          {t.tamanho}:{t.quantidade}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <span style={{ fontSize: '12px', color: '#666', textTransform: 'capitalize' }}>{CAT_LABEL[p.categoria]}</span>
              <span style={{ fontSize: '13px', color: '#555' }}>{formatCurrency(p.preco_custo)}</span>
              <span style={{ fontSize: '13px', color: '#A3A3A3', fontWeight: 500 }}>{formatCurrency(p.preco_venda)}</span>
              <span style={{ fontSize: '14px', fontWeight: 700, color: '#A3A3A3' }}>
                {p.estoque_atual} {p.unidade}
              </span>
              <button
                onClick={() => toggleAtivoProd(p.id, p.ativo)}
                style={{
                  fontSize: '10px', padding: '3px 9px', borderRadius: '99px',
                  border: p.ativo ? '1px solid rgba(255,255,255,0.2)' : '1px dashed #333',
                  background: 'transparent',
                  color: p.ativo ? '#A3A3A3' : '#444',
                  cursor: 'pointer', width: 'fit-content',
                }}
              >
                {p.ativo ? 'Ativo' : 'Inativo'}
              </button>
              <div style={{ display: 'flex', gap: '4px' }}>
                <button className="btn btn-icon" title="Editar" onClick={() => abrirEdicaoProd(p)}>
                  <Pencil size={12} />
                </button>
                <button className="btn btn-icon" title="Gerar/imprimir etiqueta" onClick={() => setProdutosEtiqueta([p])}>
                  <Tag size={12} />
                </button>
              </div>
            </motion.div>
          )
        })}
      </div>

      {/* Cards (mobile) */}
      {!loading && produtosFiltrados.length > 0 && (
        <div className="entity-grid mobile-only-grid" style={{ gap: '16px' }}>
          {produtosFiltrados.map((p, i) => {
            const margem = p.preco_custo > 0 ? ((p.preco_venda - p.preco_custo) / p.preco_custo * 100).toFixed(0) : null
            const detalhes = [p.sku && `#${p.sku}`, margem && `+${margem}% margem`, p.comissao_percentual != null && `comissão ${p.comissao_percentual}%`].filter(Boolean).join(' · ')
            return (
              <motion.div
                key={p.id}
                className="card entity-card"
                initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}
              >
                <div className="entity-header" style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                  <input type="checkbox" checked={selecionados.has(p.id)} onChange={() => toggleSelecionado(p.id)} style={{ marginTop: '4px', flexShrink: 0 }} />
                  <div className="entity-avatar" style={{
                    width: '40px', height: '40px', borderRadius: '10px',
                    background: '#262626', border: '1px solid #333',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  }}>
                    <Package size={16} style={{ color: '#A3A3A3' }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <h3 className="entity-title" style={{
                        fontSize: '14px', fontWeight: 600, color: '#FFFFFF', fontFamily: 'DM Sans, sans-serif',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0,
                      }}>{p.nome}</h3>
                    </div>
                    {detalhes && <p className="entity-subtle" style={{ fontSize: '11px', color: '#555', marginTop: '2px' }}>{detalhes}</p>}
                  </div>
                  <button
                    onClick={() => toggleAtivoProd(p.id, p.ativo)}
                    style={{
                      fontSize: '10px', padding: '3px 9px', borderRadius: '99px', flexShrink: 0,
                      border: p.ativo ? '1px solid rgba(255,255,255,0.2)' : '1px dashed #333',
                      background: 'transparent', color: p.ativo ? '#A3A3A3' : '#444', cursor: 'pointer',
                    }}
                  >
                    {p.ativo ? 'Ativo' : 'Inativo'}
                  </button>
                </div>

                <div className="entity-divider" style={{ height: '1px', background: '#222', margin: '14px 0' }} />

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px' }}>
                  <div>
                    <p style={{ fontSize: '10px', color: '#444', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '2px' }}>Categoria</p>
                    <p style={{ fontSize: '13px', color: '#A3A3A3', textTransform: 'capitalize' }}>{CAT_LABEL[p.categoria]}</p>
                  </div>
                  <div>
                    <p style={{ fontSize: '10px', color: '#444', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '2px' }}>Estoque</p>
                    <p style={{ fontSize: '13px', color: '#A3A3A3' }}>
                      {p.estoque_atual} {p.unidade}
                    </p>
                  </div>
                  <div>
                    <p style={{ fontSize: '10px', color: '#444', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '2px' }}>Custo</p>
                    <p style={{ fontSize: '13px', color: '#555' }}>{formatCurrency(p.preco_custo)}</p>
                  </div>
                  <div>
                    <p style={{ fontSize: '10px', color: '#444', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '2px' }}>Venda</p>
                    <p style={{ fontSize: '13px', color: '#A3A3A3', fontWeight: 500 }}>{formatCurrency(p.preco_venda)}</p>
                  </div>
                </div>

                <div className="entity-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px' }}>
                  <button className="btn btn-icon" title="Editar" onClick={() => abrirEdicaoProd(p)}>
                    <Pencil size={12} />
                  </button>
                  <button className="btn btn-icon" title="Gerar/imprimir etiqueta" onClick={() => setProdutosEtiqueta([p])}>
                    <Tag size={12} />
                  </button>
                </div>
              </motion.div>
            )
          })}
        </div>
      )}
      {!loading && produtosFiltrados.length === 0 && (
        <div className="card mobile-only-grid" style={{ padding: '56px', textAlign: 'center', color: '#444', fontSize: '13px' }}>
          {busca ? 'Nenhum produto encontrado.' : 'Nenhum produto cadastrado.'}
        </div>
      )}

      {/* Modal: Novo Produto */}
      <AnimatePresence>
        {showProdModal && (
          <motion.div
            style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          >
            <motion.div
              ref={modalProdRef}
              className="card"
              style={{ width: '100%', maxWidth: '460px', padding: '28px', maxHeight: '85vh', overflowY: 'auto' }}
              initial={{ scale: 0.95, y: 16 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 16 }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '24px' }}>
                <h2 style={{ fontSize: '18px', color: '#FFFFFF' }}>{editProdId ? 'Editar Produto' : 'Novo Produto'}</h2>
                <button className="btn btn-icon" onClick={fecharModalProd}><X size={14} /></button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div className="field">
                  <label className="label">Nome *</label>
                  <input className="input" placeholder="Nome do produto" value={prodForm.nome} onChange={e => setProdForm(f => ({ ...f, nome: e.target.value }))} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div className="field">
                    <label className="label">Categoria</label>
                    <select className="input" value={prodForm.categoria} onChange={e => setProdForm(f => ({ ...f, categoria: e.target.value as ProdutoCategoria }))}>
                      <option value="bebidas">Bebidas</option>
                      <option value="pomadas">Pomadas</option>
                      <option value="petiscos">Petiscos</option>
                      <option value="outros">Outros</option>
                    </select>
                  </div>
                  <div className="field">
                    <label className="label">SKU / Código</label>
                    <input className="input" placeholder="opcional" value={prodForm.sku} onChange={e => setProdForm(f => ({ ...f, sku: e.target.value }))} />
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                  <div className="field">
                    <label className="label">Preço de Custo</label>
                    <input className="input" type="number" min={0} step={0.01} placeholder="0,00" value={prodForm.preco_custo} onChange={e => setProdForm(f => ({ ...f, preco_custo: e.target.value }))} />
                  </div>
                  <div className="field">
                    <label className="label">Venda à Vista *</label>
                    <input className="input" type="number" min={0} step={0.01} placeholder="0,00" value={prodForm.preco_venda} onChange={e => setProdForm(f => ({ ...f, preco_venda: e.target.value }))} />
                  </div>
                  <div className="field">
                    <label className="label">Venda a Prazo</label>
                    <input className="input" type="number" min={0} step={0.01} placeholder="opcional" value={prodForm.preco_venda_prazo} onChange={e => setProdForm(f => ({ ...f, preco_venda_prazo: e.target.value }))} />
                  </div>
                </div>

                <div className="field">
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <label className="label" style={{ marginBottom: 0 }}>Estoque por tamanho</label>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={addTamanhoRow} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Plus size={11} /> Tamanho
                    </button>
                  </div>
                  {prodTamanhos.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '8px' }}>
                      {prodTamanhos.map((t, idx) => (
                        <div key={idx} style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                          <input
                            className="input" style={{ flex: 1 }} placeholder="Tamanho (P, M, 38...)"
                            value={t.tamanho} onChange={e => updateTamanhoRow(idx, 'tamanho', e.target.value)}
                          />
                          <input
                            className="input" style={{ width: '90px' }} type="number" min={0} placeholder="Qtd"
                            value={t.quantidade} onChange={e => updateTamanhoRow(idx, 'quantidade', e.target.value)}
                          />
                          <button className="btn btn-icon" onClick={() => removeTamanhoRow(idx)}><Trash2 size={12} /></button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: temTamanhosForm ? '1fr 1fr' : '1fr 1fr 1fr', gap: '12px' }}>
                  {!temTamanhosForm && (
                    <div className="field">
                      <label className="label">Estoque Atual</label>
                      <input className="input" type="number" min={0} placeholder="0" value={prodForm.estoque_atual} onChange={e => setProdForm(f => ({ ...f, estoque_atual: e.target.value }))} />
                    </div>
                  )}
                  <div className="field">
                    <label className="label">Estoque Mínimo</label>
                    <input className="input" type="number" min={0} placeholder="opcional" value={prodForm.estoque_minimo} onChange={e => setProdForm(f => ({ ...f, estoque_minimo: e.target.value }))} />
                  </div>
                  <div className="field">
                    <label className="label">Estoque Máximo</label>
                    <input className="input" type="number" min={0} placeholder="opcional" value={prodForm.estoque_maximo} onChange={e => setProdForm(f => ({ ...f, estoque_maximo: e.target.value }))} />
                  </div>
                </div>
                {temTamanhosForm && (
                  <p style={{ fontSize: '12px', color: '#555', marginTop: '-6px' }}>
                    Estoque total: <strong style={{ color: '#FFFFFF' }}>{totalTamanhosForm}</strong> (soma dos tamanhos acima)
                  </p>
                )}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div className="field">
                    <label className="label">Unidade</label>
                    <input className="input" placeholder="un, kg, ml..." value={prodForm.unidade} onChange={e => setProdForm(f => ({ ...f, unidade: e.target.value }))} />
                  </div>
                  <div className="field">
                    <label className="label">Comissão (%)</label>
                    <input className="input" type="number" min={0} max={100} placeholder="usa a do profissional" value={prodForm.comissao_percentual} onChange={e => setProdForm(f => ({ ...f, comissao_percentual: e.target.value }))} />
                  </div>
                </div>
                {error && <p style={{ fontSize: '12px', color: '#666' }}>{error}</p>}
                <div style={{ display: 'flex', gap: '10px', marginTop: '4px' }}>
                  <button className="btn btn-secondary" style={{ flex: 1 }} onClick={fecharModalProd}>Cancelar (Esc)</button>
                  <button className="btn btn-primary" style={{ flex: 1 }} onClick={handleSaveProd} disabled={saving}>
                    {saving ? 'Salvando...' : `${editProdId ? 'Salvar' : 'Cadastrar'} (F10)`}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {produtosEtiqueta && (
          <EtiquetaModal
            produtos={produtosEtiqueta}
            onClose={() => { setProdutosEtiqueta(null); setSelecionados(new Set()) }}
            onSkuGerado={(id, sku) => {
              setProdutos(prev => prev.map(x => x.id === id ? { ...x, sku } : x))
              setProdutosEtiqueta(prev => prev ? prev.map(x => x.id === id ? { ...x, sku } : x) : prev)
            }}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
