/*
 * Credencial de la sesión (migración 20261109690000_sesiones_con_credencial):
 * verificar_login la entrega al entrar y la base la pide en cada petición
 * (header x-sesion) para saber quién llama, sin creerle al p_usuario que
 * manda la pantalla. Vive en memoria acá y en la sesión guardada
 * (auth.tsx); este módulo no depende de React para que supabase.ts lo use.
 */

export const HEADER_SESION = "x-sesion"

/** Código de Postgres que devuelve la base cuando la credencial no sirve. */
export const CODIGO_SESION_INVALIDA = "28000"

let token: string | null = null
let alVencer: (() => void) | null = null
let aviso: string | null = null

export function fijarTokenSesion(nuevo: string | null) {
  token = nuevo
}

export function tokenSesion(): string | null {
  return token
}

/** AuthProvider registra acá cómo cerrar la sesión cuando la base la rechaza. */
export function alVencerSesion(fn: (() => void) | null) {
  alVencer = fn
}

export function sesionRechazada() {
  aviso = "Tu sesión venció. Vuelve a iniciar sesión."
  alVencer?.()
}

/** El mensaje para la pantalla de entrada; se borra al volver a entrar. */
export function avisoSalida(): string | null {
  return aviso
}

export function limpiarAvisoSalida() {
  aviso = null
}

/*
 * fetch de supabase-js: suma la credencial a las peticiones a la base
 * (/rest/v1/). No a Storage, que no la usa. Si la petición ya trae una
 * (cerrar sesión manda la vieja a propósito), no la pisa.
 */
export const fetchConSesion: typeof fetch = (input, init) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url
  if (!token || !url.includes("/rest/v1/")) return fetch(input, init)
  const headers = new Headers(init?.headers)
  if (!headers.has(HEADER_SESION)) headers.set(HEADER_SESION, token)
  return fetch(input, { ...init, headers })
}
