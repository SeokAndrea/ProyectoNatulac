import { useCallback, useMemo, useState } from "react"
import type { EstadoLineaEnVivo } from "@/components/PanelParadasVista"
import type { AccionesLinea, DatosParar, ParadaActualLinea } from "@/components/lineas/tipos"
import { corrida } from "@/lib/auditoriaDemoFixture"
import type { OeePeriodo } from "@/lib/eficiencia"
import type { ClaseParada, Parada, TipoParada } from "@/lib/paradas"
import type { Corrida, LineaEstado } from "@/lib/produccion/tipos"
import { fechaPlanta, horaPlanta } from "@/lib/tiempoPlanta"

/*
 * Demo de "Paradas desde Líneas" (/paradas-demo): todo en memoria, no toca
 * la base. Sirve para ver el flujo nuevo antes de conectarlo (plan
 * 2026-10-06): Parada con tipo + comentario → en curso → Continuar con los
 * minutos (calculados o a mano), y el Panel de Paradas con la parada actual
 * bajo la cinta y la baliza a los 15 min.
 */

/** Date → 'YYYY-MM-DDTHH:MM:SS' en hora de planta (el formato de `Parada.inicio`). */
const enPlanta = (d: Date) => `${fechaPlanta(d)}T${horaPlanta(d)}`
const haceMin = (min: number) => enPlanta(new Date(Date.now() - min * 60000))
const NO_EN_DEMO = { ok: false as const, error: "En la demo solo se prueban Parada y Continuar." }

const LINEAS = ["LINEA_1", "LINEA_2", "LINEA_3"] as const

function corridasIniciales(): Corrida[] {
  const hoy = haceMin(240)
  return [
    corrida({ id: "demo-c1", linea: "LINEA_1", activadaEn: hoy, presentacion: "1000", envasesHora: 7000, saborNombre: "Durazno", lote: "0012" }),
    corrida({ id: "demo-c2", linea: "LINEA_2", activadaEn: hoy, presentacion: "250", saborNombre: "Pera", lote: "0013", pausadaEn: haceMin(8) }),
    corrida({ id: "demo-c3", linea: "LINEA_3", activadaEn: hoy, presentacion: "330", saborNombre: "Mango (Selecto)", lote: "0014" }),
  ].map((c) => ({ ...c, confirmadoInicioEn: c.activadaEn }))
}

function parada(id: string, linea: string, clase: ClaseParada, tipoNombre: string, inicioHaceMin: number, minutos: number | null, nota: string | null): Parada {
  return {
    id,
    clase,
    origen: "MANUAL",
    lineaCodigo: linea,
    turnoTipo: "TURNO_1",
    tipoCodigo: null,
    tipoNombre,
    tiempoGuiaMin: null,
    nota,
    justificacionDesvio: null,
    inicio: haceMin(inicioHaceMin),
    fin: minutos === null ? null : haceMin(inicioHaceMin - minutos),
    supervisorNombre: "Supervisor demo",
  }
}

/** Unas paradas ya cerradas (para que el Panel tenga rankings) y la de L2 en curso hace 8 min. */
function paradasIniciales(): Parada[] {
  return [
    parada("demo-h1", "LINEA_1", "PROGRAMADA", "Cambio de Sabor", 60 * 26, 25, null),
    parada("demo-h2", "LINEA_1", "NO_PROGRAMADA", "Logística de Línea", 60 * 30, 18, "Faltaron paletas"),
    parada("demo-h3", "LINEA_2", "NO_PROGRAMADA", "Falla Operacional (Operación)", 60 * 50, 35, "Se trabó la tapadora"),
    parada("demo-h4", "LINEA_2", "NO_PROGRAMADA", "Logística de Línea", 60 * 3, 12, null),
    parada("demo-h5", "LINEA_3", "PROGRAMADA", "Descanso Legal", 60 * 5, 30, null),
    parada("demo-h6", "LINEA_3", "NO_PROGRAMADA", "Falta de operador", 60 * 75, 20, null),
    parada("demo-vivo-2", "LINEA_2", "NO_PROGRAMADA", "Falla Operacional (Operación)", 8, null, "Se cayó la banda del túnel"),
  ]
}

const OEE_DEMO = new Map<string, OeePeriodo>([
  ["LINEA_1", { oeePct: 82, disponibilidadPct: 90, rendimientoPct: 91, turnos: 9 }],
  ["LINEA_2", { oeePct: 64, disponibilidadPct: 76, rendimientoPct: 84, turnos: 9 }],
  ["LINEA_3", { oeePct: 88, disponibilidadPct: 94, rendimientoPct: 94, turnos: 9 }],
])

/** Estado y acciones de la demo. `tipos` = catálogo vigente, para saber la clase del tipo elegido. */
export function useParadasDemo(tipos: TipoParada[]) {
  const [corridas, setCorridas] = useState<Corrida[]>(corridasIniciales)
  const [paradas, setParadas] = useState<Parada[]>(paradasIniciales)
  /** Parada en curso de cada corrida pausada (id de la parada). */
  const [enCurso, setEnCurso] = useState<Record<string, string>>({ "demo-c2": "demo-vivo-2" })

  const lineasEstado: LineaEstado[] = LINEAS.map((linea) => ({
    linea,
    condicion: "LISTA",
    activadaEn: haceMin(240),
    cipIniciadoEn: null,
    cipFinalizadoEn: null,
    observacion: null,
  }))

  const paradaActual = useCallback(
    (corridaId: string): ParadaActualLinea | null => {
      const p = paradas.find((x) => x.id === enCurso[corridaId])
      return p ? { tipoNombre: p.tipoNombre, inicio: p.inicio, nota: p.nota } : null
    },
    [paradas, enCurso],
  )

  const acciones: AccionesLinea = {
    async parar(corridaId: string, datos: DatosParar) {
      const c = corridas.find((x) => x.id === corridaId)
      if (!c) return { ok: false, error: "No existe esa corrida." }
      const id = `demo-${Date.now()}`
      const clase = tipos.find((t) => t.codigo === datos.tipoCodigo)?.clase ?? "NO_PROGRAMADA"
      setParadas((ps) => [...ps, parada(id, c.linea, clase, datos.tipoNombre, datos.minutosAntes, null, datos.nota)])
      setEnCurso((e) => ({ ...e, [corridaId]: id }))
      setCorridas((cs) => cs.map((x) => (x.id === corridaId ? { ...x, pausadaEn: haceMin(datos.minutosAntes) } : x)))
      return { ok: true }
    },
    async continuar(corridaId: string, minutos?: number) {
      const id = enCurso[corridaId]
      setParadas((ps) =>
        ps.map((p) => {
          if (p.id !== id) return p
          const fin = minutos === undefined ? new Date() : new Date(new Date(p.inicio).getTime() + minutos * 60000)
          return { ...p, fin: enPlanta(fin) }
        }),
      )
      setEnCurso((e) => {
        const resto = { ...e }
        delete resto[corridaId]
        return resto
      })
      setCorridas((cs) => cs.map((x) => (x.id === corridaId ? { ...x, pausadaEn: null } : x)))
      return { ok: true }
    },
    pausar: async () => NO_EN_DEMO,
    activar: async () => NO_EN_DEMO,
    detener: async () => NO_EN_DEMO,
    continuarSiguienteLote: async () => NO_EN_DEMO,
    seguirMismoLote: async () => NO_EN_DEMO,
    confirmarEstado: async () => NO_EN_DEMO,
    cambiarCondicion: async () => NO_EN_DEMO,
    ponerEnCip: async () => NO_EN_DEMO,
    terminarCip: async () => NO_EN_DEMO,
    continuarCorridaDetenida: async () => NO_EN_DEMO,
    terminarLinea: async () => NO_EN_DEMO,
  }

  /** "Adelantar 15 min": las paradas en curso empiezan 15 min antes, como si hubiera pasado el tiempo. */
  function adelantar(min: number) {
    const ids = new Set(Object.values(enCurso))
    const atras = (iso: string) => enPlanta(new Date(new Date(iso).getTime() - min * 60000))
    setParadas((ps) => ps.map((p) => (ids.has(p.id) ? { ...p, inicio: atras(p.inicio) } : p)))
    setCorridas((cs) => cs.map((c) => (c.pausadaEn ? { ...c, pausadaEn: atras(c.pausadaEn) } : c)))
  }

  const estadoLineas: EstadoLineaEnVivo[] = corridas.map((c) => ({
    lineaCodigo: c.linea,
    estado: c.pausadaEn ? "PARADA" : "CORRIENDO",
    saborNombre: c.saborNombre,
    lote: c.lote,
    presentacion: c.presentacion,
    paradaActual: paradaActual(c.id),
  }))

  const cargarParadas = useCallback(async () => paradas, [paradas])
  const cargarOee = useMemo(() => async () => OEE_DEMO, [])

  return { corridas, lineasEstado, acciones, paradaActual, adelantar, estadoLineas, cargarParadas, cargarOee }
}
