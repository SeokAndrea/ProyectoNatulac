import { useState } from "react"
import { Switch } from "@/components/ui/switch"
import { MensajeError } from "@/components/MensajeError"
import { useAuth } from "@/lib/auth"
import { apps, puedeVerApp, type AppDef } from "@/lib/apps"
import { TITULOS_SECCION } from "@/lib/navegacion"
import { cambiarTarjetaOculta, useTarjetasOcultas } from "@/lib/tarjetasOcultas"

/** Título del grupo, como en el inicio: los paneles primero, después cada sección. */
const grupoDe = (app: AppDef) => (app.atajo ? "Paneles y accesos" : app.seccion ? TITULOS_SECCION[app.seccion] : "Turno")

/**
 * Ajustes → «Tarjetas del inicio»: un interruptor por cada tarjeta que la
 * persona puede ver. Apagada, no sale en el inicio ni en el menú (se guarda en
 * su cuenta, ver src/lib/tarjetasOcultas.ts). No cambia permisos.
 */
export function TarjetasDelInicio() {
  const { session } = useAuth()
  const ocultas = useTarjetasOcultas()
  const [error, setError] = useState<string | null>(null)
  if (!session) return null

  // Los paneles y accesos primero, como en el inicio.
  const propias = apps.filter((a) => a.href && puedeVerApp(session, a)).sort((a, b) => Number(!!b.atajo) - Number(!!a.atajo))
  const grupos = new Map<string, AppDef[]>()
  for (const a of propias) grupos.set(grupoDe(a), [...(grupos.get(grupoDe(a)) ?? []), a])

  async function cambiar(slug: string, visible: boolean) {
    setError(await cambiarTarjetaOculta(session!.username, slug, !visible))
  }

  return (
    <div className="flex flex-col gap-4">
      <MensajeError error={error} />
      {[...grupos].map(([titulo, lista]) => (
        <div key={titulo} className="flex flex-col">
          <h3 className="mb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{titulo}</h3>
          <ul className="divide-y divide-border/60 rounded-xl bg-card ring-1 ring-foreground/10">
            {lista.map((a) => {
              const visible = !ocultas.has(a.slug)
              const Icono = a.icon
              return (
                <li key={a.slug}>
                  <label className="flex min-h-12 cursor-pointer items-center gap-3 px-3 py-2">
                    <Icono aria-hidden className="size-4 shrink-0 text-muted-foreground" />
                    <span className={visible ? "flex-1 text-sm text-foreground" : "flex-1 text-sm text-muted-foreground line-through"}>{a.title}</span>
                    <Switch checked={visible} onCheckedChange={(v) => void cambiar(a.slug, v)} aria-label={`Mostrar ${a.title}`} />
                  </label>
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </div>
  )
}
