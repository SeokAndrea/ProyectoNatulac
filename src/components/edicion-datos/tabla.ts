import type { CatalogoId, FilaCatalogo } from "@/lib/edicionDatos"

/*
 * Cuentas puras de Edición de Datos (sin React): cómo se ve cada celda,
 * búsqueda, grupos, valores que se repiten hacia abajo y la lectura del
 * formulario. La pantalla (SeccionCatalogo y compañía) solo las usa.
 */

export interface Opcion {
  valor: string
  etiqueta: string
  /** Para ordenar grupos y filas (ej. la línea o los ml de la presentación). */
  orden?: number
}

/** Listas que vienen de otros catálogos: familias de sabor, líneas, presentaciones. */
export type OpcionesExternas = Partial<Record<"familias" | "lineas" | "presentaciones", Opcion[]>>

export interface Campo {
  /** Columna en la base. */
  clave: string
  etiqueta: string
  tipo: "texto" | "numero" | "opciones"
  unidad?: string
  /** Opciones fijas (tipo "opciones"). Los valores van como texto: "true"/"false" para sí/no. */
  opciones?: Opcion[]
  /** Opciones que salen de otro catálogo. */
  opcionesDe?: keyof OpcionesExternas
  /** El valor de la opción es un sí/no (se guarda como boolean). */
  booleano?: boolean
  /** Solo se escribe al crear; al editar sale con candado (ej. los ml de una presentación). */
  soloAlCrear?: boolean
  /** Ancho de la columna en la tabla (CSS grid). Sin ancho: reparte. */
  ancho?: string
  /** Aviso corto que aparece si se cambia (ej. cambiar la familia de un sabor). */
  notaAlCambiar?: string
}

export interface Seccion {
  id: CatalogoId
  titulo: string
  /** Para "Agregar …" y "Nuevo …". */
  singular: string
  campos: Campo[]
  /** Campo por el que se agrupa la tabla (sale como título de grupo, no como columna). */
  agruparPor?: string
  /** Columnas que no se repiten hacia abajo mientras no cambien (ej. 1000 ml, TB). */
  noRepetir?: string[]
  /** Filas más bajas (muchos registros parecidos). */
  compacta?: boolean
  /** No se crean desde acá (ej. líneas). */
  sinAgregar?: boolean
  /** Orden de las filas; sin esto, el que trae la base. */
  ordenar?: (a: FilaCatalogo, b: FilaCatalogo, opciones: OpcionesExternas) => number
}

export function opcionesDe(campo: Campo, externas: OpcionesExternas): Opcion[] {
  return campo.opciones ?? (campo.opcionesDe ? externas[campo.opcionesDe] ?? [] : [])
}

/** Número con coma decimal y punto de miles, como el resto de la app. */
export function formatearNumero(n: number): string {
  return n.toLocaleString("es", { maximumFractionDigits: 5 })
}

/** Lo que se ve en la celda. Vacío → "—". */
export function textoCelda(campo: Campo, valor: unknown, externas: OpcionesExternas): string {
  if (valor === null || valor === undefined || valor === "") return "—"
  if (campo.tipo === "opciones") {
    const opcion = opcionesDe(campo, externas).find((o) => o.valor === String(valor))
    return opcion?.etiqueta ?? String(valor)
  }
  if (campo.tipo === "numero") {
    const n = Number(valor)
    return Number.isFinite(n) ? formatearNumero(n) : String(valor)
  }
  return String(valor)
}

/** Columnas de la tabla: todas menos la de agrupar. */
export function columnasTabla(seccion: Seccion): Campo[] {
  return seccion.campos.filter((c) => c.clave !== seccion.agruparPor)
}

/** Busca en lo que se ve (no en los ids) y esconde los inactivos si no se piden. */
export function filtrarFilas(
  filas: FilaCatalogo[],
  seccion: Seccion,
  externas: OpcionesExternas,
  busqueda: string,
  verInactivos: boolean,
): FilaCatalogo[] {
  const q = normalizar(busqueda.trim())
  return filas.filter((fila) => {
    if (!verInactivos && !fila.activo) return false
    if (!q) return true
    return seccion.campos.some((c) => normalizar(textoCelda(c, fila[c.clave], externas)).includes(q))
  })
}

function normalizar(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
}

export type ItemTabla =
  | { tipo: "grupo"; clave: string; etiqueta: string; cantidad: number }
  | { tipo: "fila"; fila: FilaCatalogo; celdas: string[] }

/**
 * Filas listas para pintar: ordenadas, con un título por grupo y, en las
 * columnas de `noRepetir`, la celda vacía si es igual a la de arriba (y todas
 * las anteriores de esa lista también lo son).
 */
export function armarItems(filas: FilaCatalogo[], seccion: Seccion, externas: OpcionesExternas): ItemTabla[] {
  const ordenadas = seccion.ordenar ? [...filas].sort((a, b) => seccion.ordenar!(a, b, externas)) : filas
  const columnas = columnasTabla(seccion)
  const filasDe = (lista: FilaCatalogo[]): ItemTabla[] =>
    lista.map((fila, i) => ({
      tipo: "fila",
      fila,
      celdas: columnas.map((c) => (repetida(fila, lista[i - 1], c.clave, seccion.noRepetir) ? "" : textoCelda(c, fila[c.clave], externas))),
    }))

  if (!seccion.agruparPor) return filasDe(ordenadas)

  const campoGrupo = seccion.campos.find((c) => c.clave === seccion.agruparPor)!
  const claves: string[] = []
  for (const fila of ordenadas) {
    const clave = String(fila[campoGrupo.clave] ?? "")
    if (!claves.includes(clave)) claves.push(clave)
  }
  const orden = opcionesDe(campoGrupo, externas).map((o) => o.valor)
  claves.sort((a, b) => indice(orden, a) - indice(orden, b))

  return claves.flatMap((clave) => {
    const delGrupo = ordenadas.filter((f) => String(f[campoGrupo.clave] ?? "") === clave)
    return [
      { tipo: "grupo" as const, clave, etiqueta: textoCelda(campoGrupo, clave, externas), cantidad: delGrupo.length },
      ...filasDe(delGrupo),
    ]
  })
}

function indice(lista: string[], valor: string): number {
  const i = lista.indexOf(valor)
  return i === -1 ? lista.length : i
}

function repetida(fila: FilaCatalogo, anterior: FilaCatalogo | undefined, clave: string, noRepetir?: string[]): boolean {
  if (!anterior || !noRepetir?.includes(clave)) return false
  return noRepetir.slice(0, noRepetir.indexOf(clave) + 1).every((k) => fila[k] === anterior[k])
}

/** Valor del campo para el formulario: texto, con coma decimal en los números. */
export function valorParaFormulario(campo: Campo, valor: unknown): string {
  if (valor === null || valor === undefined) return ""
  if (campo.tipo === "numero") return String(valor).replace(".", ",")
  return String(valor)
}

/** Lo que manda el formulario a la base, o el primer error para mostrar. */
export function leerFormulario(
  seccion: Seccion,
  borrador: Record<string, string>,
  esNuevo: boolean,
): { ok: true; valores: Record<string, string | number | boolean | null> } | { ok: false; error: string } {
  const valores: Record<string, string | number | boolean | null> = {}
  for (const campo of seccion.campos) {
    if (campo.soloAlCrear && !esNuevo) continue
    const texto = (borrador[campo.clave] ?? "").trim()
    if (texto === "") {
      valores[campo.clave] = null
      continue
    }
    if (campo.tipo === "numero") {
      // Con coma, la coma es el decimal y los puntos son miles ("2.710,5"); sin coma, el punto es el decimal ("0.0382").
      const n = Number(texto.includes(",") ? texto.replace(/\./g, "").replace(",", ".") : texto)
      if (!Number.isFinite(n)) return { ok: false, error: `${campo.etiqueta}: escribe un número.` }
      valores[campo.clave] = n
    } else if (campo.booleano) {
      valores[campo.clave] = texto === "true"
    } else {
      valores[campo.clave] = texto
    }
  }
  return { ok: true, valores }
}
