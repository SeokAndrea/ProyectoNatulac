import type { Session } from "@/lib/auth"

/*
 * Roles que solo miran (dueño, 2026-10-09). Los dos llevan el candado de
 * solo lectura (src/lib/soloLectura.ts): la app no les deja guardar nada.
 *
 * Solo Vista (migración 20261108990000): los dos paneles y nada más. Entra
 * directo al Panel de Producción (ver InicioSegunRol) y con la flecha del
 * header pasa al de Paradas (ver NavPanelesVista).
 *
 * Sistema de Gestión (migración 20261109090000): todas las pantallas menos
 * las de abajo, de solo lectura.
 */
export const PANELES_SOLO_VISTA = [
  { slug: "panel-produccion", href: "/panel-produccion", titulo: "Producción" },
  { slug: "panel-paradas", href: "/panel-paradas", titulo: "Paradas" },
] as const

export const INICIO_SOLO_VISTA = PANELES_SOLO_VISTA[0].href

/** Sistema de Gestión no entra acá: Personal pide PERSONAL_GESTIONAR, que también deja editar gente. */
export const APPS_FUERA_DE_GESTION = new Set(["personal"])

export function esSoloVista(session: Session | null): boolean {
  return session?.rol === "VISTA"
}

export function esGestion(session: Session | null): boolean {
  return session?.rol === "GESTION"
}

export function esSoloLectura(session: Session | null): boolean {
  return esSoloVista(session) || esGestion(session)
}
