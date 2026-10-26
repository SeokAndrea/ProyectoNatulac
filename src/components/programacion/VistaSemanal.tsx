import { useState } from "react"
import { Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { PresentacionLive } from "@/lib/catalogosLive"
import {
  diasDeSemana,
  estadoDe,
  NOMBRES_DIA,
  numeroDeLinea,
  planDelDia,
  producidoEn,
  producidoExtraordinario,
  producidoSemana,
  programacionDe,
  semanaCerrada,
  type EstadoItem,
  type ItemSemana,
  type Semana,
} from "@/lib/programacionSemanal"
import type { Sabor } from "@/lib/sabores"
import { cn } from "@/lib/utils"
import { AgregarProducto } from "@/components/programacion/AgregarProducto"
import { colorLinea, fmt } from "@/components/programacion/comun"

const ESTADO: Record<EstadoItem["tipo"], { clase: string; texto: (e: EstadoItem) => string }> = {
  CUMPLIDO: { clase: "bg-success-soft text-success-foreground", texto: () => "Cumplido" },
  EN_CURSO: { clase: "bg-warning-soft text-warning-foreground", texto: () => "En curso" },
  SIN_PROGRAMAR: { clase: "bg-muted text-muted-foreground", texto: () => "Sin programar" },
  INCUMPLIDO: { clase: "bg-danger-soft text-danger-foreground", texto: (e) => `Incumplido · faltaron ${fmt(e.tipo === "INCUMPLIDO" ? e.faltan : 0)}` },
}

function Dato({ titulo, valor, detalle }: { titulo: string; valor: string; detalle: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-xl border bg-card px-4 py-2.5">
      <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{titulo}</span>
      <span className="font-mono text-2xl font-semibold tabular-nums">{valor}</span>
      <span className="text-xs text-muted-foreground">{detalle}</span>
    </div>
  )
}

/** Plan de la semana editable: se guarda al salir del campo. */
function CampoPlan({ item, onGuardar }: { item: ItemSemana; onGuardar: (n: number) => void }) {
  const [texto, setTexto] = useState(String(item.cajasPlan))
  return (
    <Input
      id={`plan-${item.id}`}
      aria-label={`Plan de ${item.saborNombre} ${item.presentacionMl} ml`}
      inputMode="numeric"
      value={texto}
      onChange={(e) => setTexto(e.target.value)}
      onBlur={() => {
        const n = Number(texto.replace(/[^\d]/g, ""))
        if (n > 0 && n !== item.cajasPlan) onGuardar(n)
        else setTexto(String(item.cajasPlan))
      }}
      className="ml-auto h-8 w-24 text-right font-mono"
    />
  )
}

/*
 * Vista SEMANAL (prototipo aprobado, dueña 2026-10-14): el plan de la semana
 * por sabor + presentación, con lo producido (PT en vivo), lo pendiente, una
 * celda por día con las cajas y la línea, y el estado. Abajo, el plan por
 * línea que usa Indicadores.
 */
export function VistaSemanal({
  semana,
  hoy,
  editable,
  sabores,
  presentaciones,
  onGuardarCajas,
  onEliminar,
  onAgregar,
}: {
  semana: Semana
  hoy: string
  editable: boolean
  sabores: Sabor[]
  presentaciones: PresentacionLive[]
  onGuardarCajas: (item: ItemSemana, cajas: number) => void
  onEliminar: (item: ItemSemana) => void
  onAgregar: (saborId: string, presentacionId: string, cajas: number) => Promise<boolean>
}) {
  const cerrada = semanaCerrada(semana.lunes, hoy)
  const dias = diasDeSemana(semana.lunes)
  const plan = semana.items.reduce((a, x) => a + x.cajasPlan, 0)
  const hecho = semana.items.reduce((a, x) => a + Math.min(x.cajasPlan, producidoSemana(semana, x)), 0)
  const incumplidos = semana.items.filter((x) => producidoSemana(semana, x) < x.cajasPlan)
  const porLinea = new Map<string, number>()
  let sinLinea = 0
  for (const it of semana.items) {
    const p = programacionDe(semana, it)
    if (p) porLinea.set(numeroDeLinea(p.lineaCodigo), (porLinea.get(numeroDeLinea(p.lineaCodigo)) ?? 0) + it.cajasPlan)
    else sinLinea += it.cajasPlan
  }

  return (
    <div className="flex flex-col gap-3">
      {cerrada && semana.items.length > 0 && (
        <p className={cn("rounded-lg px-4 py-2.5 text-sm font-semibold", incumplidos.length ? "bg-danger-soft text-danger-foreground" : "bg-success-soft text-success-foreground")}>
          Semana cerrada el viernes.{" "}
          {incumplidos.length
            ? `${incumplidos.length} ${incumplidos.length === 1 ? "producto quedó incumplido" : "productos quedaron incumplidos"}: lo que faltó no pasa a la semana siguiente.`
            : "Se cumplió todo."}
        </p>
      )}

      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        <Dato titulo="Plan de la semana" valor={fmt(plan)} detalle={`${semana.items.length} ${semana.items.length === 1 ? "producto" : "productos"}`} />
        <Dato titulo="Producido" valor={fmt(hecho)} detalle="PT del supervisor, en vivo" />
        <Dato titulo="Pendiente" valor={fmt(plan - hecho)} detalle={cerrada ? "quedó incumplido" : "hasta el viernes"} />
        <Dato titulo="Cumplimiento" valor={plan ? `${Math.round((hecho / plan) * 100)} %` : "—"} detalle="producido ÷ plan" />
      </div>

      <div className="rounded-xl border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] border-collapse text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="px-3 py-2.5 font-semibold">Producto</th>
                <th className="px-3 py-2.5 text-right font-semibold">Plan semana</th>
                <th className="px-3 py-2.5 text-right font-semibold">Producido</th>
                <th className="px-3 py-2.5 text-right font-semibold">Pendiente</th>
                <th className="px-3 py-2.5 font-semibold">Avance</th>
                <th className="px-3 py-2.5 font-semibold">{dias.map((_, i) => NOMBRES_DIA[i].slice(0, 3)).join(" · ")}</th>
                <th className="px-3 py-2.5 font-semibold">Estado</th>
                {editable && <th className="w-10" />}
              </tr>
            </thead>
            <tbody>
              {semana.items.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-3 py-6 text-center text-muted-foreground">
                    {editable ? "Todavía no hay productos en esta semana. Agrégalos abajo." : "Sin plan para esta semana."}
                  </td>
                </tr>
              )}
              {semana.items.map((it) => {
                const p = producidoSemana(semana, it)
                const extra = producidoExtraordinario(semana, it)
                const pct = Math.min(100, (p / it.cajasPlan) * 100)
                const e = estadoDe(semana, it, hoy)
                return (
                  <tr key={it.id} className="border-b last:border-b-0">
                    <td className="px-3 py-2">
                      <b className="block">{it.saborNombre}</b>
                      <span className="text-xs text-muted-foreground">{it.presentacionMl} ml</span>
                    </td>
                    <td className="px-3 py-2 text-right">
                      {editable ? <CampoPlan item={it} onGuardar={(n) => onGuardarCajas(it, n)} /> : <span className="font-mono">{fmt(it.cajasPlan)}</span>}
                    </td>
                    <td className="px-3 py-2 text-right font-mono">
                      {fmt(p)}
                      {extra > 0 && (
                        <span className="block font-sans text-xs text-muted-foreground" title="Producido un sábado o domingo marcado como día extraordinario; ya está sumado">
                          Día extraordinario: {fmt(extra)}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right font-mono">{fmt(Math.max(0, it.cajasPlan - p))}</td>
                    <td className="px-3 py-2">
                      <div className="h-1.5 min-w-24 overflow-hidden rounded-full bg-muted">
                        <div className={cn("h-full rounded-full", pct >= 100 ? "bg-success" : "bg-primary")} style={{ width: `${pct}%` }} />
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <div className="grid grid-cols-[repeat(5,46px)] gap-1">
                        {dias.map((fecha, i) => {
                          const x = planDelDia(semana, fecha).find((y) => y.item.id === it.id)
                          const c = producidoEn(semana, it, fecha)
                          const esHoy = fecha === hoy
                          return x ? (
                            <div
                              key={fecha}
                              style={colorLinea(x.lineaCodigo)}
                              title={`${NOMBRES_DIA[i]} · Línea ${numeroDeLinea(x.lineaCodigo)}: ${fmt(c)} cajas`}
                              className={cn("flex h-9 flex-col items-center justify-center rounded-md border-t-[3px] border-[var(--lc)] bg-muted text-xs leading-tight", esHoy && "outline-1 outline-offset-1 outline-dashed outline-muted-foreground")}
                            >
                              <b className="font-mono">{fmt(c)}</b>L{numeroDeLinea(x.lineaCodigo)}
                            </div>
                          ) : (
                            <div key={fecha} title={`${NOMBRES_DIA[i]}: no programado`} className={cn("grid h-9 place-items-center rounded-md bg-muted text-muted-foreground", esHoy && "outline-1 outline-offset-1 outline-dashed outline-muted-foreground")}>
                              ·
                            </div>
                          )
                        })}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <span className={cn("whitespace-nowrap rounded-sm px-2.5 py-0.5 text-xs font-semibold", ESTADO[e.tipo].clase)}>{ESTADO[e.tipo].texto(e)}</span>
                    </td>
                    {editable && (
                      <td className="px-1 py-2">
                        <Button variant="ghost" size="icon-sm" aria-label={`Quitar ${it.saborNombre} de la semana`} onClick={() => onEliminar(it)}>
                          <Trash2 className="size-3.5" />
                        </Button>
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {editable && <AgregarProducto sabores={sabores} presentaciones={presentaciones} onAgregar={onAgregar} />}
        <div className="flex flex-wrap gap-x-5 gap-y-1 border-t px-4 py-2.5 text-sm text-muted-foreground" title="Las cajas planeadas de cada línea, para Indicadores">
          Plan por línea (para Indicadores):
          {["1", "2", "3"].map((l) => (
            <span key={l} className="inline-flex items-center gap-1.5">
              <i className="inline-block size-2.5 rounded-full" style={{ background: `var(--ind-l${l})` }} />
              Línea {l}: <b className="font-mono text-foreground">{fmt(porLinea.get(l) ?? 0)}</b>
            </span>
          ))}
          {sinLinea > 0 && (
            <span>
              Sin línea todavía: <b className="font-mono text-foreground">{fmt(sinLinea)}</b>
            </span>
          )}
        </div>
      </div>
      <p className="max-w-[75ch] text-xs text-muted-foreground">
        La línea se elige al pasar el producto al día (pestaña Diario). Cada celda muestra las cajas del PT de ese día; el borde de color es la línea.
      </p>
    </div>
  )
}
