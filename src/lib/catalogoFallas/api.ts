import { supabase } from "@/lib/supabase"
import type { ClaseParada } from "@/lib/paradas"
import type { CatalogoFallas, NivelCatalogo, Resultado, TipoEquipo } from "./tipos"

/* Lectura y escritura del catálogo de fallas (RPC de la migración 20261113490000). */

interface Crudo {
  equipos: { id: string; sufijo: string; nombre: string; tipo: TipoEquipo; activo: boolean; lineas: string[] | null; creado_en?: string; reservada?: boolean }[]
  sistemas: { id: string; equipo_id: string; sufijo: string; nombre: string; activo: boolean; creado_en?: string; reservada?: boolean }[]
  subsistemas: { id: string; sistema_id: string; sufijo: string; nombre: string; codigo_sheet: string | null; activo: boolean; creado_en?: string; reservada?: boolean }[]
  fallas: { id: string; subsistema_id: string; numero: number; nombre: string; clase: ClaseParada; activo: boolean; codigo: string; reservada?: boolean }[]
}

export function mapearCatalogo(c: Crudo): CatalogoFallas {
  return {
    equipos: c.equipos.map((e) => ({
      id: e.id,
      sufijo: e.sufijo,
      nombre: e.nombre,
      tipo: e.tipo,
      activo: e.activo,
      lineas: e.lineas ?? [],
      creadoEn: e.creado_en,
      reservada: e.reservada ?? false,
    })),
    sistemas: c.sistemas.map((s) => ({
      id: s.id,
      equipoId: s.equipo_id,
      sufijo: s.sufijo,
      nombre: s.nombre,
      activo: s.activo,
      creadoEn: s.creado_en,
      reservada: s.reservada ?? false,
    })),
    subsistemas: c.subsistemas.map((u) => ({
      id: u.id,
      sistemaId: u.sistema_id,
      sufijo: u.sufijo,
      nombre: u.nombre,
      codigoSheet: u.codigo_sheet,
      activo: u.activo,
      creadoEn: u.creado_en,
      reservada: u.reservada ?? false,
    })),
    fallas: c.fallas.map((f) => ({
      id: f.id,
      subsistemaId: f.subsistema_id,
      numero: f.numero,
      nombre: f.nombre,
      clase: f.clase,
      activo: f.activo,
      codigo: f.codigo,
      reservada: f.reservada ?? false,
    })),
  }
}

export async function leerCatalogoFallas(): Promise<Resultado<CatalogoFallas>> {
  const { data, error } = await supabase.rpc("listar_catalogo_fallas")
  if (error || !data) return { ok: false, error: "No se pudo leer el catálogo de fallas." }
  return { ok: true, valor: mapearCatalogo(data as Crudo) }
}

const fallo = (error: { message?: string } | null, porDefecto: string) => ({ ok: false as const, error: error?.message || porDefecto })

export async function guardarEquipo(
  usuario: string,
  d: { id: string | null; sufijo: string; nombre: string; tipo: TipoEquipo; lineas: string[]; activo: boolean },
): Promise<Resultado<string>> {
  const { data, error } = await supabase.rpc("guardar_catalogo_equipo", {
    p_usuario: usuario,
    p_id: d.id,
    p_sufijo: d.sufijo,
    p_nombre: d.nombre,
    p_tipo: d.tipo,
    p_lineas: d.lineas,
    p_activo: d.activo,
  })
  return error ? fallo(error, "No se pudo guardar el equipo.") : { ok: true, valor: data as string }
}

export async function guardarSistema(
  usuario: string,
  d: { id: string | null; equipoId: string | null; sufijo: string; nombre: string; activo: boolean },
): Promise<Resultado<string>> {
  const { data, error } = await supabase.rpc("guardar_catalogo_sistema", {
    p_usuario: usuario,
    p_id: d.id,
    p_equipo_id: d.equipoId,
    p_sufijo: d.sufijo,
    p_nombre: d.nombre,
    p_activo: d.activo,
  })
  return error ? fallo(error, "No se pudo guardar el sistema.") : { ok: true, valor: data as string }
}

export async function guardarSubsistema(
  usuario: string,
  d: { id: string | null; sistemaId: string | null; sufijo: string; nombre: string; codigoSheet: string | null; activo: boolean },
): Promise<Resultado<string>> {
  const { data, error } = await supabase.rpc("guardar_catalogo_subsistema", {
    p_usuario: usuario,
    p_id: d.id,
    p_sistema_id: d.sistemaId,
    p_sufijo: d.sufijo,
    p_nombre: d.nombre,
    p_codigo_sheet: d.codigoSheet,
    p_activo: d.activo,
  })
  return error ? fallo(error, "No se pudo guardar el subsistema.") : { ok: true, valor: data as string }
}

export interface FallasAgregadas {
  creadas: { id: string; nombre: string; codigo: string }[]
  repetidas: string[]
}

export async function agregarFallas(usuario: string, subsistemaId: string, nombres: string[], clase: ClaseParada): Promise<Resultado<FallasAgregadas>> {
  const { data, error } = await supabase.rpc("agregar_catalogo_fallas", {
    p_usuario: usuario,
    p_subsistema_id: subsistemaId,
    p_nombres: nombres,
    p_clase: clase,
  })
  return error ? fallo(error, "No se pudo agregar la falla.") : { ok: true, valor: data as FallasAgregadas }
}

export async function guardarFalla(usuario: string, d: { id: string; nombre: string; clase: ClaseParada; activo: boolean }): Promise<Resultado> {
  const { error } = await supabase.rpc("guardar_catalogo_falla", {
    p_usuario: usuario,
    p_id: d.id,
    p_nombre: d.nombre,
    p_clase: d.clase,
    p_activo: d.activo,
  })
  return error ? fallo(error, "No se pudo guardar la falla.") : { ok: true, valor: undefined }
}

/** Cuántas paradas usan una falla de ese nivel (aviso antes de cambiar un sufijo). null si no se pudo saber. */
export async function contarParadas(nivel: NivelCatalogo, id: string): Promise<number | null> {
  const { data, error } = await supabase.rpc("contar_paradas_catalogo", { p_nivel: nivel, p_id: id })
  return error ? null : Number(data)
}

/** Lo que se puede quitar del catálogo: las cuatro cosas que cuelgan unas de otras. */
export type NivelQuitable = NivelCatalogo | "FALLA"

/** Cuánto usa algo del catálogo (migración 20261114890000): lo que se muestra antes de «Quitar». */
export interface UsoCatalogo {
  nombre: string
  reservada: boolean
  /** Fallas que se van con él (la propia, si es una falla). */
  fallas: number
  paradas: number
  sif: number
}

export const sePuedeQuitar = (u: UsoCatalogo) => !u.reservada && u.paradas === 0 && u.sif === 0

export async function usoCatalogo(nivel: NivelQuitable, id: string): Promise<Resultado<UsoCatalogo>> {
  const { data, error } = await supabase.rpc("uso_catalogo", { p_nivel: nivel, p_id: id })
  if (error || !data) return fallo(error, "No se pudo saber si se usó.")
  const d = data as { nombre: string; reservada: boolean; fallas: number | string; paradas: number | string; sif: number | string }
  return { ok: true, valor: { nombre: d.nombre, reservada: d.reservada, fallas: Number(d.fallas), paradas: Number(d.paradas), sif: Number(d.sif) } }
}

/** Quita de verdad (solo lo que nunca se usó); queda una foto completa en la auditoría. */
export async function quitarCatalogo(usuario: string, nivel: NivelQuitable, id: string): Promise<Resultado> {
  const { error } = await supabase.rpc("quitar_catalogo", { p_usuario: usuario, p_nivel: nivel, p_id: id })
  return error ? fallo(error, "No se pudo quitar.") : { ok: true, valor: undefined }
}
