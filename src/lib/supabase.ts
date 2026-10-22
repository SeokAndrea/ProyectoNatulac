import { PostgrestClient } from "@supabase/postgrest-js"
import { MENSAJE_SOLO_LECTURA, rpcBloqueada } from "@/lib/soloLectura"
import { CODIGO_SESION_INVALIDA, fetchConSesion, HEADER_SESION, sesionRechazada } from "@/lib/sesionToken"

/*
 * Cliente de la base para el frontend. La base es un PostgreSQL propio
 * en el servidor de planta (ya no Supabase); el navegador no le habla
 * directo: pasa por PostgREST (servicio "api" de docker-compose.yml),
 * que entra con el rol "anon" — las tablas tienen RLS sin políticas y
 * todo va por funciones (RPC).
 *
 * La URL es relativa al mismo servidor que sirve la app: Vite reenvía
 * /api a PostgREST (ver vite.config.ts), así no hay CORS ni hace falta
 * ninguna variable en el navegador. Los datos de conexión (DB_*) viven
 * solo en .env.local del servidor y los usa el contenedor de PostgREST.
 *
 * Se sigue llamando `supabase` para no tocar las ~50 pantallas que lo
 * importan: la librería (postgrest-js) es la misma pieza que usaba
 * supabase-js por dentro, con la misma forma `supabase.rpc(fn, args)`.
 */
export const RUTA_API = "/api"

// La credencial de la sesión va en cada petición a la base (ver sesionToken.ts).
export const supabase = new PostgrestClient(`${window.location.origin}${RUTA_API}`, { fetch: fetchConSesion })

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
  // Roles que solo miran (src/lib/soloLectura.ts): no llega a la base ni se loguea como error.
  if (rpcBloqueada(fn)) {
    return {
      data: null,
      error: { name: "PostgrestError", message: MENSAJE_SOLO_LECTURA, details: "", hint: "", code: "SOLO_LECTURA" },
      count: null,
      status: 403,
      statusText: "Solo lectura",
    }
  }
  const resultado = await rpcOriginal(fn, args)
  // La base no reconoce la credencial (venció, cambió la clave, desactivada): a la pantalla de entrada.
  if (resultado.error?.code === CODIGO_SESION_INVALIDA) {
    sesionRechazada()
    return resultado
  }
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

/**
 * Borra la sesión en la base. Manda la credencial vieja explícita: para
 * cuando sale la petición, la app ya puede tener otra (alguien entró rápido).
 */
export function cerrarSesionEnBase(token: string) {
  rpcOriginal("cerrar_sesion")
    .setHeader(HEADER_SESION, token)
    .then(
      () => {},
      () => {},
    )
}
