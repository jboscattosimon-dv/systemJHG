import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value)
}

// Datas "YYYY-MM-DD" puras (coluna DATE do Postgres, sem hora/fuso)
// são interpretadas pelo JS como meia-noite UTC. Formatadas depois no
// fuso local (Brasil, UTC-3), isso "volta" um dia inteiro na tela —
// uma data de amanhã já parece ter voltado ao dia anterior. Aqui a
// gente monta a partir dos componentes ano/mês/dia direto, sem passar
// por UTC, pra mostrar exatamente o dia que está gravado no banco.
function parseDataSemFuso(date: string): Date {
  const soData = /^\d{4}-\d{2}-\d{2}$/.test(date)
  if (!soData) return new Date(date)
  const [y, m, d] = date.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function formatDate(date: string | Date): string {
  const d = typeof date === 'string' ? parseDataSemFuso(date) : date
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(d)
}

export function formatTime(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(d)
}

export function formatDateTime(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return `${formatDate(d)} às ${formatTime(d)}`
}

export function initials(name: string): string {
  return name
    .split(' ')
    .slice(0, 2)
    .map((n) => n[0])
    .join('')
    .toUpperCase()
}

/** Gera um código curto e único a partir do id do produto (base pro código de barras da etiqueta). */
export function gerarCodigoProduto(id: string): string {
  return id.replace(/-/g, '').slice(0, 10).toUpperCase()
}
