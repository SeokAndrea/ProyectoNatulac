import type { DatosMes, DatosPresentacionVacio } from "@/lib/indicadores/tipos"

/*
 * VACÍO: dos líneas, y cualquiera de estas presentaciones puede ir en
 * cualquiera de las dos (dueña, 2026-11-05). AL-340 se mide en cm³; las
 * demás en g. Todo se carga a mano (no hay cálculo automático).
 */
export const PRESENTACIONES_VACIO = [
  { codigo: "AL-340", unidad: "cm³" },
  { codigo: "V-250", unidad: "g" },
  { codigo: "V-114", unidad: "g" },
  { codigo: "V-186", unidad: "g" },
] as const

/** Clave de la observación de una presentación de Vacío: "vacio|AL-340". */
export const claveVacio = (codigo: string) => `vacio|${codigo}`

export const presentacionVacioVacia = (): DatosPresentacionVacio => ({ cajas: null, cajasPlan: null, mermaEmpaque: null, mermaSemi: null, paradas: [] })

/** Si la presentación tiene algo cargado (algún número o alguna parada con nombre). */
export const tienePresentacionVacio = (p: DatosPresentacionVacio | undefined) =>
  !!p && (p.cajas != null || p.cajasPlan != null || p.mermaEmpaque != null || p.mermaSemi != null || (p.paradas ?? []).some((f) => f.causa.trim() !== ""))

/** Si el mes tiene algo de Vacío cargado: sin datos, la pantalla no aparece. */
export const tieneVacio = (d: DatosMes | null | undefined) =>
  !!d?.vacio && (d.vacio.eficiencia != null || Object.values(d.vacio.presentaciones ?? {}).some(tienePresentacionVacio))

/** Las dos presentaciones con las que abre la pantalla: las primeras con datos en el mes; si faltan, las primeras del catálogo. */
export function elegidasPorDefecto(d: DatosMes | null | undefined): [string, string] {
  const codigos: string[] = PRESENTACIONES_VACIO.map((p) => p.codigo)
  const con = codigos.filter((c) => tienePresentacionVacio(d?.vacio?.presentaciones?.[c]))
  const lista = [...con, ...codigos.filter((c) => !con.includes(c))]
  return [lista[0], lista[1]]
}
