import type { ReactNode } from "react"
import { diferencia, extremos, mesCorto, type PuntoSerie } from "@/lib/indicadores/calculos"
import { cn } from "@/lib/utils"
import { fmt } from "@/components/indicadores/formato"

/*
 * Un número de Indicadores: el valor del mes, la comparación con el mes
 * anterior y el más alto / más bajo de los 3 meses (dueña, 2026-10-14).
 * `serie` va del mes más viejo al elegido.
 */
export function Kpi({
  titulo,
  serie,
  decimales = 0,
  unidad = "",
  mayorEsMejor,
  estado,
  detalle,
  centrado,
  grande,
}: {
  titulo?: ReactNode
  serie: PuntoSerie[]
  decimales?: number
  /** " %" o "" (cajas). */
  unidad?: string
  mayorEsMejor: boolean
  /** Etiqueta contra el estándar (≤3 %, ≥85 %…). */
  estado?: { ok: boolean; texto: string } | null
  /** Línea extra bajo el número (ej. "Merma 1,0 %"). */
  detalle?: ReactNode
  centrado?: boolean
  grande?: boolean
}) {
  const actual = serie[serie.length - 1]
  const anterior = serie.length > 1 ? serie[serie.length - 2] : null
  const dif = diferencia(actual.valor, anterior?.valor ?? null)
  const ext = extremos(serie)
  const texto = (v: number | null) => (v == null ? "—" : `${fmt(v, decimales)}${unidad}`)
  const pts = unidad === " %" ? " pts" : ""

  return (
    <div className={cn("flex min-w-0 flex-col gap-0.5 rounded-lg bg-card px-2.5 py-1.5", centrado && "items-center text-center")}>
      {(titulo || estado) && (
        <div className={cn("flex items-center gap-1.5 text-[11.5px] font-bold tracking-wide text-[var(--c-texto)]", centrado ? "justify-center" : "justify-between")}>
          {titulo}
          {estado && (
            <span className={cn("rounded-full px-1.5 text-[10px] font-semibold", estado.ok ? "bg-success-soft text-success-foreground" : "bg-danger-soft text-danger")}>
              {estado.texto}
            </span>
          )}
        </div>
      )}
      <span className={cn("font-mono font-semibold tabular-nums leading-tight", grande ? "text-3xl" : "text-xl")}>{texto(actual.valor)}</span>
      <span className="truncate text-[11px] text-muted-foreground">
        {detalle}
        {detalle && " · "}
        {actual.valor == null ? (
          "Sin datos"
        ) : dif == null ? (
          anterior ? `Sin dato de ${mesCorto(anterior.mes)}` : "Primer mes"
        ) : Math.abs(dif) < 10 ** -decimales / 2 ? (
          `Igual que ${mesCorto(anterior!.mes)}`
        ) : (
          <>
            <b className={(dif > 0) === mayorEsMejor ? "text-success-foreground" : "text-danger"}>
              {dif > 0 ? "▲" : "▼"} {fmt(Math.abs(dif), decimales)}
              {pts}
            </b>{" "}
            vs {mesCorto(anterior!.mes)}
          </>
        )}
      </span>
      <span className="truncate text-[10.5px] text-muted-foreground">
        ▲ Más alto <b className="text-foreground">{ext ? `${mesCorto(ext.alto.mes)} ${texto(ext.alto.valor)}` : "—"}</b>
      </span>
      <span className="truncate text-[10.5px] text-muted-foreground">
        ▼ Más bajo <b className="text-foreground">{ext ? `${mesCorto(ext.bajo.mes)} ${texto(ext.bajo.valor)}` : "—"}</b>
      </span>
    </div>
  )
}
