import type { CSSProperties } from "react"
import { capital, generalesDeLinea, nombreMes, presentacionesDeLinea, tieneDatos } from "@/lib/indicadores/calculos"
import { claveP } from "@/lib/indicadores/tipos"
import type { VelocidadLive } from "@/lib/catalogosLive"
import { colorLinea, colorPresentacion } from "@/components/indicadores/colores"
import { ColumnaPresentacion } from "@/components/indicadores/ColumnaPresentacion"
import { GraficoEficiencia } from "@/components/indicadores/GraficoEficiencia"
import { hayParadas, ParadasLinea } from "@/components/indicadores/ParadasLinea"
import { cn } from "@/lib/utils"
import type { MesIndicadores } from "@/components/indicadores/useIndicadores"

/*
 * Una línea: a la izquierda la eficiencia (3 meses) y las paradas no
 * programadas; después una columna por presentación. Una presentación sin
 * datos en el mes elegido no aparece (dueña, 2026-10-14).
 */
export function VistaLinea({
  linea,
  meses,
  velocidades,
  observaciones,
  puedeEditar,
  onGuardarObservacion,
}: {
  linea: string
  meses: MesIndicadores[]
  velocidades: VelocidadLive[]
  observaciones: Record<string, string>
  puedeEditar: boolean
  onGuardarObservacion: (clave: string, texto: string) => Promise<{ ok: true } | { ok: false; error: string }>
}) {
  const elegido = meses[meses.length - 1]
  const claves = meses.flatMap((m) => Object.keys(m.datos?.presentaciones ?? {}))
  const visibles = presentacionesDeLinea(linea, velocidades, claves).filter((p) => tieneDatos(elegido.datos?.presentaciones[p.clave], elegido.modo))
  const color = colorLinea(linea)
  const manual = elegido.modo === "MANUAL"
  const generales = manual ? generalesDeLinea(elegido.datos, linea) : []
  // Sin paradas cargadas, la presentación no aparece en Paradas; sin ninguna, tampoco el bloque (dueña, 2026-10-14).
  const conParadas = visibles
    .map((p) => ({ clave: p.clave, nombre: p.nombre, color: colorPresentacion(linea, p.indice), paradas: elegido.datos?.presentaciones[p.clave]?.paradas ?? [] }))
    .filter((p) => hayParadas(p.paradas))
  const verParadas = conParadas.length > 0 || hayParadas(generales)

  return (
    <div
      className="grid min-h-0 flex-1 grid-cols-1 gap-2.5 lg:[grid-template-columns:var(--columnas)]"
      style={{ ...color, "--columnas": `minmax(0, 1.15fr) repeat(${Math.max(1, visibles.length)}, minmax(0, 1fr))` } as CSSProperties}
    >
      <div className="flex min-h-0 min-w-0 flex-col gap-2.5">
        <section aria-label="Eficiencia de la línea" className={cn("flex min-h-[190px] flex-col gap-1.5 rounded-xl border bg-card px-3 py-2.5", verParadas ? "h-[38%]" : "flex-1")}>
          <h2 className="flex items-baseline gap-2 text-base font-bold tracking-wider text-[var(--c-texto)]">
            EFICIENCIA <span className="text-xs font-medium tracking-normal text-foreground">Línea {linea}</span>
          </h2>
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-foreground">
            <span className="inline-flex items-center gap-1.5">
              <i className="inline-block size-2.5 rounded-sm bg-[var(--c)]" />
              {capital(nombreMes(elegido.mes))}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <i className="inline-block size-2.5 rounded-sm bg-[var(--c)] opacity-45" />
              Meses anteriores
            </span>
            <span className="inline-flex items-center gap-1.5">
              <i className="inline-block w-3.5 border-t-2 border-dashed border-muted-foreground" />
              Estándar 85 %
            </span>
          </div>
          <GraficoEficiencia serie={meses.map((m) => ({ mes: m.mes, valor: m.datos?.eficiencia[linea] ?? null }))} />
        </section>
        {verParadas && <ParadasLinea manual={manual} generales={generales} presentaciones={conParadas} />}
      </div>
      {visibles.map((p) => (
        <ColumnaPresentacion
          key={p.clave}
          clave={claveP(linea, p.ml)}
          nombre={p.nombre}
          linea={linea}
          color={colorPresentacion(linea, p.indice)}
          meses={meses}
          observacion={observaciones[p.clave]}
          puedeEditar={puedeEditar}
          onGuardarObservacion={(texto) => onGuardarObservacion(p.clave, texto)}
        />
      ))}
    </div>
  )
}
