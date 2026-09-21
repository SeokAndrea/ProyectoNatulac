import { Link } from "react-router-dom"
import { Lock } from "lucide-react"
import type { AppDef } from "@/lib/apps"
import { cn } from "@/lib/utils"

const COLOR_ICONO: Record<NonNullable<AppDef["color"]>, string> = {
  success: "bg-success/15 text-success group-hover:bg-success group-hover:text-primary-foreground",
  blue: "bg-blue-500/15 text-blue-600 group-hover:bg-blue-600 group-hover:text-white dark:text-blue-400",
  purple: "bg-purple-500/15 text-purple-600 group-hover:bg-purple-600 group-hover:text-white dark:text-purple-400",
  warning: "bg-warning/15 text-warning group-hover:bg-warning group-hover:text-warning-foreground",
  danger: "bg-danger/15 text-danger group-hover:bg-danger group-hover:text-danger-foreground",
}
const COLOR_BORDE_HOVER: Record<NonNullable<AppDef["color"]>, string> = {
  success: "hover:border-success/50",
  blue: "hover:border-blue-500/50",
  purple: "hover:border-purple-500/50",
  warning: "hover:border-warning/50",
  danger: "hover:border-danger/50",
}

/** Tarjeta de app del Hub — también reusada por páginas de agrupación como Calculadoras. */
export function AppCard({ app, turnoActivo }: { app: AppDef; turnoActivo: boolean }) {
  const Icon = app.icon
  const bloqueada = !app.href || (app.requiereTurno && !turnoActivo) || (app.bloqueaConTurno && turnoActivo)
  const resaltada = app.resaltarConTurno && turnoActivo && !bloqueada

  const iconoWrap = (
    <div
      className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-lg transition-colors sm:size-11 sm:rounded-xl",
        bloqueada
          ? "bg-muted text-muted-foreground"
          : resaltada
            ? "bg-destructive/15 text-destructive"
            : app.color
              ? COLOR_ICONO[app.color]
              : "bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground",
      )}
    >
      {bloqueada && !app.href ? (
        <Icon className="size-4 sm:size-5.5" />
      ) : bloqueada ? (
        <Lock className="size-4 sm:size-5" />
      ) : (
        <Icon className="size-4 sm:size-5.5" />
      )}
    </div>
  )

  const textos = (
    <div className="min-w-0">
      <h2 className={cn("text-sm font-medium sm:text-base", bloqueada ? "text-muted-foreground" : resaltada ? "text-destructive" : "text-foreground")}>
        {app.title}
      </h2>
      <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground sm:mt-1 sm:line-clamp-none sm:text-sm">
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
        className="flex cursor-not-allowed items-center gap-2.5 rounded-xl border border-border/50 bg-card/60 p-3 opacity-70 sm:flex-col sm:items-stretch sm:justify-between sm:gap-6 sm:rounded-2xl sm:p-5"
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
        "group flex items-center gap-2.5 rounded-xl border p-3 shadow-sm sm:flex-col sm:items-stretch sm:justify-between sm:gap-6 sm:rounded-2xl sm:p-5 transition-all hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
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
