import { createContext, useContext, useEffect, useState, type ReactNode } from "react"
import type { GrupoCodigo, LineaCodigo, PresentacionCodigo, TurnoTipoCodigo } from "@/lib/catalogos"
import { useAuth } from "@/lib/auth"

export interface ContadorRegistro {
  id: string
  linea: LineaCodigo
  envasesLlenadora: number
  envasesBuenos: number
  envasesDesechados: number
  mermaPct: number
  requiereJustificacion: boolean
  justificacion: string
  creadoEn: string
}

/**
 * Una línea activa en el turno, con la presentación y la velocidad
 * (envases/hora) elegidas para ella — cada línea puede estar
 * llenando algo distinto al mismo tiempo, por eso esto va por línea
 * y no una sola vez para todo el turno.
 */
export interface LineaEnTurno {
  linea: LineaCodigo
  presentacion: PresentacionCodigo
  envasesHora: number
}

export interface TurnoActivo {
  codigo: string
  fecha: string
  horaInicio: string
  turnoTipo: TurnoTipoCodigo
  grupo: GrupoCodigo
  /** Vacío = "Ninguna" (parada / limpieza / mantenimiento). */
  lineas: LineaEnTurno[]
  contadores: ContadorRegistro[]
}

export interface DatosNuevoTurno {
  turnoTipo: TurnoTipoCodigo
  grupo: GrupoCodigo
  lineas: LineaEnTurno[]
}

interface DatosNuevoContador {
  linea: LineaCodigo
  envasesLlenadora: number
  envasesBuenos: number
  envasesDesechados: number
  justificacion: string
}

interface TurnoContextValue {
  turnoActivo: TurnoActivo | null
  iniciarTurno: (datos: DatosNuevoTurno) => void
  finalizarTurno: () => void
  registrarContador: (datos: DatosNuevoContador) => void
}

const LIMITE_MERMA = 0.03

const TurnoContext = createContext<TurnoContextValue | null>(null)

/**
 * El turno es por usuario, no general: cada supervisor tiene el suyo.
 * Por eso la clave de localStorage incluye el nombre de usuario en
 * vez de ser una sola clave compartida — si no, el turno de un
 * supervisor se le "pegaba" a cualquiera que entrara después en el
 * mismo navegador.
 */
function claveStorage(usuario: string) {
  return `natulac.turnoActivo.${usuario}`
}

function generarCodigoTurno() {
  const fecha = new Date()
  const compacta = fecha.toISOString().slice(0, 10).replace(/-/g, "")
  const sufijo = Math.random().toString(36).slice(2, 6).toUpperCase()
  return `T-${compacta}-${sufijo}`
}

function leerTurno(usuario: string): TurnoActivo | null {
  const raw = localStorage.getItem(claveStorage(usuario))
  if (!raw) return null
  try {
    return JSON.parse(raw) as TurnoActivo
  } catch {
    return null
  }
}

/*
 * Estado del turno en curso, compartido por toda la app mientras no
 * se presione "Finalizar Turno" (persiste en localStorage, por
 * usuario, para sobrevivir un refresh de página).
 *
 * IMPORTANTE: esto es un reemplazo TEMPORAL mientras no hay backend.
 * Cuando se conecte Supabase, este contexto debería pasar a reflejar
 * la fila "ABIERTO" de la tabla turnos (consultada por
 * supervisor_id), y iniciarTurno/finalizarTurno/registrarContador
 * deberían hacer inserts/updates reales en vez de tocar solo el
 * estado local.
 */
export function TurnoProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth()
  const usuario = session?.username ?? null

  const [turnoActivo, setTurnoActivo] = useState<TurnoActivo | null>(() => (usuario ? leerTurno(usuario) : null))

  // Si cambia el usuario logueado (login/logout, o cambio de cuenta),
  // recargar el turno de ESE usuario en vez de arrastrar el anterior.
  useEffect(() => {
    setTurnoActivo(usuario ? leerTurno(usuario) : null)
  }, [usuario])

  useEffect(() => {
    if (!usuario) return
    if (turnoActivo) {
      localStorage.setItem(claveStorage(usuario), JSON.stringify(turnoActivo))
    } else {
      localStorage.removeItem(claveStorage(usuario))
    }
  }, [turnoActivo, usuario])

  function iniciarTurno(datos: DatosNuevoTurno) {
    const ahora = new Date()
    setTurnoActivo({
      codigo: generarCodigoTurno(),
      fecha: ahora.toISOString().slice(0, 10),
      horaInicio: ahora.toTimeString().slice(0, 5),
      turnoTipo: datos.turnoTipo,
      grupo: datos.grupo,
      lineas: datos.lineas,
      contadores: [],
    })
  }

  function finalizarTurno() {
    setTurnoActivo(null)
  }

  function registrarContador(datos: DatosNuevoContador) {
    setTurnoActivo((actual) => {
      if (!actual) return actual
      const mermaPct =
        datos.envasesLlenadora === 0
          ? 0
          : Math.round((datos.envasesDesechados / datos.envasesLlenadora) * 100 * 100) / 100
      const nuevo: ContadorRegistro = {
        id: crypto.randomUUID(),
        linea: datos.linea,
        envasesLlenadora: datos.envasesLlenadora,
        envasesBuenos: datos.envasesBuenos,
        envasesDesechados: datos.envasesDesechados,
        mermaPct,
        requiereJustificacion: datos.envasesDesechados / Math.max(datos.envasesLlenadora, 1) > LIMITE_MERMA,
        justificacion: datos.justificacion,
        creadoEn: new Date().toISOString(),
      }
      return { ...actual, contadores: [nuevo, ...actual.contadores] }
    })
  }

  return (
    <TurnoContext.Provider value={{ turnoActivo, iniciarTurno, finalizarTurno, registrarContador }}>
      {children}
    </TurnoContext.Provider>
  )
}

export function useTurno() {
  const ctx = useContext(TurnoContext)
  if (!ctx) throw new Error("useTurno debe usarse dentro de TurnoProvider")
  return ctx
}

export { LIMITE_MERMA }
