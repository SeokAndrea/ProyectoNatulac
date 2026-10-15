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
  sinExtremos,
  claseValor,
  horizontal,
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
  /** Sin "más alto / más bajo" (ej. el ausentismo total, dueña 2026-10-14). */
  sinExtremos?: boolean
  /** Tamaño propio del número (pisa a grande). */
  claseValor?: string
  /** NÚMERO ‖ datos uno al lado del otro, con letra que crece con la tarjeta; angosta, se apila. */
  horizontal?: boolean
}) {
  const actual = serie[serie.length - 1]
  const anterior = serie.length > 1 ? serie[serie.length - 2] : null
  const dif = diferencia(actual.valor, anterior?.valor ?? null)
  const ext = extremos(serie)
  // Con menos de 2 meses con dato no hay qué comparar: no se muestran (dueña, 2026-10-14).
  const verExtremos = !sinExtremos && serie.filter((p) => p.valor != null).length >= 2
  const texto = (v: number | null) => (v == null ? "—" : `${fmt(v, decimales)}${unidad}`)
  const pts = unidad === " %" ? " pts" : ""

  if (horizontal) {
    const comparacion =
      dif == null ? null : Math.abs(dif) < 10 ** -decimales / 2 ? (
        `Igual que ${mesCorto(anterior!.mes)}`
      ) : (
        <>
          <span className="whitespace-nowrap">
            <b className={(dif > 0) === mayorEsMejor ? "text-success-foreground" : "text-danger"}>
              {dif > 0 ? "▲" : "▼"} {fmt(Math.abs(dif), decimales)}
              {pts}
            </b>{" "}
            vs {mesCorto(anterior!.mes)}
          </span>
        </>
      )
    const datos = [
      detalle,
      comparacion,
      verExtremos && ext && (
        <>
          ▲ Más alto <b className="whitespace-nowrap">{`${mesCorto(ext.alto.mes)} ${texto(ext.alto.valor)}`}</b>
        </>
      ),
      verExtremos && ext && (
        <>
          ▼ Más bajo <b className="whitespace-nowrap">{`${mesCorto(ext.bajo.mes)} ${texto(ext.bajo.valor)}`}</b>
        </>
      ),
    ].filter(Boolean)
    // NÚMERO ‖ datos, aprovechando el ancho (dueña, 2026-10-15). Si la tarjeta es angosta, se apila centrado.
    return (
      <div className="@container flex min-w-0 flex-col justify-center gap-1 rounded-lg bg-card px-3 py-2">
        {titulo && <div className="text-center text-[13px] font-bold tracking-wide text-[var(--c-texto)]">{titulo}</div>}
        <div className="flex flex-col items-center gap-1 text-center @[19rem]:flex-row @[19rem]:justify-center @[19rem]:gap-4 @[19rem]:text-left">
          <div className="flex shrink-0 flex-col items-center gap-0.5">
            {estado && (
              <span className={cn("rounded-full px-2 text-[12px] font-semibold", estado.ok ? "bg-success-soft text-success-foreground" : "bg-danger-soft text-danger")}>
                {estado.texto}
              </span>
            )}
            <span className={cn("font-mono font-semibold whitespace-nowrap tabular-nums leading-none", claseValor ?? "text-[clamp(1.4rem,11cqi,2.6rem)]")}>
              {texto(actual.valor)}
            </span>
          </div>
          {datos.length > 0 && (
            <div className="flex min-w-0 flex-col gap-0.5 text-[clamp(12px,4.2cqi,14.5px)] leading-snug text-foreground @[19rem]:border-l-2 @[19rem]:border-[var(--c)] @[19rem]:pl-4">
              {datos.map((d, i) => (
                <span key={i}>{d}</span>
              ))}
            </div>
          )}
        </div>
      </div>
    )
  }

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
      <span className={cn("font-mono font-semibold tabular-nums leading-tight", claseValor ?? (grande ? "text-3xl" : "text-xl"))}>{texto(actual.valor)}</span>
      {/* Sin dato (del mes o del anterior) no se dice nada: la línea queda vacía (dueña, 2026-10-15). */}
      <span className="min-h-[1lh] truncate text-[11px] text-foreground">
        {detalle}
        {detalle && dif != null && " · "}
        {dif == null ? null : Math.abs(dif) < 10 ** -decimales / 2 ? (
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
      {verExtremos && ext && (
        <>
          <span className="truncate text-[10.5px] text-foreground">
            ▲ Más alto <b className="text-foreground">{`${mesCorto(ext.alto.mes)} ${texto(ext.alto.valor)}`}</b>
          </span>
          <span className="truncate text-[10.5px] text-foreground">
            ▼ Más bajo <b className="text-foreground">{`${mesCorto(ext.bajo.mes)} ${texto(ext.bajo.valor)}`}</b>
          </span>
        </>
      )}
    </div>
  )
}
