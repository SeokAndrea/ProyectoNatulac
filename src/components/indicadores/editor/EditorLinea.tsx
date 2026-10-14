import { Checkbox } from "@/components/ui/checkbox"
import { cumplimiento, type PresentacionDeLinea } from "@/lib/indicadores/calculos"
import { presentacionVacia, type DatosMes, type DatosPresentacion } from "@/lib/indicadores/tipos"
import { colorLinea, colorPresentacion } from "@/components/indicadores/colores"
import { CampoNumero, DatoCalculado } from "@/components/indicadores/editor/CampoNumero"
import { fmtPct } from "@/components/indicadores/formato"
import { EditorParadas } from "@/components/indicadores/editor/EditorParadas"

/** Pestaña de una línea en el editor manual: la eficiencia y, por presentación, si se corrió, cajas, merma y paradas. */
export function EditorLinea({
  linea,
  presentaciones,
  datos,
  nombreMes,
  onCambio,
}: {
  linea: string
  presentaciones: PresentacionDeLinea[]
  datos: DatosMes
  nombreMes: string
  onCambio: (d: DatosMes) => void
}) {
  const cambiarPres = (clave: string, cambio: Partial<DatosPresentacion>) =>
    onCambio({ ...datos, presentaciones: { ...datos.presentaciones, [clave]: { ...(datos.presentaciones[clave] ?? presentacionVacia()), ...cambio } } })

  return (
    <div className="flex flex-col gap-3" style={colorLinea(linea)}>
      <div className="flex items-end gap-3">
        <CampoNumero
          etiqueta={`Eficiencia de la Línea ${linea}`}
          valor={datos.eficiencia[linea] ?? null}
          onCambio={(v) => onCambio({ ...datos, eficiencia: { ...datos.eficiencia, [linea]: v } })}
          sufijo="%"
          className="w-48 text-[13px] text-[var(--c-texto)]"
        />
        <span className="pb-2 text-xs text-muted-foreground">Estándar 85 %</span>
      </div>
      <div className="grid items-start gap-3 sm:grid-cols-[repeat(auto-fit,minmax(320px,1fr))]">
        {presentaciones.map((p) => {
          const x = datos.presentaciones[p.clave] ?? presentacionVacia()
          return (
            <section key={p.clave} style={colorPresentacion(linea, p.indice)} className="flex flex-col gap-2.5 rounded-xl border-2 border-[var(--c)] bg-card p-3">
              <header className="flex flex-wrap items-center justify-between gap-1.5">
                <b className="text-lg text-[var(--c-texto)]">{p.nombre}</b>
                <label className="inline-flex cursor-pointer items-center gap-1.5 text-[12.5px]">
                  <Checkbox checked={x.corrio} onCheckedChange={(v) => cambiarPres(p.clave, { corrio: v === true })} />
                  Se corrió en {nombreMes}
                </label>
              </header>
              {/* Los campos se ven siempre: una presentación planeada que no se corrió igual lleva su plan. */}
              {!x.corrio && <p className="text-xs text-muted-foreground">Sin correr en {nombreMes}: aparece solo si tiene cajas planeadas.</p>}
              <div className="grid grid-cols-2 gap-2">
                <CampoNumero etiqueta="Cajas producidas" entero valor={x.prod} onCambio={(v) => cambiarPres(p.clave, { prod: v, corrio: x.corrio || (v ?? 0) > 0 })} />
                <CampoNumero etiqueta="Cajas planeadas" entero valor={x.plan} onCambio={(v) => cambiarPres(p.clave, { plan: v })} />
                <CampoNumero etiqueta="Merma de envases" valor={x.merma} onCambio={(v) => cambiarPres(p.clave, { merma: v })} sufijo="%" />
                <CampoNumero etiqueta="Envases perdidos (unidades)" entero valor={x.mermaUnidades ?? null} onCambio={(v) => cambiarPres(p.clave, { mermaUnidades: v })} />
                {/* Con cajas, el cumplimiento sale solo (producidas ÷ planeadas); sin cajas, se escribe. */}
                {x.prod != null && x.plan ? (
                  <DatoCalculado etiqueta="Cumplimiento" texto={fmtPct(cumplimiento(x), 1)} />
                ) : (
                  <CampoNumero etiqueta="Cumplimiento (sin cajas)" valor={x.cumplimiento ?? null} onCambio={(v) => cambiarPres(p.clave, { cumplimiento: v })} sufijo="%" />
                )}
              </div>
              <EditorParadas paradas={x.paradas} onCambio={(paradas) => cambiarPres(p.clave, { paradas })} />
            </section>
          )
        })}
      </div>
    </div>
  )
}
