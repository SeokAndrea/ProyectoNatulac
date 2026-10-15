import { useState, type CSSProperties } from "react"
import { topParadas } from "@/lib/indicadores/calculos"
import type { ParadaMes } from "@/lib/indicadores/tipos"
import { fmt, fmtHoras } from "@/components/indicadores/formato"
import { useBloqueAjustado } from "@/components/indicadores/useTextoAjustado"

/*
 * Todo se mide en `em` sobre la letra base del bloque (antes 12,5 px fijos):
 * useBloqueAjustado la agranda si sobra espacio (pocas paradas) y la achica
 * si no entra (dueña, 2026-10-15). Los nombres no se cortan con «…»: pasan
 * a dos renglones, para leerlos enteros al exponer.
 */
const LETRA = { max: 22, min: 10, telefono: 12.5 }
/** Con los nombres recortados, hasta el tamaño de antes: más letra solo cortaría más el nombre. */
const LETRA_RECORTADA = { ...LETRA, max: 12.5 }

/** El número de la parada, en un círculo. */
function Numero({ n }: { n: number }) {
  return <span className="grid size-[1.62em] place-items-center rounded-full bg-muted text-[0.84em] font-bold">{n}</span>
}

function Lista({ titulo, paradas, por }: { titulo: string; paradas: ParadaMes[]; por: "tiempo" | "veces" }) {
  const top = topParadas(paradas, por)
  return (
    <div className="flex min-w-0 flex-col justify-evenly gap-[0.25em]">
      <span className="text-[0.84em] font-semibold uppercase tracking-wider text-foreground">{titulo}</span>
      {top.length === 0 && <span className="text-[1.12em] text-foreground">—</span>}
      {top.map((p, i) => (
        <div
          key={p.causa}
          title={`${p.causa}\n${p.minutos == null ? "—" : fmt(p.minutos)} min · ${p.veces == null ? "—" : p.veces} veces`}
          className="grid grid-cols-[1.36em_minmax(0,1fr)_auto] items-center gap-[0.4em] leading-snug"
        >
          <Numero n={i + 1} />
          <span className="nombre-parada break-words">{p.causa}</span>
          <span className="font-mono text-[0.96em] text-foreground">{por === "tiempo" ? fmtHoras(p.minutos) : p.veces == null ? "—" : `${p.veces}×`}</span>
        </div>
      ))}
    </div>
  )
}

/** Cargadas a mano: solo los nombres, numerados, sin tiempo ni veces (dueña, 2026-10-14). */
function ListaNombres({ paradas }: { paradas: ParadaMes[] }) {
  const nombres = paradas.map((p) => p.causa.trim()).filter(Boolean)
  if (nombres.length === 0) return <span className="text-[1.12em] text-foreground">—</span>
  return (
    <ol className="flex flex-col gap-[0.25em] leading-snug">
      {nombres.map((n, i) => (
        <li key={`${i}-${n}`} className="grid grid-cols-[1.36em_minmax(0,1fr)] items-center gap-[0.4em]">
          <Numero n={i + 1} />
          <span className="nombre-parada break-words" title={n}>
            {n}
          </span>
        </li>
      ))}
    </ol>
  )
}

/**
 * Paradas del mes, por presentación. Automático: 3 por tiempo y 3 por veces.
 * Manual: la lista de lo cargado, solo los nombres, con las GENERALES de la
 * línea arriba. Los bloques se reparten todo el alto.
 * Solo llegan las presentaciones con paradas (VistaLinea filtra con hayParadas).
 */
/** Si hay alguna parada con nombre. Sin paradas, el bloque no aparece (dueña, 2026-10-14). */
export const hayParadas = (paradas: ParadaMes[] | undefined) => !!paradas?.some((p) => p.causa.trim())

export function ParadasLinea({
  presentaciones,
  manual,
  generales = [],
}: {
  presentaciones: { clave: string; nombre: string; color: CSSProperties; paradas: ParadaMes[] }[]
  manual: boolean
  /** Solo en manual. */
  generales?: ParadaMes[]
}) {
  // Cambia con lo que se muestra: vuelve a calcular la letra.
  const clave = JSON.stringify([manual, generales.map((p) => p.causa), presentaciones.map((p) => [p.clave, p.paradas.map((x) => [x.causa, x.minutos, x.veces])])])
  // Plan B: si ni con la letra mínima entran los nombres completos, van en un renglón con «…» (como antes).
  const [recorte, setRecorte] = useState<{ clave: string; truncar: boolean }>({ clave, truncar: false })
  const truncar = recorte.clave === clave && recorte.truncar
  const ajuste = useBloqueAjustado(`${clave}|${truncar}`, truncar ? LETRA_RECORTADA : LETRA)
  if (ajuste.noEntra && !truncar) setRecorte({ clave, truncar: true })

  return (
    <section
      ref={ajuste.ref}
      aria-label="Paradas"
      style={{ fontSize: ajuste.tamano }}
      className={`flex min-h-0 flex-1 flex-col gap-2 overflow-hidden rounded-xl ${truncar ? "[&_.nombre-parada]:truncate" : ""} border bg-card px-3 py-2.5 max-lg:flex-none`}
    >
      <h2 className="text-[0.92em] font-semibold uppercase tracking-wider text-foreground">{manual ? "Paradas" : "Paradas no programadas"}</h2>
      {manual && hayParadas(generales) && (
        <div className="flex flex-[1_0_auto] flex-col justify-evenly gap-1 border-l-4 border-muted-foreground py-1 pl-2.5 max-lg:flex-none">
          <span className="text-[1.2em] font-bold">GENERALES</span>
          <ListaNombres paradas={generales} />
        </div>
      )}
      {presentaciones.map((p) => (
        <div key={p.clave} style={p.color} className="flex flex-[1_0_auto] flex-col justify-evenly gap-1 border-l-4 border-[var(--c)] py-1 pl-2.5 max-lg:flex-none">
          <span className="text-[1.2em] font-bold text-[var(--c-texto)]">{p.nombre}</span>
          {manual ? (
            <ListaNombres paradas={p.paradas} />
          ) : (
            <div className="grid flex-1 grid-cols-2 gap-x-3">
              <Lista titulo="Más tiempo" paradas={p.paradas} por="tiempo" />
              <Lista titulo="Más veces" paradas={p.paradas} por="veces" />
            </div>
          )}
        </div>
      ))}
    </section>
  )
}
