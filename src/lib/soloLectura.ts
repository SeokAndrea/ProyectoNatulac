/*
 * Candado de solo lectura (dueño, 2026-10-09) para los roles que solo
 * miran: Solo Vista y Sistema de Gestión (src/lib/rolVista.ts). Con el
 * candado puesto, el envoltorio de supabase.rpc (src/lib/supabase.ts) solo
 * deja pasar las RPC de lectura; cualquier otra vuelve con un error, sin
 * llegar a la base. Lo prende AuthProvider según el rol que se muestra (ver
 * auth.tsx), así «Ver como» también lo prueba.
 *
 * Lista de LECTURAS (no de escrituras): una RPC nueva queda bloqueada para
 * estos roles hasta sumarla acá. Todas se revisaron: ninguna escribe.
 */
const RPC_LECTURA = new Set([
  "ajustes_semielaborado_turno",
  "ajustes_turnos",
  "analisis_calidad_de_lotes",
  "calidad_libera_area",
  "cargo_de_usuario",
  "estadisticas_produccion",
  "estado_planta_actual",
  "grupo_de_rotacion",
  "lectura_servicios_industriales_actual",
  "mi_turno_detalle",
  "mis_actas",
  "mis_turnos_sin_acta",
  "obtener_configuracion",
  "paradas_que_detienen_lineas",
  "perfil_sesion",
  "permisos_de",
  "permisos_de_rol",
  "produccion_dia_de",
  "programacion_dia_de",
  "resumen_produccion_dia",
  "resumen_produccion_dia_por_turno",
  "turno_activo_de",
  "turno_anterior_json",
  "turno_de_fecha_tipo",
  "turno_detalle",
  "turno_json",
  "turno_pt_gracia_de",
  "turnos_activos_por_area",
  "turnos_de_fecha_tipo",
  "ultima_configuracion_linea",
  "validacion_dia_de",
  "validacion_turnos_de",
  "verificar_login",
  // Su propia clave en el primer ingreso: lo único que puede guardar.
  "completar_primer_ingreso",
])

export const MENSAJE_SOLO_LECTURA = "Tu usuario es de solo lectura: puedes ver todo, pero no guardar cambios."

let activo = false

export function fijarSoloLectura(valor: boolean) {
  activo = valor
}

/** ¿Se bloquea esta RPC? Las listar_* son todas lecturas. */
export function rpcBloqueada(fn: string): boolean {
  return activo && !fn.startsWith("listar_") && !RPC_LECTURA.has(fn)
}
