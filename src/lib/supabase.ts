import { createClient } from "@supabase/supabase-js"

/*
 * Cliente de Supabase para el frontend. Usa la clave "anon" (pública),
 * que es segura de exponer en el navegador siempre que la base de
 * datos tenga Row Level Security (RLS) activada en cada tabla — es
 * RLS, no esta clave, lo que controla qué puede leer/escribir cada
 * usuario según su rol y área.
 *
 * Las variables se leen de .env.local (copiar desde .env.example y
 * completar con los datos del proyecto). Vite solo expone al
 * navegador las variables que empiezan con VITE_.
 */
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Faltan las variables VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. Copia .env.example a .env.local y complétalas.",
  )
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

/*
 * Log de errores (ver migración 20261047090000): cualquier RPC que
 * devuelva error queda guardado en errores_cliente — Auditoría ya
 * cubre las mutaciones que SALEN bien; esto cubre las que fallan, sin
 * que cada pantalla tenga que acordarse de loguearlo a mano (antes se
 * perdían: quedaban solo en la pantalla del supervisor en el momento).
 * Solo lo ve quien tenga usuarios.ve_errores = true (ver
 * src/pages/apps/ErroresCliente.tsx).
 *
 * Resuelve el RPC original UNA sola vez (nunca dos `.then()` sobre el
 * mismo builder de supabase-js, eso dispararía la petición dos veces)
 * y el log de error se manda sin esperarlo, para no frenar ni afectar
 * el resultado que ve quien llamó. Se salta a sí mismo
 * (registrar_error_cliente) para no entrar en loop si él mismo
 * fallara, y redacta cualquier parámetro que huela a contraseña antes
 * de guardar el contexto.
 */
const rpcOriginal = supabase.rpc.bind(supabase)
type RpcArgs = Record<string, unknown> | undefined

function contextoSinSecretos(args: RpcArgs): Record<string, unknown> | null {
  if (!args) return null
  const limpio: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(args)) {
    limpio[k] = /password|clave/i.test(k) ? "•••" : v
  }
  return limpio
}

// @ts-expect-error — angostamos la firma genérica de supabase-js a como se usa en todo el proyecto: `const { data, error } = await supabase.rpc(fn, args)`, sin encadenar `.select()`/`.single()` después.
supabase.rpc = async (fn: string, args?: RpcArgs) => {
  const resultado = await rpcOriginal(fn, args)
  if (resultado.error && fn !== "registrar_error_cliente") {
    const usuario = typeof args?.p_usuario === "string" ? args.p_usuario : null
    rpcOriginal("registrar_error_cliente", {
      p_usuario: usuario,
      p_funcion: fn,
      p_mensaje: resultado.error.message,
      p_contexto: contextoSinSecretos(args),
    }).then(
      () => {},
      () => {},
    )
  }
  return resultado
}
