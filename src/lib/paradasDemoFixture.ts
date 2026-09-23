import { fechaLocal, horaLocal } from "@/lib/turno"
import { tipoPorCodigo, type ClaseParada, type OrigenParada, type Parada } from "@/lib/paradas"

/*
 * DATOS DE PRUEBA para /paradas-demo, la página de Registro y el Panel de
 * Paradas mientras no hay base (FASE A′). Fixture chico del modelo nuevo:
 * unas cuantas PROGRAMADA, OCIOSO y NO_PROGRAMADA manual (todas cerradas —
 * se cargan con duración, no quedan "en curso") + NO_PROGRAMADA Mecánica
 * (`origen: "MANTENIMIENTO"`, como si las hubiera cargado Mantenimiento en
 * su propia pantalla — esas sí pueden seguir abiertas hasta que las cierran
 * a mano). Se anclan a HOY vía `offsetDias` para que los presets de fecha
 * tengan datos. Se puede borrar cuando FASE B′/C′ estén.
 */

interface RawParada {
  id: string
  clase: ClaseParada
  origen: OrigenParada
  lineaCodigo: string
  turnoTipo: string
  /** Para PROGRAMADA: código del catálogo. Para OCIOSO/NO_PROGRAMADA: null + `tipoNombre`. */
  tipoCodigo: string | null
  tipoNombre?: string
  tiempoGuiaMin?: number | null
  nota?: string | null
  /** Obligatoria en el form solo para PROGRAMADA cuando duracionMin > tiempoGuiaMin del tipo — ver Parada.justificacionDesvio en paradas.ts. */
  justificacionDesvio?: string | null
  supervisorNombre?: string | null
  offsetDias: number
  hora: string // 'HH:MM'
  /** minutos; null = parada todavía abierta ("Continúa" — solo válido para origen MANTENIMIENTO). */
  duracionMin: number | null
  /** Qué corría en la línea en ese momento — null cuando no aplica (CIP, orden y limpieza, liberación de vapor). Ver nota en Parada (paradas.ts). */
  saborNombre?: string | null
  familiaNombre?: string | null
  presentacionMl?: number | null
}

const RAW: RawParada[] = [
  // ---- Programadas (todas cerradas — se cargan con duración) ----
  { id: "p-arr-1", clase: "PROGRAMADA", origen: "MANUAL", lineaCodigo: "LINEA_1", turnoTipo: "TURNO_1", tipoCodigo: "ARRANQUE_PRODUCCION", justificacionDesvio: "Arranque más lento por ajuste de presión en la llenadora.", supervisorNombre: "EUSTORGIO", offsetDias: 0, hora: "07:05", duracionMin: 205, saborNombre: "Manzana", familiaNombre: "Clásicos", presentacionMl: 1000 },
  { id: "p-csab-1", clase: "PROGRAMADA", origen: "MANUAL", lineaCodigo: "LINEA_1", turnoTipo: "TURNO_1", tipoCodigo: "CAMBIO_SABOR", supervisorNombre: "EUSTORGIO", offsetDias: 0, hora: "11:40", duracionMin: 22, saborNombre: "Manzana", familiaNombre: "Clásicos", presentacionMl: 1000 },
  { id: "p-clote-1", clase: "PROGRAMADA", origen: "MANUAL", lineaCodigo: "LINEA_2", turnoTipo: "TURNO_1", tipoCodigo: "CAMBIO_LOTE", justificacionDesvio: "Etiqueta mal impresa — hubo que reimprimir antes de retomar.", supervisorNombre: "EUSTORGIO", offsetDias: 0, hora: "09:15", duracionMin: 14, saborNombre: "Pera", familiaNombre: "Selecto", presentacionMl: 250 },
  { id: "p-desc-1", clase: "PROGRAMADA", origen: "MANUAL", lineaCodigo: "LINEA_2", turnoTipo: "TURNO_1", tipoCodigo: "DESCANSO_LEGAL", supervisorNombre: "EUSTORGIO", offsetDias: 0, hora: "12:00", duracionMin: 30, saborNombre: "Pera", familiaNombre: "Selecto", presentacionMl: 250 },
  { id: "p-limp-1", clase: "PROGRAMADA", origen: "MANUAL", lineaCodigo: "LINEA_3", turnoTipo: "TURNO_1", tipoCodigo: "LIMPIEZA_INTERMEDIA", supervisorNombre: "EUSTORGIO", offsetDias: 1, hora: "10:30", duracionMin: 165, saborNombre: null, familiaNombre: null, presentacionMl: null },
  { id: "p-arr-2", clase: "PROGRAMADA", origen: "MANUAL", lineaCodigo: "LINEA_2", turnoTipo: "TURNO_2", tipoCodigo: "ARRANQUE_PRODUCCION", justificacionDesvio: "Retraso por prueba adicional de calidad antes de arrancar.", supervisorNombre: "JAVIER", offsetDias: 2, hora: "15:10", duracionMin: 190, saborNombre: "Durazno", familiaNombre: "Clásicos", presentacionMl: 1000 },
  { id: "p-clote-2", clase: "PROGRAMADA", origen: "MANUAL", lineaCodigo: "LINEA_1", turnoTipo: "TURNO_2", tipoCodigo: "CAMBIO_LOTE", supervisorNombre: "JAVIER", offsetDias: 3, hora: "18:20", duracionMin: 9, saborNombre: "Manzana", familiaNombre: "Clásicos", presentacionMl: 1000 },
  { id: "p-mant-1", clase: "PROGRAMADA", origen: "MANUAL", lineaCodigo: "LINEA_3", turnoTipo: "TURNO_2", tipoCodigo: "MANTENIMIENTO_PROGRAMADO", justificacionDesvio: "Repuesto necesitó ajuste en sitio, no venía a medida.", supervisorNombre: "JAVIER", offsetDias: 4, hora: "16:00", duracionMin: 240, saborNombre: "Naranja", familiaNombre: "Jucosa", presentacionMl: 200 },
  { id: "p-orden-1", clase: "PROGRAMADA", origen: "MANUAL", lineaCodigo: "LINEA_1", turnoTipo: "TURNO_1", tipoCodigo: "ORDEN_LIMPIEZA_FIN_TURNO", justificacionDesvio: "Hubo que reorganizar paletas adicionales en el área.", supervisorNombre: "EUSTORGIO", offsetDias: 5, hora: "14:40", duracionMin: 18, saborNombre: null, familiaNombre: null, presentacionMl: null },
  { id: "p-vapor-1", clase: "PROGRAMADA", origen: "MANUAL", lineaCodigo: "LINEA_2", turnoTipo: "TURNO_3", tipoCodigo: "LIBERACION_VAPOR", supervisorNombre: "PEDRO", offsetDias: 6, hora: "23:30", duracionMin: 35, saborNombre: null, familiaNombre: null, presentacionMl: null },
  { id: "p-csab-2", clase: "PROGRAMADA", origen: "MANUAL", lineaCodigo: "LINEA_1", turnoTipo: "TURNO_1", tipoCodigo: "CAMBIO_SABOR", supervisorNombre: "EUSTORGIO", offsetDias: 0, hora: "13:05", duracionMin: 18, saborNombre: "Mango", familiaNombre: "Clásicos", presentacionMl: 1000 },

  // ---- Tiempo ocioso (texto libre) ----
  { id: "o-1", clase: "OCIOSO", origen: "MANUAL", lineaCodigo: "LINEA_1", turnoTipo: "TURNO_1", tipoCodigo: null, tipoNombre: "Tiempo ocioso", tiempoGuiaMin: null, nota: "Espera de montacargas para retirar paletas", supervisorNombre: "EUSTORGIO", offsetDias: 0, hora: "10:05", duracionMin: 28, saborNombre: "Manzana", familiaNombre: "Clásicos", presentacionMl: 1000 },
  { id: "o-2", clase: "OCIOSO", origen: "MANUAL", lineaCodigo: "LINEA_3", turnoTipo: "TURNO_1", tipoCodigo: null, tipoNombre: "Tiempo ocioso", tiempoGuiaMin: 20, nota: "Sin operador en la embaladora", supervisorNombre: "EUSTORGIO", offsetDias: 1, hora: "08:50", duracionMin: 45, saborNombre: "Naranja", familiaNombre: "Jucosa", presentacionMl: 200 },
  { id: "o-3", clase: "OCIOSO", origen: "MANUAL", lineaCodigo: "LINEA_2", turnoTipo: "TURNO_2", tipoCodigo: null, tipoNombre: "Tiempo ocioso", tiempoGuiaMin: null, nota: "Falta de cajas de cartón en el área", supervisorNombre: "JAVIER", offsetDias: 3, hora: "19:40", duracionMin: 52, saborNombre: "Durazno", familiaNombre: "Selecto", presentacionMl: 250 },

  // ---- No programadas — Operacional/Externa/etc., cargadas a mano (catálogo, todas cerradas) ----
  { id: "np-op-1", clase: "NO_PROGRAMADA", origen: "MANUAL", lineaCodigo: "LINEA_1", turnoTipo: "TURNO_1", tipoCodigo: "FALTA_OPERADOR", supervisorNombre: "EUSTORGIO", offsetDias: 0, hora: "15:20", duracionMin: 18, saborNombre: "Mango", familiaNombre: "Clásicos", presentacionMl: 1000 },
  { id: "np-op-2", clase: "NO_PROGRAMADA", origen: "MANUAL", lineaCodigo: "LINEA_2", turnoTipo: "TURNO_1", tipoCodigo: "FALTA_VAPOR", supervisorNombre: "EUSTORGIO", offsetDias: 1, hora: "11:10", duracionMin: 40, saborNombre: "Pera", familiaNombre: "Selecto", presentacionMl: 250 },
  { id: "np-op-3", clase: "NO_PROGRAMADA", origen: "MANUAL", lineaCodigo: "LINEA_3", turnoTipo: "TURNO_1", tipoCodigo: "PRESENTACION_NO_PLANIFICADA", supervisorNombre: "EUSTORGIO", offsetDias: 0, hora: "14:00", duracionMin: 25, saborNombre: null, familiaNombre: null, presentacionMl: null },

  // ---- No programadas — Mecánica (equipo/subsistema), las carga Mantenimiento en su propia pantalla ----
  { id: "np-1", clase: "NO_PROGRAMADA", origen: "MANTENIMIENTO", lineaCodigo: "LINEA_3", turnoTipo: "TURNO_3", tipoCodigo: null, tipoNombre: "Falla mecánica — A3CFLEX · Sistema de tracción", tiempoGuiaMin: null, nota: "Corrección de diseño en la correa servo", supervisorNombre: "PEDRO", offsetDias: 0, hora: "01:08", duracionMin: 95, saborNombre: "Naranja", familiaNombre: "Jucosa", presentacionMl: 200 },
  { id: "np-2", clase: "NO_PROGRAMADA", origen: "MANTENIMIENTO", lineaCodigo: "LINEA_1", turnoTipo: "TURNO_2", tipoCodigo: null, tipoNombre: "Falla eléctrica — Selladora Angelus", tiempoGuiaMin: null, nota: "Caída de suministro eléctrico; CIP forzado antes de rearrancar", supervisorNombre: "JAVIER", offsetDias: 2, hora: "17:25", duracionMin: 205, saborNombre: "Manzana", familiaNombre: "Clásicos", presentacionMl: 1000 },
  { id: "np-3", clase: "NO_PROGRAMADA", origen: "MANTENIMIENTO", lineaCodigo: "LINEA_2", turnoTipo: "TURNO_1", tipoCodigo: null, tipoNombre: "Falla mecánica — Llenadora Elmar · Válvulas de llenado", tiempoGuiaMin: null, nota: "Fuga en dos válvulas; espera de repuesto", supervisorNombre: "EUSTORGIO", offsetDias: 4, hora: "09:50", duracionMin: 70, saborNombre: "Pera", familiaNombre: "Selecto", presentacionMl: 250 },
  { id: "np-open-1", clase: "NO_PROGRAMADA", origen: "MANTENIMIENTO", lineaCodigo: "LINEA_2", turnoTipo: "TURNO_1", tipoCodigo: null, tipoNombre: "Falla mecánica — Tavil · Robot de paletizado", tiempoGuiaMin: null, nota: "Pérdida de comunicación con el robot", supervisorNombre: "EUSTORGIO", offsetDias: 0, hora: "12:30", duracionMin: null, saborNombre: "Pera", familiaNombre: "Selecto", presentacionMl: 250 },
]

/** Materializa las fechas relativas a HOY (hora de planta). */
export function paradasDemo(): Parada[] {
  const now = new Date()
  return RAW.map((r, i) => {
    let start: Date
    if (r.duracionMin == null) {
      // parada abierta: solo válido para origen MANTENIMIENTO (Mecánicas) — arrancó
      // hace 25–130 min, para que "en curso" sea realista
      start = new Date(now.getTime() - (25 + ((i * 41) % 105)) * 60000)
    } else {
      const base = new Date()
      base.setDate(base.getDate() - r.offsetDias)
      const [y, mo, dy] = fechaLocal(base).split("-").map(Number)
      const [hh, mi] = r.hora.split(":").map(Number)
      start = new Date(y, mo - 1, dy, hh, mi, 0)
    }
    const inicio = `${fechaLocal(start)}T${horaLocal(start)}`
    let fin: string | null = null
    if (r.duracionMin != null) {
      const end = new Date(start.getTime() + r.duracionMin * 60000)
      fin = `${fechaLocal(end)}T${horaLocal(end)}`
    }

    const tipo = r.tipoCodigo ? tipoPorCodigo(r.tipoCodigo) : null
    return {
      id: r.id,
      clase: r.clase,
      origen: r.origen,
      lineaCodigo: r.lineaCodigo,
      turnoTipo: r.turnoTipo,
      tipoCodigo: r.tipoCodigo,
      tipoNombre: tipo?.nombre ?? r.tipoNombre ?? "—",
      tiempoGuiaMin: tipo ? tipo.tiempoGuiaMin : (r.tiempoGuiaMin ?? null),
      nota: r.nota ?? null,
      justificacionDesvio: r.justificacionDesvio ?? null,
      inicio,
      fin,
      supervisorNombre: r.supervisorNombre ?? null,
      saborNombre: r.saborNombre ?? null,
      familiaNombre: r.familiaNombre ?? null,
      presentacionMl: r.presentacionMl ?? null,
    }
  })
}
