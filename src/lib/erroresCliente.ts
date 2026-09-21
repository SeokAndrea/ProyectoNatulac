/**
 * Log de errores del cliente (ver migración 20261047090000): cualquier
 * RPC que devuelva error queda guardado solo (el wrapper de
 * supabase.rpc() en src/lib/supabase.ts se encarga de mandarlo, ningún
 * componente lo hace a mano). Este módulo es solo lectura — listar lo
 * ya guardado. Solo responde para usuarios con usuarios.ve_errores =
 * true (ver session.veErrores en src/lib/auth.tsx); listar_errores_cliente()
 * rechaza a cualquier otro.
 */
import { supabase } from "@/lib/supabase"

export interface ErrorCliente {
  id: string
  usuarioNombre: string | null
  /** Nombre del RPC que falló (ej. "registrar_contador"). */
  funcion: string
  mensaje: string
  /** Argumentos con los que se llamó al RPC — contraseñas ya redactadas antes de guardar. */
  contexto: Record<string, unknown> | null
  creadoEn: string
}

interface FilaErrorCliente {
  id: string
  usuarioNombre: string | null
  funcion: string
  mensaje: string
  contexto: Record<string, unknown> | null
  creadoEn: string
}

export async function listarErroresCliente(usuario: string): Promise<{ ok: true; errores: ErrorCliente[] } | { ok: false; error: string }> {
  const { data, error } = await supabase.rpc("listar_errores_cliente", { p_usuario: usuario })
  if (error) {
    return { ok: false, error: error.message || "No se pudo traer el log de errores." }
  }
  return { ok: true, errores: (data as FilaErrorCliente[] | null) ?? [] }
}
