import { useEffect, useRef, useState } from 'react'

// Detecta quando saiu um deploy novo enquanto o app já estava aberto (ou
// guardado em cache — comum no "Adicionar à Tela de Início" do Safari, que
// não revalida sozinho). Compara o script principal do index.html atual
// (buscado sempre da rede, sem cache) com o script que está rodando agora.
export function useVersaoDisponivel() {
  const [disponivel, setDisponivel] = useState(false)
  const scriptAtualRef = useRef<string | null>(null)
  const disponivelRef = useRef(false)

  useEffect(() => {
    const el = document.querySelector<HTMLScriptElement>('script[type="module"][src*="/assets/"]')
    scriptAtualRef.current = el?.getAttribute('src') ?? null
  }, [])

  useEffect(() => {
    async function verificar() {
      if (disponivelRef.current || !scriptAtualRef.current) return
      try {
        const res = await fetch(`${import.meta.env.BASE_URL}index.html?_=${Date.now()}`, { cache: 'no-store' })
        const html = await res.text()
        const match = html.match(/<script[^>]*type="module"[^>]*src="([^"]+)"/)
        const novoSrc = match?.[1]
        if (novoSrc && novoSrc !== scriptAtualRef.current) {
          disponivelRef.current = true
          setDisponivel(true)
        }
      } catch {
        // offline ou erro de rede — ignora, tenta de novo na próxima checagem
      }
    }

    verificar()
    function aoFicarVisivel() { if (document.visibilityState === 'visible') verificar() }
    document.addEventListener('visibilitychange', aoFicarVisivel)
    const intervalo = setInterval(verificar, 10 * 60 * 1000)
    return () => {
      document.removeEventListener('visibilitychange', aoFicarVisivel)
      clearInterval(intervalo)
    }
  }, [])

  return disponivel
}
