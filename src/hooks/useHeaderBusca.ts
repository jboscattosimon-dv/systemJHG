import { useOutletContext } from 'react-router-dom'

export interface HeaderBuscaContexto {
  headerBusca: string
  setHeaderBusca: (valor: string) => void
}

// Cada tela usa a mesma caixa de busca do cabeçalho (ali em cima, ao lado
// do sino) em vez de ter uma busca duplicada dentro da própria tela.
export function useHeaderBusca(): HeaderBuscaContexto {
  return useOutletContext<HeaderBuscaContexto>()
}
