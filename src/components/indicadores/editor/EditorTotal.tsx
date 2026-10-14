import { totalAseptico } from "@/lib/indicadores/calculos"
import type { DatosMes } from "@/lib/indicadores/tipos"
import { CampoNumero, DatoCalculado } from "@/components/indicadores/editor/CampoNumero"
import { fmt, fmtPct } from "@/components/indicadores/formato"

/**
 * Total Aséptico del mes: las cajas salen solas de sumar las presentaciones.
 * El cumplimiento se escribe solo si no hay cajas (julio y agosto vienen de otro Excel).
 */
export function EditorTotal({ datos, onCambio }: { datos: DatosMes; onCambio: (d: DatosMes) => void }) {
  const t = totalAseptico(datos)
  const conCajas = t.prod != null && !!t.plan

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-xl border border-dashed p-3">
      <b className="w-full text-sm">Total Aséptico del mes</b>
      <DatoCalculado etiqueta="Cajas producidas" texto={fmt(t.prod)} className="w-40" />
      <DatoCalculado etiqueta="Cajas planeadas" texto={fmt(t.plan)} className="w-40" />
      {conCajas ? (
        <DatoCalculado etiqueta="Cumplimiento" texto={fmtPct(t.cumplimiento, 1)} className="w-36" />
      ) : (
        <CampoNumero
          etiqueta="Cumplimiento (sin cajas)"
          valor={datos.totalAseptico?.cumplimiento ?? null}
          onCambio={(v) => onCambio({ ...datos, totalAseptico: { prod: null, plan: null, cumplimiento: v } })}
          sufijo="%"
          className="w-44"
        />
      )}
      <span className="pb-2 text-xs text-muted-foreground">Sale solo de sumar las presentaciones de las 3 líneas.</span>
    </div>
  )
}
