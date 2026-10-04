import { supabase } from './supabase'
import type { Produto, RegraPromocao } from '../types'

function arredondar(valor: number): number {
  return Math.round(valor * 100) / 100
}

// Preço à vista com a regra aplicada. Preço fixo maior que o normal é
// ignorado (promoção nunca encarece o produto).
export function precoVistaComRegra(precoVenda: number, regra: Pick<RegraPromocao, 'desconto_percentual' | 'preco_promocional'>): number {
  if (regra.preco_promocional != null) return Math.min(regra.preco_promocional, precoVenda)
  return arredondar(precoVenda * (1 - (regra.desconto_percentual ?? 0) / 100))
}

// Regras valendo hoje. Se a migration de promoções ainda não foi
// aplicada no banco, devolve vazio em vez de travar o PDV.
export async function carregarPromocoesVigentes(): Promise<RegraPromocao[]> {
  const { data, error } = await supabase.rpc('promocoes_vigentes')
  if (error || !data) return []
  return (data as RegraPromocao[]).map(r => ({
    ...r,
    desconto_percentual: r.desconto_percentual != null ? Number(r.desconto_percentual) : null,
    preco_promocional: r.preco_promocional != null ? Number(r.preco_promocional) : null,
  }))
}

// Troca preco_venda/preco_venda_prazo pelo preço promocional nos
// produtos em promoção — assim o PDV e o condicional cobram o preço
// certo sem mudar o resto do fluxo. O preço a prazo recebe o mesmo
// percentual de desconto que o à vista teve. Com mais de uma promoção
// vigente pro mesmo produto, vale a que der o menor preço.
export function aplicarPromocoes(produtos: Produto[], regras: RegraPromocao[]): Produto[] {
  if (regras.length === 0) return produtos
  const porProduto = new Map<string, RegraPromocao[]>()
  regras.forEach(r => porProduto.set(r.produto_id, [...(porProduto.get(r.produto_id) ?? []), r]))

  return produtos.map(p => {
    const candidatas = porProduto.get(p.id)
    if (!candidatas || p.preco_venda <= 0) return p
    let melhor = candidatas[0]
    let melhorPreco = precoVistaComRegra(p.preco_venda, melhor)
    candidatas.slice(1).forEach(r => {
      const preco = precoVistaComRegra(p.preco_venda, r)
      if (preco < melhorPreco) { melhor = r; melhorPreco = preco }
    })
    if (melhorPreco >= p.preco_venda) return p
    const fator = melhorPreco / p.preco_venda
    return {
      ...p,
      preco_venda: melhorPreco,
      preco_venda_prazo: p.preco_venda_prazo != null ? arredondar(p.preco_venda_prazo * fator) : p.preco_venda_prazo,
      preco_original: p.preco_venda,
      promocao_nome: melhor.promocao_nome,
    }
  })
}
