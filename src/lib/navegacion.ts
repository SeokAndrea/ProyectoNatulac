import { useAuth } from "@/lib/auth"
import { apps, puedeVerApp, type AppDef } from "@/lib/apps"
import { esAreaDeApoyo } from "@/lib/catalogos"
import { puede } from "@/lib/permisos"
import { useSesionTurno } from "@/lib/sesionTurno"

/*
 * Navegación entre pantallas: lo comparten el Hub, el menú lateral (PC) y
 * el botón flotante (teléfono). Misma lista y mismos criterios que las
 * tarjetas del Hub (src/lib/apps.tsx → puedeVerApp).
 */

export const TITULOS_SECCION: Record<NonNullable<AppDef["seccion"]>, string> = {
  produccion: "Producción",
  apoyo: "Servicios de apoyo",
  auditoria: "Auditoría",
  "base-datos": "Base de Datos",
}

/**
 * Cargo Supervisor: el flujo del turno, en este orden (dueño, 2026-09-30).
 * Arriba de todo en el Hub del teléfono.
 */
export const FLUJO_SUPERVISOR = [
  "comenzar-turno",
  "preparacion",
  "lineas",
  "producto-terminado",
  "paradas",
  "finalizar-turno",
  "mis-actas",
  "panel-produccion",
]

/** Supervisor (quien más usa la app): lo que tiene en el botón flotante, en este orden (dueño, 2026-10-09). */
export const RAPIDAS_SUPERVISOR = ["lineas", "preparacion", "paradas", "panel-produccion"]

export interface Seccion {
  titulo: string | null
  apps: AppDef[]
}

/**
 * Agrupa las tarjetas por su `seccion`, en el orden en que aparece cada
 * grupo. Las que no tienen `seccion` van juntas, sin título. Para un área
 * de apoyo, las de "produccion" (ej. Registrar Paradas en Mantenimiento)
 * van en "apoyo".
 */
export function agruparPorSeccion(lista: AppDef[], areaDeApoyo: boolean): Seccion[] {
  const grupos: Seccion[] = []
  const indicePorTitulo = new Map<string | null, number>()

  for (const app of lista) {
    const seccion = areaDeApoyo && app.seccion === "produccion" ? "apoyo" : app.seccion
    const titulo = seccion ? TITULOS_SECCION[seccion] : null
    let indice = indicePorTitulo.get(titulo)
    if (indice === undefined) {
      indice = grupos.length
      indicePorTitulo.set(titulo, indice)
      grupos.push({ titulo, apps: [] })
    }
    grupos[indice].apps.push(app)
  }

  return grupos
}

/** Por qué una app está bloqueada (o no), con el turno de la sesión. Mismo criterio en el Hub y en la navegación. */
export function bloqueoDeApp(app: AppDef, turnoActivo: boolean, turnoPorAsumir: boolean) {
  const porTurnoEnCurso = !!app.bloqueaConTurno && turnoActivo && !turnoPorAsumir
  const sinTurno = app.requiereTurno && !turnoActivo
  return { bloqueada: !app.href || sinTurno || porTurnoEnCurso, sinTurno, porTurnoEnCurso }
}

/** Estado del turno que usan el Hub y la navegación para bloquear tarjetas. */
export function useTurnoDeLaSesion() {
  const { session } = useAuth()
  const sesion = useSesionTurno()
  const turnoActivo = sesion.turnoId !== null
  // Mismo criterio que ComenzarTurno: solo el responsable actual "tiene" el turno; el resto puede asumirlo o tomar el relevo.
  const soyResponsable = !sesion.sinResponsable && sesion.supervisorUsuario === session?.username.toLowerCase()
  const turnoPorAsumir = turnoActivo && !soyResponsable && puede(session, "TURNO_ASUMIR")
  return { turnoActivo, turnoPorAsumir, sinResponsable: sesion.sinResponsable }
}

/**
 * Lo que muestran el menú lateral y el botón flotante:
 * - `secciones`: todas las pantallas que puede abrir, agrupadas como en el Hub (los accesos del Hub al final).
 * - `rapidas`: las principales y no bloqueadas, en orden (Supervisor: RAPIDAS_SUPERVISOR).
 */
export function useAppsNavegables() {
  const { session } = useAuth()
  const { turnoActivo, turnoPorAsumir } = useTurnoDeLaSesion()
  const visibles = apps.filter((app) => app.href && puedeVerApp(session, app))
  const principales = visibles.filter((app) => !app.atajo)
  const atajos = visibles.filter((app) => app.atajo)

  const secciones = agruparPorSeccion(principales, esAreaDeApoyo(session?.area))
  if (atajos.length > 0) secciones.push({ titulo: "Paneles y accesos", apps: atajos })

  const libre = (app: AppDef) => !bloqueoDeApp(app, turnoActivo, turnoPorAsumir).bloqueada
  const orden =
    session?.cargo === "SUPERVISOR"
      ? RAPIDAS_SUPERVISOR.map((slug) => visibles.find((app) => app.slug === slug)).filter((app): app is AppDef => !!app)
      : [...principales, ...atajos]
  const rapidas = orden.filter(libre)

  return { secciones, rapidas, turnoActivo, turnoPorAsumir }
}
