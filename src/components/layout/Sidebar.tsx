import { useState } from 'react'
import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  LayoutDashboard, Calendar, ShoppingCart, Wallet, Users,
  Scissors, Package, PackageOpen, Truck, BarChart2, ArrowDownCircle, ArrowUpCircle,
  Percent, FileBarChart, FileText, ClipboardList, Settings, UserCog, LogOut, Building2, Tags,
  ChevronDown, FolderOpen, ArrowLeftRight,
} from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { usePerfil } from '../../hooks/usePerfil'
import { initials } from '../../lib/utils'
import type { PapelUsuario } from '../../types'

const PAPEL_LABEL: Record<PapelUsuario, string> = {
  super_admin: 'Super Admin', administrador: 'Administrador', gerente: 'Gerente', atendente: 'Atendente', profissional: 'Profissional',
}

const NAV_SUPER_ADMIN = [
  { to: '/empresas',     icon: Building2,       label: 'Empresas'      },
  { to: '/usuarios',     icon: UserCog,         label: 'Pendências'    },
]

type NavItemDef = { to: string; icon: typeof LayoutDashboard; label: string }

const NAV_TOPO: NavItemDef[] = [
  { to: '/dashboard',    icon: LayoutDashboard, label: 'Dashboard'     },
]

const NAV_GRUPOS: { label: string; icon: typeof LayoutDashboard; items: NavItemDef[] }[] = [
  {
    label: 'Cadastros',
    icon: FolderOpen,
    items: [
      { to: '/clientes',      icon: Users,    label: 'Clientes'      },
      { to: '/profissionais', icon: Scissors, label: 'Profissionais' },
      { to: '/produtos',      icon: Package,  label: 'Produtos'      },
      { to: '/fornecedores',  icon: Truck,    label: 'Fornecedores'  },
      { to: '/categorias',    icon: Tags,     label: 'Categorias'    },
      { to: '/usuarios',      icon: UserCog,  label: 'Usuários'      },
    ],
  },
  {
    label: 'Movimentos',
    icon: ArrowLeftRight,
    items: [
      { to: '/agenda',         icon: Calendar,        label: 'Agenda'           },
      { to: '/pdv',            icon: ShoppingCart,    label: 'PDV'              },
      { to: '/condicional',    icon: PackageOpen,     label: 'Condicional'      },
      { to: '/caixa',          icon: Wallet,          label: 'Caixa'            },
      { to: '/financeiro',     icon: BarChart2,       label: 'Financeiro'       },
      { to: '/contas-pagar',   icon: ArrowUpCircle,   label: 'Contas a Pagar'   },
      { to: '/contas-receber', icon: ArrowDownCircle, label: 'Contas a Receber' },
      { to: '/comissoes',      icon: Percent,         label: 'Comissões'       },
    ],
  },
  {
    label: 'Relatórios',
    icon: FileBarChart,
    items: [
      { to: '/dre',          icon: FileBarChart,  label: 'DRE'         },
      { to: '/relatorios',   icon: FileText,      label: 'Relatórios'  },
      { to: '/auditoria',    icon: ClipboardList, label: 'Auditoria'   },
    ],
  },
]

const NAV_RODAPE: NavItemDef[] = [
  { to: '/configuracoes', icon: Settings, label: 'Configurações' },
]

// Telas que ficam sempre visíveis, mesmo com permissões restritas: Dashboard
// (é a home depois do login) e Usuários (senão quem tem permissão de gerenciar
// a equipe pode se trancar pra fora da própria tela de gerenciar permissões).
const SEMPRE_VISIVEL = new Set(['usuarios'])

// Telas que um gerente pode liberar/restringir para outro usuário da loja.
export const TELAS_CONFIGURAVEIS: { grupo: string; itens: { key: string; label: string }[] }[] = [
  ...NAV_GRUPOS.map(g => ({ grupo: g.label, itens: g.items.filter(i => !SEMPRE_VISIVEL.has(i.to.slice(1))).map(i => ({ key: i.to.slice(1), label: i.label })) })),
  { grupo: 'Outros', itens: NAV_RODAPE.map(i => ({ key: i.to.slice(1), label: i.label })) },
].filter(g => g.itens.length > 0)

function NavItem({ to, icon: Icon, label }: { to: string; icon: typeof LayoutDashboard; label: string }) {
  return (
    <NavLink to={to} style={{ display: 'block', marginBottom: '2px' }}>
      {({ isActive }) => (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '10px 12px',
            borderRadius: '8px',
            color: isActive ? '#FFFFFF' : '#666666',
            background: isActive ? 'rgba(255,255,255,0.07)' : 'transparent',
            fontSize: '13px',
            fontWeight: isActive ? 500 : 400,
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
          onMouseEnter={e => {
            if (!isActive) {
              (e.currentTarget as HTMLDivElement).style.color = '#A3A3A3'
              ;(e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.04)'
            }
          }}
          onMouseLeave={e => {
            if (!isActive) {
              (e.currentTarget as HTMLDivElement).style.color = '#666666'
              ;(e.currentTarget as HTMLDivElement).style.background = 'transparent'
            }
          }}
        >
          <Icon size={15} strokeWidth={isActive ? 2.2 : 1.75} style={{ flexShrink: 0 }} />
          <span style={{ flex: 1 }}>{label}</span>
          {isActive && (
            <div style={{ width: '4px', height: '4px', borderRadius: '50%', background: '#FFFFFF', flexShrink: 0 }} />
          )}
        </div>
      )}
    </NavLink>
  )
}

function NavGroup({ label, icon: Icon, items, defaultOpen }: { label: string; icon: typeof LayoutDashboard; items: NavItemDef[]; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div style={{ marginBottom: '2px' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: '10px', width: '100%',
          padding: '10px 12px',
          borderRadius: '8px',
          border: 'none',
          background: 'transparent',
          color: '#8A8A8A',
          fontSize: '11px',
          fontWeight: 600,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          cursor: 'pointer',
          fontFamily: 'inherit',
        }}
      >
        <Icon size={14} strokeWidth={1.9} style={{ flexShrink: 0 }} />
        <span style={{ flex: 1, textAlign: 'left' }}>{label}</span>
        <ChevronDown size={13} style={{ flexShrink: 0, transform: open ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 0.15s ease' }} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: [0.25, 0.46, 0.45, 0.94] }}
            style={{ overflow: 'hidden' }}
          >
            <div style={{ padding: '2px 0 4px' }}>
              {items.map(item => <NavItem key={item.to} {...item} />)}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default function Sidebar({ hidden }: { hidden: boolean }) {
  const { user, signOut } = useAuth()
  const { papel, telasPermitidas } = usePerfil()
  const navigate = useNavigate()
  const location = useLocation()
  const name = user?.email?.split('@')[0] ?? 'Usuário'
  const ini = initials(name)
  const isSuperAdmin = papel === 'super_admin'

  const liberada = (to: string) => SEMPRE_VISIVEL.has(to.slice(1)) || !telasPermitidas || telasPermitidas.includes(to.slice(1))
  const navGruposVisiveis = NAV_GRUPOS
    .map(g => ({ ...g, items: g.items.filter(i => liberada(i.to)) }))
    .filter(g => g.items.length > 0)
  const navRodapeVisivel = NAV_RODAPE.filter(i => liberada(i.to))

  async function handleSignOut() {
    await signOut()
    navigate('/login')
  }

  return (
    <motion.aside
      className="app-sidebar"
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        background: '#111111',
        borderRight: hidden ? 'none' : '1px solid #1F1F1F',
        flexShrink: 0,
        overflow: 'hidden',
      }}
      initial={false}
      animate={{ width: hidden ? 0 : 220, opacity: hidden ? 0 : 1 }}
      transition={{ duration: 0.22, ease: [0.25, 0.46, 0.45, 0.94] }}
    >
      {/* Logo */}
      <div style={{
        height: '64px',
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        padding: '0 20px',
        borderBottom: '1px solid #1F1F1F',
        flexShrink: 0,
      }}>
        <img
          src={`${import.meta.env.BASE_URL}logo.png`}
          alt="Logo"
          style={{
            width: '32px',
            height: '32px',
            objectFit: 'contain',
            flexShrink: 0,
          }}
        />
        <span style={{ fontSize: '13px', fontWeight: 600, color: '#FFFFFF', letterSpacing: '-0.01em' }}>
          Noir ERP
        </span>
        <span style={{
          marginLeft: 'auto',
          fontSize: '9px',
          fontWeight: 700,
          padding: '2px 6px',
          borderRadius: '4px',
          background: 'rgba(255,255,255,0.08)',
          color: '#A3A3A3',
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
        }}>
          ERP
        </span>
      </div>

      {/* Navigation */}
      <nav style={{ flex: 1, padding: '16px 8px', overflowY: 'auto' }}>
        {isSuperAdmin ? (
          NAV_SUPER_ADMIN.map(item => <NavItem key={item.to} {...item} />)
        ) : (
          <>
            {NAV_TOPO.map(item => <NavItem key={item.to} {...item} />)}
            <div style={{ height: '10px' }} />
            {navGruposVisiveis.map(grupo => (
              <NavGroup
                key={grupo.label}
                label={grupo.label}
                icon={grupo.icon}
                items={grupo.items}
                defaultOpen={grupo.items.some(i => location.pathname.startsWith(i.to))}
              />
            ))}
            <div style={{ height: '10px' }} />
            {navRodapeVisivel.map(item => <NavItem key={item.to} {...item} />)}
          </>
        )}
      </nav>

      {/* User */}
      <div style={{ padding: '12px 8px 16px', borderTop: '1px solid #1F1F1F', flexShrink: 0 }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          padding: '10px 12px',
          borderRadius: '8px',
          cursor: 'pointer',
        }}>
          <div style={{
            width: '30px', height: '30px',
            borderRadius: '50%',
            background: '#262626',
            border: '1px solid #333',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '11px',
            fontWeight: 700,
            color: '#A3A3A3',
            flexShrink: 0,
          }}>
            {ini}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: '12px', fontWeight: 500, color: '#FFFFFF', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {name}
            </p>
            <p style={{ fontSize: '10px', color: '#444' }}>{papel ? PAPEL_LABEL[papel] : '—'}</p>
          </div>
          <button
            onClick={handleSignOut}
            title="Sair"
            style={{
              width: '26px', height: '26px',
              border: 'none',
              background: 'transparent',
              color: '#444',
              cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              borderRadius: '6px',
              transition: 'all 0.15s ease',
              flexShrink: 0,
            }}
            onMouseEnter={e => {
              (e.currentTarget).style.background = 'rgba(255,255,255,0.06)'
              ;(e.currentTarget).style.color = '#A3A3A3'
            }}
            onMouseLeave={e => {
              (e.currentTarget).style.background = 'transparent'
              ;(e.currentTarget).style.color = '#444'
            }}
          >
            <LogOut size={13} />
          </button>
        </div>
      </div>
    </motion.aside>
  )
}
