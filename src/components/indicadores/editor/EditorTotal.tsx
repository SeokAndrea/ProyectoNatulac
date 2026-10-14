import { totalAseptico } from "@/lib/indicadores/calculos"
import type { DatosMes, TotalAseptico } from "@/lib/indicadores/tipos"
import { CampoNumero } from "@/components/indicadores/editor/CampoNumero"
import { fmt } from "@/components/indicadores/formato"

/** Total Aséptico del mes, por si viene de otro Excel. Vacío = la suma de las presentaciones. */
export function EditorTotal({ datos, onCambio }: { datos: DatosMes; onCambio: (d: DatosMes) => void }) {
  const t = datos.totalAseptico ?? { prod: null, plan: null, cumplimiento: null }
  const cambiar = (cambio: Partial<TotalAseptico>) => onCambio({ ...datos, totalAseptico: { ...t, ...cambio } })
  const calculado = totalAseptico({ ...datos, totalAseptico: null })

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-xl border border-dashed p-3">
      <b className="w-full text-sm">Total Aséptico del mes</b>
      <CampoNumero etiqueta="Cajas producidas" entero valor={t.prod} onCambio={(v) => cambiar({ prod: v })} className="w-40" />
      <CampoNumero etiqueta="Cajas planeadas" entero valor={t.plan} onCambio={(v) => cambiar({ plan: v })} className="w-40" />
      <CampoNumero etiqueta="Cumplimiento" valor={t.cumplimiento} onCambio={(v) => cambiar({ cumplimiento: v })} sufijo="%" className="w-36" />
      <span className="pb-2 text-xs text-muted-foreground">
        Vacío = la suma de las presentaciones ({fmt(calculado.prod)} de {fmt(calculado.plan)} · {calculado.cumplimiento == null ? "—" : `${fmt(calculado.cumplimiento)} %`})
      </span>
    </div>
  )
}
