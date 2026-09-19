import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { BrowserMultiFormatReader } from '@zxing/browser'
import type { IScannerControls } from '@zxing/browser'
import { X, Camera } from 'lucide-react'

export default function ScannerCamera({ onScan, onClose }: {
  onScan: (codigo: string) => void
  onClose: () => void
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [erro, setErro] = useState('')

  useEffect(() => {
    let controls: IScannerControls | undefined
    let cancelado = false
    const reader = new BrowserMultiFormatReader()

    reader.decodeFromVideoDevice(undefined, videoRef.current ?? undefined, (result, _err, ctrl) => {
      controls = ctrl
      if (result && !cancelado) {
        cancelado = true
        ctrl.stop()
        onScan(result.getText())
      }
    }).catch(e => setErro(e instanceof Error ? e.message : 'Não foi possível acessar a câmera.'))

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
          <video ref={videoRef} style={{ width: '100%', borderRadius: '8px', background: '#000' }} muted playsInline />
        )}
      </motion.div>
    </motion.div>
  )
}
