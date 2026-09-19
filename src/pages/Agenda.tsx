import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ChevronLeft, ChevronRight, Plus, X, Clock,
  Check, Trash2, List, CalendarDays, CalendarRange,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { formatCurrency } from '../lib/utils'
import { useModalKeyboard } from '../hooks/useModalKeyboard'
import type { Agendamento, AgendamentoStatus, Cliente, Profissional, Servico } from '../types'

/* ── Types ──────────────────────────────────────────────── */
type ViewMode = 'lista' | 'semanal' | 'mensal'

/* ── Constants ──────────────────────────────────────────── */
const STATUS_CFG: Record<AgendamentoStatus, { label: string; cls: string }> = {
  pendente:       { label: 'Pendente',        cls: 'badge badge-pending'   },
  confirmado:     { label: 'Confirmado',      cls: 'badge badge-confirmed' },
  em_atendimento: { label: 'Em atendimento',  cls: 'badge badge-confirmed' },
  concluido:      { label: 'Concluído',       cls: 'badge badge-done'      },
  cancelado:      { label: 'Cancelado',       cls: 'badge badge-canceled'  },
  nao_compareceu: { label: 'Não compareceu',  cls: 'badge badge-canceled'  },
}

const HOURS = Array.from({ length: 13 }, (_, i) => i + 8) // 8–20
const HOUR_H = 64 // px per hour in weekly grid
const GRID_START = 8

const WEEK_DAYS_SHORT = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']
const MONTH_NAMES = [
  'Janeiro','Fevereiro','Março','Abril','Maio','Junho',
  'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro',
]

/* ── Date helpers ───────────────────────────────────────── */
const toKey = (d: Date) => d.toISOString().split('T')[0]

function startOfWeekMon(d: Date): Date {
  const r = new Date(d)
  const dow = r.getDay()
  r.setDate(r.getDate() - (dow === 0 ? 6 : dow - 1))
  r.setHours(0, 0, 0, 0)
  return r
}

function getWeekDays(base: Date): Date[] {
  const mon = startOfWeekMon(base)
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(mon)
    d.setDate(mon.getDate() + i)
    return d
  })
}

function getMonthGrid(year: number, month: number): Date[] {
  const first = new Date(year, month, 1)
  const dow   = first.getDay()
  const lead  = dow === 0 ? 6 : dow - 1
  const days: Date[] = []
  for (let i = lead - 1; i >= 0; i--) {
    const d = new Date(year, month, -i)
    days.push(d)
  }
  const last = new Date(year, month + 1, 0).getDate()
  for (let i = 1; i <= last; i++) days.push(new Date(year, month, i))
  while (days.length < 42) {
    const prev = days[days.length - 1]
    const d = new Date(prev)
    d.setDate(prev.getDate() + 1)
    days.push(d)
  }
  return days
}

const pad = (n: number) => String(n).padStart(2, '0')

/* ── View toggle button ─────────────────────────────────── */
function ViewBtn({
  active, onClick, icon: Icon, label,
}: { active: boolean; onClick: () => void; icon: typeof List; label: string }) {
  return (
    <button
      onClick={onClick}
      title={label}
      style={{
        display: 'flex', alignItems: 'center', gap: '6px',
        padding: '7px 12px',
        borderRadius: '7px',
        border: active ? '1px solid #FFFFFF' : '1px solid transparent',
        background: active ? 'rgba(255,255,255,0.07)' : 'transparent',
        color: active ? '#FFFFFF' : '#555',
        fontSize: '12px',
        fontWeight: active ? 600 : 400,
        cursor: 'pointer',
        transition: 'all 0.15s ease',
        fontFamily: 'inherit',
      }}
      onMouseEnter={e => { if (!active) (e.currentTarget as HTMLButtonElement).style.color = '#A3A3A3' }}
      onMouseLeave={e => { if (!active) (e.currentTarget as HTMLButtonElement).style.color = '#555' }}
    >
      <Icon size={13} />
      {label}
    </button>
  )
}

/* ══════════════════════════════════════════════════════════
   LISTA VIEW (existing)
══════════════════════════════════════════════════════════ */
function ListaView({
  selectedDate, setSelectedDate, agenda, updateStatus,
  onOpenModal, setFormDate,
}: {
  selectedDate: Date
  setSelectedDate: (d: Date) => void
  agenda: Agendamento[]
  updateStatus: (id: string, s: AgendamentoStatus) => void
  onOpenModal: () => void
  setFormDate: (k: string) => void
}) {
  const dateKey  = toKey(selectedDate)
  const todayKey = toKey(new Date())
  const filtrado = agenda
    .filter(a => a.data_hora.startsWith(dateKey))
    .sort((a, b) => a.data_hora.localeCompare(b.data_hora))

  const weekBase = new Date()
  const weekDays: Date[] = []
  for (let i = -2; i <= 4; i++) {
    const d = new Date(weekBase)
    d.setDate(d.getDate() + i)
    weekDays.push(d)
  }

  const navDay = (n: number) => {
    const d = new Date(selectedDate)
    d.setDate(d.getDate() + n)
    setSelectedDate(d)
  }

  return (
    <>
      {/* Week strip */}
      <div style={{ display: 'flex', gap: '6px', marginBottom: '28px', alignItems: 'center' }}>
        <button className="btn-icon btn" style={{ flexShrink: 0 }} onClick={() => navDay(-7)}>
          <ChevronLeft size={14} />
        </button>
        <div className="agenda-days-scroll" style={{ display: 'flex', gap: '6px', flex: 1, minWidth: 0 }}>
          {weekDays.map(d => {
            const key = toKey(d)
            const isSel   = key === dateKey
            const isToday = key === todayKey
            const count   = agenda.filter(a => a.data_hora.startsWith(key)).length
            return (
              <button key={key} onClick={() => setSelectedDate(new Date(d))} style={{
                flex: 1, padding: '10px 8px', borderRadius: '8px', fontFamily: 'inherit',
                border: isSel ? '1px solid #FFFFFF' : '1px solid #2A2A2A',
                background: isSel ? '#FFFFFF' : 'transparent',
                color: isSel ? '#0D0D0D' : isToday ? '#A3A3A3' : '#555',
                cursor: 'pointer', textAlign: 'center', transition: 'all 0.15s ease',
              }}>
                <div style={{ fontSize: '10px', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  {d.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '')}
                </div>
                <div style={{ fontSize: '16px', fontWeight: 700, lineHeight: 1 }}>{d.getDate()}</div>
                {count > 0 && (
                  <div style={{
                    marginTop: '5px', width: '5px', height: '5px', borderRadius: '50%',
                    background: isSel ? '#0D0D0D' : '#555', margin: '5px auto 0',
                  }} />
                )}
              </button>
            )
          })}
        </div>
        <button className="btn-icon btn" style={{ flexShrink: 0 }} onClick={() => navDay(7)}>
          <ChevronRight size={14} />
        </button>
      </div>

      {/* List */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '16px 24px', borderBottom: '1px solid #222', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Clock size={14} style={{ color: '#555' }} />
          <span style={{ fontSize: '13px', fontWeight: 600, color: '#FFFFFF' }}>
            {filtrado.length} {filtrado.length === 1 ? 'agendamento' : 'agendamentos'}
          </span>
        </div>

        {filtrado.length === 0 ? (
          <div style={{ padding: '56px', textAlign: 'center' }}>
            <p style={{ fontSize: '14px', color: '#555' }}>Nenhum agendamento neste dia.</p>
            <button
              className="btn btn-secondary btn-sm"
              style={{ marginTop: '16px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              onClick={() => { setFormDate(dateKey); onOpenModal() }}
            >
              <Plus size={13} /> Agendar
            </button>
          </div>
        ) : filtrado.map((ag, i) => {
          const hora = new Date(ag.data_hora).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
          const fim  = ag.servico
            ? new Date(new Date(ag.data_hora).getTime() + ag.servico.duracao_minutos * 60000)
                .toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
            : ''
          const cfg = STATUS_CFG[ag.status]
          return (
            <motion.div
              key={ag.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              style={{
                display: 'flex', gap: '20px', padding: '18px 24px',
                borderBottom: i < filtrado.length - 1 ? '1px solid #1F1F1F' : 'none',
                alignItems: 'flex-start',
              }}
            >
              <div style={{ width: '70px', flexShrink: 0, paddingTop: '2px' }}>
                <p style={{ fontSize: '14px', fontWeight: 700, color: '#FFFFFF', fontVariantNumeric: 'tabular-nums' }}>{hora}</p>
                {fim && <p style={{ fontSize: '11px', color: '#444', marginTop: '2px' }}>até {fim}</p>}
              </div>
              <div style={{ width: '2px', background: '#2A2A2A', borderRadius: '1px', alignSelf: 'stretch', flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
                  <p style={{ fontSize: '14px', fontWeight: 600, color: '#FFFFFF' }}>{ag.cliente?.nome ?? 'Sem cliente'}</p>
                  <span className={cfg.cls}>{cfg.label}</span>
                </div>
                <p style={{ fontSize: '12px', color: '#555' }}>
                  {ag.servico?.nome}{ag.servico?.preco ? ` · ${formatCurrency(ag.servico.preco)}` : ''}
                  {ag.profissional ? ` · ${ag.profissional.nome}` : ''}
                </p>
                {ag.observacoes && (
                  <p style={{ fontSize: '12px', color: '#444', marginTop: '4px', fontStyle: 'italic' }}>"{ag.observacoes}"</p>
                )}
              </div>
              <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                {ag.status === 'pendente' && (
                  <button className="btn btn-icon" title="Confirmar" onClick={() => updateStatus(ag.id, 'confirmado')}>
                    <Check size={13} />
                  </button>
                )}
                {ag.status === 'confirmado' && (
                  <button className="btn btn-icon" title="Iniciar atendimento" onClick={() => updateStatus(ag.id, 'em_atendimento')}>
                    <Check size={13} />
                  </button>
                )}
                {ag.status === 'em_atendimento' && (
                  <button className="btn btn-icon" title="Concluir" onClick={() => updateStatus(ag.id, 'concluido')}>
                    <Check size={13} />
                  </button>
                )}
                {(ag.status === 'pendente' || ag.status === 'confirmado') && (
                  <button className="btn btn-icon" title="Não compareceu" onClick={() => updateStatus(ag.id, 'nao_compareceu')}>
                    <Clock size={13} />
                  </button>
                )}
                {ag.status !== 'concluido' && ag.status !== 'cancelado' && (
                  <button className="btn btn-icon" title="Cancelar" onClick={() => updateStatus(ag.id, 'cancelado')}>
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
            </motion.div>
          )
        })}
      </div>
    </>
  )
}

/* ══════════════════════════════════════════════════════════
   SEMANAL VIEW — time grid
══════════════════════════════════════════════════════════ */
function SemanalView({
  baseDate, setBaseDate, agenda, filterProfId, onDayClick,
}: {
  baseDate: Date
  setBaseDate: (d: Date) => void
  agenda: Agendamento[]
  filterProfId: string
  onDayClick: (d: Date) => void
}) {
  const weekDays = getWeekDays(baseDate)
  const todayKey = toKey(new Date())

  const navWeek = (n: number) => {
    const d = new Date(baseDate)
    d.setDate(d.getDate() + n * 7)
    setBaseDate(d)
  }

  const filtered = filterProfId
    ? agenda.filter(a => a.profissional_id === filterProfId)
    : agenda

  // Get appointments for a specific day key, sorted
  function agForDay(dayKey: string) {
    return filtered
      .filter(a => a.data_hora.startsWith(dayKey))
      .sort((a, b) => a.data_hora.localeCompare(b.data_hora))
  }

  // Convert time to px offset from top of grid
  function timeToPx(iso: string): number {
    const d = new Date(iso)
    const h = d.getHours() + d.getMinutes() / 60
    return (h - GRID_START) * HOUR_H
  }

  function durationToPx(mins: number): number {
    return Math.max((mins / 60) * HOUR_H, 28)
  }

  const weekLabel = `${weekDays[0].getDate()} ${MONTH_NAMES[weekDays[0].getMonth()]} — ${weekDays[6].getDate()} ${MONTH_NAMES[weekDays[6].getMonth()]} ${weekDays[6].getFullYear()}`

  return (
    <div>
      {/* Week nav */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
        <button className="btn btn-icon" onClick={() => navWeek(-1)}><ChevronLeft size={14} /></button>
        <span style={{ fontSize: '13px', fontWeight: 500, color: '#A3A3A3', flex: 1 }}>{weekLabel}</span>
        <button className="btn btn-icon" onClick={() => navWeek(1)}><ChevronRight size={14} /></button>
      </div>

      {/* Grid */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <div className="agenda-week-scroll">
      <div className="agenda-week-inner">
        {/* Day headers */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '52px repeat(7, 1fr)',
          borderBottom: '1px solid #222',
          background: 'rgba(0,0,0,0.2)',
        }}>
          <div />
          {weekDays.map((d, i) => {
            const key     = toKey(d)
            const isToday = key === todayKey
            const count   = agForDay(key).length
            return (
              <div
                key={key}
                onClick={() => onDayClick(d)}
                style={{
                  padding: '10px 8px',
                  textAlign: 'center',
                  borderLeft: '1px solid #1A1A1A',
                  cursor: 'pointer',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.03)'}
                onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.background = 'transparent'}
              >
                <p style={{
                  fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em',
                  color: isToday ? '#FFFFFF' : '#555', marginBottom: '4px',
                }}>
                  {WEEK_DAYS_SHORT[i]}
                </p>
                <p style={{
                  fontSize: '18px', fontWeight: 700, lineHeight: 1, fontFamily: 'DM Sans, sans-serif',
                  color: isToday ? '#FFFFFF' : '#A3A3A3',
                }}>
                  {d.getDate()}
                </p>
                {count > 0 && (
                  <div style={{
                    marginTop: '4px', fontSize: '10px', color: '#444',
                    background: 'rgba(255,255,255,0.05)', borderRadius: '99px',
                    padding: '1px 5px', display: 'inline-block',
                  }}>
                    {count}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Time body — scrollable */}
        <div style={{ overflowY: 'auto', maxHeight: '520px' }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: '52px repeat(7, 1fr)',
            position: 'relative',
          }}>
            {/* Hour labels column */}
            <div style={{ borderRight: '1px solid #1A1A1A' }}>
              {HOURS.map(h => (
                <div key={h} style={{
                  height: `${HOUR_H}px`, display: 'flex', alignItems: 'flex-start',
                  justifyContent: 'flex-end', padding: '4px 8px 0 0',
                  borderBottom: '1px solid #1A1A1A',
                }}>
                  <span style={{ fontSize: '10px', color: '#3A3A3A', fontVariantNumeric: 'tabular-nums' }}>
                    {pad(h)}:00
                  </span>
                </div>
              ))}
            </div>

            {/* Day columns */}
            {weekDays.map((d) => {
              const key  = toKey(d)
              const ags  = agForDay(key)
              const isToday = key === todayKey
              return (
                <div key={key} style={{
                  borderLeft: '1px solid #1A1A1A',
                  position: 'relative',
                  background: isToday ? 'rgba(255,255,255,0.015)' : 'transparent',
                }}>
                  {/* Hour lines */}
                  {HOURS.map(h => (
                    <div key={h} style={{ height: `${HOUR_H}px`, borderBottom: '1px solid #1A1A1A' }} />
                  ))}

                  {/* Appointments */}
                  {ags.map(ag => {
                    const top  = timeToPx(ag.data_hora)
                    const h    = durationToPx(ag.servico?.duracao_minutos ?? 30)
                    const cfg  = STATUS_CFG[ag.status]
                    return (
                      <div
                        key={ag.id}
                        title={`${ag.cliente?.nome} — ${ag.servico?.nome}`}
                        style={{
                          position: 'absolute',
                          top: `${top}px`,
                          left: '3px',
                          right: '3px',
                          height: `${h}px`,
                          background: '#262626',
                          border: '1px solid #3A3A3A',
                          borderLeft: '2px solid #FFFFFF',
                          borderRadius: '5px',
                          padding: '4px 7px',
                          overflow: 'hidden',
                          cursor: 'default',
                          zIndex: 1,
                        }}
                      >
                        <p style={{
                          fontSize: '11px', fontWeight: 600, color: '#FFFFFF',
                          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                          lineHeight: 1.2,
                        }}>
                          {ag.cliente?.nome ?? 'Cliente'}
                        </p>
                        {h >= 40 && (
                          <p style={{
                            fontSize: '10px', color: '#666',
                            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                            marginTop: '2px',
                          }}>
                            {ag.servico?.nome}
                          </p>
                        )}
                        {h >= 52 && (
                          <span className={cfg.cls} style={{ fontSize: '9px', padding: '1px 6px', marginTop: '3px', display: 'inline-block' }}>
                            {cfg.label}
                          </span>
                        )}
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </div>
        </div>
      </div>
      </div>
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════
   MENSAL VIEW — month calendar
══════════════════════════════════════════════════════════ */
function MensalView({
  baseDate, setBaseDate, agenda, filterProfId, onDayClick, selectedDate,
}: {
  baseDate: Date
  setBaseDate: (d: Date) => void
  agenda: Agendamento[]
  filterProfId: string
  onDayClick: (d: Date) => void
  selectedDate: Date
}) {
  const year  = baseDate.getFullYear()
  const month = baseDate.getMonth()
  const grid  = getMonthGrid(year, month)
  const todayKey   = toKey(new Date())
  const selectedKey = toKey(selectedDate)

  const navMonth = (n: number) => {
    const d = new Date(year, month + n, 1)
    setBaseDate(d)
  }

  const filtered = filterProfId
    ? agenda.filter(a => a.profissional_id === filterProfId)
    : agenda

  function agForDay(dayKey: string) {
    return filtered.filter(a => a.data_hora.startsWith(dayKey))
  }

  return (
    <div>
      {/* Month nav */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
        <button className="btn btn-icon" onClick={() => navMonth(-1)}><ChevronLeft size={14} /></button>
        <span style={{ fontSize: '15px', fontWeight: 600, color: '#FFFFFF', flex: 1 }}>
          {MONTH_NAMES[month]} {year}
        </span>
        <button className="btn btn-icon" onClick={() => navMonth(1)}><ChevronRight size={14} /></button>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <div className="agenda-month-scroll">
      <div className="agenda-month-inner">
        {/* Day of week headers */}
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)',
          borderBottom: '1px solid #222',
          background: 'rgba(0,0,0,0.2)',
        }}>
          {WEEK_DAYS_SHORT.map(d => (
            <div key={d} style={{
              padding: '10px 0',
              textAlign: 'center',
              fontSize: '10px', fontWeight: 600,
              color: '#444', textTransform: 'uppercase', letterSpacing: '0.08em',
            }}>
              {d}
            </div>
          ))}
        </div>

        {/* Month grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
          {grid.map((d, i) => {
            const key       = toKey(d)
            const isToday   = key === todayKey
            const isSel     = key === selectedKey
            const isThisMon = d.getMonth() === month
            const ags       = agForDay(key)
            const maxShow   = 3
            const extra     = Math.max(0, ags.length - maxShow)

            return (
              <motion.div
                key={key}
                onClick={() => onDayClick(d)}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: i * 0.004 }}
                style={{
                  minHeight: '90px',
                  padding: '8px',
                  borderRight: (i + 1) % 7 === 0 ? 'none' : '1px solid #1A1A1A',
                  borderBottom: i < grid.length - 7 ? '1px solid #1A1A1A' : 'none',
                  cursor: 'pointer',
                  background: isSel ? 'rgba(255,255,255,0.06)' : 'transparent',
                  transition: 'background 0.12s',
                  position: 'relative',
                }}
                whileHover={{ backgroundColor: 'rgba(255,255,255,0.03)' }}
              >
                {/* Day number */}
                <div style={{
                  width: '26px', height: '26px',
                  borderRadius: '50%',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  marginBottom: '6px',
                  background: isToday ? '#FFFFFF' : 'transparent',
                }}>
                  <span style={{
                    fontSize: '13px',
                    fontWeight: isToday ? 700 : 400,
                    color: isToday ? '#0D0D0D' : isThisMon ? (isSel ? '#FFFFFF' : '#A3A3A3') : '#333',
                    fontFamily: 'DM Sans, sans-serif',
                  }}>
                    {d.getDate()}
                  </span>
                </div>

                {/* Appointment pills */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  {ags.slice(0, maxShow).map(ag => {
                    const hora = new Date(ag.data_hora).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
                    return (
                      <div key={ag.id} style={{
                        fontSize: '10px', color: '#A3A3A3',
                        background: 'rgba(255,255,255,0.06)',
                        border: '1px solid #2A2A2A',
                        borderRadius: '3px',
                        padding: '1px 5px',
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      }}>
                        <span style={{ color: '#555', marginRight: '4px' }}>{hora}</span>
                        {ag.cliente?.nome ?? ag.servico?.nome}
                      </div>
                    )
                  })}
                  {extra > 0 && (
                    <div style={{ fontSize: '10px', color: '#444', paddingLeft: '2px' }}>
                      +{extra} mais
                    </div>
                  )}
                </div>
              </motion.div>
            )
          })}
        </div>
      </div>
      </div>
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════
   MAIN COMPONENT
══════════════════════════════════════════════════════════ */
export default function Agenda() {
  const [viewMode, setViewMode]     = useState<ViewMode>('lista')
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [calBase, setCalBase]       = useState(new Date()) // week/month navigation base
  const [filterProfId, setFilterProfId] = useState('')

  const [agenda, setAgenda]         = useState<Agendamento[]>([])
  const [profissionais, setProfissionais] = useState<Profissional[]>([])
  const [servicos, setServicos]     = useState<Servico[]>([])
  const [profServMap, setProfServMap] = useState<Record<string, string[]>>({})
  const [clientes, setClientes]     = useState<Cliente[]>([])
  const [showModal, setShowModal]   = useState(false)

  const [form, setForm] = useState({
    cliente_id: '', profissional_id: '', servico_id: '',
    data: toKey(new Date()), hora: '09:00', obs: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  useEffect(() => {
    let inicio: string
    let fim: string
    if (viewMode === 'semanal') {
      const dias = getWeekDays(calBase)
      inicio = toKey(dias[0]); fim = toKey(dias[6])
    } else if (viewMode === 'mensal') {
      const dias = getMonthGrid(calBase.getFullYear(), calBase.getMonth())
      inicio = toKey(dias[0]); fim = toKey(dias[dias.length - 1])
    } else {
      inicio = toKey(selectedDate); fim = inicio
    }
    supabase
      .from('agendamentos')
      .select('*, cliente:clientes(*), profissional:profissionais(*), servico:servicos(*)')
      .gte('data_hora', `${inicio}T00:00:00`)
      .lte('data_hora', `${fim}T23:59:59`)
      .order('data_hora')
      .then(({ data }) => { setAgenda((data ?? []) as Agendamento[]) })
  }, [selectedDate, viewMode, calBase])

  useEffect(() => {
    supabase.from('clientes').select('*').order('nome')
      .then(({ data }) => { if (data) setClientes(data as Cliente[]) })

    supabase.from('profissionais').select('*').eq('ativo', true).order('nome')
      .then(({ data }) => { if (data) setProfissionais(data as Profissional[]) })

    supabase.from('servicos').select('*').eq('ativo', true).order('nome')
      .then(({ data }) => { if (data) setServicos(data as Servico[]) })

    supabase.from('profissional_servicos').select('*')
      .then(({ data }) => {
        if (data) {
          const map: Record<string, string[]> = {}
          ;(data as { profissional_id: string; servico_id: string }[]).forEach(ps => {
            if (!map[ps.profissional_id]) map[ps.profissional_id] = []
            map[ps.profissional_id].push(ps.servico_id)
          })
          setProfServMap(map)
        }
      })
  }, [])

  async function handleSave() {
    if (!form.profissional_id) { setError('Selecione um profissional.'); return }
    setSaving(true); setError('')
    const data_hora = `${form.data}T${form.hora}:00`
    const servicoSelecionado = servicos.find(s => s.id === form.servico_id)
    const { error: err } = await supabase.from('agendamentos').insert({
      cliente_id: form.cliente_id || null,
      profissional_id: form.profissional_id,
      servico_id: form.servico_id || null,
      data_hora,
      duracao_minutos: servicoSelecionado?.duracao_minutos ?? 30,
      valor: servicoSelecionado?.preco ?? null,
      observacoes: form.obs, status: 'pendente',
    })
    if (err) {
      setError(
        err.code === '23P01'
          ? 'Esse profissional já tem outro atendimento nesse horário.'
          : err.message
      )
      setSaving(false); return
    }
    setShowModal(false)
    setForm({ cliente_id: '', profissional_id: '', servico_id: '', data: toKey(new Date()), hora: '09:00', obs: '' })
    setSaving(false)
    supabase
      .from('agendamentos')
      .select('*, cliente:clientes(*), profissional:profissionais(*), servico:servicos(*)')
      .gte('data_hora', `${form.data}T00:00:00`)
      .lte('data_hora', `${form.data}T23:59:59`)
      .order('data_hora')
      .then(({ data }) => { if (data) setAgenda(data as Agendamento[]) })
  }

  async function updateStatus(id: string, status: AgendamentoStatus) {
    setAgenda(prev => prev.map(a => a.id === id ? { ...a, status } : a))
    await supabase.from('agendamentos').update({ status }).eq('id', id)
  }

  // When clicking a day in semanal/mensal views
  function handleDayClick(d: Date) {
    setSelectedDate(d)
    setViewMode('lista')
  }

  const showCalFilters = viewMode === 'semanal' || viewMode === 'mensal'

  const servicosFiltrados = form.profissional_id && Object.keys(profServMap).length > 0
    ? servicos.filter(s => (profServMap[form.profissional_id] ?? []).includes(s.id))
    : servicos

  const modalRef = useModalKeyboard(showModal, () => setShowModal(false), handleSave)

  return (
    <div className="page">
      {/* Header */}
      <div className="page-header-row" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '24px', color: '#FFFFFF' }}>Agenda</h1>
          <p style={{ fontSize: '13px', color: '#555', marginTop: '3px' }}>
            {viewMode === 'lista'
              ? selectedDate.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })
              : viewMode === 'mensal'
              ? `${MONTH_NAMES[calBase.getMonth()]} ${calBase.getFullYear()}`
              : `Semana de ${getWeekDays(calBase)[0].toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' })}`
            }
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          {/* View toggle */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: '2px',
            padding: '4px',
            background: '#1A1A1A',
            border: '1px solid #252525',
            borderRadius: '9px',
          }}>
            <ViewBtn active={viewMode === 'lista'}   onClick={() => setViewMode('lista')}   icon={List}          label="Lista"   />
            <ViewBtn active={viewMode === 'semanal'} onClick={() => { setViewMode('semanal'); setCalBase(selectedDate) }} icon={CalendarDays} label="Semanal" />
            <ViewBtn active={viewMode === 'mensal'}  onClick={() => { setViewMode('mensal');  setCalBase(selectedDate) }} icon={CalendarRange} label="Mensal"  />
          </div>

          <button
            className="btn btn-primary"
            onClick={() => setShowModal(true)}
            style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
          >
            <Plus size={14} strokeWidth={2.5} /> Agendar
          </button>
        </div>
      </div>

      {/* Calendar-mode filters */}
      <AnimatePresence>
        {showCalFilters && (
          <motion.div
            initial={{ opacity: 0, height: 0, marginBottom: 0 }}
            animate={{ opacity: 1, height: 'auto', marginBottom: 20 }}
            exit={{ opacity: 0, height: 0, marginBottom: 0 }}
            style={{ overflow: 'hidden' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '12px', color: '#444' }}>Filtrar por profissional:</span>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                <button
                  onClick={() => setFilterProfId('')}
                  style={{
                    padding: '5px 12px', borderRadius: '99px', fontFamily: 'inherit',
                    border: filterProfId === '' ? '1px solid #FFFFFF' : '1px solid #2A2A2A',
                    background: filterProfId === '' ? 'rgba(255,255,255,0.08)' : 'transparent',
                    color: filterProfId === '' ? '#FFFFFF' : '#555',
                    fontSize: '12px', cursor: 'pointer', transition: 'all 0.15s',
                  }}
                >
                  Todos
                </button>
                {profissionais.map(p => (
                  <button
                    key={p.id}
                    onClick={() => setFilterProfId(p.id)}
                    style={{
                      padding: '5px 12px', borderRadius: '99px', fontFamily: 'inherit',
                      border: filterProfId === p.id ? '1px solid #FFFFFF' : '1px solid #2A2A2A',
                      background: filterProfId === p.id ? 'rgba(255,255,255,0.08)' : 'transparent',
                      color: filterProfId === p.id ? '#FFFFFF' : '#555',
                      fontSize: '12px', cursor: 'pointer', transition: 'all 0.15s',
                    }}
                  >
                    {p.nome}
                  </button>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Views */}
      <AnimatePresence mode="wait">
        <motion.div
          key={viewMode}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.18 }}
        >
          {viewMode === 'lista' && (
            <ListaView
              selectedDate={selectedDate}
              setSelectedDate={setSelectedDate}
              agenda={agenda}
              updateStatus={updateStatus}
              onOpenModal={() => setShowModal(true)}
              setFormDate={k => setForm(f => ({ ...f, data: k }))}
            />
          )}
          {viewMode === 'semanal' && (
            <SemanalView
              baseDate={calBase}
              setBaseDate={setCalBase}
              agenda={agenda}
              filterProfId={filterProfId}
              onDayClick={handleDayClick}
            />
          )}
          {viewMode === 'mensal' && (
            <MensalView
              baseDate={calBase}
              setBaseDate={setCalBase}
              agenda={agenda}
              filterProfId={filterProfId}
              onDayClick={handleDayClick}
              selectedDate={selectedDate}
            />
          )}
        </motion.div>
      </AnimatePresence>

      {/* Modal */}
      <AnimatePresence>
        {showModal && (
          <motion.div
            style={{
              position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.75)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px',
            }}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          >
            <motion.div
              ref={modalRef}
              className="card"
              style={{ width: '100%', maxWidth: '480px', padding: '28px' }}
              initial={{ scale: 0.95, opacity: 0, y: 16 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 16 }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                <h2 style={{ fontSize: '18px', color: '#FFFFFF' }}>Novo Agendamento</h2>
                <button className="btn btn-icon" onClick={() => setShowModal(false)}><X size={14} /></button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {clientes.length > 0 && (
                  <div className="field">
                    <label className="label">Cliente</label>
                    <select className="input" value={form.cliente_id} onChange={e => setForm(f => ({ ...f, cliente_id: e.target.value }))}>
                      <option value="">Selecionar...</option>
                      {clientes.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                    </select>
                  </div>
                )}
                <div className="field">
                  <label className="label">Profissional *</label>
                  <select className="input" value={form.profissional_id} onChange={e => setForm(f => ({ ...f, profissional_id: e.target.value, servico_id: '' }))}>
                    <option value="">Selecionar...</option>
                    {profissionais.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label className="label">Serviço</label>
                  <select className="input" value={form.servico_id} onChange={e => setForm(f => ({ ...f, servico_id: e.target.value }))}>
                    <option value="">Selecionar...</option>
                    {servicosFiltrados.map(s => <option key={s.id} value={s.id}>{s.nome} · {formatCurrency(s.preco)}</option>)}
                  </select>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div className="field">
                    <label className="label">Data</label>
                    <input type="date" className="input" value={form.data} onChange={e => setForm(f => ({ ...f, data: e.target.value }))} />
                  </div>
                  <div className="field">
                    <label className="label">Hora</label>
                    <input type="time" className="input" value={form.hora} onChange={e => setForm(f => ({ ...f, hora: e.target.value }))} />
                  </div>
                </div>
                <div className="field">
                  <label className="label">Observações</label>
                  <input type="text" className="input" placeholder="Opcional..." value={form.obs} onChange={e => setForm(f => ({ ...f, obs: e.target.value }))} />
                </div>
                {error && <p style={{ fontSize: '13px', color: '#888' }}>{error}</p>}
                <div style={{ display: 'flex', gap: '10px', marginTop: '4px' }}>
                  <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setShowModal(false)}>Cancelar (Esc)</button>
                  <button className="btn btn-primary" style={{ flex: 1 }} onClick={handleSave} disabled={saving}>
                    {saving ? 'Salvando...' : 'Confirmar (F10)'}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
