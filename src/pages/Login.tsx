import { useState, useRef } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Eye, EyeOff, ArrowRight } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'

const ease = [0.22, 1, 0.36, 1] as const

export default function Login() {
  const [email, setEmail]   = useState('')
  const [senha, setSenha]   = useState('')
  const [erro, setErro]     = useState('')
  const [loading, setLoading] = useState(false)
  const [showSenha, setShowSenha] = useState(false)
  const { signIn } = useAuth()
  const navigate   = useNavigate()
  const rootRef    = useRef<HTMLDivElement>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErro(''); setLoading(true)
    const { error } = await signIn(email, senha)
    if (error) {
      setErro(error.message === 'Invalid login credentials' ? 'E-mail ou senha incorretos.' : error.message)
    } else {
      navigate('/dashboard')
    }
    setLoading(false)
  }

  // Spotlight que segue o mouse
  function handleMouse(e: React.MouseEvent<HTMLDivElement>) {
    const el = rootRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    el.style.setProperty('--mx', `${e.clientX - r.left}px`)
    el.style.setProperty('--my', `${e.clientY - r.top}px`)
  }

  return (
    <div ref={rootRef} className="login-root" onMouseMove={handleMouse}>
      <ScopedStyles />

      {/* ─── Camadas de fundo ─────────────────────────── */}
      <div className="login-grid" />
      <div className="login-spotlight" />

      <motion.div
        className="login-orb login-orb-1"
        animate={{ x: [0, 60, -20, 0], y: [0, -40, 30, 0] }}
        transition={{ duration: 18, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="login-orb login-orb-2"
        animate={{ x: [0, -50, 30, 0], y: [0, 40, -20, 0] }}
        transition={{ duration: 22, repeat: Infinity, ease: 'easeInOut' }}
      />

      <div className="login-vignette" />

      {/* ─── Conteúdo ─────────────────────────────────── */}
      <motion.div
        className="login-stack"
        initial="hidden"
        animate="show"
        variants={{
          hidden: {},
          show: { transition: { staggerChildren: 0.09, delayChildren: 0.1 } },
        }}
      >
        {/* Logo */}
        <motion.div
          className="login-head"
          variants={{ hidden: { opacity: 0, y: 18 }, show: { opacity: 1, y: 0, transition: { duration: 0.6, ease } } }}
        >
          <div className="login-logo">
            <span className="login-logo-ring" />
            <img src={`${import.meta.env.BASE_URL}logo.png`} alt="Logo" style={{ width: '100px', height: '100px', objectFit: 'contain' }} />
          </div>
          <h1 className="login-title">BarberOS</h1>
          <p className="login-sub">
            <span className="login-dot" /> Sistema de gestão
          </p>
        </motion.div>

        {/* Card */}
        <motion.div
          className="login-card-wrap"
          variants={{ hidden: { opacity: 0, y: 24 }, show: { opacity: 1, y: 0, transition: { duration: 0.7, ease } } }}
        >
          <span className="login-card-glow" />
          <div className="login-card">
            <form onSubmit={handleSubmit} className="login-form">
              <div className="field">
                <label className="label">E-mail</label>
                <input
                  className="login-input"
                  type="email"
                  placeholder="seu@email.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                />
              </div>

              <div className="field">
                <label className="label">Senha</label>
                <div style={{ position: 'relative' }}>
                  <input
                    className="login-input"
                    type={showSenha ? 'text' : 'password'}
                    placeholder="••••••••"
                    value={senha}
                    onChange={e => setSenha(e.target.value)}
                    required
                    autoComplete="current-password"
                    style={{ paddingRight: '46px' }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowSenha(s => !s)}
                    className="login-eye"
                    aria-label={showSenha ? 'Ocultar senha' : 'Mostrar senha'}
                  >
                    {showSenha ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>

              {erro && (
                <motion.p
                  className="login-error"
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  {erro}
                </motion.p>
              )}

              <button type="submit" className="login-btn" disabled={loading}>
                <span className="login-btn-shimmer" />
                <span className="login-btn-label">
                  {loading ? 'Entrando…' : 'Entrar'}
                  {!loading && <ArrowRight size={16} />}
                </span>
              </button>
            </form>
          </div>
        </motion.div>

        <motion.p
          style={{ textAlign: 'center', fontSize: '13px', color: '#777', marginTop: '22px' }}
          variants={{ hidden: { opacity: 0 }, show: { opacity: 1, transition: { duration: 0.6 } } }}
        >
          Não tem conta? <Link to="/cadastro" style={{ color: '#FFFFFF' }}>Criar conta</Link>
        </motion.p>

        <motion.p
          className="login-foot"
          variants={{ hidden: { opacity: 0 }, show: { opacity: 1, transition: { duration: 0.6 } } }}
        >
          BarberOS ERP © {new Date().getFullYear()}
        </motion.p>
      </motion.div>
    </div>
  )
}

/* ============================================================
   Estilos scoped — pegada tech, monocromático preto
   ============================================================ */
function ScopedStyles() {
  return (
    <style>{`
      .login-root {
        position: relative;
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 24px;
        background: #060606;
        overflow: hidden;
        --mx: 50%;
        --my: 30%;
      }

      /* Grid em perspectiva, deslizando lentamente */
      .login-grid {
        position: absolute;
        inset: -50%;
        background-image:
          linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px),
          linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px);
        background-size: 46px 46px;
        mask-image: radial-gradient(ellipse 60% 60% at 50% 40%, #000 30%, transparent 75%);
        -webkit-mask-image: radial-gradient(ellipse 60% 60% at 50% 40%, #000 30%, transparent 75%);
        animation: login-pan 24s linear infinite;
      }
      @keyframes login-pan {
        from { background-position: 0 0; }
        to   { background-position: 46px 46px; }
      }

      /* Spotlight que segue o cursor */
      .login-spotlight {
        position: absolute;
        inset: 0;
        background: radial-gradient(360px circle at var(--mx) var(--my),
          rgba(255,255,255,0.07), transparent 70%);
        pointer-events: none;
        transition: background 0.12s ease-out;
      }

      /* Orbs de brilho */
      .login-orb {
        position: absolute;
        border-radius: 50%;
        filter: blur(90px);
        pointer-events: none;
      }
      .login-orb-1 {
        width: 420px; height: 420px;
        top: -120px; left: -80px;
        background: radial-gradient(circle, rgba(255,255,255,0.12), transparent 70%);
      }
      .login-orb-2 {
        width: 380px; height: 380px;
        bottom: -140px; right: -100px;
        background: radial-gradient(circle, rgba(255,255,255,0.08), transparent 70%);
      }

      .login-vignette {
        position: absolute;
        inset: 0;
        background: radial-gradient(ellipse 80% 80% at 50% 50%, transparent 40%, rgba(0,0,0,0.7));
        pointer-events: none;
      }

      .login-stack {
        position: relative;
        z-index: 2;
        width: 100%;
        max-width: 390px;
      }

      /* ── Cabeçalho / logo ── */
      .login-head { text-align: center; margin-bottom: 36px; }
      .login-logo {
        position: relative;
        width: 110px; height: 110px;
        margin: 0 auto 18px;
        background: transparent;
        display: flex; align-items: center; justify-content: center;
      }
      .login-logo-ring {
        position: absolute;
        inset: -6px;
        border-radius: 20px;
        border: 1px solid rgba(255,255,255,0.18);
        animation: login-pulse 3s ease-in-out infinite;
      }
      @keyframes login-pulse {
        0%, 100% { transform: scale(1);   opacity: 0.6; }
        50%      { transform: scale(1.12); opacity: 0; }
      }
      .login-title {
        font-family: 'Playfair Display', serif;
        font-size: 26px; font-weight: 600;
        color: #FFFFFF; line-height: 1.1; margin-bottom: 10px;
        letter-spacing: -0.01em;
      }
      .login-sub {
        display: inline-flex; align-items: center; gap: 7px;
        font-size: 12.5px; color: #777;
        text-transform: uppercase; letter-spacing: 0.14em;
      }
      .login-dot {
        width: 6px; height: 6px; border-radius: 50%;
        background: #4ade80;
        box-shadow: 0 0 8px #4ade80;
        animation: login-blink 2s ease-in-out infinite;
      }
      @keyframes login-blink { 0%,100% { opacity: 1; } 50% { opacity: 0.3; } }

      /* ── Card glass com borda em glow rotativo ── */
      .login-card-wrap { position: relative; }
      .login-card-glow {
        position: absolute;
        inset: -1px;
        border-radius: 18px;
        background: conic-gradient(from 0deg,
          transparent, rgba(255,255,255,0.5), transparent 30%);
        animation: login-spin 6s linear infinite;
        opacity: 0.5;
      }
      @keyframes login-spin { to { transform: rotate(360deg); } }

      .login-card {
        position: relative;
        background: rgba(20,20,20,0.72);
        backdrop-filter: blur(16px);
        -webkit-backdrop-filter: blur(16px);
        border: 1px solid rgba(255,255,255,0.08);
        border-radius: 17px;
        padding: 34px;
      }
      .login-form { display: flex; flex-direction: column; gap: 18px; }

      .login-input {
        width: 100%;
        padding: 13px 15px;
        background: rgba(255,255,255,0.03);
        border: 1px solid rgba(255,255,255,0.1);
        border-radius: 10px;
        color: #fff;
        font-family: 'DM Sans', sans-serif;
        font-size: 14px;
        min-height: 46px;
        outline: none;
        transition: border-color 0.2s ease, box-shadow 0.2s ease, background 0.2s ease;
      }
      .login-input::placeholder { color: #555; }
      .login-input:focus {
        border-color: rgba(255,255,255,0.35);
        background: rgba(255,255,255,0.05);
        box-shadow: 0 0 0 3px rgba(255,255,255,0.06);
      }

      .login-eye {
        position: absolute; right: 13px; top: 50%;
        transform: translateY(-50%);
        background: none; border: none; cursor: pointer;
        color: #666; display: flex; align-items: center;
        transition: color 0.18s ease;
      }
      .login-eye:hover { color: #fff; }

      .login-error {
        font-size: 13px; color: #f87171;
        text-align: center; padding: 11px;
        background: rgba(248,113,113,0.08);
        border: 1px solid rgba(248,113,113,0.2);
        border-radius: 9px;
      }

      /* ── Botão com shimmer ── */
      .login-btn {
        position: relative;
        margin-top: 6px;
        width: 100%;
        min-height: 48px;
        border: none; cursor: pointer;
        border-radius: 11px;
        background: #FFFFFF;
        color: #0D0D0D;
        font-family: 'DM Sans', sans-serif;
        font-weight: 600; font-size: 14.5px;
        overflow: hidden;
        transition: transform 0.18s ease, box-shadow 0.18s ease;
      }
      .login-btn:hover:not(:disabled) {
        transform: translateY(-1px);
        box-shadow: 0 8px 28px rgba(255,255,255,0.22);
      }
      .login-btn:active:not(:disabled) { transform: translateY(0); }
      .login-btn:disabled { opacity: 0.45; cursor: not-allowed; }
      .login-btn-label {
        position: relative; z-index: 2;
        display: inline-flex; align-items: center; gap: 8px;
      }
      .login-btn-shimmer {
        position: absolute; top: 0; left: -120%;
        width: 60%; height: 100%;
        background: linear-gradient(120deg, transparent, rgba(13,13,13,0.18), transparent);
        animation: login-shimmer 2.6s ease-in-out infinite;
      }
      @keyframes login-shimmer {
        0%   { left: -120%; }
        60%, 100% { left: 160%; }
      }

      .login-foot {
        text-align: center; font-size: 12px;
        color: #3a3a3a; margin-top: 26px;
        letter-spacing: 0.03em;
      }

      @media (prefers-reduced-motion: reduce) {
        .login-grid, .login-orb, .login-card-glow,
        .login-btn-shimmer, .login-logo-ring, .login-dot { animation: none !important; }
      }
    `}</style>
  )
}
