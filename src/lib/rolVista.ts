import type { Session } from "@/lib/auth"

/*
 * Rol que solo mira (dueño, 2026-10-09). Lleva el candado de solo
 * lectura (src/lib/soloLectura.ts): la app no le deja guardar nada.
 *
 * Solo Vista (migración 20261108990000): los dos paneles y nada más. Entra
 * directo al Panel de Producción (ver InicioSegunRol) y con la flecha del
 * header pasa al de Paradas (ver NavPanelesVista).
 *
 * Sistema de Gestión se eliminó (migración 20261111290000): quien lo tenía
 * pasó a Solo Vista.
 *
 * Con los puestos (20261114190000) lo decide el PUESTO Solo Vista, no el rol
 * VISTA: un puesto nuevo puede tener rol equivalente VISTA y permisos en la
 * matriz, y esa persona sí trabaja. Solo mientras la sesión no trae el código
 * del puesto (recién entrando, sesión guardada de antes) se mira el rol.
 */
export const PUESTO_SOLO_VISTA = "SOLO_VISTA"
export const PANELES_SOLO_VISTA = [
  { slug: "panel-produccion", href: "/panel-produccion", titulo: "Producción" },
  { slug: "panel-paradas", href: "/panel-paradas", titulo: "Paradas" },
] as const

export const INICIO_SOLO_VISTA = PANELES_SOLO_VISTA[0].href

export function esSoloVista(session: Session | null): boolean {
  if (!session) return false
  if (session.puestoCodigo) return session.puestoCodigo === PUESTO_SOLO_VISTA
  return session.rol === "VISTA"
}

export function esSoloLectura(session: Session | null): boolean {
  return esSoloVista(session)
}
