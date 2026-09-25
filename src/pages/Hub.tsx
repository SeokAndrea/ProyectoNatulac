import { Link } from "react-router-dom"
import { Lock } from "lucide-react"
import { AppCard } from "@/components/AppCard"
import { AppHeader } from "@/components/AppHeader"
import { Logo } from "@/components/Logo"
import { useAuth } from "@/lib/auth"
import { useSesionTurno } from "@/lib/sesionTurno"
import { useGenerarActasPendientes } from "@/lib/actasPendientes"
import { apps, type AppDef } from "@/lib/apps"
import { cn } from "@/lib/utils"

/** Emoji del saludo, distinto para algún usuario puntual — por username, en minúscula. */
const EMOJI_SALUDO_POR_USUARIO: Record<string, string> = {
  jguerrero: "🐱",
}
const EMOJI_SALUDO_DEFAULT = "👋"

export default function Hub() {
  const { session } = useAuth()
  const sesion = useSesionTurno()
  useGenerarActasPendientes()
  const turnoActivo = sesion.turnoId !== null
  // Área de Pruebas: ve TODAS las tarjetas sin importar el rol — mismo
  // criterio que ProtectedRoute.tsx (la cuenta de prueba ejercita
  // cualquier pantalla nueva sin pedir un login por rol para cada una).
  const esPruebas = session?.area === "PRUEBAS"
  const appsVisibles = apps.filter((app) => {
    if (esPruebas) return true
    if (app.rolesPermitidos && !(session && app.rolesPermitidos.includes(session.rol))) return false
    if (app.areasPermitidas && !(session?.area && app.areasPermitidas.includes(session.area))) return false
    if (app.areasExcluidas && session?.area && app.areasExcluidas.includes(session.area)) return false
    if (app.veErroresSolo && !session?.veErrores) return false
    if (app.usuarioPermitido && session?.username.toLowerCase() !== app.usuarioPermitido.toLowerCase()) return false
    return true
  })
  const atajos = appsVisibles.filter((app) => app.atajo)
  const principales = appsVisibles.filter((app) => !app.atajo)
  const secciones = agruparPorSeccion(principales)

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
              {turnoActivo
                ? "Elige una aplicación para continuar."
                : "Inicia un turno para habilitar el resto de las aplicaciones."}
            </p>
          </div>

          {atajos.length > 0 && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:w-auto lg:shrink-0">
              {atajos.map((app) => (
                <TarjetaAtajo key={app.slug} app={app} turnoActivo={turnoActivo} />
              ))}
            </div>
          )}
        </div>

        <div className="space-y-8">
          {secciones.map(({ titulo, apps: appsSeccion }) => (
            <section key={titulo ?? "otras"}>
              {titulo && (
                <h2 className="mb-3 border-b border-border/70 pb-1.5 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  {titulo}
                </h2>
              )}
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 sm:gap-4 lg:grid-cols-4">
                {appsSeccion.map((app) => (
                  <AppCard key={app.slug} app={app} turnoActivo={turnoActivo} />
                ))}
              </div>
            </section>
          ))}
        </div>
      </main>
    </div>
  )
}

const TITULOS_SECCION: Record<NonNullable<AppDef["seccion"]>, string> = {
  produccion: "Producción",
  auditoria: "Auditoría",
  "base-datos": "Base de Datos",
}

/**
 * Agrupa las tarjetas principales por su `seccion` (ver src/lib/apps.tsx),
 * preservando el orden de aparición de cada grupo. Las tarjetas sin
 * `seccion` (ej. Servicios Industriales) van todas juntas al final, sin
 * título.
 */
function agruparPorSeccion(appsPrincipales: AppDef[]): { titulo: string | null; apps: AppDef[] }[] {
  const grupos: { titulo: string | null; apps: AppDef[] }[] = []
  const indicePorTitulo = new Map<string | null, number>()

  for (const app of appsPrincipales) {
    const titulo = app.seccion ? TITULOS_SECCION[app.seccion] : null
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
        <p className="truncate text-xs text-muted-foreground">{!app.href ? "Próximamente" : app.description}</p>
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
