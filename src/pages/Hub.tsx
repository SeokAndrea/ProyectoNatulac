import { useState } from "react"
import { Link } from "react-router-dom"
import { Lock } from "lucide-react"
import { AppCard } from "@/components/AppCard"
import { AppHeader } from "@/components/AppHeader"
import { Logo } from "@/components/Logo"
import { SelectorVerComo } from "@/components/VerComo"
import { Switch } from "@/components/ui/switch"
import { useAuth } from "@/lib/auth"
import { useSesionTurno } from "@/lib/sesionTurno"
import { useGenerarActasPendientes } from "@/lib/actasPendientes"
import { apps, puedeVerApp, type AppDef } from "@/lib/apps"
import { esAreaDeApoyo } from "@/lib/catalogos"
import { puede } from "@/lib/permisos"
import { cn } from "@/lib/utils"

/** Emoji del saludo, distinto para algún usuario puntual — por username, en minúscula. */
const EMOJI_SALUDO_POR_USUARIO: Record<string, string> = {
  jguerrero: "🐱",
}
const EMOJI_SALUDO_DEFAULT = "👋"

/**
 * Cargo Supervisor, en el teléfono: el flujo del turno arriba de todo, en este
 * orden (dueño, 2026-09-30). En pantallas grandes, y para los otros cargos,
 * el hub queda como siempre.
 */
const FLUJO_SUPERVISOR = [
  "comenzar-turno",
  "preparacion",
  "lineas",
  "producto-terminado",
  "paradas",
  "finalizar-turno",
  "mis-actas",
  "panel-produccion",
]
/** «Solo paradas» (jefe y analista, dueña 2026-10-08): oculta el flujo del turno y deja Registrar Paradas. */
const APPS_DEL_TURNO = new Set(["comenzar-turno", "preparacion", "lineas", "producto-terminado", "finalizar-turno"])
const STORAGE_SOLO_PARADAS = "natulac.soloParadas"
function leerSoloParadas(): boolean {
  try {
    return localStorage.getItem(STORAGE_SOLO_PARADAS) === "1"
  } catch {
    return false
  }
}

/** Supervisor en el teléfono: estas van al final de todo, debajo de las secciones. */
const AL_FINAL_SUPERVISOR = ["programacion", "manual", "panel-paradas"]

export default function Hub() {
  const { session } = useAuth()
  const sesion = useSesionTurno()
  useGenerarActasPendientes()
  const turnoActivo = sesion.turnoId !== null
  // Mismo criterio que ComenzarTurno: solo el responsable actual "tiene" el turno; el resto puede asumirlo o tomar el relevo.
  const soyResponsable = !sesion.sinResponsable && sesion.supervisorUsuario === session?.username.toLowerCase()
  const turnoPorAsumir = turnoActivo && !soyResponsable && puede(session, "TURNO_ASUMIR")
  const puedeSoloParadas = session?.rol === "JEFE_PRODUCCION" || session?.rol === "ANALISTA"
  const [soloParadas, setSoloParadas] = useState(leerSoloParadas)
  const ocultarTurno = puedeSoloParadas && soloParadas
  function cambiarSoloParadas(v: boolean) {
    setSoloParadas(v)
    try {
      localStorage.setItem(STORAGE_SOLO_PARADAS, v ? "1" : "0")
    } catch {
      // Sin almacenamiento: vale hasta recargar.
    }
  }
  // Mismo criterio que las rutas (ProtectedRoute): puedeVerApp en src/lib/apps.tsx.
  const appsVisibles = apps.filter((app) => puedeVerApp(session, app) && !(ocultarTurno && APPS_DEL_TURNO.has(app.slug)))
  const atajos = appsVisibles.filter((app) => app.atajo)
  const principales = appsVisibles.filter((app) => !app.atajo)
  const secciones = agruparPorSeccion(principales, esAreaDeApoyo(session?.area))
  // Por CARGO (rótulo del puesto en Personal), no por rol: el cargo no da permisos, solo ordena el inicio.
  const esSupervisor = session?.cargo === "SUPERVISOR"
  const porSlug = (slugs: string[]) =>
    slugs.map((slug) => appsVisibles.find((app) => app.slug === slug)).filter((app): app is AppDef => !!app)
  const flujo = esSupervisor ? porSlug(FLUJO_SUPERVISOR) : []
  const alFinal = esSupervisor ? porSlug(AL_FINAL_SUPERVISOR) : []
  /** En el teléfono, lo que ya está arriba (flujo) o abajo (al final) no se repite en su lugar de siempre. "grid" para que la tarjeta ocupe todo el alto, como antes. */
  const soloEnPantallaGrande = (app: AppDef) => (flujo.includes(app) || alFinal.includes(app) ? "hidden sm:grid" : "grid")
  /** Una sección cuyas tarjetas ya salen arriba o abajo tampoco muestra su título vacío en el teléfono. */
  const seccionVacia = (appsSeccion: AppDef[]) => appsSeccion.every((app) => flujo.includes(app) || alFinal.includes(app))

  return (
    <div className="flex min-h-svh flex-col bg-background">
      <AppHeader left={<Logo />} />

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
        <div className="mb-8 flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
              Hola{session ? `, ${session.nombre}` : ""}{" "}
              {session ? (EMOJI_SALUDO_POR_USUARIO[session.username.toLowerCase()] ?? EMOJI_SALUDO_DEFAULT) : EMOJI_SALUDO_DEFAULT}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground sm:text-base">
              {turnoPorAsumir
                ? sesion.sinResponsable
                  ? "Hay un turno abierto sin responsable. Entra a Comenzar Turno para asumirlo."
                  : "Elige una aplicación para continuar."
                : turnoActivo || !puede(session, "TURNO_ASUMIR")
                  ? "Elige una aplicación para continuar."
                  : "Inicia un turno para habilitar el resto de las aplicaciones."}
            </p>
            <div className="mt-3">
              <SelectorVerComo />
            </div>
          </div>

          {flujo.length > 0 && (
            <div className="grid grid-cols-1 gap-2.5 sm:hidden">
              {flujo.map((app) => (
                <AppCard key={app.slug} app={app} turnoActivo={turnoActivo} turnoPorAsumir={turnoPorAsumir} />
              ))}
            </div>
          )}

          {atajos.length > 0 && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:w-auto lg:shrink-0">
              {atajos.map((app) => (
                <div key={app.slug} className={soloEnPantallaGrande(app)}>
                  <TarjetaAtajo app={app} turnoActivo={turnoActivo} />
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-8">
          {secciones.map(({ titulo, apps: appsSeccion }) => (
            <section key={titulo ?? "otras"} className={seccionVacia(appsSeccion) ? "hidden sm:block" : undefined}>
              {titulo && (
                <h2 className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-border/70 pb-1.5 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  {titulo}
                  {titulo === TITULOS_SECCION.produccion && puedeSoloParadas && (
                    <label className="flex cursor-pointer items-center gap-2 text-xs font-medium normal-case tracking-normal">
                      <Switch checked={soloParadas} onCheckedChange={cambiarSoloParadas} aria-label="Ver solo Registrar Paradas" />
                      Solo paradas
                    </label>
                  )}
                </h2>
              )}
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 sm:gap-4 lg:grid-cols-4">
                {appsSeccion.map((app) => (
                  <div key={app.slug} className={soloEnPantallaGrande(app)}>
                    <AppCard app={app} turnoActivo={turnoActivo} turnoPorAsumir={turnoPorAsumir} />
                  </div>
                ))}
              </div>
            </section>
          ))}

          {alFinal.length > 0 && (
            <section className="sm:hidden">
              <h2 className="mb-3 border-b border-border/70 pb-1.5 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Más
              </h2>
              <div className="grid grid-cols-1 gap-2.5">
                {alFinal.map((app) => (
                  <TarjetaAtajo key={app.slug} app={app} turnoActivo={turnoActivo} />
                ))}
              </div>
            </section>
          )}
        </div>
      </main>
    </div>
  )
}

const TITULOS_SECCION: Record<NonNullable<AppDef["seccion"]>, string> = {
  produccion: "Producción",
  apoyo: "Servicios de apoyo",
  auditoria: "Auditoría",
  "base-datos": "Base de Datos",
}

/**
 * Agrupa las tarjetas principales por su `seccion` (ver src/lib/apps.tsx),
 * preservando el orden de aparición de cada grupo. Las tarjetas sin
 * `seccion` van todas juntas al final, sin título. Para un área de apoyo,
 * las de "produccion" (ej. Registrar Paradas en Mantenimiento) van en "apoyo".
 */
function agruparPorSeccion(appsPrincipales: AppDef[], areaDeApoyo: boolean): { titulo: string | null; apps: AppDef[] }[] {
  const grupos: { titulo: string | null; apps: AppDef[] }[] = []
  const indicePorTitulo = new Map<string | null, number>()

  for (const app of appsPrincipales) {
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

function TarjetaAtajo({ app, turnoActivo }: { app: AppDef; turnoActivo: boolean }) {
  const Icon = app.icon
  const bloqueada = !app.href || (app.requiereTurno && !turnoActivo)

  const contenido = (
    <>
      <div
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-lg",
          bloqueada ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary",
        )}
      >
        {bloqueada && !app.href ? <Icon className="size-4" /> : bloqueada ? <Lock className="size-4" /> : <Icon className="size-4" />}
      </div>
      <div className="min-w-0">
        <p className={cn("truncate text-sm font-medium", bloqueada ? "text-muted-foreground" : "text-foreground")}>{app.title}</p>
        {(!app.href || app.description) && (
          <p className="truncate text-xs text-muted-foreground">{!app.href ? "Próximamente" : app.description}</p>
        )}
      </div>
    </>
  )

  if (bloqueada) {
    return (
      <div
        aria-disabled="true"
        title={!app.href ? "Todavía no está construido" : "Inicia un turno para habilitar esta sección"}
        className="flex w-full cursor-not-allowed items-center gap-2.5 rounded-xl border border-border/50 bg-card/60 px-3 py-2.5 opacity-70 sm:w-56"
      >
        {contenido}
      </div>
    )
  }

  return (
    <Link
      to={app.href!}
      className="flex w-full items-center gap-2.5 rounded-xl border border-border/70 bg-card px-3 py-2.5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:w-56"
    >
      {contenido}
    </Link>
  )
}
