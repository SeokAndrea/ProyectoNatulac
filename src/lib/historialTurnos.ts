import { supabase } from "@/lib/supabase"
import type { AreaCodigo, GrupoCodigo, TurnoTipoCodigo } from "@/lib/catalogos"
import { mapearTurno, type FilaTurno, type TurnoActivo } from "@/lib/turno"

/*
 * Auditoría (Super Administrador — todas las áreas menos PRUEBAS — y
 * Administrador de Área, acotado a la suya): buscar cualquier turno
 * por supervisor y/o rango de fechas, y ver su registro de acciones
 * completo (construirHistorial(), src/lib/historial.ts). Reutiliza el
 * mismo "turno_json" que arma turno_activo_de() (ver
 * supabase/migrations/20260901090000_historial_auditoria.sql).
 * También vive acá lo de reabrir turnos, actas (PDF real, ver
 * src/lib/actaPdf.ts) y el vistazo de turnos activos por área.
 */
export interface TurnoResumen {
  id: string
  codigo: string
  fecha: string
  horaInicio: string
  estado: "ABIERTO" | "CERRADO"
  supervisorUsuario: string
  supervisorNombre: string
  area: AreaCodigo
  turnoTipo: TurnoTipoCodigo
  grupo: GrupoCodigo
}

interface FilaResumen {
  turno_id: string
  codigo: string
  fecha: string
  hora_inicio: string
  estado: "ABIERTO" | "CERRADO"
  supervisor_usuario: string
  supervisor_nombre: string
  area_codigo: string
  turno_tipo_codigo: string
  grupo_codigo: string
}

export async function listarTurnosHistorial(
  usuarioSesion: string,
  filtros: { supervisorUsuario?: string; fechaDesde?: string; fechaHasta?: string },
): Promise<TurnoResumen[]> {
  const { data, error } = await supabase.rpc("listar_turnos_historial", {
    p_usuario: usuarioSesion,
    p_supervisor_usuario: filtros.supervisorUsuario || null,
    p_fecha_desde: filtros.fechaDesde || null,
    p_fecha_hasta: filtros.fechaHasta || null,
  })
  if (error || !data) return []
  return (data as FilaResumen[]).map((f) => ({
    id: f.turno_id,
    codigo: f.codigo,
    fecha: f.fecha,
    horaInicio: f.hora_inicio,
    estado: f.estado,
    supervisorUsuario: f.supervisor_usuario,
    supervisorNombre: f.supervisor_nombre,
    area: f.area_codigo as AreaCodigo,
    turnoTipo: f.turno_tipo_codigo as TurnoTipoCodigo,
    grupo: f.grupo_codigo as GrupoCodigo,
  }))
}

export async function obtenerTurnoDetalle(usuarioSesion: string, turnoId: string): Promise<TurnoActivo | null> {
  const { data, error } = await supabase.rpc("turno_detalle", { p_usuario: usuarioSesion, p_turno_id: turnoId })
  if (error || !data) return null
  return mapearTurno(data as FilaTurno)
}

/** Borrado real: solo permite turnos CERRADOS (Postgres lo rechaza si no). */
export async function eliminarTurno(
  usuarioSesion: string,
  turnoId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabase.rpc("eliminar_turno", { p_usuario: usuarioSesion, p_turno_id: turnoId })
  if (error) {
    return { ok: false, error: error.message || "No se pudo eliminar el turno. Intenta de nuevo." }
  }
  return { ok: true }
}

/** Vuelve un turno CERRADO a ABIERTO para corregirlo y volver a Finalizar (genera la V1 del acta). */
export async function reabrirTurno(
  usuarioSesion: string,
  turnoId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabase.rpc("reabrir_turno", { p_usuario: usuarioSesion, p_turno_id: turnoId })
  if (error) {
    return { ok: false, error: error.message || "No se pudo reabrir el turno. Intenta de nuevo." }
  }
  return { ok: true }
}

/**
 * Corregir Producto Terminado de un turno REAL (no solo los cargados
 * por Crear Turno) desde la pestaña "Editar Turno" (src/pages/apps/CrearTurno.tsx)
 * — ej. le faltó una paleta a un lote y el turno ya cerró. Reusa
 * registrar_producto_terminado() del lado del servidor con los mismos
 * datos que ya tenía la fila (línea/sabor/presentación/retenido), solo
 * cambia paletas/cajas sueltas — ver
 * supabase/migrations/20260958090000_corregir_producto_terminado_auditoria.sql.
 */
export async function corregirProductoTerminado(
  usuarioSesion: string,
  datos: { turnoLineaId: string; paletas: number; cajasSueltas: number },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabase.rpc("corregir_producto_terminado_auditoria", {
    p_usuario: usuarioSesion,
    p_turno_linea_id: datos.turnoLineaId,
    p_paletas: datos.paletas,
    p_cajas_sueltas: datos.cajasSueltas,
  })
  if (error) {
    return { ok: false, error: error.message || "No se pudo corregir. Intenta de nuevo." }
  }
  return { ok: true }
}

export interface Acta {
  id: string
  turnoId: string
  version: number
  codigo: string
  estado: "VIGENTE" | "ANULADA"
  storagePath: string
  generadoEn: string
  turnoCodigo: string
  fecha: string
  supervisorNombre: string
  area: AreaCodigo
}

interface FilaActa {
  acta_id: string
  turno_id: string
  version: number
  codigo: string
  estado: "VIGENTE" | "ANULADA"
  storage_path: string
  generado_en: string
  turno_codigo: string
  fecha: string
  supervisor_nombre: string
  area_codigo: string
}

/** Pestaña "Actas" de Auditoría — todas las versiones (vigentes y anuladas) dentro del alcance del usuario. */
export async function listarActas(
  usuarioSesion: string,
  filtros: { areaCodigo?: string; fechaDesde?: string; fechaHasta?: string } = {},
): Promise<Acta[]> {
  const { data, error } = await supabase.rpc("listar_actas", {
    p_usuario: usuarioSesion,
    p_area_codigo: filtros.areaCodigo || null,
    p_fecha_desde: filtros.fechaDesde || null,
    p_fecha_hasta: filtros.fechaHasta || null,
  })
  if (error || !data) return []
  return (data as FilaActa[]).map((f) => ({
    id: f.acta_id,
    turnoId: f.turno_id,
    version: f.version,
    codigo: f.codigo,
    estado: f.estado,
    storagePath: f.storage_path,
    generadoEn: f.generado_en,
    turnoCodigo: f.turno_codigo,
    fecha: f.fecha,
    supervisorNombre: f.supervisor_nombre,
    area: f.area_codigo as AreaCodigo,
  }))
}

/** URL pública (bucket "actas" es público) para descargar/ver el PDF directo. */
export function urlPublicaActa(storagePath: string): string {
  return supabase.storage.from("actas").getPublicUrl(storagePath).data.publicUrl
}

export interface ActaRegistrada {
  id: string
  turnoId: string
  version: number
  codigo: string
  estado: "VIGENTE" | "ANULADA"
  storagePath: string
  generadoEn: string
}

/** Sube el PDF ya generado (ver src/lib/actaPdf.ts) a Storage y registra la versión — anula la vigente anterior de este turno, si había una. */
export async function subirYRegistrarActa(
  usuarioSesion: string,
  turnoId: string,
  areaCodigo: string,
  codigoTurno: string,
  pdfBlob: Blob,
): Promise<{ ok: true; acta: ActaRegistrada } | { ok: false; error: string }> {
  const ruta = `${areaCodigo}/${turnoId}/${codigoTurno}-${Date.now()}.pdf`

  const { error: errorSubida } = await supabase.storage.from("actas").upload(ruta, pdfBlob, {
    contentType: "application/pdf",
    upsert: false,
  })
  if (errorSubida) {
    return { ok: false, error: errorSubida.message || "No se pudo subir el PDF." }
  }

  const { data, error } = await supabase.rpc("registrar_acta", {
    p_usuario: usuarioSesion,
    p_turno_id: turnoId,
    p_storage_path: ruta,
  })
  if (error || !data) {
    return { ok: false, error: error?.message ?? "No se pudo registrar el acta." }
  }

  const fila = data as {
    id: string
    turno_id: string
    version: number
    codigo: string
    estado: "VIGENTE" | "ANULADA"
    storage_path: string
    generado_en: string
  }
  return {
    ok: true,
    acta: {
      id: fila.id,
      turnoId: fila.turno_id,
      version: fila.version,
      codigo: fila.codigo,
      estado: fila.estado,
      storagePath: fila.storage_path,
      generadoEn: fila.generado_en,
    },
  }
}

export interface TurnoActivoArea {
  areaCodigo: AreaCodigo
  areaNombre: string
  turnoId: string | null
  turnoCodigo: string | null
  supervisorNombre: string | null
  horaInicio: string | null
}

interface FilaTurnoActivoArea {
  area_codigo: string
  area_nombre: string
  turno_id: string | null
  turno_codigo: string | null
  supervisor_nombre: string | null
  hora_inicio: string | null
}

/** "¿Quién es el supervisor activo ahora mismo, por área?" — todas las áreas (menos PRUEBAS) para Super Admin, solo la propia para Administrador de Área. */
export async function turnosActivosPorArea(usuarioSesion: string): Promise<TurnoActivoArea[]> {
  const { data, error } = await supabase.rpc("turnos_activos_por_area", { p_usuario: usuarioSesion })
  if (error || !data) return []
  return (data as FilaTurnoActivoArea[]).map((f) => ({
    areaCodigo: f.area_codigo as AreaCodigo,
    areaNombre: f.area_nombre,
    turnoId: f.turno_id,
    turnoCodigo: f.turno_codigo,
    supervisorNombre: f.supervisor_nombre,
    horaInicio: f.hora_inicio,
  }))
}
