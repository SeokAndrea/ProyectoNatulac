import { supabase } from "@/lib/supabase"
import type { AreaCodigo, CargoCodigo, RolCodigo } from "@/lib/catalogos"

export interface PersonalRegistrado {
  id: string
  usuario: string
  nombre: string
  cedula: string | null
  area: AreaCodigo | null
  /** De dónde es la persona en realidad, cuando está cubriendo otra área temporalmente (ej. reemplazo). null = sin reemplazo. Es solo informativo, no afecta permisos ni scoping — ver migración 20260979. */
  areaOrigen: AreaCodigo | null
  rol: RolCodigo
  /** Título del puesto, solo visual — no afecta permisos (ver migración 20260982). null = sin cargo cargado. */
  cargo: CargoCodigo | null
  activo: boolean
}

/*
 * Personal registrado, editable desde "Edición de Datos" (Jorge, ve
 * todas las áreas) o desde "Personal" (ADMINISTRADOR_AREA, solo ve y
 * gestiona el de su propia área). Vive en la tabla "usuarios" de
 * Supabase (NO Supabase Auth — ver
 * supabase/migrations/20260822090000_usuarios_tabla_propia.sql).
 *
 * El filtro por área NO es solo de interfaz: cada función de acá
 * manda quién hace el pedido (creadorUsuario) y Postgres decide qué
 * le está permitido ver/tocar — ver
 * supabase/migrations/20260828090000_personal_por_area.sql. Estas
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
  rol_codigo: string
  area_codigo: string | null
  area_origen_codigo: string | null
  cargo: string | null
  activo: boolean
}

export async function listarPersonal(usuarioSesion: string): Promise<PersonalRegistrado[]> {
  const { data, error } = await supabase.rpc("listar_personal", { p_usuario: usuarioSesion })
  if (error || !data) return []
  return (data as FilaPersonal[]).map((fila) => ({
    id: fila.usuario_id,
    usuario: fila.usuario,
    nombre: fila.nombre ?? fila.usuario,
    cedula: fila.cedula,
    area: fila.area_codigo as AreaCodigo | null,
    areaOrigen: fila.area_origen_codigo as AreaCodigo | null,
    rol: fila.rol_codigo as RolCodigo,
    cargo: fila.cargo as CargoCodigo | null,
    activo: fila.activo,
  }))
}

export async function editarPersonal(
  usuarioSesion: string,
  datos: {
    id: string
    nombre: string
    cedula: string
    area: AreaCodigo
    areaOrigen: AreaCodigo | null
    rol: RolCodigo
    cargo: CargoCodigo | null
  },
  pagina: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabase.rpc("editar_personal", {
    p_creador_usuario: usuarioSesion,
    p_usuario_id: datos.id,
    p_nombre: datos.nombre,
    p_cedula: datos.cedula,
    p_area_codigo: datos.area,
    p_rol_codigo: datos.rol,
    p_area_origen_codigo: datos.areaOrigen,
    p_cargo: datos.cargo,
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
  datos: {
    usuario: string
    nombre: string
    cedula: string
    password: string
    area: AreaCodigo
    areaOrigen: AreaCodigo | null
    rol: RolCodigo
    cargo: CargoCodigo | null
  },
  pagina: string,
): Promise<{ ok: true; personal: PersonalRegistrado } | { ok: false; error: string }> {
  const { data, error } = await supabase.rpc("crear_usuario", {
    p_creador_usuario: usuarioSesion,
    p_usuario: datos.usuario,
    p_password: datos.password,
    p_rol_codigo: datos.rol,
    p_area_codigo: datos.area,
    p_nombre: datos.nombre,
    p_cedula: datos.cedula,
    p_area_origen_codigo: datos.areaOrigen,
    p_cargo: datos.cargo,
    p_pagina: pagina,
  })

  if (error) {
    // El usuario ya existe: violación del unique de la columna "usuario".
    if (error.code === "23505") {
      return { ok: false, error: "Ese usuario ya existe." }
    }
    return { ok: false, error: error.message || "No se pudo agregar el usuario. Intenta de nuevo." }
  }

  return {
    ok: true,
    personal: {
      id: data as string,
      usuario: datos.usuario,
      nombre: datos.nombre,
      cedula: datos.cedula,
      area: datos.area,
      areaOrigen: datos.areaOrigen,
      rol: datos.rol,
      cargo: datos.cargo,
      activo: true,
    },
  }
}
