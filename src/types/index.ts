/* ============================================================
   TIPOS DO SISTEMA ERP — Barbearia & Conveniência
   ============================================================ */

export type AgendamentoStatus = 'pendente' | 'confirmado' | 'em_atendimento' | 'concluido' | 'cancelado' | 'nao_compareceu'
export type PagamentoMetodo = 'pix' | 'credito' | 'debito' | 'dinheiro'
export type ProdutoCategoria = 'bebidas' | 'pomadas' | 'petiscos' | 'outros'
export type MovimentoTipo = 'entrada' | 'saida'
export type ComandaStatus = 'aberta' | 'fechada' | 'cancelada'

/* ── Entidades ────────────────────────────────────────────── */

export interface Profissional {
  id: string
  nome: string
  especialidade: string
  comissao_percentual: number
  ativo: boolean
  telefone?: string
  email?: string
  documento?: string
  valor_fixo?: number
  created_at: string
}

export interface Cliente {
  id: string
  nome: string
  telefone: string
  email?: string
  cpf?: string
  data_nascimento?: string
  endereco?: string
  observacoes?: string
  ativo: boolean
  created_at: string
}

export interface Servico {
  id: string
  nome: string
  preco: number
  duracao_minutos: number
  descricao?: string
  categoria?: string
  comissao_percentual?: number
  ativo: boolean
  profissionais?: Profissional[]
}

export interface ProfissionalServico {
  profissional_id: string
  servico_id: string
}

export interface ProdutoTamanho {
  id: string
  produto_id: string
  tamanho: string
  quantidade: number
}

export interface Produto {
  id: string
  nome: string
  categoria: ProdutoCategoria
  preco_custo: number
  preco_venda: number
  preco_venda_prazo?: number
  estoque_atual: number
  estoque_minimo?: number
  estoque_maximo?: number
  sku?: string
  unidade: string
  comissao_percentual?: number
  ativo: boolean
  tamanhos?: ProdutoTamanho[]
}

export interface Agendamento {
  id: string
  cliente_id: string
  profissional_id: string
  servico_id: string
  data_hora: string
  duracao_minutos?: number
  valor?: number
  status: AgendamentoStatus
  observacoes?: string
  created_at: string
  cliente?: Cliente
  profissional?: Profissional
  servico?: Servico
}

export interface ItemComanda {
  id: string
  tipo: 'servico' | 'produto'
  referencia_id: string
  nome: string
  tamanho?: string
  quantidade: number
  preco_unitario: number
  profissional_id?: string
}

export interface Comanda {
  id: string
  cliente_id?: string
  cliente_nome?: string
  data: string
  status: ComandaStatus
  itens: ItemComanda[]
  total: number
  forma_pagamento?: PagamentoMetodo
  created_at: string
}

export interface MovimentoCaixa {
  id: string
  tipo: MovimentoTipo
  categoria: string
  descricao: string
  valor: number
  data: string
  comanda_id?: string
  sessao_caixa_id?: string
  created_at: string
}

export type SessaoCaixaStatus = 'aberto' | 'fechado'

export interface SessaoCaixa {
  id: string
  usuario_id: string
  valor_inicial: number
  aberto_em: string
  fechado_em?: string
  saldo_esperado?: number
  valor_informado?: number
  diferenca?: number
  observacao_fechamento?: string
  status: SessaoCaixaStatus
}

export interface DashboardStats {
  faturamento_dia: number
  agendamentos_dia: number
  clientes_novos: number
  ticket_medio: number
}

/* ── Fundação financeira/administrativa (Fase 1) ─────────────── */

export type PapelUsuario = 'super_admin' | 'administrador' | 'gerente' | 'atendente' | 'profissional'

export interface Empresa {
  id: string
  nome: string
  codigo?: string
  cnpj?: string
  telefone?: string
  email?: string
  ativo: boolean
  created_at: string
}
export type CategoriaFinanceiraTipo = 'receita' | 'despesa'

export interface CategoriaFinanceira {
  id: string
  nome: string
  tipo: CategoriaFinanceiraTipo
  categoria_pai_id?: string
  ativo: boolean
  created_at: string
}

export interface FormaPagamentoCadastro {
  id: string
  nome: string
  ativo: boolean
  created_at: string
}

export interface Fornecedor {
  id: string
  nome: string
  nome_fantasia?: string
  documento?: string
  telefone?: string
  email?: string
  endereco?: string
  observacoes?: string
  ativo: boolean
  created_at: string
}

export type ComissaoStatus = 'pendente' | 'aprovada' | 'paga' | 'cancelada'
export type MovimentoEstoqueTipo = 'entrada' | 'saida' | 'ajuste' | 'perda' | 'devolucao' | 'venda' | 'inventario'

export interface Comissao {
  id: string
  profissional_id: string
  comanda_id?: string
  item_comanda_id?: string
  valor_base: number
  percentual: number
  valor_comissao: number
  status: ComissaoStatus
  created_at: string
  profissional?: Profissional
}

export interface MovimentacaoEstoque {
  id: string
  produto_id: string
  tipo: MovimentoEstoqueTipo
  quantidade: number
  motivo?: string
  referencia_tipo?: string
  referencia_id?: string
  created_at: string
}

export type ContaStatus = 'aberta' | 'parcial' | 'paga' | 'cancelada'

export interface ContaPagar {
  id: string
  fornecedor_id?: string
  categoria_id?: string
  descricao: string
  valor: number
  valor_pago: number
  data_emissao: string
  data_vencimento: string
  data_pagamento?: string
  forma_pagamento_id?: string
  status: ContaStatus
  centro_custo?: string
  observacao?: string
  origem: string
  numero_parcela: number
  total_parcelas: number
  grupo_parcelamento?: string
  created_at: string
  fornecedor?: Fornecedor
  categoria?: CategoriaFinanceira
}

export interface ContaReceber {
  id: string
  cliente_id?: string
  categoria_id?: string
  descricao: string
  valor: number
  valor_pago: number
  data_emissao: string
  data_vencimento: string
  data_pagamento?: string
  forma_pagamento_id?: string
  status: ContaStatus
  observacao?: string
  origem: string
  numero_parcela: number
  total_parcelas: number
  grupo_parcelamento?: string
  created_at: string
  cliente?: Cliente
  categoria?: CategoriaFinanceira
}

export interface Auditoria {
  id: string
  usuario_id?: string
  acao: 'insert' | 'update' | 'delete'
  modulo: string
  registro_id?: string
  dados_antes?: Record<string, unknown>
  dados_depois?: Record<string, unknown>
  created_at: string
}

export interface Configuracoes {
  empresa_id: string
  nome_empresa: string
  cnpj?: string
  telefone?: string
  endereco?: string
  logo_url?: string
  horario_abertura: string
  horario_fechamento: string
  duracao_padrao_min: number
  tolerancia_atraso_min: number
  regras_cancelamento?: string
  updated_at: string
}

export interface UsuarioListado {
  usuario_id: string
  email: string
  papel: PapelUsuario
  profissional_id?: string
  ativo: boolean
  criado_em: string
  empresa_id?: string
  empresa_nome?: string
  telas_permitidas?: string[] | null
}

export interface UsuarioPerfil {
  usuario_id: string
  papel: PapelUsuario
  profissional_id?: string
  empresa_id?: string
  ativo: boolean
  created_at: string
}

/* ── Condicional ──────────────────────────────────────────────── */

export type CondicionalStatus = 'aberto' | 'fechado'
export type ItemCondicionalStatus = 'pendente' | 'vendido' | 'devolvido'

export interface ItemCondicional {
  id: string
  condicional_id: string
  produto_id: string
  nome: string
  tamanho?: string
  quantidade: number
  preco_unitario: number
  status: ItemCondicionalStatus
}

export interface Condicional {
  id: string
  cliente_id: string
  usuario_id?: string
  status: CondicionalStatus
  observacao?: string
  venda_id?: string
  criado_em: string
  fechado_em?: string
  cliente?: Cliente
  itens?: ItemCondicional[]
}
