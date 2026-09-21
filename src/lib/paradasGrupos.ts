import { NOMBRE_FAMILIA, type FamiliaParada } from "@/lib/paradas"
import type { EquipoParada } from "@/lib/paradasEquipos"

/*
 * Agrupación del catálogo de tipos de parada, como la lleva el dueño:
 * Programada, Línea no programada (LNPE), Operacional (OP), Suministro (S),
 * Equipo de Proceso (EP), Codificación, luego UN GRUPO POR EQUIPO de línea
 * (Helix, Cardboard Packer, Robot Tavil, A3 Flex…) y al final Tiempo ocioso.
 * La usan el Catálogo de Paradas y el selector del Registro.
 */

const ORDEN_FAMILIAS: FamiliaParada[] = [
  "PROGRAMADA",
  "EXTERNA",
  "OPERACIONAL",
  "SUMINISTRO",
  "SUMINISTRO_VAPOR",
  "EQUIPO_PROCESO",
  "ESTERILIZACION",
  "PREPARACION",
  "CODIFICACION",
  "OCIOSO",
]

export interface GrupoTipos<T> {
  clave: string
  titulo: string
  tipos: T[]
}

interface ConGrupo {
  familia: FamiliaParada
  equipoCodigo?: string | null
}

/** Agrupa los tipos en el orden del dueño. Dentro de cada grupo se respeta el orden en que vienen. */
export function agruparTipos<T extends ConGrupo>(tipos: T[], equipos: EquipoParada[]): GrupoTipos<T>[] {
  const grupos = new Map<string, GrupoTipos<T> & { orden: number }>()

  for (const t of tipos) {
    let clave: string
    let titulo: string
    let orden: number
    if (t.familia === "EQUIPO" && t.equipoCodigo) {
      const i = equipos.findIndex((e) => e.codigo === t.equipoCodigo)
      clave = `EQ:${t.equipoCodigo}`
      titulo = equipos[i]?.nombre ?? t.equipoCodigo
      orden = 100 + (i >= 0 ? i : 999)
    } else {
      const i = ORDEN_FAMILIAS.indexOf(t.familia)
      clave = `FAM:${t.familia}`
      titulo = NOMBRE_FAMILIA[t.familia] ?? t.familia
      // el ocioso siempre al final, después de los equipos
      orden = t.familia === "OCIOSO" ? 1000 : i >= 0 ? i : 500
    }
    const g = grupos.get(clave) ?? { clave, titulo, tipos: [], orden }
    g.tipos.push(t)
    grupos.set(clave, g)
  }

  return [...grupos.values()].sort((a, b) => a.orden - b.orden).map(({ clave, titulo, tipos: ts }) => ({ clave, titulo, tipos: ts }))
}
