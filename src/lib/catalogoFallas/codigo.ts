import { sinTildes } from "@/lib/texto"
import type { FallaCatalogo } from "./tipos"

/*
 * Sufijos y códigos. Las mismas reglas que valida el servidor
 * (catalogo_sufijo(), migración 20261113490000); acá solo para avisar antes
 * de mandar y para mostrar el código que va a salir.
 */

export const SUFIJO_MAX = 6
const SUFIJO_VALIDO = /^[A-Z0-9]{2,6}$/

/** Lo que se escribe en el campo: «cám a» → «CAMA». */
export const normalizarSufijo = (texto: string) =>
  sinTildes(texto)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, SUFIJO_MAX)

/** null si sirve; si no, qué arreglar. `ocupados`: los sufijos de sus hermanos. */
export function errorSufijo(sufijo: string, ocupados: string[]): string | null {
  if (!SUFIJO_VALIDO.test(sufijo)) return "El sufijo lleva de 2 a 6 letras o números."
  if (ocupados.includes(sufijo)) return `Ya existe el sufijo ${sufijo} en este nivel.`
  return null
}

/** Primeras letras del nombre que no estén ocupadas: «Cámara aséptica» → «CAM» (o «CAMA» si CAM ya está). */
export function sugerirSufijo(nombre: string, ocupados: string[]): string {
  const base = normalizarSufijo(nombre)
  if (base.length < 2) return ""
  for (let largo = 3; largo <= Math.min(base.length, SUFIJO_MAX); largo++) {
    if (!ocupados.includes(base.slice(0, largo))) return base.slice(0, largo)
  }
  const raiz = base.slice(0, 3)
  for (let n = 2; n < 100; n++) {
    if (!ocupados.includes(`${raiz}${n}`)) return `${raiz}${n}`
  }
  return ""
}

/** El que sigue en el subsistema: nunca reutiliza un número, ni de fallas inactivas. */
export const siguienteNumero = (fallas: FallaCatalogo[], subsistemaId: string) =>
  fallas.filter((f) => f.subsistemaId === subsistemaId).reduce((max, f) => Math.max(max, f.numero), 0) + 1

/** Código que va a salir, para mostrarlo antes de guardar. Un sufijo vacío se ve como «…». */
export const componerCodigo = (sufijos: string[], numero: number) =>
  [...sufijos.map((s) => s || "…"), String(numero).padStart(2, "0")].join("-")

/** Lo pegado del Excel: una falla por línea, sin vacías ni repetidas. */
export function nombresPegados(texto: string): string[] {
  const vistos = new Set<string>()
  const nombres: string[] = []
  for (const linea of texto.split(/\r?\n/)) {
    const nombre = linea.replace(/\s+/g, " ").trim()
    const clave = sinTildes(nombre)
    if (!nombre || vistos.has(clave)) continue
    vistos.add(clave)
    nombres.push(nombre)
  }
  return nombres
}
