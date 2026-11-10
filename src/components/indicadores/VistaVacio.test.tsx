import { fireEvent, render, screen, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { VistaVacio } from "@/components/indicadores/VistaVacio"
import { mesVacio, type DatosMes } from "@/lib/indicadores/tipos"

const datos = (): DatosMes => ({
  ...mesVacio(),
  vacio: {
    eficiencia: 86,
    presentaciones: {
      "AL-340": { cajas: 9640, cajasPlan: 9600, mermaEmpaque: 0.8, mermaSemi: 1.9, paradas: [{ causa: "Cambio de rollo de tapa", minutos: null, veces: null }] },
      "V-250": { cajas: 6480, cajasPlan: 6500, mermaEmpaque: 1.4, mermaSemi: 2.2, paradas: [{ causa: "Falla en cerradora", minutos: null, veces: null }] },
      "V-114": { cajas: 3560, cajasPlan: 3600, mermaEmpaque: 1.9, mermaSemi: 2.7, paradas: [{ causa: "Falla en etiquetadora", minutos: null, veces: null }] },
    },
  },
})
const meses = (d: DatosMes | null) => [
  { mes: "2026-08-01", datos: null },
  { mes: "2026-09-01", datos: null },
  { mes: "2026-10-01", datos: d },
]
const props = { observaciones: {}, puedeEditar: false, onGuardarObservacion: async () => ({ ok: true as const }), editar: null }

describe("VistaVacio", () => {
  it("una eficiencia, dos columnas con cajas producidas y planificadas y las dos mermas; sin cumplimiento ni comparaciones", () => {
    render(<VistaVacio meses={meses(datos())} {...props} />)
    expect(screen.getAllByText("EFICIENCIA")).toHaveLength(1)
    expect(screen.getAllByText("CAJAS PRODUCIDAS")).toHaveLength(2)
    expect(screen.getAllByText("CAJAS PLANIFICADAS")).toHaveLength(2)
    expect(screen.getAllByText("MERMA DE EMPAQUE")).toHaveLength(2)
    expect(screen.getAllByText("MERMA DE SEMIELABORADO")).toHaveLength(2)
    expect(screen.queryByText("CUMPLIMIENTO DE PLAN")).toBeNull()
    expect(screen.queryByText(/Más alto/)).toBeNull()
    expect(screen.queryByText(/vs /)).toBeNull()
    expect(screen.queryByText(/Línea/)).toBeNull()
    // Lo cargado a mano se ve: 9.640 cajas, merma de empaque 0,8 %.
    expect(screen.getByText("9.640")).toBeTruthy()
    expect(screen.getByText("0,8 %")).toBeTruthy()
  })

  it("abre con las dos primeras presentaciones con datos; el selector trae las 4 con su unidad y cambia la columna y sus paradas", () => {
    render(<VistaVacio meses={meses(datos())} {...props} />)
    const selector = screen.getByLabelText("Presentación de la columna 1") as HTMLSelectElement
    expect(selector.value).toBe("AL-340")
    expect((screen.getByLabelText("Presentación de la columna 2") as HTMLSelectElement).value).toBe("V-250")
    expect([...selector.options].map((o) => o.textContent)).toEqual(["AL-340 · cm³", "V-250 · g", "V-114 · g", "V-186 · g"])
    const paradas = screen.getByRole("region", { name: "Paradas" })
    expect(within(paradas).getByText("Cambio de rollo de tapa")).toBeTruthy()
    fireEvent.change(selector, { target: { value: "V-114" } })
    expect(within(paradas).queryByText("Cambio de rollo de tapa")).toBeNull()
    expect(within(paradas).getByText("Falla en etiquetadora")).toBeTruthy()
  })

  it("sin paradas cargadas, el bloque de paradas no aparece", () => {
    const d = datos()
    for (const p of Object.values(d.vacio!.presentaciones)) p.paradas = []
    render(<VistaVacio meses={meses(d)} {...props} />)
    expect(screen.queryByRole("region", { name: "Paradas" })).toBeNull()
  })

  it("un mes sin Vacío cargado avisa y no muestra columnas", () => {
    render(<VistaVacio meses={meses(null)} {...props} />)
    expect(screen.getByText(/Todavía no se cargó Vacío de octubre/)).toBeTruthy()
    expect(screen.queryByText("CAJAS PRODUCIDAS")).toBeNull()
  })
})
