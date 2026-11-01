import { supabase } from "@/lib/supabase"
import type { Nivel } from "@/lib/estructura"
import type { Permiso } from "@/lib/permisos"

export interface PersonalRegistrado {
  id: string
  usuario: string
  nombre: string
  cedula: string | null
  puestoId: string
  puesto: string
  /** null = puesto sin área (Super Administrador, Probador). */
  areaCodigo: string | null
  nivel: Nivel | null
  /** Rótulo libre de la persona (ej. Subjefe). Solo visual. */
  titulo: string | null
  activo: boolean
  /** La base dice si quien pregunta puede editar a esta persona. */
  gestionable: boolean
}

/*
 * Personal registrado, de todas las áreas, editable desde "Edición de
 * Datos" o desde "Personal" — ambas exclusivas de SUPERADMINISTRADOR
 * (rework 2026-09-23; antes ADMINISTRADOR_AREA veía y gestionaba solo
 * su propia área, ese rol ya no existe). Vive en la tabla "usuarios" de
 * Supabase (NO Supabase Auth — ver
 * supabase/migrations/20260822090000_usuarios_tabla_propia.sql).
 *
 * El permiso NO es solo de interfaz: cada función de acá manda quién
 * hace el pedido (creadorUsuario) y Postgres decide si le está
 * permitido ver/tocar — ver
 * supabase/migrations/20261076090000_rework_dos_roles.sql. Estas
 * funciones solo llaman a RPC que hashean la contraseña y nunca la
 * devuelven; el frontend nunca ve password_hash.
 *
 * La cédula se guarda de una porque en algún momento va a alimentar
 * el botón que genera el PDF del acta de fin de turno para firmar
 * (todavía no existe esa función).
 */
interface FilaPersonal {
  usuario_id: string
  usuario: string
  nombre: string | null
  cedula: string | null
  puesto_id: string
  puesto: string
  area_codigo: string | null
  nivel: number | null
  titulo: string | null
  activo: boolean
  gestionable: boolean
}

export async function listarPersonal(usuarioSesion: string): Promise<PersonalRegistrado[]> {
  const { data, error } = await supabase.rpc("listar_personal", { p_usuario: usuarioSesion })
  if (error || !data) return []
  return (data as FilaPersonal[]).map((fila) => ({
    id: fila.usuario_id,
    usuario: fila.usuario,
    nombre: fila.nombre ?? fila.usuario,
    cedula: fila.cedula,
    puestoId: fila.puesto_id,
    puesto: fila.puesto,
    areaCodigo: fila.area_codigo,
    nivel: fila.nivel as Nivel | null,
    titulo: fila.titulo,
    activo: fila.activo,
    gestionable: Boolean(fila.gestionable),
  }))
}

/** Puestos que quien pregunta puede dar (su área, nivel menor al propio). */
export interface PuestoAsignable {
  puestoId: string
  codigo: string
  nombre: string
  areaCodigo: string
  nivel: Nivel
}

export async function listarPuestosAsignables(usuarioSesion: string): Promise<PuestoAsignable[]> {
  const { data, error } = await supabase.rpc("puestos_asignables", { p_usuario: usuarioSesion })
  if (error || !data) return []
  return (
    data as { puesto_id: string; codigo: string; nombre: string; area_codigo: string; nivel: number }[]
  ).map((f) => ({
    puestoId: f.puesto_id,
    codigo: f.codigo,
    nombre: f.nombre,
    areaCodigo: f.area_codigo,
    nivel: f.nivel as Nivel,
  }))
}

export async function editarPersonal(
  usuarioSesion: string,
  id: string,
  datos: { nombre: string; cedula: string | null; puestoId: string; titulo: string | null },
  pagina: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabase.rpc("editar_personal", {
    p_creador_usuario: usuarioSesion,
    p_usuario_id: id,
    p_nombre: datos.nombre,
    p_cedula: datos.cedula,
    p_puesto_id: datos.puestoId,
    p_titulo: datos.titulo,
    p_pagina: pagina,
  })
  if (error) {
    return { ok: false, error: error.message || "No se pudo editar el personal. Intenta de nuevo." }
  }
  return { ok: true }
}

export async function restablecerPassword(
  usuarioSesion: string,
  id: string,
  nuevaPassword: string,
  pagina: string,
): Promise<boolean> {
  const { error } = await supabase.rpc("restablecer_password", {
    p_creador_usuario: usuarioSesion,
    p_usuario_id: id,
    p_password: nuevaPassword,
    p_pagina: pagina,
  })
  return !error
}

export async function desactivarPersonal(usuarioSesion: string, id: string, pagina: string): Promise<boolean> {
  const { error } = await supabase.rpc("desactivar_personal", {
    p_creador_usuario: usuarioSesion,
    p_usuario_id: id,
    p_pagina: pagina,
  })
  return !error
}

export async function reactivarPersonal(usuarioSesion: string, id: string, pagina: string): Promise<boolean> {
  const { error } = await supabase.rpc("reactivar_personal", {
    p_creador_usuario: usuarioSesion,
    p_usuario_id: id,
    p_pagina: pagina,
  })
  return !error
}

/*
 * Borrado real (no baja lógica). Si la persona ya tiene turnos o
 * contadores registrados, Postgres lo rechaza solo (violación de
 * llave foránea, código 23503) — no hace falta chequearlo a mano acá,
 * solo traducir el error a un mensaje entendible.
 */
export async function eliminarPersonal(
  usuarioSesion: string,
  id: string,
  forzar = false,
  pagina = "",
): Promise<{ ok: true } | { ok: false; error: string; tieneRegistros?: boolean }> {
  const { error } = await supabase.rpc("eliminar_personal", {
    p_creador_usuario: usuarioSesion,
    p_usuario_id: id,
    p_forzar: forzar,
    p_pagina: pagina,
  })
  if (error) {
    if (error.code === "23503") {
      return {
        ok: false,
        error: "Tiene turnos o registros asociados.",
        tieneRegistros: true,
      }
    }
    return { ok: false, error: error.message || "No se pudo eliminar. Intenta de nuevo." }
  }
  return { ok: true }
}

export async function agregarPersonal(
  usuarioSesion: string,
  datos: { usuario: string; password: string; puestoId: string; nombre: string; cedula?: string | null; titulo?: string | null },
  pagina: string,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const { data, error } = await supabase.rpc("crear_usuario", {
    p_creador_usuario: usuarioSesion,
    p_usuario: datos.usuario,
    p_password: datos.password,
    p_puesto_id: datos.puestoId,
    p_nombre: datos.nombre,
    p_cedula: datos.cedula ?? null,
    p_titulo: datos.titulo ?? null,
    p_pagina: pagina,
  })

  if (error) {
    // El usuario ya existe: violación del unique de la columna "usuario".
    if (error.code === "23505") {
      return { ok: false, error: "Ese usuario ya existe." }
    }
    return { ok: false, error: error.message || "No se pudo agregar el usuario. Intenta de nuevo." }
  }

  return { ok: true, id: data as string }
}

/*
 * Permisos extra por persona (además de los de su puesto). Ver
 * supabase/migrations/20261078090000_roles_y_permisos.sql.
 */

/** Permisos extra de todo el personal, por id de usuario. */
export async function listarPermisosExtra(usuarioSesion: string): Promise<Map<string, Permiso[]>> {
  const { data, error } = await supabase.rpc("listar_permisos_extra", { p_usuario: usuarioSesion })
  const mapa = new Map<string, Permiso[]>()
  if (error || !data) return mapa
  for (const fila of data as { usuario_id: string; permiso_codigo: Permiso }[]) {
    mapa.set(fila.usuario_id, [...(mapa.get(fila.usuario_id) ?? []), fila.permiso_codigo])
  }
  return mapa
}

/** Ids de los dueños (intocables salvo por ellos mismos). */
export async function listarDuenos(usuarioSesion: string): Promise<Set<string>> {
  const { data, error } = await supabase.rpc("listar_duenos", { p_usuario: usuarioSesion })
  if (error || !Array.isArray(data)) return new Set()
  return new Set(data as string[])
}

/** Reemplaza los permisos extra de una persona (solo Super Administrador). */
export async function guardarPermisosExtra(
  usuarioSesion: string,
  usuarioId: string,
  permisos: Permiso[],
  pagina: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabase.rpc("guardar_permisos_extra", {
    p_usuario: usuarioSesion,
    p_usuario_id: usuarioId,
    p_permisos: permisos,
    p_pagina: pagina,
  })
  if (error) return { ok: false, error: error.message || "No se pudieron guardar los permisos." }
  return { ok: true }
}
