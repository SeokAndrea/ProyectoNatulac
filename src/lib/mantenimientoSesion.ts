import type { Session } from "@/lib/auth"

/**
 * Usuario de Mantenimiento: del área Mantenimiento o con el rol Mantenimiento
 * (este último también puede estar en el Área de Pruebas, donde se prueba el
 * flujo completo). Coincide con es_de_mantenimiento() del servidor.
 */
export const esDeMantenimiento = (session: Pick<Session, "area" | "rol"> | null | undefined): boolean =>
  session?.area === "MANTENIMIENTO" || session?.rol === "MANTENIMIENTO"

/** Área de planta donde trabaja: Pruebas si la sesión es de Pruebas; si no, Aséptico (como area_de_paradas_mantenimiento). */
export const areaPlantaDeSesion = (session: Pick<Session, "area"> | null | undefined): "PRUEBAS" | "ASEPTICO" =>
  session?.area === "PRUEBAS" ? "PRUEBAS" : "ASEPTICO"
