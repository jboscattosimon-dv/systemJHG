import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { BrowserMultiFormatReader } from '@zxing/browser'
import type { IScannerControls } from '@zxing/browser'
import { BarcodeFormat, DecodeHintType } from '@zxing/library'
import { X, Camera } from 'lucide-react'

// Só os códigos que o sistema gera (CODE128) + "tentar mais" — restringir
// o formato acelera a decodificação e evita falsos positivos, ajudando
// principalmente com pouca luz ou o código um pouco fora de foco.
const hints = new Map<DecodeHintType, unknown>([
  [DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.CODE_128]],
  [DecodeHintType.TRY_HARDER, true],
])

export default function ScannerCamera({ onScan, onClose }: {
  onScan: (codigo: string) => void
  onClose: () => void
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [erro, setErro] = useState('')

  useEffect(() => {
    let controls: IScannerControls | undefined
    let cancelado = false
    const reader = new BrowserMultiFormatReader(hints)

    // facingMode + resolução moderada (em vez de deixar o navegador
    // escolher sozinho) evita cair na lente ultra-wide de celulares com
    // várias câmeras traseiras — a ultra-wide tem campo de visão maior,
    // deixa o código minúsculo na tela e foca mal de perto.
    reader.decodeFromConstraints(
      {
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 },
          // Zoom digital/óptico inicial, quando o navegador aceita direto
          // na constraint (Chrome Android, principalmente).
          advanced: [{ zoom: 2 } as MediaTrackConstraintSet],
        },
      },
      videoRef.current ?? undefined,
      (result, _err, ctrl) => {
        controls = ctrl
        if (result && !cancelado) {
          cancelado = true
          ctrl.stop()
          onScan(result.getText())
        }
      }
    )
      .then(ctrl => {
        controls = ctrl
        // Reforça o zoom depois que o stream já está rodando — em vários
        // aparelhos o zoom só é aceito via applyConstraints na track já
        // ativa, não na constraint inicial do getUserMedia.
        const track = videoRef.current?.srcObject instanceof MediaStream
          ? videoRef.current.srcObject.getVideoTracks()[0]
          : undefined
        const caps = track?.getCapabilities?.() as (MediaTrackCapabilities & { zoom?: { max: number } }) | undefined
        if (track && caps?.zoom) {
          const zoomAlvo = Math.min(2, caps.zoom.max)
          track.applyConstraints({ advanced: [{ zoom: zoomAlvo } as MediaTrackConstraintSet] }).catch(() => {})
        }
      })
      .catch(e => setErro(e instanceof Error ? e.message : 'Não foi possível acessar a câmera.'))

    return () => { cancelado = true; controls?.stop() }
  }, [onScan])

  return (
    <motion.div
      style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <motion.div className="card" style={{ width: '100%', maxWidth: '420px', padding: '20px' }} initial={{ scale: 0.95 }} animate={{ scale: 1 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
          <h2 style={{ fontSize: '15px', color: '#FFFFFF', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Camera size={15} /> Aponte pro código de barras
          </h2>
          <button className="btn btn-icon" onClick={onClose}><X size={14} /></button>
        </div>
        {erro ? (
          <p style={{ fontSize: '13px', color: '#666', padding: '20px 0' }}>{erro}</p>
        ) : (
          <>
            <div style={{ position: 'relative', width: '100%', aspectRatio: '4 / 3', borderRadius: '8px', overflow: 'hidden', background: '#000' }}>
              <video ref={videoRef} style={{ width: '100%', height: '100%', objectFit: 'cover' }} muted playsInline />
              {/* Guia de mira: mostra onde alinhar o código, do tamanho
                  aproximado de uma etiqueta — ajuda a segurar na distância
                  certa pra focar em vez de encher a tela toda de câmera. */}
              <div style={{
                position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                pointerEvents: 'none',
              }}>
                <div style={{
                  width: '75%', height: '32%', border: '2px solid #22C55E', borderRadius: '6px',
                  boxShadow: '0 0 0 999px rgba(0,0,0,0.35)',
                }} />
              </div>
            </div>
            <p style={{ fontSize: '11px', color: '#666', marginTop: '10px', textAlign: 'center' }}>
              Alinhe o código dentro da área verde e aproxime devagar até focar.
            </p>
          </>
        )}
      </motion.div>
    </motion.div>
  )
}
