import { describe, expect, it } from "vitest"
import { tramosLibres, ubicarMinutos } from "@/lib/cubrirTurno"

const t = (hhmm: string) => new Date(`2026-10-25T${hhmm}:00`).getTime()

describe("Cubrir lo sin reportar", () => {
  const paradas = [
    { inicio: "2026-10-25T09:00:00", fin: "2026-10-25T09:30:00" },
    { inicio: "2026-10-25T13:50:00", fin: "2026-10-25T14:10:00" },
  ]

  it("los tramos libres del turno son los que no tienen ninguna parada", () => {
    expect(tramosLibres(paradas, t("07:00"), t("15:00"))).toEqual([
      [t("07:00"), t("09:00")],
      [t("09:30"), t("13:50")],
      [t("14:10"), t("15:00")],
    ])
  })

  it("una parada abierta ocupa hasta el final", () => {
    expect(tramosLibres([{ inicio: "2026-10-25T14:00:00", fin: null }], t("07:00"), t("15:00"))).toEqual([[t("07:00"), t("14:00")]])
  })

  it("lo que cubre va al tramo libre más reciente y no pisa otra parada", () => {
    const libres = tramosLibres(paradas, t("07:00"), t("15:00"))
    expect(ubicarMinutos(libres, 30)).toEqual([{ inicio: "2026-10-25T14:30:00", fin: "2026-10-25T15:00:00" }])
  })

  it("si no entra en un tramo, se reparte hacia atrás", () => {
    const libres = tramosLibres(paradas, t("07:00"), t("15:00"))
    expect(ubicarMinutos(libres, 70)).toEqual([
      { inicio: "2026-10-25T13:30:00", fin: "2026-10-25T13:50:00" },
      { inicio: "2026-10-25T14:10:00", fin: "2026-10-25T15:00:00" },
    ])
  })

  it("si no hay lugar, no inventa: vacío", () => {
    const libres = tramosLibres([{ inicio: "2026-10-25T07:00:00", fin: "2026-10-25T14:50:00" }], t("07:00"), t("15:00"))
    expect(ubicarMinutos(libres, 30)).toEqual([])
    expect(ubicarMinutos(libres, 0)).toEqual([])
  })
})
