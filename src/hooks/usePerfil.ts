import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './useAuth'
import type { PapelUsuario } from '../types'

interface Perfil {
  papel: PapelUsuario | null
  empresaId: string | null
  profissionalId: string | null
  ativo: boolean
  loading: boolean
}

export function usePerfil() {
  const { user } = useAuth()
  const [perfil, setPerfil] = useState<Perfil>({ papel: null, empresaId: null, profissionalId: null, ativo: true, loading: true })

  useEffect(() => {
    if (!user) { setPerfil({ papel: null, empresaId: null, profissionalId: null, ativo: true, loading: false }); return }
    supabase.from('usuario_perfis').select('papel, empresa_id, profissional_id, ativo').eq('usuario_id', user.id).maybeSingle()
      .then(({ data }) => {
        setPerfil({
          papel: (data?.papel as PapelUsuario) ?? null,
          empresaId: data?.empresa_id ?? null,
          profissionalId: data?.profissional_id ?? null,
          ativo: data?.ativo ?? true,
          loading: false,
        })
      })
  }, [user])

  return perfil
}
