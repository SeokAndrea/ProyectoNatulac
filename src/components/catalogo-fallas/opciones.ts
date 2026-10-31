import { NOMBRE_CLASE, type ClaseParada } from "@/lib/paradas"
import type { TipoEquipo } from "@/lib/catalogoFallas/tipos"

/** «No programada» primero: es la que lleva casi toda falla mecánica. */
export const OPCIONES_CLASE: { valor: ClaseParada; texto: string }[] = [
  { valor: "NO_PROGRAMADA", texto: NOMBRE_CLASE.NO_PROGRAMADA },
  { valor: "PROGRAMADA", texto: NOMBRE_CLASE.PROGRAMADA },
  { valor: "OCIOSO", texto: "Ocioso" },
]

export const OPCIONES_TIPO_EQUIPO: { valor: TipoEquipo; texto: string }[] = [
  { valor: "LINEA", texto: "De línea" },
  { valor: "SERVICIOS", texto: "De servicios" },
]
