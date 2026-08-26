import { Link } from "react-router-dom"
import { Lock } from "lucide-react"
import { AppHeader } from "@/components/AppHeader"
import { Logo } from "@/components/Logo"
import { useAuth } from "@/lib/auth"
import { useTurno } from "@/lib/turno"
import { apps, type AppDef } from "@/lib/apps"
import { cn } from "@/lib/utils"

export default function Hub() {
  const { session } = useAuth()
  const { turnoActivo } = useTurno()
  const appsVisibles = apps.filter((app) => !app.rolesPermitidos || (session && app.rolesPermitidos.includes(session.rol)))
  const atajos = appsVisibles.filter((app) => app.atajo)
  const principales = appsVisibles.filter((app) => !app.atajo)

  return (
    <div className="flex min-h-svh flex-col bg-background">
      <AppHeader left={<Logo />} />

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
        <div className="mb-8 flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
              Hola{session ? `, ${session.nombre}` : ""} 👋
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
                <TarjetaAtajo key={app.slug} app={app} turnoActivo={turnoActivo !== null} />
              ))}
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {principales.map((app) => (
            <TarjetaApp key={app.slug} app={app} turnoActivo={turnoActivo !== null} />
          ))}
        </div>
      </main>
    </div>
  )
}

const COLOR_ICONO: Record<NonNullable<AppDef["color"]>, string> = {
  success: "bg-success/15 text-success group-hover:bg-success group-hover:text-primary-foreground",
  blue: "bg-blue-500/15 text-blue-600 group-hover:bg-blue-600 group-hover:text-white dark:text-blue-400",
}
const COLOR_BORDE_HOVER: Record<NonNullable<AppDef["color"]>, string> = {
  success: "hover:border-success/50",
  blue: "hover:border-blue-500/50",
}

function TarjetaApp({ app, turnoActivo }: { app: AppDef; turnoActivo: boolean }) {
  const Icon = app.icon
  const bloqueada = !app.href || (app.requiereTurno && !turnoActivo) || (app.bloqueaConTurno && turnoActivo)
  const resaltada = app.resaltarConTurno && turnoActivo && !bloqueada

  const iconoWrap = (
    <div
      className={cn(
        "flex size-11 items-center justify-center rounded-xl transition-colors",
        bloqueada
          ? "bg-muted text-muted-foreground"
          : resaltada
            ? "bg-destructive/15 text-destructive"
            : app.color
              ? COLOR_ICONO[app.color]
              : "bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground",
      )}
    >
      {bloqueada && !app.href ? <Icon className="size-5.5" /> : bloqueada ? <Lock className="size-5" /> : <Icon className="size-5.5" />}
    </div>
  )

  const textos = (
    <div>
      <h2 className={cn("font-medium", bloqueada ? "text-muted-foreground" : resaltada ? "text-destructive" : "text-foreground")}>
        {app.title}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {!app.href
          ? "Próximamente."
          : app.bloqueaConTurno && turnoActivo
            ? "Ya tienes un turno en curso."
            : app.requiereTurno && !turnoActivo
              ? "Se habilita al iniciar un turno."
              : app.description}
      </p>
    </div>
  )

  if (bloqueada) {
    return (
      <div
        aria-disabled="true"
        title={
          !app.href
            ? "Todavía no está construido"
            : app.bloqueaConTurno && turnoActivo
              ? "Ya tienes un turno en curso"
              : "Inicia un turno para habilitar esta sección"
        }
        className="flex cursor-not-allowed flex-col justify-between gap-6 rounded-2xl border border-border/50 bg-card/60 p-5 opacity-70"
      >
        {iconoWrap}
        {textos}
      </div>
    )
  }

  return (
    <Link
      to={app.href!}
      className={cn(
        "group flex flex-col justify-between gap-6 rounded-2xl border p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        resaltada
          ? "border-destructive/40 bg-destructive/5 hover:border-destructive/60"
          : app.color
            ? cn("border-border/70 bg-card", COLOR_BORDE_HOVER[app.color])
            : "border-border/70 bg-card hover:border-primary/40",
      )}
    >
      {iconoWrap}
      {textos}
    </Link>
  )
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
