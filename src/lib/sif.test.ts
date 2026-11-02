import { describe, expect, it } from "vitest"
import type { Session } from "@/lib/auth"
import { apps, puedeVerApp } from "@/lib/apps"
import type { AreaCodigo, RolCodigo } from "@/lib/catalogos"
import {
  areaDeSif,
  CONFIG_SIF_POR_DEFECTO,
  descripcionSif,
  errorConfigSif,
  errorDesactualizado,
  fechaHoraSif,
  fraseControlSif,
  mensajeErrorSif,
  minutosEntre,
  nombreSolicitud,
  pasosSif,
  sifPorAtender,
  textoDuracion,
  textoPorAtender,
  type ConfigSif,
  type EstadoSif,
  type Sif,
} from "@/lib/sif"

function sesion(area: AreaCodigo, rol: RolCodigo, permisos: Session["permisos"]): Session {
  return { username: "prueba", nombre: "Prueba", cedula: null, area, rol, esDueno: false, permisos, debeCompletarPerfil: false }
}
function sif(estado: EstadoSif, extra: Partial<Sif> = {}): Sif {
  return {
    id: `sif-${estado}`,
    codigo: "SIF20261025_1",
    fechaJornada: "2026-10-25",
    estado,
    generadaEn: "2026-10-25T12:00:00Z",
    escaladaEn: null,
    revisadaEn: null,
    revisadaPor: null,
    revision: null,
    responsable: null,
    inicioReparacion: null,
    trabajoRealizado: null,
    entregadaA: null,
    cierre: null,
    lineaCodigo: "LINEA_2",
    lineaNombre: "Línea 2",
    areaNombre: "Aséptico",
    tipoCodigo: "LLENADORA_ATASCO",
    tipoNombre: "Atasco de llenadora",
    equipoNombre: "Llenadora",
    fallas: 3,
    ...extra,
  }
}
const titulos = (s: Sif) => pasosSif(s).map((p) => p.titulo)
const veSif = (s: Session) => puedeVerApp(s, apps.find((a) => a.slug === "solicitudes-intervencion")!)

describe("Solicitudes de Intervención de Falla", () => {
  it("fecha y hora en hora de planta (Caracas, UTC-4)", () => {
    expect(fechaHoraSif("2026-10-09T18:05:00Z")).toBe("09/10/2026 14:05")
    expect(fechaHoraSif(null)).toBe("—")
  })

  it("duración en minutos y en horas", () => {
    expect(minutosEntre("2026-10-09T10:00:00Z", "2026-10-09T10:18:00Z")).toBe(18)
    expect(minutosEntre("2026-10-09T10:00:00Z", null)).toBeNull()
    expect(textoDuracion(18)).toBe("18 min")
    expect(textoDuracion(125)).toBe("2 h 05 min")
    expect(textoDuracion(null)).toBe("—")
  })

  it("la ven Mantenimiento, los supervisores y quien audita; Servicios Industriales no", () => {
    expect(veSif(sesion("MANTENIMIENTO", "MANTENIMIENTO", ["PARADAS_MANTENIMIENTO", "SIF_GESTIONAR"]))).toBe(true)
    expect(veSif(sesion("ASEPTICO", "SUPERVISOR", ["TURNO_ASUMIR", "TURNO_CARGAR", "PARADAS_REGISTRAR"]))).toBe(true)
    expect(veSif(sesion("ASEPTICO", "ANALISTA", ["AUDITORIA_VER"]))).toBe(true)
    expect(veSif(sesion("SERVICIOS_INDUSTRIALES", "SERVICIOS_INDUSTRIALES", []))).toBe(false)
    expect(veSif(sesion("CALIDAD", "CALIDAD", ["LOTE_LIBERAR"]))).toBe(false)
  })

  it("Inspección o Intervención según el estado", () => {
    expect(nombreSolicitud("INSPECCION")).toBe("Solicitud de Inspección")
    expect(nombreSolicitud("REVISADA")).toBe("Solicitud de Inspección")
    expect(nombreSolicitud("PENDIENTE")).toBe("Solicitud de Intervención")
    expect(nombreSolicitud("CERRADA")).toBe("Solicitud de Intervención")
  })

  it("por atender: primero las intervenciones sin responsable, después las inspecciones sin revisar", () => {
    const lista = [sif("INSPECCION"), sif("EN_REPARACION"), sif("PENDIENTE"), sif("REVISADA"), sif("CERRADA")]
    expect(sifPorAtender(lista).map((s) => s.estado)).toEqual(["PENDIENTE", "INSPECCION"])
  })

  it("texto del aviso", () => {
    expect(textoPorAtender([sif("PENDIENTE")])).toBe("1 solicitud de intervención pendiente")
    expect(textoPorAtender([sif("PENDIENTE"), sif("PENDIENTE")])).toBe("2 solicitudes de intervención pendientes")
    expect(textoPorAtender([sif("INSPECCION")])).toBe("1 solicitud de inspección por revisar")
    expect(textoPorAtender([sif("PENDIENTE"), sif("INSPECCION"), sif("INSPECCION")])).toBe(
      "1 solicitud de intervención y 2 de inspección por atender",
    )
  })

  it("pasos: la inspección, la que subió a intervención y la que nació intervención", () => {
    expect(titulos(sif("INSPECCION"))).toEqual(["Inspección", "Revisada"])
    expect(pasosSif(sif("INSPECCION"))[1]).toMatchObject({ hecho: false, actual: true })
    expect(titulos(sif("PENDIENTE", { escaladaEn: "2026-10-25T14:00:00Z" }))).toEqual([
      "Inspección",
      "Pasó a intervención",
      "Inicio de reparación",
      "Cerrada",
    ])
    expect(titulos(sif("PENDIENTE", { escaladaEn: "2026-10-25T15:00:00Z", revisadaEn: "2026-10-25T13:00:00Z" }))).toEqual([
      "Inspección",
      "Revisada",
      "Pasó a intervención",
      "Inicio de reparación",
      "Cerrada",
    ])
    expect(titulos(sif("PENDIENTE"))).toEqual(["Generada", "Inicio de reparación", "Cerrada"])
  })

  it("errores: los de las reglas quedan; los de red y técnicos se traducen", () => {
    expect(mensajeErrorSif("La solicitud ya no está pendiente. Recarga la pantalla.")).toBe("La solicitud ya no está pendiente. Recarga la pantalla.")
    expect(mensajeErrorSif("TypeError: Failed to fetch")).toBe("No hay conexión con el servidor. Revisa la red e intenta de nuevo.")
    expect(mensajeErrorSif("Could not find the function public.marcar_revisada_sif (PGRST202)")).toMatch(/^No se pudo completar/)
    expect(mensajeErrorSif(null)).toMatch(/^No se pudo completar/)
    expect(errorDesactualizado("La solicitud no está en reparación. Recarga la pantalla.")).toBe(true)
    expect(errorDesactualizado("Escribe el trabajo realizado.")).toBe(false)
  })
})

describe("frecuencia de las SIF (configuración por área)", () => {
  const dia: ConfigSif = { ventana: "DIA", inspeccionEn: 3, intervencionEn: 4 }

  it("la configuración por defecto es la de siempre: por día, 3 y 4", () => {
    expect(CONFIG_SIF_POR_DEFECTO).toEqual(dia)
  })

  it("la frase de control dice el número y la ventana", () => {
    expect(fraseControlSif({ ventana: "TURNO", inspeccionEn: 3, intervencionEn: 4 })).toBe(
      "La misma falla 3 veces en un turno → Inspección; a la 4.ª → Intervención.",
    )
    expect(fraseControlSif({ ventana: "TURNO", inspeccionEn: 2, intervencionEn: 3 })).toBe(
      "La misma falla 2 veces en un turno → Inspección; a la 3.ª → Intervención.",
    )
    expect(fraseControlSif(dia)).toBe("La misma falla 3 veces en un día → Inspección; a la 4.ª → Intervención.")
    expect(fraseControlSif({ ventana: "SEMANA", inspeccionEn: 5, intervencionEn: 8 })).toBe(
      "La misma falla 5 veces en una semana → Inspección; a la 8.ª → Intervención.",
    )
  })

  it("la descripción del encabezado sale de la configuración", () => {
    expect(descripcionSif({ ventana: "TURNO", inspeccionEn: 3, intervencionEn: 4 })).toBe(
      "Fallas repetidas en el turno: inspección a la 3.ª, intervención a la 4.ª",
    )
    expect(descripcionSif(dia)).toBe("Fallas repetidas en el día: inspección a la 3.ª, intervención a la 4.ª")
    expect(descripcionSif({ ventana: "SEMANA", inspeccionEn: 2, intervencionEn: 6 })).toBe(
      "Fallas repetidas en la semana: inspección a la 2.ª, intervención a la 6.ª",
    )
  })

  it("avisa lo que no se puede guardar", () => {
    expect(errorConfigSif(dia)).toBeNull()
    expect(errorConfigSif({ ...dia, inspeccionEn: 4, intervencionEn: 4 })).toBe("La intervención tiene que ser después de la inspección.")
    expect(errorConfigSif({ ...dia, inspeccionEn: 5, intervencionEn: 3 })).toBe("La intervención tiene que ser después de la inspección.")
    expect(errorConfigSif({ ...dia, inspeccionEn: 1, intervencionEn: 4 })).toBe("La inspección va de la 2.ª a la 10.ª vez.")
    expect(errorConfigSif({ ...dia, inspeccionEn: 11, intervencionEn: 12 })).toBe("La inspección va de la 2.ª a la 10.ª vez.")
    expect(errorConfigSif({ ...dia, intervencionEn: 16 })).toBe("La intervención llega hasta la 15.ª vez.")
  })

  it("el área de las SIF: Pruebas es PRUEBAS y el resto ASEPTICO", () => {
    expect(areaDeSif("PRUEBAS")).toBe("PRUEBAS")
    expect(areaDeSif("ASEPTICO")).toBe("ASEPTICO")
    expect(areaDeSif("MANTENIMIENTO")).toBe("ASEPTICO")
    expect(areaDeSif(null)).toBe("ASEPTICO")
  })
})
