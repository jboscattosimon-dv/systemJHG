import { useState, useEffect, useRef, type ChangeEvent } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, X, AlertTriangle, Package, Scissors, Check, Tag, Pencil, Download, Upload, Trash2, FileSpreadsheet } from 'lucide-react'
import * as XLSX from 'xlsx'
import { supabase } from '../lib/supabase'
import { formatCurrency } from '../lib/utils'
import EtiquetaModal from '../components/EtiquetaModal'
import { useModalKeyboard } from '../hooks/useModalKeyboard'
import type { Produto, ProdutoCategoria, Servico, Profissional } from '../types'

type Secao = 'produtos' | 'servicos'

const CAT_LABEL: Record<ProdutoCategoria, string> = {
  bebidas: 'Bebidas', pomadas: 'Pomadas', petiscos: 'Petiscos', outros: 'Outros',
}

const COLUNAS_IMPORTACAO = [
  'Nome', 'Tamanho', 'Estoque', 'Preço de Custo', 'Preço de Venda à Vista', 'Preço de Venda a Prazo',
] as const

interface TamanhoQtd { tamanho: string; quantidade: number }

// Aceita os dois formatos:
// "P:2, M:3, G:1"  -> tamanho:quantidade explícito
// "M, M, G, M"     -> repete o tamanho uma vez por unidade (como na
//                      planilha antiga) — cada repetição soma 1
function parseTamanhos(valor: unknown): TamanhoQtd[] {
  const texto = String(valor ?? '').trim()
  if (!texto) return []
  const acumulado = new Map<string, number>()
  texto.split(',')
    .map(token => token.trim())
    .filter(Boolean)
    .forEach(token => {
      const [tam, qtd] = token.split(':').map(s => s.trim())
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

async function lerPlanilhaProdutos(arquivo: File): Promise<{ validas: LinhaImportada[]; erros: string[] }> {
  const buf = await arquivo.arrayBuffer()
  const wb = XLSX.read(buf, { type: 'array' })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const linhas: Record<string, unknown>[] = XLSX.utils.sheet_to_json(ws, { defval: '' })

  const validas: LinhaImportada[] = []
  const erros: string[] = []

  linhas.forEach((linha, i) => {
    const nome = String(linha[COLUNAS_IMPORTACAO[0]] ?? '').trim()
    const precoVenda = numero(linha[COLUNAS_IMPORTACAO[4]], NaN)
    if (!nome) { erros.push(`Linha ${i + 2}: sem nome do produto, ignorada.`); return }
    if (!Number.isFinite(precoVenda) || precoVenda <= 0) { erros.push(`Linha ${i + 2} (${nome}): preço de venda à vista inválido, ignorada.`); return }

    const tamanhos = parseTamanhos(linha[COLUNAS_IMPORTACAO[1]])
    const estoqueTotal = tamanhos.length > 0
      ? tamanhos.reduce((s, t) => s + t.quantidade, 0)
      : numero(linha[COLUNAS_IMPORTACAO[2]], 0)
    const precoPrazoBruto = linha[COLUNAS_IMPORTACAO[5]]
    const precoVendaPrazo = precoPrazoBruto !== '' && precoPrazoBruto != null ? numero(precoPrazoBruto, NaN) : null

    validas.push({
      nome,
      tamanhos,
      estoque_total: estoqueTotal,
      preco_custo: numero(linha[COLUNAS_IMPORTACAO[3]], 0),
      preco_venda: precoVenda,
      preco_venda_prazo: precoVendaPrazo != null && Number.isFinite(precoVendaPrazo) ? precoVendaPrazo : null,
    })
  })

  return { validas, erros }
}

export default function Produtos() {
  const [secao, setSecao] = useState<Secao>('produtos')

  // Produtos
  const [produtos, setProdutos] = useState<Produto[]>([])
  const [showProdModal, setShowProdModal] = useState(false)
  const [editProdId, setEditProdId] = useState<string | null>(null)
  const [prodForm, setProdForm] = useState({
    nome: '', categoria: 'bebidas' as ProdutoCategoria, sku: '', unidade: 'un',
    preco_custo: '', preco_venda: '', preco_venda_prazo: '', estoque_atual: '', estoque_minimo: '5', estoque_maximo: '',
    comissao_percentual: '',
  })
  const [prodTamanhos, setProdTamanhos] = useState<{ tamanho: string; quantidade: string }[]>([])

  // Serviços
  const [servicos, setServicos] = useState<Servico[]>([])
  const [profissionais, setProfissionais] = useState<Profissional[]>([])
  const [showServModal, setShowServModal] = useState(false)
  const [editServId, setEditServId] = useState<string | null>(null)
  const [servForm, setServForm] = useState({
    nome: '', preco: '', duracao_minutos: '30', descricao: '', categoria: '', comissao_percentual: '',
    profissional_ids: [] as string[],
  })

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [produtosEtiqueta, setProdutosEtiqueta] = useState<Produto[] | null>(null)
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set())
  const [importando, setImportando] = useState(false)
  const [resultadoImportacao, setResultadoImportacao] = useState<{ ok: number; erros: string[] } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const alertas = produtos.filter(p => p.estoque_atual <= p.estoque_minimo)
  const temTamanhosForm = prodTamanhos.some(t => t.tamanho.trim())
  const totalTamanhosForm = prodTamanhos.filter(t => t.tamanho.trim()).reduce((s, t) => s + (Number(t.quantidade) || 0), 0)

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
    setSelecionados(prev => prev.size === produtos.length ? new Set() : new Set(produtos.map(p => p.id)))
  }

  function imprimirSelecionados() {
    setProdutosEtiqueta(produtos.filter(p => selecionados.has(p.id)))
  }

  function carregarProdutos() {
    return supabase.from('produtos').select('*, tamanhos:produto_tamanhos(*)').order('nome')
      .then(({ data }) => { setProdutos((data ?? []) as Produto[]) })
  }

  useEffect(() => {
    carregarProdutos()

    supabase
      .from('servicos')
      .select('*, profissionais:profissional_servicos(profissional:profissionais(*))')
      .order('nome')
      .then(({ data }) => {
        const mapped = ((data ?? []) as any[]).map(s => ({
          ...s,
          profissionais: (s.profissionais ?? []).map((ps: any) => ps.profissional).filter(Boolean),
        }))
        setServicos(mapped as Servico[])
        setLoading(false)
      })

    supabase.from('profissionais').select('*').order('nome')
      .then(({ data }) => { if (data) setProfissionais(data as Profissional[]) })
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
      estoque_minimo: Number(prodForm.estoque_minimo) || 5,
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
    setProdForm({ nome: '', categoria: 'bebidas', sku: '', unidade: 'un', preco_custo: '', preco_venda: '', preco_venda_prazo: '', estoque_atual: '', estoque_minimo: '5', estoque_maximo: '', comissao_percentual: '' })
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
      estoque_atual: String(p.estoque_atual), estoque_minimo: String(p.estoque_minimo),
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

  async function handleSaveServ() {
    if (!servForm.nome.trim() || !servForm.preco) {
      setError('Nome e preço são obrigatórios.'); return
    }
    setSaving(true); setError('')
    const payload = {
      nome: servForm.nome,
      preco: Number(servForm.preco),
      duracao_minutos: Number(servForm.duracao_minutos) || 30,
      descricao: servForm.descricao || null,
      categoria: servForm.categoria || null,
      comissao_percentual: servForm.comissao_percentual ? Number(servForm.comissao_percentual) : null,
    }
    let servicoId: string | null = editServId
    if (editServId) {
      const { data, error: err } = await supabase.from('servicos').update(payload).eq('id', editServId).select('*').single()
      if (err) { setError(err.message); setSaving(false); return }
      if (data) {
        await supabase.from('profissional_servicos').delete().eq('servico_id', editServId)
        const novoServ: Servico = {
          ...(data as Servico),
          profissionais: profissionais.filter(p => servForm.profissional_ids.includes(p.id)),
        }
        setServicos(prev => prev.map(s => s.id === editServId ? novoServ : s))
      }
    } else {
      const { data, error: err } = await supabase.from('servicos').insert({ ...payload, ativo: true }).select('*').single()
      if (err) { setError(err.message); setSaving(false); return }
      if (data) {
        servicoId = (data as Servico).id
        const novoServ: Servico = {
          ...(data as Servico),
          profissionais: profissionais.filter(p => servForm.profissional_ids.includes(p.id)),
        }
        setServicos(prev => [...prev, novoServ])
      }
    }
    if (servicoId && servForm.profissional_ids.length > 0) {
      await supabase.from('profissional_servicos').insert(
        servForm.profissional_ids.map(pid => ({ profissional_id: pid, servico_id: servicoId }))
      )
    }
    fecharModalServ(); setSaving(false)
  }

  function abrirNovoServ() {
    setEditServId(null)
    setServForm({ nome: '', preco: '', duracao_minutos: '30', descricao: '', categoria: '', comissao_percentual: '', profissional_ids: [] })
    setError('')
    setShowServModal(true)
  }

  function abrirEdicaoServ(s: Servico) {
    setEditServId(s.id)
    setServForm({
      nome: s.nome, preco: String(s.preco), duracao_minutos: String(s.duracao_minutos),
      descricao: s.descricao ?? '', categoria: s.categoria ?? '',
      comissao_percentual: s.comissao_percentual != null ? String(s.comissao_percentual) : '',
      profissional_ids: (s.profissionais ?? []).map(p => p.id),
    })
    setError('')
    setShowServModal(true)
  }

  function fecharModalServ() {
    setShowServModal(false)
    setEditServId(null)
  }

  async function toggleAtivoServ(id: string, ativo: boolean) {
    setServicos(prev => prev.map(s => s.id === id ? { ...s, ativo: !ativo } : s))
    await supabase.from('servicos').update({ ativo: !ativo }).eq('id', id)
  }

  function toggleProfissional(id: string) {
    setServForm(f => ({
      ...f,
      profissional_ids: f.profissional_ids.includes(id)
        ? f.profissional_ids.filter(p => p !== id)
        : [...f.profissional_ids, id],
    }))
  }

  const modalProdRef = useModalKeyboard(showProdModal, fecharModalProd, handleSaveProd)
  const modalServRef = useModalKeyboard(showServModal, fecharModalServ, handleSaveServ)

  return (
    <div className="page">
      {/* Header */}
      <div className="page-header-row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '28px' }}>
        <div>
          <h1 style={{ fontSize: '24px', color: '#FFFFFF' }}>Produtos & Serviços</h1>
          <p style={{ fontSize: '13px', color: '#555', marginTop: '3px' }}>
            {secao === 'produtos' ? 'Estoque da conveniência' : 'Serviços oferecidos'}
          </p>
        </div>
        {secao === 'produtos' ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            {produtos.length > 0 && (
              <button className="btn btn-secondary btn-sm" onClick={toggleSelecionarTodos} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Check size={12} /> {selecionados.size === produtos.length ? 'Desmarcar todos' : 'Selecionar todos'}
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
        ) : (
          <button className="btn btn-primary" onClick={abrirNovoServ} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Plus size={14} strokeWidth={2.5} /> Novo Serviço
          </button>
        )}
      </div>

      {/* Tabs */}
      <div style={{
        display: 'flex', gap: '2px',
        padding: '4px',
        background: '#1A1A1A',
        border: '1px solid #252525',
        borderRadius: '9px',
        width: 'fit-content',
        marginBottom: '24px',
      }}>
        {(['produtos', 'servicos'] as Secao[]).map(s => (
          <button
            key={s}
            onClick={() => setSecao(s)}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              padding: '7px 16px',
              borderRadius: '7px',
              border: secao === s ? '1px solid #FFFFFF' : '1px solid transparent',
              background: secao === s ? 'rgba(255,255,255,0.07)' : 'transparent',
              color: secao === s ? '#FFFFFF' : '#555',
              fontSize: '13px',
              fontWeight: secao === s ? 600 : 400,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
              fontFamily: 'inherit',
            }}
          >
            {s === 'produtos' ? <><Package size={13} /> Produtos</> : <><Scissors size={13} /> Serviços</>}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {secao === 'produtos' ? (
          <motion.div key="produtos" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
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
            {alertas.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                style={{
                  display: 'flex', alignItems: 'center', gap: '10px',
                  padding: '12px 16px',
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid #333',
                  borderRadius: '8px',
                  marginBottom: '20px',
                }}
              >
                <AlertTriangle size={14} style={{ color: '#A3A3A3', flexShrink: 0 }} />
                <p style={{ fontSize: '13px', color: '#A3A3A3' }}>
                  <strong style={{ color: '#FFFFFF' }}>{alertas.length} produto{alertas.length > 1 ? 's' : ''}</strong>{' '}
                  abaixo do estoque mínimo: {alertas.map(p => p.nome).join(', ')}.
                </p>
              </motion.div>
            )}

            <div className="card desktop-row" style={{ padding: 0, overflow: 'hidden' }}>
              <div className="list-header" style={{
                display: 'grid',
                gridTemplateColumns: '28px 1fr 100px 120px 120px 90px 90px 80px 76px',
                padding: '10px 24px',
                borderBottom: '1px solid #222',
                fontSize: '10px', fontWeight: 600, color: '#444',
                textTransform: 'uppercase', letterSpacing: '0.1em',
                background: 'rgba(0,0,0,0.2)',
                alignItems: 'center',
              }}>
                <input type="checkbox" checked={produtos.length > 0 && selecionados.size === produtos.length} onChange={toggleSelecionarTodos} />
                <span>Produto</span><span>Categoria</span><span>Custo</span>
                <span>Venda</span><span>Estoque</span><span>Mínimo</span><span>Status</span><span></span>
              </div>

              {produtos.length === 0 ? (
                <div style={{ padding: '56px', textAlign: 'center', color: '#444', fontSize: '13px' }}>
                  Nenhum produto cadastrado.
                </div>
              ) : produtos.map((p, i) => {
                const baixo  = p.estoque_atual <= p.estoque_minimo
                const margem = p.preco_custo > 0 ? ((p.preco_venda - p.preco_custo) / p.preco_custo * 100).toFixed(0) : null
                return (
                  <motion.div
                    key={p.id}
                    className="list-row"
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.03 }}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '28px 1fr 100px 120px 120px 90px 90px 80px 76px',
                      padding: '14px 24px',
                      borderBottom: i < produtos.length - 1 ? '1px solid #1F1F1F' : 'none',
                      alignItems: 'center',
                    }}
                    whileHover={{ backgroundColor: 'rgba(255,255,255,0.02)' }}
                  >
                    <input type="checkbox" checked={selecionados.has(p.id)} onChange={() => toggleSelecionado(p.id)} />
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <Package size={13} style={{ color: '#444', flexShrink: 0 }} />
                      <div>
                        <span style={{ fontSize: '13px', fontWeight: 500, color: '#FFFFFF' }}>{p.nome}</span>
                        {p.sku && <span style={{ fontSize: '10px', color: '#444', marginLeft: '8px' }}>#{p.sku}</span>}
                        {margem && <span style={{ fontSize: '10px', color: '#555', marginLeft: '8px' }}>+{margem}% margem</span>}
                        {p.comissao_percentual != null && <span style={{ fontSize: '10px', color: '#555', marginLeft: '8px' }}>comissão {p.comissao_percentual}%</span>}
                        {p.tamanhos && p.tamanhos.length > 0 && (
                          <span style={{ fontSize: '10px', color: '#555', marginLeft: '8px' }}>
                            {p.tamanhos.map(t => `${t.tamanho}:${t.quantidade}`).join(' ')}
                          </span>
                        )}
                      </div>
                    </div>
                    <span style={{ fontSize: '12px', color: '#666', textTransform: 'capitalize' }}>{CAT_LABEL[p.categoria]}</span>
                    <span style={{ fontSize: '13px', color: '#555' }}>{formatCurrency(p.preco_custo)}</span>
                    <span style={{ fontSize: '13px', color: '#A3A3A3', fontWeight: 500 }}>{formatCurrency(p.preco_venda)}</span>
                    <span style={{ fontSize: '14px', fontWeight: 700, color: baixo ? '#FFFFFF' : '#A3A3A3' }}>
                      {p.estoque_atual} {p.unidade}
                      {baixo && <AlertTriangle size={12} style={{ marginLeft: '4px', color: '#777', verticalAlign: 'middle' }} />}
                    </span>
                    <span style={{ fontSize: '13px', color: '#444' }}>{p.estoque_minimo}</span>
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
            {produtos.length > 0 && (
              <div className="entity-grid mobile-only-grid" style={{ gap: '16px' }}>
                {produtos.map((p, i) => {
                  const baixo  = p.estoque_atual <= p.estoque_minimo
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
                          <p style={{ fontSize: '13px', color: baixo ? '#FFFFFF' : '#A3A3A3', fontWeight: baixo ? 700 : 400 }}>
                            {p.estoque_atual} {p.unidade} {baixo && <AlertTriangle size={11} style={{ marginLeft: '2px', color: '#777', verticalAlign: 'middle' }} />}
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
            {produtos.length === 0 && (
              <div className="card mobile-only-grid" style={{ padding: '56px', textAlign: 'center', color: '#444', fontSize: '13px' }}>
                Nenhum produto cadastrado.
              </div>
            )}
          </motion.div>
        ) : (
          <motion.div key="servicos" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
            <div className="card desktop-row" style={{ padding: 0, overflow: 'hidden' }}>
              <div className="list-header" style={{
                display: 'grid',
                gridTemplateColumns: '1fr 100px 120px 90px 1fr 80px 76px',
                padding: '10px 24px',
                borderBottom: '1px solid #222',
                fontSize: '10px', fontWeight: 600, color: '#444',
                textTransform: 'uppercase', letterSpacing: '0.1em',
                background: 'rgba(0,0,0,0.2)',
              }}>
                <span>Serviço</span><span>Preço</span><span>Duração</span><span>Comissão</span><span>Profissionais</span><span>Status</span><span></span>
              </div>

              {loading ? (
                <div style={{ padding: '56px', textAlign: 'center', color: '#444', fontSize: '13px' }}>
                  Carregando...
                </div>
              ) : servicos.length === 0 ? (
                <div style={{ padding: '56px', textAlign: 'center', color: '#444', fontSize: '13px' }}>
                  Nenhum serviço cadastrado.
                </div>
              ) : servicos.map((s, i) => (
                <motion.div
                  key={s.id}
                  className="list-row"
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.03 }}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 100px 120px 90px 1fr 80px 76px',
                    padding: '14px 24px',
                    borderBottom: i < servicos.length - 1 ? '1px solid #1F1F1F' : 'none',
                    alignItems: 'center',
                  }}
                  whileHover={{ backgroundColor: 'rgba(255,255,255,0.02)' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <Scissors size={13} style={{ color: '#444', flexShrink: 0 }} />
                    <div>
                      <span style={{ fontSize: '13px', fontWeight: 500, color: '#FFFFFF' }}>{s.nome}</span>
                      {s.categoria && <span style={{ fontSize: '10px', color: '#444', marginLeft: '8px' }}>{s.categoria}</span>}
                    </div>
                  </div>
                  <span style={{ fontSize: '13px', color: '#A3A3A3', fontWeight: 500 }}>{formatCurrency(s.preco)}</span>
                  <span style={{ fontSize: '12px', color: '#666' }}>{s.duracao_minutos} min</span>
                  <span style={{ fontSize: '12px', color: '#666' }}>{s.comissao_percentual != null ? `${s.comissao_percentual}%` : '—'}</span>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                    {s.profissionais && s.profissionais.length > 0
                      ? s.profissionais.map(p => (
                          <span key={p.id} style={{
                            fontSize: '10px', color: '#A3A3A3',
                            background: 'rgba(255,255,255,0.06)',
                            border: '1px solid #2A2A2A',
                            borderRadius: '99px',
                            padding: '2px 8px',
                          }}>{p.nome}</span>
                        ))
                      : <span style={{ fontSize: '12px', color: '#333' }}>—</span>
                    }
                  </div>
                  <button
                    onClick={() => toggleAtivoServ(s.id, s.ativo)}
                    style={{
                      fontSize: '10px', padding: '3px 9px', borderRadius: '99px',
                      border: s.ativo ? '1px solid rgba(255,255,255,0.2)' : '1px dashed #333',
                      background: 'transparent',
                      color: s.ativo ? '#A3A3A3' : '#444',
                      cursor: 'pointer', width: 'fit-content',
                    }}
                  >
                    {s.ativo ? 'Ativo' : 'Inativo'}
                  </button>
                  <button className="btn btn-icon" title="Editar" onClick={() => abrirEdicaoServ(s)}>
                    <Pencil size={12} />
                  </button>
                </motion.div>
              ))}
            </div>

            {/* Cards (mobile) */}
            {!loading && servicos.length > 0 && (
              <div className="entity-grid mobile-only-grid" style={{ gap: '16px' }}>
                {servicos.map((s, i) => (
                  <motion.div
                    key={s.id}
                    className="card entity-card"
                    initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}
                  >
                    <div className="entity-header" style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                      <div className="entity-avatar" style={{
                        width: '40px', height: '40px', borderRadius: '10px',
                        background: '#262626', border: '1px solid #333',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                      }}>
                        <Scissors size={16} style={{ color: '#A3A3A3' }} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <h3 className="entity-title" style={{
                          fontSize: '14px', fontWeight: 600, color: '#FFFFFF', fontFamily: 'DM Sans, sans-serif',
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>{s.nome}</h3>
                        {s.categoria && <p className="entity-subtle" style={{ fontSize: '11px', color: '#555', marginTop: '2px' }}>{s.categoria}</p>}
                      </div>
                      <button
                        onClick={() => toggleAtivoServ(s.id, s.ativo)}
                        style={{
                          fontSize: '10px', padding: '3px 9px', borderRadius: '99px', flexShrink: 0,
                          border: s.ativo ? '1px solid rgba(255,255,255,0.2)' : '1px dashed #333',
                          background: 'transparent', color: s.ativo ? '#A3A3A3' : '#444', cursor: 'pointer',
                        }}
                      >
                        {s.ativo ? 'Ativo' : 'Inativo'}
                      </button>
                    </div>

                    <div className="entity-divider" style={{ height: '1px', background: '#222', margin: '14px 0' }} />

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px' }}>
                      <div>
                        <p style={{ fontSize: '10px', color: '#444', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '2px' }}>Preço</p>
                        <p style={{ fontSize: '13px', color: '#A3A3A3', fontWeight: 500 }}>{formatCurrency(s.preco)}</p>
                      </div>
                      <div>
                        <p style={{ fontSize: '10px', color: '#444', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '2px' }}>Duração</p>
                        <p style={{ fontSize: '13px', color: '#666' }}>{s.duracao_minutos} min</p>
                      </div>
                      <div>
                        <p style={{ fontSize: '10px', color: '#444', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '2px' }}>Comissão</p>
                        <p style={{ fontSize: '13px', color: '#666' }}>{s.comissao_percentual != null ? `${s.comissao_percentual}%` : '—'}</p>
                      </div>
                    </div>

                    {s.profissionais && s.profissionais.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '12px' }}>
                        {s.profissionais.map(p => (
                          <span key={p.id} style={{
                            fontSize: '10px', color: '#A3A3A3',
                            background: 'rgba(255,255,255,0.06)',
                            border: '1px solid #2A2A2A',
                            borderRadius: '99px',
                            padding: '2px 8px',
                          }}>{p.nome}</span>
                        ))}
                      </div>
                    )}

                    <div className="entity-footer" style={{ display: 'flex', justifyContent: 'flex-end' }}>
                      <button className="btn btn-icon" title="Editar" onClick={() => abrirEdicaoServ(s)}>
                        <Pencil size={12} />
                      </button>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
            {!loading && servicos.length === 0 && (
              <div className="card mobile-only-grid" style={{ padding: '56px', textAlign: 'center', color: '#444', fontSize: '13px' }}>
                Nenhum serviço cadastrado.
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

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
                    <input className="input" type="number" min={0} placeholder="5" value={prodForm.estoque_minimo} onChange={e => setProdForm(f => ({ ...f, estoque_minimo: e.target.value }))} />
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

      {/* Modal: Novo Serviço */}
      <AnimatePresence>
        {showServModal && (
          <motion.div
            style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          >
            <motion.div
              ref={modalServRef}
              className="card"
              style={{ width: '100%', maxWidth: '460px', padding: '28px', maxHeight: '85vh', overflowY: 'auto' }}
              initial={{ scale: 0.95, y: 16 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 16 }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '24px' }}>
                <h2 style={{ fontSize: '18px', color: '#FFFFFF' }}>{editServId ? 'Editar Serviço' : 'Novo Serviço'}</h2>
                <button className="btn btn-icon" onClick={fecharModalServ}><X size={14} /></button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div className="field">
                  <label className="label">Nome *</label>
                  <input className="input" placeholder="Nome do serviço" value={servForm.nome} onChange={e => setServForm(f => ({ ...f, nome: e.target.value }))} />
                </div>
                <div className="field">
                  <label className="label">Descrição</label>
                  <input className="input" placeholder="opcional" value={servForm.descricao} onChange={e => setServForm(f => ({ ...f, descricao: e.target.value }))} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div className="field">
                    <label className="label">Preço *</label>
                    <input className="input" type="number" min={0} step={0.01} placeholder="0,00" value={servForm.preco} onChange={e => setServForm(f => ({ ...f, preco: e.target.value }))} />
                  </div>
                  <div className="field">
                    <label className="label">Duração (min)</label>
                    <input className="input" type="number" min={5} step={5} placeholder="30" value={servForm.duracao_minutos} onChange={e => setServForm(f => ({ ...f, duracao_minutos: e.target.value }))} />
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div className="field">
                    <label className="label">Categoria</label>
                    <input className="input" placeholder="Ex: Cabelo, Barba..." value={servForm.categoria} onChange={e => setServForm(f => ({ ...f, categoria: e.target.value }))} />
                  </div>
                  <div className="field">
                    <label className="label">Comissão (%)</label>
                    <input className="input" type="number" min={0} max={100} placeholder="usa a do profissional" value={servForm.comissao_percentual} onChange={e => setServForm(f => ({ ...f, comissao_percentual: e.target.value }))} />
                  </div>
                </div>
                {profissionais.length > 0 && (
                  <div className="field">
                    <label className="label">Profissionais</label>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '4px' }}>
                      {profissionais.map(p => {
                        const checked = servForm.profissional_ids.includes(p.id)
                        return (
                          <button
                            key={p.id}
                            onClick={() => toggleProfissional(p.id)}
                            style={{
                              display: 'flex', alignItems: 'center', gap: '10px',
                              padding: '9px 12px',
                              borderRadius: '7px',
                              border: checked ? '1px solid #FFFFFF' : '1px solid #2A2A2A',
                              background: checked ? 'rgba(255,255,255,0.06)' : 'transparent',
                              cursor: 'pointer',
                              fontFamily: 'inherit',
                              transition: 'all 0.12s',
                              textAlign: 'left',
                            }}
                          >
                            <div style={{
                              width: '16px', height: '16px',
                              borderRadius: '4px',
                              border: checked ? '1px solid #FFFFFF' : '1px solid #444',
                              background: checked ? '#FFFFFF' : 'transparent',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              flexShrink: 0,
                            }}>
                              {checked && <Check size={10} strokeWidth={3} style={{ color: '#000000' }} />}
                            </div>
                            <div>
                              <div style={{ fontSize: '13px', color: '#FFFFFF' }}>{p.nome}</div>
                              <div style={{ fontSize: '11px', color: '#555' }}>{p.especialidade}</div>
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}
                {error && <p style={{ fontSize: '12px', color: '#666' }}>{error}</p>}
                <div style={{ display: 'flex', gap: '10px', marginTop: '4px' }}>
                  <button className="btn btn-secondary" style={{ flex: 1 }} onClick={fecharModalServ}>Cancelar (Esc)</button>
                  <button className="btn btn-primary" style={{ flex: 1 }} onClick={handleSaveServ} disabled={saving}>
                    {saving ? 'Salvando...' : `${editServId ? 'Salvar' : 'Cadastrar'} (F10)`}
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
