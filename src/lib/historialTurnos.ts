import { supabase } from "@/lib/supabase"
import type { AreaCodigo, GrupoCodigo, TurnoTipoCodigo } from "@/lib/catalogos"
import { saborSinFamiliaOculta } from "@/lib/turno"
import type { TanqueEncontrado } from "@/lib/sesionTurno"
import { mapearAjusteVolumen, mapearDesvaseLote, mapearPreparacion, mapearTanque, mapearTransferencia } from "@/lib/preparacion/mapear"
import type {
  AjusteVolumenRegistro,
  DesvaseLoteRegistro,
  FilaAjusteVolumen,
  FilaDesvaseLote,
  FilaPreparacion,
  FilaTanque,
  FilaTransferencia,
  PreparacionRegistro,
  TanqueRecepcion,
  TransferenciaRegistro,
} from "@/lib/preparacion/tipos"
import { mapearContador, mapearCorrida, mapearLineaEstado } from "@/lib/produccion/mapear"
import type { Corrida, ContadorRegistro, FilaContador, FilaCorrida, FilaLineaEstado, LineaEstado } from "@/lib/produccion/tipos"
import { mapearProductoTerminado } from "@/lib/productoTerminado"
import type { FilaProductoTerminado, ProductoTerminadoRegistro } from "@/lib/productoTerminado"
import { mapearNovedadTurno } from "@/lib/novedades"
import type { FilaNovedadTurno, NovedadTurno } from "@/lib/novedades"

/*
 * Auditoría (Super Administrador — todas las áreas menos PRUEBAS — y
 * Administrador de Área, acotado a la suya): buscar cualquier turno
 * por supervisor y/o rango de fechas, y ver su registro de acciones
 * completo (construirHistorial(), src/lib/historial.ts). Reutiliza el
 * mismo "turno_json" que arma turno_activo_de() (ver
 * supabase/migrations/20260901090000_historial_auditoria.sql).
 * También vive acá lo de actas (PDF real, ver src/lib/actaPdf.ts) y el
 * vistazo de turnos activos por área.
 */

/**
 * Un turno histórico (cerrado, o en curso visto desde Auditoría) —
 * a diferencia del turno EN VIVO de un supervisor (que cada uno de
 * los 3 módulos busca por separado, ver usePreparacion()), acá SÍ
 * tiene sentido un solo fetch con todo junto: no hay nada "en vivo"
 * que sincronizar tramo por tramo. Mismos tipos de dominio que los 3
 * módulos (Corrida/TanqueRecepcion/etc.) — no una copia propia.
 */
export interface TurnoHistorial {
  id: string
  codigo: string
  fecha: string
  horaInicio: string
  estado: "ABIERTO" | "CERRADO"
  fechaFin: string | null
  horaFin: string | null
  cierreAutomatico: boolean
  turnoTipo: TurnoTipoCodigo
  grupo: GrupoCodigo
  supervisorUsuario: string
  supervisorNombre: string
  tanquesEncontrados: TanqueEncontrado[] | null
  tanques: TanqueRecepcion[]
  preparaciones: PreparacionRegistro[]
  corridas: Corrida[]
  lineasEstado: LineaEstado[]
  contadores: ContadorRegistro[]
  productoTerminado: ProductoTerminadoRegistro[]
  transferencias: TransferenciaRegistro[]
  desvases: DesvaseLoteRegistro[]
  novedades: NovedadTurno[]
  ajustesVolumen: AjusteVolumenRegistro[]
}

interface FilaTanqueEncontrado {
  numero_tanque: 1 | 2 | 3
  condicion: TanqueRecepcion["condicion"]
  volumen_l: number | null
  sabor_nombre: string | null
  lote: string | null
}

/** Forma cruda de turno_json()/turno_detalle() — mismo shape que src/lib/sesionTurno.tsx (cabecera) + los 6 módulos de dominio. */
interface FilaTurnoHistorial {
  id: string
  codigo: string
  fecha: string
  hora_inicio: string
  estado: "ABIERTO" | "CERRADO"
  fecha_fin: string | null
  hora_fin: string | null
  cierre_automatico: boolean
  tanques_encontrados: FilaTanqueEncontrado[] | null
  turno_tipo_codigo: string
  grupo_codigo: string
  supervisor_usuario: string
  supervisor_nombre: string
  lineas: FilaCorrida[]
  lineas_estado: FilaLineaEstado[]
  tanques: FilaTanque[]
  contadores: FilaContador[]
  producto_terminado: FilaProductoTerminado[]
  preparaciones: FilaPreparacion[]
  transferencias: FilaTransferencia[]
  desvases: FilaDesvaseLote[]
  novedades: FilaNovedadTurno[]
  ajustes_volumen: FilaAjusteVolumen[]
}

export function mapearTurnoHistorial(fila: FilaTurnoHistorial): TurnoHistorial {
  return {
    id: fila.id,
    codigo: fila.codigo,
    fecha: fila.fecha,
    horaInicio: fila.hora_inicio,
    estado: fila.estado,
    fechaFin: fila.fecha_fin,
    horaFin: fila.hora_fin,
    cierreAutomatico: fila.cierre_automatico,
    turnoTipo: fila.turno_tipo_codigo as TurnoTipoCodigo,
    grupo: fila.grupo_codigo as GrupoCodigo,
    supervisorUsuario: fila.supervisor_usuario,
    supervisorNombre: fila.supervisor_nombre,
    tanquesEncontrados:
      fila.tanques_encontrados?.map((t) => ({
        numeroTanque: t.numero_tanque,
        condicion: t.condicion,
        volumenL: t.volumen_l,
        saborNombre: saborSinFamiliaOculta(t.sabor_nombre),
        lote: t.lote,
      })) ?? null,
    tanques: fila.tanques.map(mapearTanque),
    preparaciones: fila.preparaciones.map(mapearPreparacion),
    corridas: fila.lineas.map(mapearCorrida),
    lineasEstado: fila.lineas_estado.map(mapearLineaEstado),
    contadores: fila.contadores.map(mapearContador),
    productoTerminado: fila.producto_terminado.map(mapearProductoTerminado),
    transferencias: fila.transferencias.map(mapearTransferencia),
    desvases: fila.desvases.map(mapearDesvaseLote),
    novedades: fila.novedades.map(mapearNovedadTurno),
    ajustesVolumen: fila.ajustes_volumen.map(mapearAjusteVolumen),
  }
}

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

export async function obtenerTurnoDetalle(usuarioSesion: string, turnoId: string): Promise<TurnoHistorial | null> {
  const { data, error } = await supabase.rpc("turno_detalle", { p_usuario: usuarioSesion, p_turno_id: turnoId })
  if (error || !data) return null
  return mapearTurnoHistorial(data as FilaTurnoHistorial)
}

/** Mismo turno_json() que obtenerTurnoDetalle(), pero solo para EL PROPIO turno del supervisor (ver src/lib/actasPendientes.ts). */
export async function miTurnoDetalle(usuarioSesion: string, turnoId: string): Promise<TurnoHistorial | null> {
  const { data, error } = await supabase.rpc("mi_turno_detalle", { p_usuario: usuarioSesion, p_turno_id: turnoId })
  if (error || !data) return null
  return mapearTurnoHistorial(data as FilaTurnoHistorial)
}

/** Turnos CERRADOS por cierre_automatico (cron, abandonados) del propio supervisor que todavía no tienen acta VIGENTE. */
export async function misTurnosSinActa(usuarioSesion: string): Promise<{ turnoId: string; turnoCodigo: string }[]> {
  const { data, error } = await supabase.rpc("mis_turnos_sin_acta", { p_usuario: usuarioSesion })
  if (error || !data) return []
  return (data as { turno_id: string; turno_codigo: string }[]).map((f) => ({ turnoId: f.turno_id, turnoCodigo: f.turno_codigo }))
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

// reabrirTurno() y corregirProductoTerminado() se retiraron en la Fase 2
// del rework (migración 20261013090000): no hay corrección de un turno ya
// cerrado a mitad de camino — se espera al cierre y se corrige desde VALIDAR.

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

export interface MiActa {
  id: string
  turnoId: string
  codigo: string
  storagePath: string
  generadoEn: string
  turnoCodigo: string
  fecha: string
  turnoTipo: TurnoTipoCodigo
  grupo: GrupoCodigo
}

interface FilaMiActa {
  acta_id: string
  turno_id: string
  codigo: string
  storage_path: string
  generado_en: string
  turno_codigo: string
  fecha: string
  turno_tipo_codigo: string
  grupo_codigo: string
}

/** "Mis Actas" (Home del supervisor) — solo las actas VIGENTES de SUS propios turnos, sin exigir rol. */
export async function misActas(usuarioSesion: string): Promise<MiActa[]> {
  const { data, error } = await supabase.rpc("mis_actas", { p_usuario: usuarioSesion })
  if (error || !data) return []
  return (data as FilaMiActa[]).map((f) => ({
    id: f.acta_id,
    turnoId: f.turno_id,
    codigo: f.codigo,
    storagePath: f.storage_path,
    generadoEn: f.generado_en,
    turnoCodigo: f.turno_codigo,
    fecha: f.fecha,
    turnoTipo: f.turno_tipo_codigo as TurnoTipoCodigo,
    grupo: f.grupo_codigo as GrupoCodigo,
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
