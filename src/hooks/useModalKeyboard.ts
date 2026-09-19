import { useEffect, useRef } from 'react'

/**
 * Comportamento padrão de modal de cadastro: foco automático no primeiro
 * campo ao abrir, Esc fecha, F10 confirma/salva. Tab entre campos já é
 * comportamento nativo do navegador (basta os campos estarem no DOM na
 * ordem certa).
 */
export function useModalKeyboard(active: boolean, onClose: () => void, onSave?: () => void) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!active) return

    const t = setTimeout(() => {
      const el = ref.current?.querySelector<HTMLElement>('input, select, textarea')
      el?.focus()
    }, 20)

    function handler(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      } else if (e.key === 'F10') {
        e.preventDefault()
        onSave?.()
      }
    }

    window.addEventListener('keydown', handler)
    return () => {
      clearTimeout(t)
      window.removeEventListener('keydown', handler)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active])

  return ref
}
