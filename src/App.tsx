import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './hooks/useAuth'
import AppLayout from './components/layout/AppLayout'
import Login from './pages/Login'
import Signup from './pages/Signup'
import Empresas from './pages/Empresas'
import EmpresaDetalhe from './pages/EmpresaDetalhe'
import Dashboard from './pages/Dashboard'
import Agenda from './pages/Agenda'
import PDV from './pages/PDV'
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

export default function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/cadastro" element={<Signup />} />
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route element={<PrivateRoute><AppLayout /></PrivateRoute>}>
          <Route path="/empresas"      element={<Empresas />} />
          <Route path="/empresas/:id"  element={<EmpresaDetalhe />} />
          <Route path="/dashboard"     element={<Dashboard />} />
          <Route path="/agenda"        element={<Agenda />} />
          <Route path="/pdv"           element={<PDV />} />
          <Route path="/condicional"   element={<Condicionais />} />
          <Route path="/caixa"         element={<Caixa />} />
          <Route path="/clientes"      element={<Clientes />} />
          <Route path="/profissionais" element={<Profissionais />} />
          <Route path="/produtos"      element={<Produtos />} />
          <Route path="/fornecedores"  element={<Fornecedores />} />
          <Route path="/financeiro"    element={<Financeiro />} />
          <Route path="/categorias"    element={<Categorias />} />
          <Route path="/contas-pagar"   element={<ContasPagar />} />
          <Route path="/contas-receber" element={<ContasReceber />} />
          <Route path="/comissoes"     element={<Comissoes />} />
          <Route path="/dre"           element={<DRE />} />
          <Route path="/relatorios"    element={<Relatorios />} />
          <Route path="/auditoria"     element={<Auditoria />} />
          <Route path="/configuracoes" element={<Configuracoes />} />
          <Route path="/usuarios"      element={<Usuarios />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
