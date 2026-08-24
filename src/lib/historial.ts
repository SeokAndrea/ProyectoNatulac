import { GRUPOS, TURNO_TIPOS, nombrePorCodigo } from "@/lib/catalogos"
import type { LineaLive, PresentacionLive } from "@/lib/catalogosLive"
import { mermaCorrida, type TurnoActivo } from "@/lib/turno"

/**
 * Historial del turno: lista cronológica de todo lo registrado (Hora
 * - Sección - Qué), armada a partir de los mismos datos que ya viven
 * en el turno (Tanques, Líneas, Contadores, Producto Terminado) — no
 * es una tabla nueva, es una vista combinada y ordenada por hora.
 */
export interface EventoHistorial {
  hora: string
  seccion: string
  detalle: string
}

export function formatearHora(valor: string): string {
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

  eventos.push({
    hora: horaInicio,
    seccion: "Comenzar Turno",
    detalle: `${nombrePorCodigo(TURNO_TIPOS, turno.turnoTipo)} · ${nombrePorCodigo(GRUPOS, turno.grupo)}`,
  })

  // Líneas y tanques ya no se fijan al iniciar el turno: son estado
  // continuo (ver Preparación) que se activa/cambia en cualquier
  // momento, incluso en un turno anterior — por eso cada uno usa su
  // propia hora de activación en vez de la hora de inicio del turno.
  // "lineas" trae TODAS las corridas tocadas en este turno (activas y
  // finalizadas durante él), por eso una corrida finalizada suma un
  // segundo evento con su hora de cierre.
  for (const l of turno.lineas) {
    const lote = l.loteId ? turno.preparaciones.find((p) => p.id === l.loteId) : null
    eventos.push({
      hora: formatearHora(l.activadaEn),
      seccion: "Líneas en uso",
      detalle: `${nombrePorCodigo(lineas, l.linea)}: ${l.presentacion} ml · ${l.envasesHora} env/h${l.saborNombre ? ` · ${l.saborNombre}` : ""}${l.lote ? ` · Lote ${l.lote}` : ""}${lote ? ` · Tanque ${lote.numeroTanque}` : ""}`,
    })
    if (l.finalizadaEn) {
      eventos.push({
        hora: formatearHora(l.finalizadaEn),
        seccion: "Líneas en uso",
        detalle: `${nombrePorCodigo(lineas, l.linea)}: corrida finalizada`,
      })
    }
  }

  for (const t of turno.tanques) {
    const estado =
      t.condicion === "LISTO"
        ? `${t.saborNombre ?? "Sabor"} · ${t.volumenL} L${t.lote ? ` · Lote ${t.lote}` : ""}`
        : t.condicion === "SUCIO"
          ? `Sucio${t.ultimoSaborNombre ? ` · último: ${t.ultimoSaborNombre}${t.ultimoLote ? ` · Lote ${t.ultimoLote}` : ""}` : ""}`
          : t.condicion === "VACIO"
            ? "Vacío"
            : "En Preparación"
    eventos.push({ hora: formatearHora(t.activadaEn), seccion: "Tanques", detalle: `Tanque ${t.numeroTanque}: ${estado}` })
  }

  for (const p of turno.preparaciones) {
    const ajustes = [
      p.agua !== null ? `Agua ${p.agua} L` : null,
      p.azucar !== null ? `Azúcar ${p.azucar} kg` : null,
      p.acidoCitrico !== null ? `Ácido cítrico ${p.acidoCitrico} kg` : null,
    ]
      .filter(Boolean)
      .join(" · ")
    eventos.push({
      hora: formatearHora(p.creadoEn),
      seccion: "Preparaciones",
      detalle: `Tanque ${p.numeroTanque}: ${p.saborNombre ?? "sin sabor"}${p.lote ? ` · Lote ${p.lote}` : ""} · ${p.tambores} tambores${ajustes ? ` · ${ajustes}` : ""}`,
    })
    if (p.liberadoEn) {
      eventos.push({ hora: formatearHora(p.liberadoEn), seccion: "Preparaciones", detalle: `Tanque ${p.numeroTanque}: lote liberado (Listo)` })
    }
    if (p.cerradoEn) {
      eventos.push({ hora: formatearHora(p.cerradoEn), seccion: "Preparaciones", detalle: `Tanque ${p.numeroTanque}: lote finalizado` })
    }
  }

  for (const c of turno.contadores) {
    const merma = c.turnoLineaId ? mermaCorrida(c.turnoLineaId, turno, presentaciones) : null
    eventos.push({
      hora: formatearHora(c.creadoEn),
      seccion: "Contadores y Merma",
      detalle: `${nombrePorCodigo(lineas, c.linea)}: ${c.envasesLlenadora} envases de la llenadora${merma !== null ? ` (${merma.pct}% merma)` : ""}`,
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
