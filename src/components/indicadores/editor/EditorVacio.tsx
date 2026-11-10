import type { DatosMes, DatosPresentacionVacio } from "@/lib/indicadores/tipos"
import { PRESENTACIONES_VACIO, presentacionVacioVacia } from "@/lib/indicadores/vacio"
import { colorVacio } from "@/components/indicadores/colores"
import { CampoNumero } from "@/components/indicadores/editor/CampoNumero"
import { EditorParadas } from "@/components/indicadores/editor/EditorParadas"

/**
 * Pestaña de Vacío en el editor manual (todo a mano, siempre): la eficiencia
 * (una sola para las dos presentaciones que se miren) y, por presentación,
 * cajas producidas y planificadas, merma de empaque y de semielaborado (en %) y las paradas.
 * Vacío = sin dato (se muestra "—").
 */
export function EditorVacio({ datos, onCambio }: { datos: DatosMes; onCambio: (d: DatosMes) => void }) {
  const vacio = datos.vacio ?? { eficiencia: null, presentaciones: {} }
  const guardar = (cambio: Partial<typeof vacio>) => onCambio({ ...datos, vacio: { ...vacio, ...cambio } })
  const cambiarPres = (codigo: string, cambio: Partial<DatosPresentacionVacio>) =>
    guardar({ presentaciones: { ...vacio.presentaciones, [codigo]: { ...(vacio.presentaciones[codigo] ?? presentacionVacioVacia()), ...cambio } } })

  return (
    <div className="flex flex-col gap-3" style={colorVacio(0)}>
      <div className="flex items-end gap-3">
        <CampoNumero etiqueta="Eficiencia de Vacío" valor={vacio.eficiencia} onCambio={(v) => guardar({ eficiencia: v })} sufijo="%" className="w-48 text-[0.8125rem] text-[var(--c-texto)]" />
        <span className="pb-2 text-xs text-muted-foreground">Estándar 85 %. Una sola para las dos presentaciones.</span>
      </div>
      <div className="grid items-start gap-3 sm:grid-cols-[repeat(auto-fit,minmax(300px,1fr))]">
        {PRESENTACIONES_VACIO.map((p, i) => {
          const x = vacio.presentaciones[p.codigo] ?? presentacionVacioVacia()
          return (
            <section key={p.codigo} style={colorVacio(i % 2)} className="flex flex-col gap-2.5 rounded-xl border-2 border-[var(--c)] bg-card p-3">
              <header className="flex items-baseline justify-between gap-2">
                <b className="text-lg text-[var(--c-texto)]">{p.codigo}</b>
                <span className="text-xs text-muted-foreground">{p.unidad}</span>
              </header>
              <div className="grid grid-cols-2 gap-2">
                <CampoNumero etiqueta="Cajas producidas" entero valor={x.cajas} onCambio={(v) => cambiarPres(p.codigo, { cajas: v })} />
                <CampoNumero etiqueta="Cajas planificadas" entero valor={x.cajasPlan} onCambio={(v) => cambiarPres(p.codigo, { cajasPlan: v })} />
                <CampoNumero etiqueta="Merma de empaque" valor={x.mermaEmpaque} onCambio={(v) => cambiarPres(p.codigo, { mermaEmpaque: v })} sufijo="%" />
                <CampoNumero etiqueta="Merma de semielaborado" valor={x.mermaSemi} onCambio={(v) => cambiarPres(p.codigo, { mermaSemi: v })} sufijo="%" />
              </div>
              <EditorParadas paradas={x.paradas} onCambio={(paradas) => cambiarPres(p.codigo, { paradas })} />
            </section>
          )
        })}
      </div>
    </div>
  )
}
