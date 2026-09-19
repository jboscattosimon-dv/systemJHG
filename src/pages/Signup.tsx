import { useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowRight, CheckCircle2 } from 'lucide-react'
import { supabase } from '../lib/supabase'

export default function Signup() {
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [confirmar, setConfirmar] = useState('')
  const [erro, setErro] = useState('')
  const [loading, setLoading] = useState(false)
  const [feito, setFeito] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErro('')
    if (senha.length < 6) { setErro('A senha precisa ter pelo menos 6 caracteres.'); return }
    if (senha !== confirmar) { setErro('As senhas não coincidem.'); return }
    setLoading(true)
    const { error } = await supabase.auth.signUp({ email, password: senha })
    setLoading(false)
    if (error) { setErro(error.message); return }
    setFeito(true)
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0D0D0D', padding: '20px' }}>
      <motion.div
        className="card"
        style={{ width: '100%', maxWidth: '380px', padding: '32px' }}
        initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
      >
        {feito ? (
          <div style={{ textAlign: 'center' }}>
            <CheckCircle2 size={32} style={{ color: '#FFFFFF', margin: '0 auto 16px' }} />
            <h1 style={{ fontSize: '18px', color: '#FFFFFF', marginBottom: '10px' }}>Conta criada!</h1>
            <p style={{ fontSize: '13px', color: '#A3A3A3', lineHeight: 1.5 }}>
              Agora é só aguardar o administrador vincular seu acesso a uma loja. Você recebe um aviso quando estiver liberado.
            </p>
            <Link to="/login" className="btn btn-primary btn-full" style={{ marginTop: '20px', display: 'block', textAlign: 'center' }}>
              Ir para o login
            </Link>
          </div>
        ) : (
          <>
            <h1 style={{ fontSize: '20px', color: '#FFFFFF', marginBottom: '4px' }}>Criar conta</h1>
            <p style={{ fontSize: '13px', color: '#555', marginBottom: '24px' }}>Depois de criar, um administrador vincula você a uma loja.</p>
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div className="field">
                <label className="label">E-mail</label>
                <input className="input" type="email" placeholder="seu@email.com" value={email} onChange={e => setEmail(e.target.value)} required />
              </div>
              <div className="field">
                <label className="label">Senha</label>
                <input className="input" type="password" placeholder="mínimo 6 caracteres" value={senha} onChange={e => setSenha(e.target.value)} required />
              </div>
              <div className="field">
                <label className="label">Confirmar senha</label>
                <input className="input" type="password" placeholder="repita a senha" value={confirmar} onChange={e => setConfirmar(e.target.value)} required />
              </div>
              {erro && <p style={{ fontSize: '12px', color: '#666' }}>{erro}</p>}
              <button type="submit" className="btn btn-primary btn-full" disabled={loading} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                {loading ? 'Criando...' : 'Criar conta'} {!loading && <ArrowRight size={14} />}
              </button>
            </form>
            <p style={{ fontSize: '12px', color: '#555', textAlign: 'center', marginTop: '18px' }}>
              Já tem conta? <Link to="/login" style={{ color: '#FFFFFF' }}>Entrar</Link>
            </p>
          </>
        )}
      </motion.div>
    </div>
  )
}
