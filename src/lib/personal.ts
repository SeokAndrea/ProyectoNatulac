import { supabase } from "@/lib/supabase"
import type { AreaCodigo, RolCodigo } from "@/lib/catalogos"

export interface PersonalRegistrado {
  id: string
  usuario: string
  nombre: string
  cedula: string | null
  area: AreaCodigo | null
  rol: RolCodigo
}

/*
 * Personal registrado desde "Añadir Personal"
 * (src/pages/apps/AnadirPersonal.tsx). Vive en la tabla "usuarios" de
 * Supabase (NO Supabase Auth — ver
 * supabase/migrations/20260822090000_usuarios_tabla_propia.sql).
 * Estas funciones solo llaman a las RPC de Postgres que hashean la
 * contraseña y nunca la devuelven; el frontend nunca ve password_hash.
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
}

export async function listarPersonal(): Promise<PersonalRegistrado[]> {
  const { data, error } = await supabase.rpc("listar_personal")
  if (error || !data) return []
  return (data as FilaPersonal[]).map((fila) => ({
    id: fila.usuario_id,
    usuario: fila.usuario,
    nombre: fila.nombre ?? fila.usuario,
    cedula: fila.cedula,
    area: fila.area_codigo as AreaCodigo | null,
    rol: fila.rol_codigo as RolCodigo,
  }))
}

export async function agregarPersonal(datos: {
  usuario: string
  nombre: string
  cedula: string
  password: string
  area: AreaCodigo
  rol: RolCodigo
}): Promise<{ ok: true; personal: PersonalRegistrado } | { ok: false; error: string }> {
  const { data, error } = await supabase.rpc("crear_usuario", {
    p_usuario: datos.usuario,
    p_password: datos.password,
    p_rol_codigo: datos.rol,
    p_area_codigo: datos.area,
    p_nombre: datos.nombre,
    p_cedula: datos.cedula,
  })

  if (error) {
    // El usuario ya existe: violación del unique de la columna "usuario".
    if (error.code === "23505") {
      return { ok: false, error: "Ese usuario ya existe." }
    }
    return { ok: false, error: "No se pudo agregar el usuario. Intenta de nuevo." }
  }

  return {
    ok: true,
    personal: {
      id: data as string,
      usuario: datos.usuario,
      nombre: datos.nombre,
      cedula: datos.cedula,
      area: datos.area,
      rol: datos.rol,
    },
  }
}
