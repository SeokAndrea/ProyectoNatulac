import type { Session } from "@/lib/auth"

/*
 * Rol «Solo Vista» (dueño, 2026-10-09; migración 20261108990000): mira los
 * dos paneles y nada más. Entra directo al Panel de Producción (ver
 * InicioSegunRol) y con la flecha del header pasa al de Paradas (ver
 * NavPanelesVista). puedeVerApp() le cierra todo lo demás.
 */
export const PANELES_SOLO_VISTA = [
  { slug: "panel-produccion", href: "/panel-produccion", titulo: "Producción" },
  { slug: "panel-paradas", href: "/panel-paradas", titulo: "Paradas" },
] as const

export const INICIO_SOLO_VISTA = PANELES_SOLO_VISTA[0].href

export function esSoloVista(session: Session | null): boolean {
  return session?.rol === "VISTA"
}
