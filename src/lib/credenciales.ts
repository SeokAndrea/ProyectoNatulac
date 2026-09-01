/*
 * Validadores puros de credenciales (contraseña y cédula) del primer
 * ingreso. Separados de auth.tsx para no romper el fast-refresh de ese
 * archivo (que exporta el provider y el hook).
 */

/** Política de contraseña de la planta: exactamente 4 dígitos y distinta de la base 1234. */
export function claveCumplePolitica(password: string): boolean {
  return /^\d{4}$/.test(password) && password !== "1234"
}

/**
 * Cédula al formato "XX.XXX.XXX" / "X.XXX.XXX": toma lo que se escriba,
 * deja solo dígitos (máximo 8) y agrupa de a 3 desde la derecha con
 * puntos. "30223132" -> "30.223.132", "1234567" -> "1.234.567".
 */
export function formatearCedula(entrada: string): string {
  const digitos = entrada.replace(/\D/g, "").slice(0, 8)
  if (!digitos) return ""
  return digitos.replace(/\B(?=(\d{3})+(?!\d))/g, ".")
}

/** Cédula válida: 7 u 8 dígitos ya formateados (X.XXX.XXX o XX.XXX.XXX). */
export function cedulaValida(cedula: string): boolean {
  return /^\d{1,2}\.\d{3}\.\d{3}$/.test(cedula)
}
