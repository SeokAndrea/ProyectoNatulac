import { GRUPOS, TURNO_TIPOS, nombrePorCodigo } from "@/lib/catalogos"
import type { LineaLive, PresentacionLive } from "@/lib/catalogosLive"
import type { TurnoActivo } from "@/lib/turno"

/**
 * Historial del turno: lista cronológica de todo lo registrado (Hora
 * - Sección - Qué), armada a partir de los mismos datos que ya viven
 * en el turno (Recepción, Contadores, Producto Terminado) — no es una
 * tabla nueva, es una vista combinada y ordenada por hora.
 */
export interface EventoHistorial {
  hora: string
  seccion: string
  detalle: string
}

function formatearHora(valor: string): string {
  // turno.horaInicio ya viene como "HH:MM:SS" (hora local, ver
  // src/lib/turno.tsx); los demás timestamps vienen completos (ISO).
  if (/^\d{2}:\d{2}/.test(valor)) return valor.slice(0, 5)
  return new Date(valor).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })
}

export function construirHistorial(
  turno: TurnoActivo,
  lineas: LineaLive[],
  presentaciones: PresentacionLive[],
): EventoHistorial[] {
  const eventos: EventoHistorial[] = []
  const horaInicio = formatearHora(turno.horaInicio)

  const nombreLineas =
    turno.lineas.length === 0 ? "Ninguna (parada)" : turno.lineas.map((l) => nombrePorCodigo(lineas, l.linea)).join(", ")

  eventos.push({
    hora: horaInicio,
    seccion: "Comenzar Turno",
    detalle: `${nombrePorCodigo(TURNO_TIPOS, turno.turnoTipo)} · ${nombrePorCodigo(GRUPOS, turno.grupo)} · Líneas: ${nombreLineas}`,
  })

  for (const t of turno.tanques) {
    const estado =
      t.condicion === "VOLUMEN"
        ? `${t.saborNombre ?? "Sabor"} · ${t.volumenL} L${t.lote ? ` · Lote ${t.lote}` : ""}`
        : t.condicion === "SUCIO"
          ? "Sucio"
          : "Vacío"
    eventos.push({ hora: horaInicio, seccion: "Recepción", detalle: `Tanque ${t.numeroTanque}: ${estado}` })
  }

  for (const c of turno.contadores) {
    eventos.push({
      hora: formatearHora(c.creadoEn),
      seccion: "Contadores y Merma",
      detalle: `${nombrePorCodigo(lineas, c.linea)}: ${c.envasesLlenadora} llenadora · ${c.envasesBuenos} buenos · ${c.envasesDesechados} desechados (${c.mermaPct}% merma)`,
    })
  }

  for (const p of turno.productoTerminado) {
    const cajasXPaleta = presentaciones.find((pr) => pr.codigo === p.presentacion)?.cajasXPaleta ?? 0
    const cajasTotales = p.paletas * cajasXPaleta + p.cajasSueltas
    eventos.push({
      hora: formatearHora(p.creadoEn),
      seccion: "Producto Terminado",
      detalle: `${nombrePorCodigo(lineas, p.linea)}: ${p.paletas} paletas + ${p.cajasSueltas} cajas sueltas = ${cajasTotales} cajas (${p.saborNombre ?? "sin sabor"})`,
    })
  }

  return eventos.sort((a, b) => a.hora.localeCompare(b.hora))
}
