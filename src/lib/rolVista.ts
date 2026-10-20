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
 */
export const PANELES_SOLO_VISTA = [
  { slug: "panel-produccion", href: "/panel-produccion", titulo: "Producción" },
  { slug: "panel-paradas", href: "/panel-paradas", titulo: "Paradas" },
] as const

export const INICIO_SOLO_VISTA = PANELES_SOLO_VISTA[0].href

export function esSoloVista(session: Session | null): boolean {
  return session?.rol === "VISTA"
}

export function esSoloLectura(session: Session | null): boolean {
  return esSoloVista(session)
}
