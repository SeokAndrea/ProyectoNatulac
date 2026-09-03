import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"
import { AuditoriaTurnos, type TurnoAuditoria } from "@/components/AuditoriaTurnos"
import { LINEAS_DEMO, PRESENTACIONES_DEMO, contador, corrida, prep, pt, turnoDemo } from "@/lib/auditoriaDemoFixture"
import { fechaLocal, type TurnoActivo } from "@/lib/turno"
import type { TurnoResumen } from "@/lib/historialTurnos"

const HOY = fechaLocal(new Date())

function turnoAuditoria(detalle: TurnoActivo, area: "ASEPTICO" | "VACIO" = "ASEPTICO"): TurnoAuditoria {
  return {
    detalle,
    resumen: {
      id: detalle.id,
      codigo: detalle.codigo,
      fecha: detalle.fecha,
      horaInicio: detalle.horaInicio,
      estado: detalle.estado,
      supervisorUsuario: detalle.supervisorUsuario,
      supervisorNombre: detalle.supervisorNombre,
      area,
      turnoTipo: detalle.turnoTipo,
      grupo: detalle.grupo,
    } satisfies TurnoResumen,
  }
}

const BASE = {
  fecha: HOY,
  horaInicio: "22:30:00" as const,
  turnoTipo: "TURNO_3" as const,
  grupo: "GRUPO_1" as const,
}

/** Turno sano: un lote, una corrida, números coherentes. */
function turnoSano(over: { id: string; supervisorUsuario: string; supervisorNombre: string; codigo: string }) {
  return turnoDemo({
    ...BASE,
    ...over,
    preparaciones: [
      prep({ id: `${over.id}-L`, numeroTanque: 1, creadoEn: "22:35:00", saborNombre: "Fresa", lote: "0001", volumenInicialL: 7000, volumenLInicio: 7000, volumenL: 200 }),
    ],
    lineas: [
      corrida({ id: `${over.id}-c`, linea: "LINEA_1", activadaEn: "23:05:00", saborNombre: "Fresa", lote: "0001", loteId: `${over.id}-L`, presentacion: "1000" }),
    ],
    contadores: [contador({ id: `${over.id}-co`, linea: "LINEA_1", creadoEn: "03:00:00", turnoLineaId: `${over.id}-c`, envasesLlenadora: 5600 })],
    productoTerminado: [
      pt({ id: `${over.id}-pt`, linea: "LINEA_1", creadoEn: "03:05:00", turnoLineaId: `${over.id}-c`, saborNombre: "Fresa", presentacion: "1000", paletas: 9, cajasSueltas: 0, litrosProducidos: 5400 }),
    ],
  })
}

function render7dias(turnos: TurnoAuditoria[]) {
  return render(
    <AuditoriaTurnos turnos={turnos} lineas={LINEAS_DEMO} presentaciones={PRESENTACIONES_DEMO} presetInicial="DIAS_7" />,
  )
}

describe("AuditoriaTurnos", () => {
  it("muestra el supervisor, la solapa con su conteo y el resumen sano sin flags", () => {
    render7dias([turnoAuditoria(turnoSano({ id: "t1", supervisorUsuario: "drojas", supervisorNombre: "Deivis Rojas", codigo: "0902-A-3" }))])

    expect(screen.getByText("Deivis Rojas")).toBeInTheDocument()
    expect(screen.getByRole("tab", { name: /Turno 3 · 1/ })).toBeInTheDocument()
    expect(screen.getByText(/merma de semielaborado/)).toBeInTheDocument()
    expect(screen.queryByText(/sin dato/)).not.toBeInTheDocument()
    expect(screen.queryByText(/parcial/)).not.toBeInTheDocument()
  })

  it("abre la línea de tiempo al hacer clic en la fila (empieza contraída)", async () => {
    const user = userEvent.setup()
    render7dias([turnoAuditoria(turnoSano({ id: "t1", supervisorUsuario: "drojas", supervisorNombre: "Deivis Rojas", codigo: "0902-A-3" }))])

    expect(screen.queryByText("Comenzar Turno")).not.toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: /Deivis Rojas/ }))
    expect(screen.getByText("Comenzar Turno")).toBeInTheDocument()
  })

  it("merma de semielaborado parcial: un lote con fin ≥ inicio", () => {
    const turno = turnoDemo({
      ...BASE,
      id: "tp",
      codigo: "0902-A-3",
      supervisorUsuario: "psalas",
      supervisorNombre: "Pedro Salas",
      preparaciones: [
        prep({ id: "L1", numeroTanque: 1, creadoEn: "22:35:00", saborNombre: "Fresa", lote: "0001", volumenInicialL: 6000, volumenLInicio: 6000, volumenL: 200 }),
        prep({ id: "L2", numeroTanque: 2, creadoEn: "23:00:00", saborNombre: "Mango", lote: "0002", volumenInicialL: 6000, volumenLInicio: 6000, volumenL: 9000 }),
      ],
      lineas: [
        corrida({ id: "c1", linea: "LINEA_1", activadaEn: "23:05:00", saborNombre: "Fresa", lote: "0001", loteId: "L1", presentacion: "1000" }),
        corrida({ id: "c2", linea: "LINEA_2", activadaEn: "23:10:00", saborNombre: "Mango", lote: "0002", loteId: "L2", presentacion: "1000" }),
      ],
      contadores: [
        contador({ id: "co1", linea: "LINEA_1", creadoEn: "02:00:00", turnoLineaId: "c1", envasesLlenadora: 5800 }),
        contador({ id: "co2", linea: "LINEA_2", creadoEn: "02:10:00", turnoLineaId: "c2", envasesLlenadora: 5200 }),
      ],
      productoTerminado: [
        pt({ id: "p1", linea: "LINEA_1", creadoEn: "02:05:00", turnoLineaId: "c1", saborNombre: "Fresa", presentacion: "1000", paletas: 9, cajasSueltas: 0, litrosProducidos: 5400 }),
        pt({ id: "p2", linea: "LINEA_2", creadoEn: "02:15:00", turnoLineaId: "c2", saborNombre: "Mango", presentacion: "1000", paletas: 8, cajasSueltas: 0, litrosProducidos: 4800 }),
      ],
    })
    render7dias([turnoAuditoria(turno)])
    expect(screen.getByText(/parcial \(.*sin contrastar\)/)).toBeInTheDocument()
  })

  it("dos corridas idénticas: una fila, marcada como posible duplicado", () => {
    const turno = turnoDemo({
      ...BASE,
      id: "td",
      codigo: "0902-A-3",
      supervisorUsuario: "jbello",
      supervisorNombre: "Javier Bello",
      preparaciones: [prep({ id: "L1", numeroTanque: 1, creadoEn: "22:35:00", saborNombre: "Pera", lote: "0004", volumenInicialL: 20000, volumenLInicio: 20000, volumenL: 200 })],
      lineas: [
        corrida({ id: "c1", linea: "LINEA_1", activadaEn: "23:05:00", saborNombre: "Pera", lote: "0004", loteId: "L1", presentacion: "1000" }),
        corrida({ id: "c2", linea: "LINEA_1", activadaEn: "01:00:00", saborNombre: "Pera", lote: "0004", loteId: "L1", presentacion: "1000" }),
      ],
      contadores: [
        contador({ id: "co1", linea: "LINEA_1", creadoEn: "00:30:00", turnoLineaId: "c1", envasesLlenadora: 10300 }),
        contador({ id: "co2", linea: "LINEA_1", creadoEn: "05:00:00", turnoLineaId: "c2", envasesLlenadora: 10300 }),
      ],
      productoTerminado: [
        pt({ id: "p1", linea: "LINEA_1", creadoEn: "00:35:00", turnoLineaId: "c1", saborNombre: "Pera", presentacion: "1000", paletas: 10, cajasSueltas: 5, litrosProducidos: 6120 }),
        pt({ id: "p2", linea: "LINEA_1", creadoEn: "05:05:00", turnoLineaId: "c2", saborNombre: "Pera", presentacion: "1000", paletas: 10, cajasSueltas: 5, litrosProducidos: 6120 }),
      ],
    })
    render7dias([turnoAuditoria(turno)])
    expect(screen.getByText(/2 registros idénticos/)).toBeInTheDocument()
  })

  it("el buscador filtra la lista y las filas siguen contraídas", async () => {
    const user = userEvent.setup()
    render7dias([
      turnoAuditoria(turnoSano({ id: "t1", supervisorUsuario: "drojas", supervisorNombre: "Deivis Rojas", codigo: "0902-A-3" })),
      turnoAuditoria(turnoSano({ id: "t2", supervisorUsuario: "kmendez", supervisorNombre: "Karla Méndez", codigo: "0902-V-3" }), "VACIO"),
    ])

    await user.type(screen.getByPlaceholderText(/Buscar/), "Karla")
    expect(screen.getByText(/1 turno coincide/)).toBeInTheDocument()
    expect(screen.getByText("Karla Méndez")).toBeInTheDocument()
    expect(screen.queryByText("Deivis Rojas")).not.toBeInTheDocument()
    expect(screen.queryByText("Comenzar Turno")).not.toBeInTheDocument()
  })
})
