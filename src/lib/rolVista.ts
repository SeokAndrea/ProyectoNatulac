import type { Session } from "@/lib/auth"

/*
 * Roles que solo miran (dueño, 2026-10-09). Los dos llevan el candado de
 * solo lectura (src/lib/soloLectura.ts): la app no les deja guardar nada.
 *
 * Solo Vista (migración 20261108990000): los dos paneles y nada más. Entra
 * directo al Panel de Producción (ver InicioSegunRol) y con la flecha del
 * header pasa al de Paradas (ver NavPanelesVista).
 *
 * Sistema de Gestión (migración 20261109090000): documentos (actas de
 * todos los turnos, Resumen Diario, Auditoría), Programación y los dos
 * paneles, de solo lectura. Las pantallas del turno no: sin turno propio
 * solo le mostraban avisos de "no hay turno".
 */
export const PANELES_SOLO_VISTA = [
  { slug: "panel-produccion", href: "/panel-produccion", titulo: "Producción" },
  { slug: "panel-paradas", href: "/panel-paradas", titulo: "Paradas" },
] as const

export const INICIO_SOLO_VISTA = PANELES_SOLO_VISTA[0].href

/** Lo único que ve Sistema de Gestión. */
export const APPS_GESTION = new Set(["mis-actas", "resumen-dia", "auditoria", "programacion", "panel-produccion", "panel-paradas"])

export function esSoloVista(session: Session | null): boolean {
  return session?.rol === "VISTA"
}

export function esGestion(session: Session | null): boolean {
  return session?.rol === "GESTION"
}

export function esSoloLectura(session: Session | null): boolean {
  return esSoloVista(session) || esGestion(session)
}
