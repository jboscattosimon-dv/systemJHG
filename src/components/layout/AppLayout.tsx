import { useState, useEffect } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import type { HeaderBuscaContexto } from '../../hooks/useHeaderBusca'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronRight, Bell, Search, PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import Sidebar from './Sidebar'
import { usePerfil } from '../../hooks/usePerfil'

const SIDEBAR_KEY = 'barberos-sidebar-hidden'

const PAGE_NAMES: Record<string, string> = {
  '/empresas':      'Empresas',
  '/dashboard':     'Dashboard',
  '/agenda':        'Agenda',
  '/vendas':        'Vendas',
  '/condicional':   'Condicional',
  '/caixa':         'Caixa',
  '/clientes':      'Clientes',
  '/profissionais': 'Profissionais',
  '/produtos':      'Produtos',
  '/fornecedores':  'Fornecedores',
  '/financeiro':    'Financeiro',
  '/categorias':    'Categorias',
  '/contas-pagar':   'Contas a Pagar',
  '/contas-receber': 'Contas a Receber',
  '/comissoes':     'Comissões',
  '/dre':           'DRE',
  '/relatorios':    'Relatórios',
  '/auditoria':     'Auditoria',
  '/usuarios':      'Usuários',
  '/configuracoes': 'Configurações',
}

export default function AppLayout() {
  const location = useLocation()
  const navigate = useNavigate()
  const pageName = PAGE_NAMES[location.pathname] ?? ''
  const { papel, empresaId, loading: perfilLoading } = usePerfil()
  const [sidebarHidden, setSidebarHidden] = useState(() => {
    if (typeof window !== 'undefined' && window.innerWidth < 768) return true
    try { return localStorage.getItem(SIDEBAR_KEY) === '1' } catch { return false }
  })
  const [headerBusca, setHeaderBusca] = useState('')

  const semLoja = !perfilLoading && papel !== null && papel !== 'super_admin' && !empresaId && location.pathname !== '/empresas'
  // A busca do cabeçalho só faz sentido (por enquanto) na tela de Produtos —
  // só aparece lá, pra não parecer que busca em qualquer tela sem fazer nada.
  const buscaAtiva = location.pathname === '/produtos'

  useEffect(() => {
    if (window.innerWidth < 768) setSidebarHidden(true)
    setHeaderBusca('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname])

  function toggleSidebar() {
    setSidebarHidden(prev => {
      const next = !prev
      try { localStorage.setItem(SIDEBAR_KEY, next ? '1' : '0') } catch { /* ignore */ }
      return next
    })
  }

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: '#000000' }}>
      <Sidebar hidden={sidebarHidden} />
      {!sidebarHidden && <div className="mobile-sidebar-backdrop" onClick={toggleSidebar} />}

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
        {/* Header */}
        <div className="app-header" style={{
          height: '64px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 36px',
          background: '#000000',
          borderBottom: '1px solid #1F1F1F',
          flexShrink: 0,
        }}>
          {/* Breadcrumb */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              className={`sidebar-toggle-btn${sidebarHidden ? '' : ' sidebar-open'}`}
              onClick={toggleSidebar}
              title={sidebarHidden ? 'Mostrar menu' : 'Esconder menu'}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: '28px', height: '28px',
                background: 'transparent', border: '1px solid #252525', borderRadius: '6px',
                color: '#666', cursor: 'pointer', marginRight: '4px',
              }}
            >
              {sidebarHidden ? <PanelLeftOpen size={14} /> : <PanelLeftClose size={14} />}
            </button>
            <span
              onClick={() => navigate('/dashboard')}
              style={{ fontSize: '12px', color: '#3D3D3D', cursor: 'pointer' }}
            >
              Noir ERP
            </span>
            {pageName && (
              <>
                <ChevronRight size={12} style={{ color: '#2A2A2A' }} />
                <span style={{ fontSize: '12px', color: '#A3A3A3', fontWeight: 500 }}>{pageName}</span>
              </>
            )}
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {/* Search */}
            {buscaAtiva && (
              <div className="app-header-search" style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '7px 12px',
                background: '#1A1A1A',
                border: '1px solid #252525',
                borderRadius: '8px',
                cursor: 'text',
              }}>
                <Search size={12} style={{ color: '#444' }} />
                <input
                  type="text"
                  placeholder="Buscar produto..."
                  value={headerBusca}
                  onChange={e => setHeaderBusca(e.target.value)}
                  autoComplete="off"
                  style={{
                    background: 'transparent',
                    border: 'none',
                    outline: 'none',
                    fontSize: '12px',
                    color: '#A3A3A3',
                    width: '130px',
                    fontFamily: 'inherit',
                  }}
                />
              </div>
            )}

            {/* Notifications */}
            <button style={{
              width: '34px', height: '34px',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: '#1A1A1A',
              border: '1px solid #252525',
              borderRadius: '8px',
              cursor: 'pointer',
              color: '#555',
              position: 'relative',
              transition: 'all 0.15s ease',
            }}>
              <Bell size={13} />
              <span style={{
                position: 'absolute',
                top: '8px', right: '8px',
                width: '5px', height: '5px',
                background: '#FFFFFF',
                borderRadius: '50%',
              }} />
            </button>
          </div>
        </div>

        {/* Busca (mobile) — o cabeçalho esconde a busca ali de cima no mobile
            por falta de espaço, então essa linha aparece só lá embaixo dele
            quando a busca está ativa pra essa tela. */}
        {buscaAtiva && (
          <div className="mobile-search-row" style={{
            alignItems: 'center', gap: '8px',
            padding: '10px 14px',
            background: '#1A1A1A',
            borderBottom: '1px solid #1F1F1F',
            flexShrink: 0,
          }}>
            <Search size={13} style={{ color: '#444', flexShrink: 0 }} />
            <input
              type="text"
              placeholder="Buscar produto..."
              value={headerBusca}
              onChange={e => setHeaderBusca(e.target.value)}
              autoComplete="off"
              style={{
                flex: 1, background: 'transparent', border: 'none', outline: 'none',
                fontSize: '13px', color: '#A3A3A3', fontFamily: 'inherit',
              }}
            />
          </div>
        )}

        {/* Page content */}
        <AnimatePresence mode="wait">
          <motion.main
            key={location.pathname}
            style={{ flex: 1, overflowY: 'auto' }}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
          >
            {perfilLoading ? (
              <div style={{ padding: '56px', textAlign: 'center', color: '#444', fontSize: '13px' }}>Carregando...</div>
            ) : semLoja ? (
              <div style={{ padding: '80px 40px', textAlign: 'center', maxWidth: '440px', margin: '0 auto' }}>
                <h2 style={{ fontSize: '18px', color: '#FFFFFF', marginBottom: '10px' }}>Aguardando vínculo com uma loja</h2>
                <p style={{ fontSize: '13px', color: '#A3A3A3', lineHeight: 1.6 }}>
                  Sua conta foi criada, mas ainda não está vinculada a nenhuma loja. Peça para um administrador te vincular em Usuários.
                </p>
              </div>
            ) : (
              <Outlet context={{ headerBusca, setHeaderBusca } satisfies HeaderBuscaContexto} />
            )}
          </motion.main>
        </AnimatePresence>
      </div>
    </div>
  )
}
