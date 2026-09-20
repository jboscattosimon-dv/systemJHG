import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './hooks/useAuth'
import { usePerfil } from './hooks/usePerfil'
import { useVersaoDisponivel } from './hooks/useVersaoDisponivel'
import AppLayout from './components/layout/AppLayout'
import Login from './pages/Login'
import Signup from './pages/Signup'
import Empresas from './pages/Empresas'
import EmpresaDetalhe from './pages/EmpresaDetalhe'
import Dashboard from './pages/Dashboard'
import Agenda from './pages/Agenda'
import Vendas from './pages/Vendas'
import Condicionais from './pages/Condicionais'
import Caixa from './pages/Caixa'
import Clientes from './pages/Clientes'
import Profissionais from './pages/Profissionais'
import Produtos from './pages/Produtos'
import Fornecedores from './pages/Fornecedores'
import ContasPagar from './pages/ContasPagar'
import ContasReceber from './pages/ContasReceber'
import Comissoes from './pages/Comissoes'
import DRE from './pages/DRE'
import Relatorios from './pages/Relatorios'
import Auditoria from './pages/Auditoria'
import Configuracoes from './pages/Configuracoes'
import Usuarios from './pages/Usuarios'
import Financeiro from './pages/Financeiro'
import Categorias from './pages/Categorias'

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth()
  if (loading) return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: '#000000',
    }}>
      <div style={{
        width: '18px', height: '18px',
        border: '2px solid #222',
        borderTopColor: '#FFFFFF',
        borderRadius: '50%',
        animation: 'spin 0.75s linear infinite',
      }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
  return session ? <>{children}</> : <Navigate to="/login" replace />
}

// Dashboard e Usuários sempre acessíveis (mesma trava do menu — ver Sidebar.tsx).
function TelaPermitida({ tela, children }: { tela: string; children: React.ReactNode }) {
  const { telasPermitidas, loading } = usePerfil()
  if (loading) return null
  if (telasPermitidas && !telasPermitidas.includes(tela)) return <Navigate to="/dashboard" replace />
  return <>{children}</>
}

// Avisa quando saiu um deploy novo enquanto o app estava aberto (ou em
// cache — comum no "Adicionar à Tela de Início" do Safari).
function BannerAtualizacao() {
  const disponivel = useVersaoDisponivel()
  if (!disponivel) return null
  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 9999,
      background: '#FFFFFF', color: '#000000',
      padding: '10px 16px',
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '14px',
      flexWrap: 'wrap',
      fontSize: '13px', fontFamily: 'DM Sans, sans-serif',
      boxShadow: '0 2px 12px rgba(0,0,0,0.4)',
    }}>
      <span style={{ fontWeight: 600 }}>Uma versão nova do sistema está disponível.</span>
      <button
        onClick={() => {
          // location.reload() nem sempre ignora o cache (especialmente no modo
          // "Tela de Início" do Safari) — troca a URL pra forçar buscar de verdade.
          const url = new URL(window.location.href)
          url.searchParams.set('_v', Date.now().toString())
          window.location.href = url.toString()
        }}
        style={{
          padding: '5px 14px', borderRadius: '99px', border: 'none',
          background: '#000000', color: '#FFFFFF', fontSize: '12px', fontWeight: 600,
          cursor: 'pointer', fontFamily: 'inherit',
        }}
      >
        Atualizar agora
      </button>
    </div>
  )
}

export default function App() {
  // Limpa o "?_v=..." que o botão de atualizar usa pra forçar buscar
  // a versão nova sem cache — some da barra de endereço depois de carregar.
  useEffect(() => {
    const url = new URL(window.location.href)
    if (url.searchParams.has('_v')) {
      url.searchParams.delete('_v')
      window.history.replaceState(null, '', url.toString())
    }
  }, [])

  return (
    <>
      <BannerAtualizacao />
      <BrowserRouter basename={import.meta.env.BASE_URL}>
        <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/cadastro" element={<Signup />} />
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/pdv" element={<Navigate to="/vendas" replace />} />
        <Route element={<PrivateRoute><AppLayout /></PrivateRoute>}>
          <Route path="/empresas"      element={<Empresas />} />
          <Route path="/empresas/:id"  element={<EmpresaDetalhe />} />
          <Route path="/dashboard"     element={<Dashboard />} />
          <Route path="/agenda"        element={<TelaPermitida tela="agenda"><Agenda /></TelaPermitida>} />
          <Route path="/vendas"        element={<TelaPermitida tela="vendas"><Vendas /></TelaPermitida>} />
          <Route path="/condicional"   element={<TelaPermitida tela="condicional"><Condicionais /></TelaPermitida>} />
          <Route path="/caixa"         element={<TelaPermitida tela="caixa"><Caixa /></TelaPermitida>} />
          <Route path="/clientes"      element={<TelaPermitida tela="clientes"><Clientes /></TelaPermitida>} />
          <Route path="/profissionais" element={<TelaPermitida tela="profissionais"><Profissionais /></TelaPermitida>} />
          <Route path="/produtos"      element={<TelaPermitida tela="produtos"><Produtos /></TelaPermitida>} />
          <Route path="/fornecedores"  element={<TelaPermitida tela="fornecedores"><Fornecedores /></TelaPermitida>} />
          <Route path="/financeiro"    element={<TelaPermitida tela="financeiro"><Financeiro /></TelaPermitida>} />
          <Route path="/categorias"    element={<TelaPermitida tela="categorias"><Categorias /></TelaPermitida>} />
          <Route path="/contas-pagar"   element={<TelaPermitida tela="contas-pagar"><ContasPagar /></TelaPermitida>} />
          <Route path="/contas-receber" element={<TelaPermitida tela="contas-receber"><ContasReceber /></TelaPermitida>} />
          <Route path="/comissoes"     element={<TelaPermitida tela="comissoes"><Comissoes /></TelaPermitida>} />
          <Route path="/dre"           element={<TelaPermitida tela="dre"><DRE /></TelaPermitida>} />
          <Route path="/relatorios"    element={<TelaPermitida tela="relatorios"><Relatorios /></TelaPermitida>} />
          <Route path="/auditoria"     element={<TelaPermitida tela="auditoria"><Auditoria /></TelaPermitida>} />
          <Route path="/configuracoes" element={<TelaPermitida tela="configuracoes"><Configuracoes /></TelaPermitida>} />
          <Route path="/usuarios"      element={<Usuarios />} />
        </Route>
        </Routes>
      </BrowserRouter>
    </>
  )
}
