import type { DatosMes } from "@/lib/indicadores/tipos"
import { colorFamilia, nombreFamilia } from "@/components/indicadores/colores"
import { CampoNumero } from "@/components/indicadores/editor/CampoNumero"
import { fmt } from "@/components/indicadores/formato"

/** Pestaña de semielaborado: el rendimiento de cada producto. Vacío = no se hizo ese mes (no aparece). */
export function EditorSemielaborado({ familias, datos, onCambio }: { familias: string[]; datos: DatosMes; onCambio: (d: DatosMes) => void }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-[repeat(auto-fit,minmax(190px,1fr))]">
        {familias.map((f) => {
          const v = datos.semielaborado[f] ?? null
          return (
            <section key={f} style={colorFamilia(f)} className="flex flex-col gap-2 rounded-xl border-2 border-[var(--c)] bg-card p-3">
              <b className="text-lg text-[var(--c-texto)]">{nombreFamilia(f)}</b>
              <CampoNumero etiqueta="Rendimiento" valor={v} sufijo="%" onCambio={(n) => onCambio({ ...datos, semielaborado: { ...datos.semielaborado, [f]: n } })} />
              <span className="text-xs text-muted-foreground">{v == null ? "Sin dato: no aparece" : `Merma ${fmt(100 - v, 1)} %`}</span>
            </section>
          )
        })}
      </div>
      <p className="text-xs text-muted-foreground">Rendimiento = litros envasados ÷ litros preparados. Estándar 100 %.</p>
    </div>
  )
}
