import { Link } from "react-router-dom"
import { Lock } from "lucide-react"
import { AppHeader } from "@/components/AppHeader"
import { Logo } from "@/components/Logo"
import { useAuth } from "@/lib/auth"
import { useTurno } from "@/lib/turno"
import { apps } from "@/lib/apps"
import { cn } from "@/lib/utils"

export default function Hub() {
  const { session } = useAuth()
  const { turnoActivo } = useTurno()
  const appsVisibles = apps.filter((app) => !app.rolesPermitidos || (session && app.rolesPermitidos.includes(session.rol)))

  return (
    <div className="flex min-h-svh flex-col bg-background">
      <AppHeader left={<Logo />} />

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            Hola{session ? `, ${session.nombre}` : ""} 👋
          </h1>
          <p className="mt-1 text-sm text-muted-foreground sm:text-base">
            {turnoActivo
              ? "Elige una aplicación para continuar."
              : "Inicia un turno para habilitar el resto de las aplicaciones."}
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {appsVisibles.map((app) => {
            const Icon = app.icon
            const bloqueada = app.requiereTurno && !turnoActivo

            const iconoWrap = (
              <div
                className={cn(
                  "flex size-11 items-center justify-center rounded-xl transition-colors",
                  bloqueada
                    ? "bg-muted text-muted-foreground"
                    : "bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground",
                )}
              >
                {bloqueada ? <Lock className="size-5" /> : <Icon className="size-5.5" />}
              </div>
            )

            const textos = (
              <div>
                <h2 className={cn("font-medium", bloqueada ? "text-muted-foreground" : "text-foreground")}>
                  {app.title}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {bloqueada ? "Se habilita al iniciar un turno." : app.description}
                </p>
              </div>
            )

            if (bloqueada) {
              return (
                <div
                  key={app.slug}
                  aria-disabled="true"
                  title="Inicia un turno para habilitar esta sección"
                  className="flex cursor-not-allowed flex-col justify-between gap-6 rounded-2xl border border-border/50 bg-card/60 p-5 opacity-70"
                >
                  {iconoWrap}
                  {textos}
                </div>
              )
            }

            return (
              <Link
                key={app.slug}
                to={app.href}
                className="group flex flex-col justify-between gap-6 rounded-2xl border border-border/70 bg-card p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {iconoWrap}
                {textos}
              </Link>
            )
          })}
        </div>
      </main>
    </div>
  )
}
