import { useEffect, useSyncExternalStore } from "react"
import { useAuth } from "@/lib/auth"
import { supabase } from "@/lib/supabase"

/*
 * Tarjetas que cada persona escondió desde Ajustes (migración
 * 20261113690000). Se guardan en su cuenta. Esconder no quita permisos:
 * solo saca la tarjeta del inicio y del menú.
 */

const VACIO: ReadonlySet<string> = new Set()
let usuarioCargado: string | null = null
let ocultas: ReadonlySet<string> = VACIO
const oyentes = new Set<() => void>()
const avisar = () => oyentes.forEach((f) => f())
const suscribir = (f: () => void) => {
  oyentes.add(f)
  return () => oyentes.delete(f)
}

async function cargar(usuario: string) {
  usuarioCargado = usuario
  const { data, error } = await supabase.rpc("listar_tarjetas_ocultas", { p_usuario: usuario })
  if (usuarioCargado !== usuario) return // cambió la sesión mientras tanto
  ocultas = !error && Array.isArray(data) ? new Set(data as string[]) : VACIO
  avisar()
}

/** Las tarjetas escondidas de la sesión (vacío mientras carga o sin sesión). */
export function useTarjetasOcultas(): ReadonlySet<string> {
  const { session } = useAuth()
  const usuario = session?.username ?? null
  useEffect(() => {
    if (!usuario) {
      usuarioCargado = null
      ocultas = VACIO
      avisar()
    } else if (usuario !== usuarioCargado) {
      void cargar(usuario)
    }
  }, [usuario])
  return useSyncExternalStore(suscribir, () => ocultas, () => VACIO)
}

/** Esconde o vuelve a mostrar una tarjeta. Se ve al instante; si no se pudo guardar, vuelve atrás y devuelve el error. */
export async function cambiarTarjetaOculta(usuario: string, slug: string, ocultar: boolean): Promise<string | null> {
  const antes = ocultas
  const siguiente = new Set(antes)
  if (ocultar) siguiente.add(slug)
  else siguiente.delete(slug)
  ocultas = siguiente
  avisar()
  const { error } = await supabase.rpc("guardar_tarjetas_ocultas", { p_usuario: usuario, p_slugs: [...siguiente] })
  if (!error) return null
  ocultas = antes
  avisar()
  return error.message || "No se pudo guardar. Intenta de nuevo."
}
