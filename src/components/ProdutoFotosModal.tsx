import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Plus, Trash2, Star, Package } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useModalKeyboard } from '../hooks/useModalKeyboard'
import { usePerfil } from '../hooks/usePerfil'
import type { Produto } from '../types'

interface Foto { id: string; url: string }

// Bucket "produtos" (público) guarda os arquivos; produto_fotos guarda
// a galeria. A "capa" (o que aparece nas miniaturas em todo o resto do
// sistema) é sempre produtos.foto_url — aqui é onde ela é decidida e
// mantida sincronizada.
function caminhoNaStorage(url: string): string | null {
  const marcador = '/storage/v1/object/public/produtos/'
  const idx = url.indexOf(marcador)
  return idx === -1 ? null : url.slice(idx + marcador.length)
}

export default function ProdutoFotosModal({ produto, onClose, onChange }: {
  produto: Produto
  onClose: () => void
  onChange: () => void
}) {
  const { empresaId, papel } = usePerfil()
  const souAtendente = papel === 'atendente'
  const [fotos, setFotos] = useState<Foto[]>([])
  const [capaUrl, setCapaUrl] = useState<string | null>(produto.foto_url ?? null)
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [ampliada, setAmpliada] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  function carregar() {
    setLoading(true)
    supabase.from('produto_fotos').select('id, url').eq('produto_id', produto.id).order('criado_em')
      .then(({ data }) => { setFotos((data ?? []) as Foto[]); setLoading(false) })
  }

  useEffect(() => { carregar() }, [produto.id])

  async function atualizarCapa(novaUrl: string | null) {
    setCapaUrl(novaUrl)
    await supabase.from('produtos').update({ foto_url: novaUrl }).eq('id', produto.id)
    onChange()
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const arquivo = e.target.files?.[0]
    e.target.value = ''
    if (!arquivo) return
    if (!arquivo.type.startsWith('image/')) { setError('Escolha um arquivo de imagem.'); return }
    if (arquivo.size > 5 * 1024 * 1024) { setError('Imagem muito grande (máx. 5MB).'); return }
    if (!empresaId) { setError('Sua loja ainda não foi identificada. Recarregue a página e tente de novo.'); return }

    setUploading(true); setError('')
    const ext = arquivo.name.split('.').pop()?.toLowerCase() || 'jpg'
    const caminho = `${empresaId}/${crypto.randomUUID()}.${ext}`
    const { error: uploadErr } = await supabase.storage.from('produtos').upload(caminho, arquivo)
    if (uploadErr) { setError(`Falha ao enviar a foto: ${uploadErr.message}`); setUploading(false); return }

    const url = supabase.storage.from('produtos').getPublicUrl(caminho).data.publicUrl
    const eraAPrimeira = fotos.length === 0
    const { error: insertErr } = await supabase.from('produto_fotos').insert({ produto_id: produto.id, url })
    setUploading(false)
    if (insertErr) { setError(insertErr.message); return }

    carregar()
    if (eraAPrimeira) await atualizarCapa(url)
  }

  async function handleExcluir(foto: Foto) {
    if (!window.confirm('Excluir essa foto?')) return
    setError('')
    const caminho = caminhoNaStorage(foto.url)
    if (caminho) await supabase.storage.from('produtos').remove([caminho])
    const { error: delErr } = await supabase.from('produto_fotos').delete().eq('id', foto.id)
    if (delErr) { setError(delErr.message); return }

    const restantes = fotos.filter(f => f.id !== foto.id)
    setFotos(restantes)
    if (capaUrl === foto.url) {
      await atualizarCapa(restantes[0]?.url ?? null)
    }
  }

  function handleTornarCapa(foto: Foto) {
    if (foto.url === capaUrl) return
    atualizarCapa(foto.url)
  }

  const modalRef = useModalKeyboard(true, onClose)

  return (
    <motion.div
      style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        ref={modalRef}
        className="card"
        style={{ width: '100%', maxWidth: '480px', padding: '28px', maxHeight: '85vh', overflowY: 'auto' }}
        initial={{ scale: 0.95, y: 16 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 16 }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4px' }}>
          <div>
            <h2 style={{ fontSize: '18px', color: '#FFFFFF' }}>Fotos do produto</h2>
            <p style={{ fontSize: '12px', color: '#555', marginTop: '2px' }}>{produto.nome}</p>
          </div>
          <button className="btn btn-icon" onClick={onClose}><X size={14} /></button>
        </div>

        {loading ? (
          <p style={{ fontSize: '13px', color: '#555', padding: '32px 0', textAlign: 'center' }}>Carregando...</p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', margin: '18px 0' }}>
            {fotos.map(foto => (
              <div key={foto.id} style={{ position: 'relative' }}>
                <button
                  onClick={() => setAmpliada(foto.url)}
                  style={{
                    width: '100%', aspectRatio: '1', borderRadius: '8px', overflow: 'hidden',
                    border: foto.url === capaUrl ? '2px solid #FFFFFF' : '1px solid #2A2A2A',
                    padding: 0, cursor: 'pointer', display: 'block', background: '#1F1F1F',
                  }}
                >
                  <img src={foto.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </button>
                {foto.url === capaUrl && (
                  <span style={{ position: 'absolute', top: '4px', left: '4px', background: 'rgba(0,0,0,0.7)', borderRadius: '99px', padding: '2px 7px', fontSize: '9px', color: '#FFFFFF', display: 'flex', alignItems: 'center', gap: '3px' }}>
                    <Star size={9} fill="#FFFFFF" /> Capa
                  </span>
                )}
                {!souAtendente && (
                  <div style={{ display: 'flex', gap: '4px', marginTop: '4px' }}>
                    {foto.url !== capaUrl && (
                      <button
                        title="Tornar capa"
                        onClick={() => handleTornarCapa(foto)}
                        style={{ flex: 1, background: 'transparent', border: '1px solid #2A2A2A', borderRadius: '6px', padding: '4px', cursor: 'pointer', color: '#666', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                      >
                        <Star size={11} />
                      </button>
                    )}
                    <button
                      title="Excluir"
                      onClick={() => handleExcluir(foto)}
                      style={{ flex: 1, background: 'transparent', border: '1px solid #2A2A2A', borderRadius: '6px', padding: '4px', cursor: 'pointer', color: '#666', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    >
                      <Trash2 size={11} />
                    </button>
                  </div>
                )}
              </div>
            ))}

            {!souAtendente && (
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                style={{
                  aspectRatio: '1', borderRadius: '8px', background: '#1F1F1F', border: '1px dashed #333',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '4px',
                  cursor: uploading ? 'default' : 'pointer', color: '#555', fontSize: '11px',
                }}
              >
                {uploading ? <span>Enviando...</span> : <><Plus size={16} /><span>Adicionar</span></>}
              </button>
            )}
          </div>
        )}

        {!loading && fotos.length === 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#444', fontSize: '12px', marginBottom: '14px' }}>
            <Package size={13} /> {souAtendente ? 'Nenhuma foto ainda.' : 'Nenhuma foto ainda — adicione a primeira.'}
          </div>
        )}

        {!souAtendente && (
          <input ref={fileInputRef} type="file" accept="image/*" onChange={handleUpload} style={{ display: 'none' }} />
        )}

        {error && <p style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>{error}</p>}

        <button className="btn btn-secondary btn-full" style={{ marginTop: '14px' }} onClick={onClose}>Fechar</button>
      </motion.div>

      {/* Lightbox */}
      <AnimatePresence>
        {ampliada && (
          <motion.div
            style={{ position: 'fixed', inset: 0, zIndex: 70, background: 'rgba(0,0,0,0.92)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setAmpliada(null)}
          >
            <button className="btn btn-icon" onClick={() => setAmpliada(null)} style={{ position: 'absolute', top: '20px', right: '20px' }}>
              <X size={18} />
            </button>
            <motion.img
              src={ampliada} alt=""
              style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: '8px' }}
              initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
              onClick={e => e.stopPropagation()}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
