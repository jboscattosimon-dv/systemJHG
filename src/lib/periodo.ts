export type Periodo = 'mes' | 'trimestre' | 'ano' | 'personalizado'

export function toISO(d: Date): string {
  return d.toISOString().split('T')[0]
}

export function rangeFor(periodo: Periodo, ref: Date, custom: { inicio: string; fim: string }): [string, string] {
  if (periodo === 'personalizado') return [custom.inicio, custom.fim]
  if (periodo === 'mes') {
    const inicio = new Date(ref.getFullYear(), ref.getMonth(), 1)
    const fim = new Date(ref.getFullYear(), ref.getMonth() + 1, 0)
    return [toISO(inicio), toISO(fim)]
  }
  if (periodo === 'trimestre') {
    const q = Math.floor(ref.getMonth() / 3)
    const inicio = new Date(ref.getFullYear(), q * 3, 1)
    const fim = new Date(ref.getFullYear(), q * 3 + 3, 0)
    return [toISO(inicio), toISO(fim)]
  }
  const inicio = new Date(ref.getFullYear(), 0, 1)
  const fim = new Date(ref.getFullYear(), 11, 31)
  return [toISO(inicio), toISO(fim)]
}

export function periodoAnterior(inicio: string, fim: string): [string, string] {
  const di = new Date(`${inicio}T12:00:00`)
  const df = new Date(`${fim}T12:00:00`)
  const dias = Math.round((df.getTime() - di.getTime()) / 86400000) + 1
  const novoFim = new Date(di.getTime() - 86400000)
  const novoInicio = new Date(novoFim.getTime() - (dias - 1) * 86400000)
  return [toISO(novoInicio), toISO(novoFim)]
}
