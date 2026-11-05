import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { CintaLinea, type EstadoLineaVista } from "@/components/CintaLinea"
import type { Corrida } from "@/lib/produccion/tipos"
import { ASPECTO_DE_VISTA, ASPECTO_LINEA, aspectoDeLinea, claveAspecto } from "./estadoLinea"

// El dibujo pixel art no importa acá: solo la etiqueta.
vi.mock("@/components/pixel/CintaPixel", () => ({ CintaPixel: () => null }))

/*
 * Contrato de la tabla única (dueña, 2026-11-05): la tarjeta de Líneas, el
 * Modo Paradas y el Panel de Producción leen ASPECTO_LINEA; el Panel de
 * Paradas, su escena. Si alguien agrega un estado sin su escena, o la escena
 * dice otra cosa que la tarjeta, esto falla.
 */
describe("tabla única del aspecto de una línea", () => {
  it("cada estado tiene una escena propia del Panel de Paradas", () => {
    const vistas = Object.values(ASPECTO_LINEA).map((a) => a.vista)
    expect(new Set(vistas).size).toBe(vistas.length)
    const todas: EstadoLineaVista[] = ["CORRIENDO", "PARADA", "DETENIDA", "CIP", "CAMBIO", "SIN_PROGRAMACION", "LIBRE", "TERMINO"]
    expect([...vistas].sort()).toEqual([...todas].sort())
  })

  it.each(Object.entries(ASPECTO_LINEA))("el Panel de Paradas dice lo mismo que la tarjeta: %s", (_clave, aspecto) => {
    render(<CintaLinea numeroLinea={1} estado={aspecto.vista} saborNombre={null} lote={null} />)
    expect(screen.getAllByText(aspecto.badge).length).toBeGreaterThan(0)
    expect(ASPECTO_DE_VISTA[aspecto.vista]).toBe(aspecto)
  })

  it("una corrida con el lote terminado se ve «Terminó el Lote»; sin corrida, el estado tal cual", () => {
    const terminada = { loteTerminado: "2026-11-05T09:00:00" } as unknown as Corrida
    expect(claveAspecto({ estado: "activa", corrida: terminada })).toBe("lote_terminado")
    expect(aspectoDeLinea({ estado: "activa", corrida: terminada }).badge).toBe("Terminó el Lote")
    expect(aspectoDeLinea({ estado: "detenida_por_parada", corrida: null })).toMatchObject({ badge: "Detenida por parada", variante: "danger" })
    expect(aspectoDeLinea({ estado: "libre", corrida: null })).toMatchObject({ badge: "Libre", variante: "muted" })
  })

  it("«Esperando PT» ya no existe como estado", () => {
    expect(Object.values(ASPECTO_LINEA).map((a) => a.badge)).not.toContain("Esperando PT")
  })
})
