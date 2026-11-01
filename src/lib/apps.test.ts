import { describe, expect, it } from "vitest"
import type { Session } from "@/lib/auth"
import { apps, puedeVerApp } from "@/lib/apps"
import type { AreaCodigo, RolCodigo } from "@/lib/catalogos"
import { PERMISOS, type Permiso } from "@/lib/permisos"

/*
 * Las tarjetas y rutas las deciden los permisos del puesto (Personal por
 * áreas y puestos). Sesiones armadas a mano con los permisos de cada puesto.
 */
function sesion(area: AreaCodigo | null, rol: RolCodigo, permisos: Permiso[], extra: Partial<Session> = {}): Session {
  return { username: "prueba", nombre: "Prueba", cedula: null, area, rol, esDueno: false, permisos, debeCompletarPerfil: false, ...extra }
}
const visibles = (s: Session) => apps.filter((a) => puedeVerApp(s, a)).map((a) => a.slug)

const TECNICO = sesion("MANTENIMIENTO", "MANTENIMIENTO", ["PARADAS_MANTENIMIENTO", "SIF_GESTIONAR", "CODIGOS_MTTO_EDITAR", "REPORTES_PARADAS_VER", "CATALOGO_PARADAS_VER"])
const JEFE_MTTO = sesion("MANTENIMIENTO", "MANTENIMIENTO", [
  "PARADAS_MANTENIMIENTO", "SIF_GESTIONAR", "CODIGOS_MTTO_EDITAR", "REPORTES_PARADAS_VER", "CATALOGO_PARADAS_VER", "CATALOGO_PARADAS", "PERSONAL_GESTIONAR",
])
const SERVICIOS = sesion("SERVICIOS_INDUSTRIALES", "SERVICIOS_INDUSTRIALES", ["LECTURAS_SI", "CATALOGO_PARADAS_VER"])
const JEFE_PRODUCCION = sesion("ASEPTICO", "JEFE_PRODUCCION", [
  "TURNO_CARGAR", "RESUMEN_VER", "VALIDAR", "REPORTES_PARADAS_VER", "LOTE_LIBERAR", "AUDITORIA_VER", "PERSONAL_GESTIONAR",
])
// Pruebas: puesto Probador (todos los permisos); la sesión trae la lista completa.
const PRUEBAS = sesion("PRUEBAS", "SUPERVISOR", PERMISOS.map((p) => p.codigo))

describe("tarjetas por permisos del puesto", () => {
  it("Técnico de Mantenimiento: Reportes de paradas sí; Códigos de Mantenimiento (solo la dueña) y Personal no", () => {
    const v = visibles(TECNICO)
    expect(v).toContain("reportes-paradas")
    expect(v).not.toContain("codigos-mantenimiento")
    expect(v).not.toContain("personal")
  })

  it("Jefe de Mantenimiento: ve Personal y Catálogo de Paradas", () => {
    const v = visibles(JEFE_MTTO)
    expect(v).toContain("personal")
    expect(v).toContain("catalogo-paradas")
    expect(v).not.toContain("codigos-mantenimiento")
  })

  it("Códigos de Mantenimiento: solo la dueña", () => {
    expect(visibles({ ...JEFE_MTTO, esDueno: true })).toContain("codigos-mantenimiento")
  })

  it("Servicios Industriales ve sus dos tarjetas con LECTURAS_SI; sin el permiso, ninguna", () => {
    expect(visibles(SERVICIOS)).toEqual(expect.arrayContaining(["servicios-industriales", "registros-servicios-industriales"]))
    const sin = visibles(sesion("SERVICIOS_INDUSTRIALES", "SERVICIOS_INDUSTRIALES", []))
    expect(sin).not.toContain("servicios-industriales")
    expect(sin).not.toContain("registros-servicios-industriales")
  })

  it("Jefe de Producción no ve Calidad (está en prueba) aunque libere lotes", () => {
    expect(visibles(JEFE_PRODUCCION)).not.toContain("calidad")
  })

  it("sesión de Pruebas: ve Calidad y todas las demás (menos las de un solo usuario o del dueño)", () => {
    const v = visibles(PRUEBAS)
    expect(v).toContain("calidad")
    expect(v).toContain("validar-jornada")
    expect(v).toEqual(expect.arrayContaining(["personal", "areas-puestos", "reportes-paradas", "servicios-industriales"]))
  })

  it("Manual lo ve cualquier puesto, también Mantenimiento", () => {
    expect(visibles(TECNICO)).toContain("manual")
  })

  it("Personal también lo abre quien gestiona la estructura", () => {
    expect(visibles(sesion(null, "SUPERADMINISTRADOR", ["ESTRUCTURA_GESTIONAR"], { esDueno: false }))).toContain("personal")
  })

  it("un rol ya no decide nada: mismo rol, sin el permiso, no ve la tarjeta", () => {
    expect(visibles(sesion("MANTENIMIENTO", "MANTENIMIENTO", []))).not.toContain("reportes-paradas")
  })
})
