import type { LineaCodigo } from "@/lib/catalogos"
import { supabase } from "@/lib/supabase"
import { mapearTurno, type FilaTurno, type TurnoActivo } from "@/lib/turno"

/*
 * Carga manual de turnos viejos (Super Administrador) desde un acta en
 * papel — ver supabase/migrations/20260959090000_crear_turno_manual_paso_a_paso.sql.
 * Flujo de dos pasos: crearTurnoManual() arma el turno vacío
 * (supervisor + turno + grupo — el área sale sola del supervisor
 * elegido), después agregarFilaTurnoManual() carga un sabor a la vez,
 * devolviendo siempre el turno completo actualizado para mostrar el
 * total acumulado. Reusa las mismas tablas que un turno en vivo (una
 * fila = una línea+sabor, sin distinguir lote/tanque real), así que el
 * turno creado se ve y se reporta igual que cualquier otro en Panel de
 * Producción/Auditoría — se consulta con las mismas funciones
 * (turnoDetalle, listarTurnosHistorial) que ya existen en
 * src/lib/historialTurnos.ts.
 */
export interface DatosNuevoTurnoManual {
  supervisorUsuario: string
  fecha: string
  turnoTipo: string
  grupo: string
  horaInicio: string
  horaFin: string
}

export interface DatosFilaTurnoManual {
  turnoId: string
  lineaCodigo: LineaCodigo
  saborId: string
  presentacionVolumenMl: number
  paletas: number
  cajasSueltas: number
  envasesLlenadora: number
  /** Litros que salieron del tanque para este sabor — para la merma de semielaborado. */
  litrosConsumidos: number
}

type Resultado = { ok: true; turno: TurnoActivo } | { ok: false; error: string }

export async function crearTurnoManual(usuarioSesion: string, datos: DatosNuevoTurnoManual): Promise<Resultado> {
  const { data, error } = await supabase.rpc("crear_turno_manual", {
    p_usuario: usuarioSesion,
    p_supervisor_usuario: datos.supervisorUsuario,
    p_fecha: datos.fecha,
    p_turno_tipo_codigo: datos.turnoTipo,
    p_grupo_codigo: datos.grupo,
    p_hora_inicio: datos.horaInicio,
    p_hora_fin: datos.horaFin,
  })
  if (error || !data) {
    return { ok: false, error: error?.message || "No se pudo crear el turno. Intenta de nuevo." }
  }
  return { ok: true, turno: mapearTurno(data as FilaTurno) }
}

export async function agregarFilaTurnoManual(usuarioSesion: string, datos: DatosFilaTurnoManual): Promise<Resultado> {
  const { data, error } = await supabase.rpc("agregar_fila_turno_manual", {
    p_usuario: usuarioSesion,
    p_turno_id: datos.turnoId,
    p_linea_codigo: datos.lineaCodigo,
    p_sabor_id: datos.saborId,
    p_presentacion_volumen_ml: datos.presentacionVolumenMl,
    p_paletas: datos.paletas,
    p_cajas_sueltas: datos.cajasSueltas,
    p_envases_llenadora: datos.envasesLlenadora,
    p_litros_consumidos: datos.litrosConsumidos,
  })
  if (error || !data) {
    return { ok: false, error: error?.message || "No se pudo agregar el sabor. Intenta de nuevo." }
  }
  return { ok: true, turno: mapearTurno(data as FilaTurno) }
}

export async function editarFilaTurnoManual(
  usuarioSesion: string,
  datos: {
    turnoLineaId: string
    paletas: number
    cajasSueltas: number
    envasesLlenadora: number
    litrosConsumidos: number
  },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabase.rpc("editar_fila_turno_manual", {
    p_usuario: usuarioSesion,
    p_turno_linea_id: datos.turnoLineaId,
    p_paletas: datos.paletas,
    p_cajas_sueltas: datos.cajasSueltas,
    p_envases_llenadora: datos.envasesLlenadora,
    p_litros_consumidos: datos.litrosConsumidos,
  })
  if (error) {
    return { ok: false, error: error.message || "No se pudo guardar. Intenta de nuevo." }
  }
  return { ok: true }
}
