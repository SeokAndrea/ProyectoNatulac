import { supabase } from "@/lib/supabase"

/*
 * Registro de auditoría universal: toda mutación (crear/editar/borrar)
 * queda acá con cuándo, quién, qué acción, en qué página y los valores
 * antes/después. Se instrumenta módulo por módulo desde Postgres (ver
 * la migración de auditoría). Solo SUPERADMINISTRADOR lo lee.
 */
export interface RegistroAuditoria {
  ocurridoEn: string
  usuario: string | null
  usuarioNombre: string | null
  /** Cargo (rótulo del puesto) de quien hizo la acción — código de CARGOS, o null. */
  usuarioCargo: string | null
  accion: string
  entidad: string
  entidadId: string | null
  pagina: string | null
  resumen: string | null
  antes: Record<string, unknown> | null
  despues: Record<string, unknown> | null
}

interface FilaAuditoria {
  ocurrido_en: string
  usuario: string | null
  usuario_nombre: string | null
  usuario_cargo: string | null
  accion: string
  entidad: string
  entidad_id: string | null
  pagina: string | null
  resumen: string | null
  antes: Record<string, unknown> | null
  despues: Record<string, unknown> | null
}

/** Si la migración de auditoría todavía no está aplicada, el RPC no existe y esto devuelve []. */
export async function listarAuditoria(
  usuario: string,
  filtros: { fechaDesde?: string; fechaHasta?: string },
): Promise<RegistroAuditoria[]> {
  const { data, error } = await supabase.rpc("listar_auditoria", {
    p_usuario: usuario,
    p_fecha_desde: filtros.fechaDesde || null,
    p_fecha_hasta: filtros.fechaHasta || null,
  })
  if (error || !data) return []
  return (data as FilaAuditoria[]).map((r) => ({
    ocurridoEn: r.ocurrido_en,
    usuario: r.usuario,
    usuarioNombre: r.usuario_nombre,
    usuarioCargo: r.usuario_cargo,
    accion: r.accion,
    entidad: r.entidad,
    entidadId: r.entidad_id,
    pagina: r.pagina,
    resumen: r.resumen,
    antes: r.antes,
    despues: r.despues,
  }))
}
