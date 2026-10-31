import { NOMBRE_FAMILIA, type ClaseParada, type FamiliaParada } from "@/lib/paradas"
import type { TipoParadaEditable } from "@/lib/paradasCatalogo"
import { codigoDesdeNombre, sinTildes } from "@/lib/texto"

/*
 * «Otras paradas»: las que no son fallas de equipo (PP, LNPE, OP, S…). Se
 * agrupan por prefijo de código; una nueva toma el siguiente número de su
 * grupo y la clase sale de la familia, como siempre (Programada no castiga,
 * LNPE cuenta como ocioso, el resto castiga). Funciones puras.
 */

/** Las mecánicas van en el catálogo de fallas (Equipo › Sistema › Subsistema › Falla). */
const FAMILIAS_DE_EQUIPO = new Set<FamiliaParada>(["EQUIPO", "EQUIPO_PROCESO"])
export const esFamiliaDeEquipo = (f: FamiliaParada) => FAMILIAS_DE_EQUIPO.has(f)
const OCIOSO = "OCIOSO"

export interface GrupoParadas {
  /** El prefijo (PP, LNPE…) o OCIOSO, que no lleva código. */
  clave: string
  familia: FamiliaParada
  prefijo: string
  nombre: string
  /** Cómo cuenta para la eficiencia, en palabras. */
  cuenta: string
  /** Si sus códigos llevan número (LNPEL1-3) o no (PPL1). */
  numerado: boolean
  conLinea: boolean
  tipos: TipoParadaEditable[]
}

export const claseDeFamilia = (f: FamiliaParada): ClaseParada => (f === "PROGRAMADA" ? "PROGRAMADA" : f === "OCIOSO" ? "OCIOSO" : "NO_PROGRAMADA")

function cuentaDe(familia: FamiliaParada, prefijo: string): string {
  if (familia === "PROGRAMADA") return "No castiga la eficiencia"
  if (prefijo === "LNPE") return "Cuenta como ocioso: baja la meta, no castiga"
  if (familia === "OCIOSO") return "No castiga la eficiencia"
  return "Castiga la eficiencia"
}

/** Grupos por prefijo, en el orden de siempre (PP primero), más «Tiempo ocioso» aunque esté vacío. */
export function gruposOtrasParadas(tipos: TipoParadaEditable[], verInactivos = true): GrupoParadas[] {
  const porClave = new Map<string, GrupoParadas>()
  for (const t of tipos) {
    if (FAMILIAS_DE_EQUIPO.has(t.familia)) continue
    const esOcioso = t.familia === "OCIOSO"
    const prefijo = t.prefijoPlanilla.trim().toUpperCase()
    if (!esOcioso && !prefijo) continue // «por clasificar» y otros especiales: no se editan acá
    const clave = esOcioso ? OCIOSO : prefijo
    let g = porClave.get(clave)
    if (!g) {
      g = {
        clave,
        familia: t.familia,
        prefijo: esOcioso ? "" : prefijo,
        nombre: esOcioso ? NOMBRE_FAMILIA.OCIOSO : `${NOMBRE_FAMILIA[t.familia].replace(/\s*\(.*\)$/, "")} (${prefijo})`,
        cuenta: cuentaDe(t.familia, prefijo),
        numerado: false,
        conLinea: t.codigoConLinea !== false,
        tipos: [],
      }
      porClave.set(clave, g)
    }
    if (t.secuenciaPlanilla != null) g.numerado = true
    if (verInactivos || t.activo) g.tipos.push(t)
  }
  if (!porClave.has(OCIOSO)) {
    porClave.set(OCIOSO, { clave: OCIOSO, familia: "OCIOSO", prefijo: "", nombre: NOMBRE_FAMILIA.OCIOSO, cuenta: cuentaDe("OCIOSO", ""), numerado: false, conLinea: false, tipos: [] })
  }
  const orden = (g: GrupoParadas) => (g.familia === "PROGRAMADA" ? 0 : g.familia === "OCIOSO" ? 2 : 1)
  return [...porClave.values()]
    .map((g) => ({ ...g, tipos: g.tipos.sort((a, b) => (a.secuenciaPlanilla ?? 0) - (b.secuenciaPlanilla ?? 0) || a.nombre.localeCompare(b.nombre, "es")) }))
    .sort((a, b) => orden(a) - orden(b) || a.prefijo.localeCompare(b.prefijo))
}

/** El número que le toca a una nueva del grupo (null si el grupo no numera, como PP). Cuenta también las inactivas. */
export const siguienteSecuencia = (g: GrupoParadas): number | null =>
  g.numerado ? g.tipos.reduce((max, t) => Math.max(max, t.secuenciaPlanilla ?? 0), 0) + 1 : null

/** Código para mostrar (el de la Línea 1): LNPEL1-7, PPL1, o «Sin código» para el ocioso. */
export function codigoMuestra(g: GrupoParadas, secuencia: number | null): string {
  if (!g.prefijo) return "Sin código"
  return `${g.prefijo}${g.conLinea ? "L1" : ""}${secuencia != null ? `-${secuencia}` : ""}`
}

const PALABRAS_VACIAS = new Set(["de", "del", "la", "las", "el", "los", "en", "por", "sin", "con", "para", "falta", "falla"])

/**
 * Paradas que ya existen con un nombre parecido (comparten una palabra que dice
 * algo, sin tildes): «Sin paletas» → «Falta de Insumos/Paletas». Hasta 3.
 */
export function parecidas(nombre: string, tipos: TipoParadaEditable[]): TipoParadaEditable[] {
  const palabras = sinTildes(nombre)
    .split(/[^a-z0-9]+/)
    .filter((p) => p.length >= 4 && !PALABRAS_VACIAS.has(p))
  if (palabras.length === 0) return []
  return tipos.filter((t) => !FAMILIAS_DE_EQUIPO.has(t.familia) && palabras.some((p) => sinTildes(t.nombre).includes(p))).slice(0, 3)
}

/** El tipo nuevo listo para guardarTipo(): código interno único, número siguiente, en todas las líneas. */
export function tipoNuevo(g: GrupoParadas, nombre: string, tiempoGuiaMin: number | null, todos: TipoParadaEditable[]): TipoParadaEditable {
  const base = codigoDesdeNombre(nombre)
  let codigo = base
  for (let n = 2; todos.some((t) => t.codigo === codigo); n++) codigo = `${base}_${n}`
  return {
    codigo,
    nombre: nombre.replace(/\s+/g, " ").trim(),
    clase: claseDeFamilia(g.familia),
    familia: g.familia,
    equipoCodigo: null,
    tiempoGuiaMin: g.familia === "PROGRAMADA" ? tiempoGuiaMin : null,
    prefijoPlanilla: g.prefijo,
    secuenciaPlanilla: siguienteSecuencia(g),
    codigoConLinea: g.conLinea,
    lineas: [],
    activo: true,
  }
}
