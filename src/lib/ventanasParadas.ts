import { supabase } from "@/lib/supabase"
import type { VentanaTurno } from "@/lib/paradasTramo"
import type { Parada } from "@/lib/paradas"

/** Un turno abierto no tiene fin: queda "para siempre" y la cuenta se corta en `ahora`. */
const SIN_FIN = "9999-12-31T00:00:00"

interface FilaVentana {
  turno_id: string
  turno_tipo_codigo: string
  desde: string
  hasta: string | null
}

/** «TURNO_2» → «T2»; el 12x12 se llama como es. */
export function etiquetaTurno(codigo: string): string {
  const m = /^TURNO_(\d)$/.exec(codigo)
  return m ? `T${m[1]}` : codigo.toLowerCase()
}

export function mapearVentanas(filas: FilaVentana[]): VentanaTurno[] {
  return filas.map((f) => ({
    id: f.turno_id,
    etiqueta: etiquetaTurno(f.turno_tipo_codigo),
    desde: f.desde,
    hasta: f.hasta ?? SIN_FIN,
  }))
}

/**
 * Turnos reales del área (con sus horas de inicio y fin) que tocan el rango.
 * Si la consulta falla, devuelve vacío: el reporte muestra solo el total.
 */
export async function listarVentanasTurnos(area: string, desde: string, hasta: string): Promise<VentanaTurno[]> {
  const { data, error } = await supabase.rpc("ventanas_turnos_paradas", { p_area: area, p_desde: desde, p_hasta: hasta })
  if (error || !data) return []
  return mapearVentanas(data as FilaVentana[])
}

/** Las ventanas que la parada toca (ordenadas por inicio). */
export function ventanasDeParada(p: Pick<Parada, "inicio" | "fin">, todas: VentanaTurno[], ahora: Date): VentanaTurno[] {
  const ini = new Date(p.inicio).getTime()
  const fin = Math.min(p.fin ? new Date(p.fin).getTime() : ahora.getTime(), ahora.getTime())
  return todas
    .filter((v) => new Date(v.desde).getTime() < Math.max(fin, ini + 1) && new Date(v.hasta).getTime() > ini)
    .sort((a, b) => a.desde.localeCompare(b.desde))
}
