import { Button } from "@/components/ui/button"
import type { VelocidadLive } from "@/lib/catalogosLive"
import {
  diasDeSemana,
  NOMBRES_DIA,
  numeroDeLinea,
  pendienteAl,
  planDelDia,
  producidoEn,
  programacionDe,
  semanaCerrada,
  type ItemSemana,
  type Semana,
} from "@/lib/programacionSemanal"
import { cn } from "@/lib/utils"
import { colorLinea, fmt, lineasQueLlenan } from "@/components/programacion/comun"

/*
 * Vista DIARIO (prototipo aprobado, dueña 2026-10-14). Arriba los 5 días. A
 * la izquierda el plan del día: lo que viene solo del día anterior y lo que
 * eligió la analista, con su línea y "producido hoy / pendiente al empezar".
 * A la derecha, lo del plan semanal que todavía tiene pendiente, para
 * pasarlo al día. Los días pasados y las semanas cerradas son de solo lectura.
 */
export function VistaDiaria({
  semana,
  hoy,
  dia,
  onDia,
  puedeEditar,
  velocidades,
  onProgramar,
}: {
  semana: Semana
  hoy: string
  dia: string
  onDia: (fecha: string) => void
  /** Permiso de editar (además, el día no tiene que haber pasado). */
  puedeEditar: boolean
  velocidades: VelocidadLive[]
  /** Pasa el producto al día con esa línea; con null, lo saca del día. */
  onProgramar: (item: ItemSemana, lineaCodigo: string | null) => void
}) {
  const dias = diasDeSemana(semana.lunes)
  const i = dias.indexOf(dia)
  const nombre = NOMBRES_DIA[i].toLowerCase()
  const pasado = dia < hoy
  const futuro = dia > hoy
  const edita = puedeEditar && !pasado && !semanaCerrada(semana.lunes, hoy)
  const plan = planDelDia(semana, dia)
  const pendientes = semana.items.filter((it) => !plan.some((x) => x.item.id === it.id) && pendienteAl(semana, it, dia) > 0)

  return (
    <div className="flex flex-col gap-3">
      <div role="group" aria-label="Día" className="grid grid-cols-3 gap-2 sm:grid-cols-5">
        {dias.map((fecha, j) => {
          const n = planDelDia(semana, fecha).length
          return (
            <button
              key={fecha}
              type="button"
              aria-pressed={fecha === dia}
              onClick={() => onDia(fecha)}
              className={cn("flex flex-col rounded-xl border bg-card px-3 py-2 text-left", fecha === dia && "border-primary ring-1 ring-primary")}
            >
              <span className="text-sm font-bold">
                {NOMBRES_DIA[j]} {Number(fecha.slice(8, 10))}
              </span>
              <span className="text-xs text-muted-foreground">
                {fecha < hoy ? "Pasado" : fecha === hoy ? "Hoy" : "Por venir"} · {n} {n === 1 ? "producto" : "productos"}
              </span>
            </button>
          )
        })}
      </div>

      <div className="grid items-start gap-3 lg:grid-cols-[minmax(0,1.7fr)_minmax(280px,1fr)]">
        <section aria-label="Plan del día" className="flex flex-col gap-2.5 rounded-xl border bg-card p-3.5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-lg font-bold">
              Plan del {nombre} {Number(dia.slice(8, 10))}
            </h2>
            <span className="text-xs text-muted-foreground">{pasado ? "Ya pasó: solo lectura" : futuro ? "Proyección con lo producido hasta hoy" : "En vivo con el PT del supervisor"}</span>
          </div>
          {plan.length === 0 && (
            <p className="py-4 text-sm text-muted-foreground">
              Nada programado para el {nombre}. {edita && "Pasa productos del plan semanal desde la derecha."}
            </p>
          )}
          {plan.map((x) => {
            const pend = pendienteAl(semana, x.item, dia)
            const hecho = producidoEn(semana, x.item, dia)
            const pct = pend ? Math.min(100, (hecho / pend) * 100) : 100
            return (
              <div key={x.item.id} style={colorLinea(x.lineaCodigo)} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 rounded-xl border border-l-[5px] border-l-[var(--lc)] p-3">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <b className="text-base">{x.item.saborNombre}</b>
                  <span className="text-xs text-muted-foreground">{x.item.presentacionMl} ml</span>
                  {x.viene && (
                    <span className="rounded-sm bg-warning-soft px-2 py-px text-xs font-semibold text-warning-foreground" title="Quedó pendiente del día anterior">
                      Viene del {NOMBRES_DIA[i - 1].toLowerCase()}
                    </span>
                  )}
                </div>
                <div className="row-span-2 text-right">
                  <div className="font-mono text-2xl font-bold leading-tight">
                    {fmt(hecho)}
                    <small className="text-base font-semibold text-muted-foreground"> / {fmt(pend)}</small>
                  </div>
                  <div className="text-xs text-muted-foreground">{futuro ? "pendiente al día de hoy" : "producido hoy / pendiente al empezar"}</div>
                </div>
                <div role="group" aria-label="Línea" className="flex flex-wrap gap-1.5">
                  {lineasQueLlenan(x.item.presentacionMl, velocidades).map((l) => (
                    <button
                      key={l}
                      type="button"
                      aria-pressed={x.lineaCodigo === l}
                      disabled={!edita || x.lineaCodigo === l}
                      onClick={() => onProgramar(x.item, l)}
                      style={colorLinea(l)}
                      className={cn(
                        "rounded-sm border px-2.5 py-0.5 text-xs font-bold",
                        x.lineaCodigo === l ? "border-[var(--lc)] bg-[var(--lc)] text-white" : "bg-card disabled:opacity-60",
                      )}
                    >
                      L{numeroDeLinea(l)}
                    </button>
                  ))}
                </div>
                <div className="col-span-2 flex flex-wrap items-center gap-2">
                  <div className="h-1.5 min-w-32 flex-1 overflow-hidden rounded-full bg-muted" title={`${Math.round(pct)} %`}>
                    <div className="h-full rounded-full bg-[var(--lc)]" style={{ width: `${pct}%` }} />
                  </div>
                  {edita && (
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => onProgramar(x.item, null)}>
                      Quitar del {nombre}
                    </Button>
                  )}
                </div>
              </div>
            )
          })}
        </section>

        <section aria-label="Pendiente del plan semanal" className="flex flex-col gap-2.5 rounded-xl border bg-card p-3.5">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="text-lg font-bold">Del plan semanal</h2>
            <span className="text-xs text-muted-foreground">{pendientes.length} con pendiente</span>
          </div>
          {pendientes.length === 0 && <p className="py-4 text-sm text-muted-foreground">Todo lo de la semana ya está en el {nombre} o se cumplió.</p>}
          {pendientes.map((it) => {
            // La línea con que venía programado; si nunca, la primera que llena esa presentación.
            const linea = programacionDe(semana, it)?.lineaCodigo ?? lineasQueLlenan(it.presentacionMl, velocidades)[0] ?? null
            return (
              <div key={it.id} className="flex items-center justify-between gap-3 rounded-xl border border-dashed p-3">
                <div className="text-sm">
                  <b>{it.saborNombre}</b> <span className="text-xs text-muted-foreground">{it.presentacionMl} ml</span>
                  <div className="text-xs text-muted-foreground">
                    Falta <span className="font-mono font-semibold text-foreground">{fmt(pendienteAl(semana, it, dia))}</span> de <span className="font-mono">{fmt(it.cajasPlan)}</span>
                  </div>
                </div>
                {edita && linea && (
                  <Button size="sm" className="h-7 shrink-0 text-xs" onClick={() => onProgramar(it, linea)}>
                    Pasar al {nombre}
                  </Button>
                )}
              </div>
            )
          })}
          <p className="text-xs text-muted-foreground">Lo que no se termina un día pasa solo al siguiente, con su línea, hasta el viernes. Lo que faltó el viernes queda incumplido.</p>
        </section>
      </div>
    </div>
  )
}
