import type { CSSProperties } from "react"
import type { DatosPresentacion } from "@/lib/indicadores/tipos"
import { AnillosCumplimiento } from "@/components/indicadores/AnillosCumplimiento"
import { Kpi } from "@/components/indicadores/Kpi"
import { Observacion } from "@/components/indicadores/Observacion"
import { fmt } from "@/components/indicadores/formato"
import type { MesIndicadores } from "@/components/indicadores/useIndicadores"

const Subtitulo = ({ children }: { children: string }) => <h3 className="text-[13px] font-bold tracking-wide text-[var(--c-texto)]">{children}</h3>

/** Una presentación: merma de envases, cajas producidas y planeadas, cumplimiento en anillos y observaciones. */
export function ColumnaPresentacion({
  clave,
  nombre,
  linea,
  color,
  meses,
  observacion,
  puedeEditar,
  onGuardarObservacion,
}: {
  clave: string
  nombre: string
  linea: string
  color: CSSProperties
  meses: MesIndicadores[]
  observacion: string | undefined
  puedeEditar: boolean
  onGuardarObservacion: (texto: string) => Promise<{ ok: true } | { ok: false; error: string }>
}) {
  const de = (campo: keyof Pick<DatosPresentacion, "prod" | "plan" | "merma">) =>
    meses.map((m) => ({ mes: m.mes, valor: m.datos?.presentaciones[clave]?.[campo] ?? null }))
  const merma = de("merma")
  const mermaMes = merma[merma.length - 1].valor
  const unidades = meses[meses.length - 1].datos?.presentaciones[clave]?.mermaUnidades ?? null

  return (
    <section
      aria-label={nombre}
      data-ajusta-texto
      style={color}
      className="flex min-h-0 min-w-0 flex-col gap-2 rounded-xl border-2 border-[var(--c)] bg-[color-mix(in_srgb,var(--c)_8%,var(--card))] px-3 pb-3"
    >
      <h2 className="-mx-3 flex items-baseline gap-2 rounded-t-[10px] bg-[var(--c)] px-3 py-1.5 text-[22px] font-bold text-[var(--c-cab)]">
        {nombre} <span className="text-xs font-semibold opacity-85">Línea {linea}</span>
      </h2>
      <Subtitulo>MERMA DE ENVASES</Subtitulo>
      <Kpi
        serie={merma}
        decimales={2}
        unidad=" %"
        mayorEsMejor={false}
        centrado
        estado={mermaMes == null ? null : { ok: mermaMes <= 3, texto: mermaMes <= 3 ? "≤3 %" : ">3 %" }}
        detalle={unidades == null ? undefined : `${fmt(unidades)} envases`}
      />
      <div className="grid grid-cols-2 gap-2">
        <Kpi titulo="CAJAS PRODUCIDAS" serie={de("prod")} mayorEsMejor />
        <Kpi titulo="CAJAS PLANEADAS" serie={de("plan")} mayorEsMejor />
      </div>
      <Subtitulo>CUMPLIMIENTO DE PLAN</Subtitulo>
      <AnillosCumplimiento meses={meses.map((m) => ({ mes: m.mes, datos: m.datos?.presentaciones[clave] }))} />
      <Observacion
        titulo={<Subtitulo>OBSERVACIONES</Subtitulo>}
        texto={observacion}
        placeholder="Qué pasó en el mes con esta presentación"
        puedeEditar={puedeEditar}
        onGuardar={onGuardarObservacion}
      />
    </section>
  )
}
