/**
 * Cuántas paletas y cajas son unos envases, con los datos de la
 * presentación (envases por caja, cajas por paleta). Sirve para comparar
 * el Contador 2 (envases buenos) con lo que se cuenta en el piso.
 * null si falta el dato de la presentación.
 */
export interface EquivalenciaEnvases {
  /** Paletas completas. */
  paletas: number
  /** Cajas que sobran después de las paletas completas. */
  cajasSueltas: number
  /** Todo en cajas (paletas × cajas por paleta + sueltas). */
  cajasTotales: number
  /** Envases que no llegan a completar una caja. */
  envasesSueltos: number
}

export function equivalenciaEnvases(envases: number, envasesXCaja: number, cajasXPaleta: number): EquivalenciaEnvases | null {
  if (!(envasesXCaja > 0) || !(envases >= 0)) return null
  const cajasTotales = Math.floor(envases / envasesXCaja)
  const envasesSueltos = envases - cajasTotales * envasesXCaja
  const porPaleta = cajasXPaleta > 0 ? cajasXPaleta : 0
  const paletas = porPaleta > 0 ? Math.floor(cajasTotales / porPaleta) : 0
  return { paletas, cajasSueltas: cajasTotales - paletas * porPaleta, cajasTotales, envasesSueltos }
}

/** "14 paletas y 25 cajas (1.005 cajas)" — texto para mostrar debajo de un campo de envases. */
export function textoEquivalencia(e: EquivalenciaEnvases): string {
  const fmt = (n: number) => n.toLocaleString("es-CO")
  const partes: string[] = []
  if (e.paletas > 0) partes.push(`${fmt(e.paletas)} ${e.paletas === 1 ? "paleta" : "paletas"}`)
  if (e.cajasSueltas > 0 || e.paletas === 0) partes.push(`${fmt(e.cajasSueltas)} ${e.cajasSueltas === 1 ? "caja" : "cajas"}`)
  let texto = partes.join(" y ")
  if (e.paletas > 0) texto += ` (${fmt(e.cajasTotales)} cajas)`
  if (e.envasesSueltos > 0) texto += ` + ${fmt(e.envasesSueltos)} ${e.envasesSueltos === 1 ? "envase" : "envases"}`
  return texto
}
