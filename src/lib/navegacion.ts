import { useAuth } from "@/lib/auth"
import { apps, puedeVerApp, type AppDef } from "@/lib/apps"
import { esAreaDeApoyo, type CargoCodigo } from "@/lib/catalogos"
import { puede } from "@/lib/permisos"
import { useSesionTurno } from "@/lib/sesionTurno"
import { continuidadReciente, type ContinuidadTurno } from "@/lib/continuidadTurno"

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
export function agruparPorSeccion(lista: AppDef[], areaDeApoyo: boolean, cargo?: CargoCodigo | null): Seccion[] {
  const grupos = agruparEnOrden(lista, areaDeApoyo)
  if (!cargo || !CARGOS_CONTROL_PRIMERO.includes(cargo)) return grupos
  const lugar = (s: Seccion) => {
    const i = ORDEN_SECCIONES_CONTROL.indexOf(s.titulo ?? "")
    return i === -1 ? ORDEN_SECCIONES_CONTROL.length : i
  }
  return [...grupos].sort((a, b) => lugar(a) - lugar(b))
}

/**
 * Cargo Jefe y Analista de Producción: primero lo de control, al final el
 * flujo del turno (dueña, 2026-10-15). Por CARGO, como el Supervisor: hoy
 * los dos son Super Administrador de rol.
 */
const CARGOS_CONTROL_PRIMERO: CargoCodigo[] = ["JEFE_PRODUCCION", "ANALISTA_PRODUCCION"]
const ORDEN_SECCIONES_CONTROL = [TITULOS_SECCION.auditoria, TITULOS_SECCION["base-datos"], TITULOS_SECCION.produccion]

function agruparEnOrden(lista: AppDef[], areaDeApoyo: boolean): Seccion[] {
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
export function bloqueoDeApp(app: AppDef, turnoActivo: boolean, turnoPorAsumir: boolean, continuidad: ContinuidadTurno | null = null) {
  const porTurnoEnCurso = !!app.bloqueaConTurno && turnoActivo && !turnoPorAsumir
  const sinTurno = app.requiereTurno && !turnoActivo
  /** Turno recién abierto por continuidad: "HH:MM" en que se habilita (ver src/lib/continuidadTurno.ts). */
  const habilitaA = app.bloqueaEnContinuidad && continuidad ? continuidad.finalizableDesde : null
  return { bloqueada: !app.href || sinTurno || porTurnoEnCurso || habilitaA !== null, sinTurno, porTurnoEnCurso, habilitaA }
}

/** Estado del turno que usan el Hub y la navegación para bloquear tarjetas. */
export function useTurnoDeLaSesion() {
  const { session } = useAuth()
  const sesion = useSesionTurno()
  const turnoActivo = sesion.turnoId !== null
  // Mismo criterio que ComenzarTurno: solo el responsable actual "tiene" el turno; el resto puede asumirlo o tomar el relevo.
  const soyResponsable = !sesion.sinResponsable && sesion.supervisorUsuario === session?.username.toLowerCase()
  const turnoPorAsumir = turnoActivo && !soyResponsable && puede(session, "TURNO_ASUMIR")
  const continuidad = continuidadReciente(sesion, session?.username ?? null)
  return { turnoActivo, turnoPorAsumir, sinResponsable: sesion.sinResponsable, continuidad }
}

/**
 * Lo que muestran el menú lateral y el botón flotante:
 * - `secciones`: todas las pantallas que puede abrir, agrupadas como en el Hub (los accesos del Hub al final).
 * - `rapidas`: las principales y no bloqueadas, en orden (Supervisor: RAPIDAS_SUPERVISOR).
 */
export function useAppsNavegables() {
  const { session } = useAuth()
  const { turnoActivo, turnoPorAsumir, continuidad } = useTurnoDeLaSesion()
  const visibles = apps.filter((app) => app.href && puedeVerApp(session, app))
  const principales = visibles.filter((app) => !app.atajo)
  const atajos = visibles.filter((app) => app.atajo)

  const secciones = agruparPorSeccion(principales, esAreaDeApoyo(session?.area), session?.cargo)
  if (atajos.length > 0) {
    const accesos = { titulo: "Paneles y accesos", apps: atajos }
    // Jefe y analista: los accesos van primero, como en el Hub.
    if (session?.cargo && CARGOS_CONTROL_PRIMERO.includes(session.cargo)) secciones.unshift(accesos)
    else secciones.push(accesos)
  }

  const libre = (app: AppDef) => !bloqueoDeApp(app, turnoActivo, turnoPorAsumir, continuidad).bloqueada
  const orden =
    session?.cargo === "SUPERVISOR"
      ? RAPIDAS_SUPERVISOR.map((slug) => visibles.find((app) => app.slug === slug)).filter((app): app is AppDef => !!app)
      : [...principales, ...atajos]
  const rapidas = orden.filter(libre)

  return { secciones, rapidas, turnoActivo, turnoPorAsumir, continuidad }
}
