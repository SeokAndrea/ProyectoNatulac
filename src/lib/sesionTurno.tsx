/**
 * Sesión de turno — NO es un módulo de dominio (no es Preparación, ni
 * Producción, ni Producto Terminado). Es la pieza chica que los tres
 * necesitan antes de poder buscar sus propios datos: "¿cuál turno estoy
 * viendo, y quién soy?" — ver plan-rework-3-modulos-y-merma.md, Fase 1.
 *
 * Guarda solo identidad (turnoId, código, estado, usuario) — nunca tanques,
 * líneas, contadores ni producto terminado. Cada módulo de dominio busca su
 * propia porción de datos por separado, usando el turnoId de acá como
 * clave (ver src/lib/preparacion/usePreparacion.ts).
 *
 * turno_activo_de() devuelve el mismo JSON completo que turno_json() (turno
 * + tanques + líneas + PT) — acá se usa solo para leer id/código/estado,
 * el resto de la respuesta se descarta a propósito.
 */
import { createContext, useContext, useEffect, useState, type ReactNode } from "react"
import type { GrupoCodigo, TurnoTipoCodigo } from "@/lib/catalogos"
import { useAuth } from "@/lib/auth"
import { fechaLocal, horaLocal } from "@/lib/turno"
import { supabase } from "@/lib/supabase"

export interface SesionTurno {
  turnoId: string | null
  codigo: string | null
  estado: "ABIERTO" | "CERRADO" | null
  usuario: string | null
  cargando: boolean
  iniciarTurno: (turnoTipo: TurnoTipoCodigo, grupo: GrupoCodigo) => Promise<{ ok: true } | { ok: false; error: string }>
  finalizarTurno: () => Promise<{ ok: true } | { ok: false; error: string }>
}

interface FilaTurnoIdentidad {
  id: string
  codigo: string
  estado: "ABIERTO" | "CERRADO"
}

const SesionTurnoContext = createContext<SesionTurno | undefined>(undefined)

export function SesionTurnoProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth()
  const usuario = session?.username ?? null

  const [turnoId, setTurnoId] = useState<string | null>(null)
  const [codigo, setCodigo] = useState<string | null>(null)
  const [estado, setEstado] = useState<"ABIERTO" | "CERRADO" | null>(null)
  const [cargando, setCargando] = useState(true)

  function tomarIdentidad(fila: FilaTurnoIdentidad | null) {
    setTurnoId(fila?.id ?? null)
    setCodigo(fila?.codigo ?? null)
    setEstado(fila?.estado ?? null)
  }

  async function recargar(u: string) {
    setCargando(true)
    const { data, error } = await supabase.rpc("turno_activo_de", { p_usuario: u })
    tomarIdentidad(!error && data ? (data as FilaTurnoIdentidad) : null)
    setCargando(false)
  }

  useEffect(() => {
    if (!usuario) {
      tomarIdentidad(null)
      setCargando(false)
      return
    }
    recargar(usuario)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usuario])

  async function iniciarTurno(turnoTipo: TurnoTipoCodigo, grupo: GrupoCodigo) {
    if (!usuario || !session?.area) {
      return { ok: false as const, error: "No se pudo identificar el área del usuario." }
    }

    const ahora = new Date()
    const { data, error } = await supabase.rpc("iniciar_turno", {
      p_usuario: usuario,
      p_area_codigo: session.area,
      p_turno_tipo_codigo: turnoTipo,
      p_grupo_codigo: grupo,
      p_fecha: fechaLocal(ahora),
      p_hora_inicio: horaLocal(ahora),
    })

    if (error || !data) {
      return { ok: false as const, error: "No se pudo iniciar el turno. Intenta de nuevo." }
    }

    tomarIdentidad(data as FilaTurnoIdentidad)
    return { ok: true as const }
  }

  async function finalizarTurno() {
    if (!turnoId) {
      return { ok: false as const, error: "No hay un turno en curso." }
    }
    // TODO (Fase 1, paso 3 - Producto Terminado): acá va el chequeo de que
    // toda corrida activa tenga su PT cargado antes de cerrar (costura 2
    // del plan) — todavía no existe el módulo de Producción/PT para
    // consultarlo, se suma cuando esos módulos estén.
    const { error } = await supabase.rpc("finalizar_turno", {
      p_turno_id: turnoId,
      p_fecha_fin: fechaLocal(new Date()),
      p_hora_fin: horaLocal(new Date()),
    })

    if (error) {
      return { ok: false as const, error: "No se pudo finalizar el turno. Intenta de nuevo." }
    }

    tomarIdentidad(null)
    return { ok: true as const }
  }

  return (
    <SesionTurnoContext.Provider value={{ turnoId, codigo, estado, usuario, cargando, iniciarTurno, finalizarTurno }}>
      {children}
    </SesionTurnoContext.Provider>
  )
}

export function useSesionTurno(): SesionTurno {
  const ctx = useContext(SesionTurnoContext)
  if (!ctx) throw new Error("useSesionTurno debe usarse dentro de SesionTurnoProvider")
  return ctx
}
