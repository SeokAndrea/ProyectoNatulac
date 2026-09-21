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
import { saborSinFamiliaOculta } from "@/lib/turno"
import type { CondicionTanque } from "@/lib/preparacion/tipos"
import { supabase } from "@/lib/supabase"

/** Foto de cómo estaba un tanque al empezar el turno (Status, revisión de INICIO) — se congela ahí, no cambia con el turno en curso. Se usa en el acta en PDF ("Condiciones encontradas" vs. "dejadas"). null = el turno se cerró sin completar esa revisión. */
export interface TanqueEncontrado {
  numeroTanque: 1 | 2 | 3
  condicion: CondicionTanque
  volumenL: number | null
  saborNombre: string | null
  lote: string | null
}

/**
 * Turno CERRADO del usuario, todavía dentro de los 15 min de gracia
 * (turno_pt_gracia_de — ver migración 20261044090000). Solo lo usa
 * ProductoTerminado.tsx cuando `turnoId` da null (el turno ya cerró):
 * evita que un supervisor ansioso que finalizó el turno le tape a otro
 * la carga de su Producto Terminado. NINGUNA otra pantalla debe usar
 * esto para reabrir edición — Preparación/Producción siguen exigiendo
 * `estado === "ABIERTO"` como siempre.
 */
export interface TurnoGraciaPT {
  turnoId: string
  codigo: string
}

export interface SesionTurno {
  turnoId: string | null
  codigo: string | null
  estado: "ABIERTO" | "CERRADO" | null
  turnoGraciaPT: TurnoGraciaPT | null
  /** Cabecera del turno — no es dato de dominio (eso lo tienen los 3 módulos), pero tampoco es solo identidad: es lo que describe AL turno como tal. null si no hay turno. */
  fecha: string | null
  horaInicio: string | null
  fechaFin: string | null
  horaFin: string | null
  turnoTipo: TurnoTipoCodigo | null
  grupo: GrupoCodigo | null
  supervisorUsuario: string | null
  supervisorNombre: string | null
  tanquesEncontrados: TanqueEncontrado[] | null
  usuario: string | null
  cargando: boolean
  iniciarTurno: (turnoTipo: TurnoTipoCodigo, grupo: GrupoCodigo) => Promise<{ ok: true } | { ok: false; error: string }>
  finalizarTurno: () => Promise<{ ok: true } | { ok: false; error: string }>
}

interface FilaTanqueEncontrado {
  numero_tanque: 1 | 2 | 3
  condicion: CondicionTanque
  volumen_l: number | null
  sabor_nombre: string | null
  lote: string | null
}

interface FilaTurnoIdentidad {
  id: string
  codigo: string
  estado: "ABIERTO" | "CERRADO"
  fecha: string
  hora_inicio: string
  fecha_fin: string | null
  hora_fin: string | null
  turno_tipo_codigo: TurnoTipoCodigo
  grupo_codigo: GrupoCodigo
  supervisor_usuario: string
  supervisor_nombre: string
  tanques_encontrados: FilaTanqueEncontrado[] | null
}

const SesionTurnoContext = createContext<SesionTurno | undefined>(undefined)

export function SesionTurnoProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth()
  const usuario = session?.username ?? null

  const [turnoId, setTurnoId] = useState<string | null>(null)
  const [codigo, setCodigo] = useState<string | null>(null)
  const [estado, setEstado] = useState<"ABIERTO" | "CERRADO" | null>(null)
  const [fecha, setFecha] = useState<string | null>(null)
  const [horaInicio, setHoraInicio] = useState<string | null>(null)
  const [fechaFin, setFechaFin] = useState<string | null>(null)
  const [horaFin, setHoraFin] = useState<string | null>(null)
  const [turnoTipo, setTurnoTipo] = useState<TurnoTipoCodigo | null>(null)
  const [grupo, setGrupo] = useState<GrupoCodigo | null>(null)
  const [supervisorUsuario, setSupervisorUsuario] = useState<string | null>(null)
  const [supervisorNombre, setSupervisorNombre] = useState<string | null>(null)
  const [tanquesEncontrados, setTanquesEncontrados] = useState<TanqueEncontrado[] | null>(null)
  const [turnoGraciaPT, setTurnoGraciaPT] = useState<TurnoGraciaPT | null>(null)
  const [cargando, setCargando] = useState(true)

  function tomarIdentidad(fila: FilaTurnoIdentidad | null) {
    setTurnoId(fila?.id ?? null)
    setCodigo(fila?.codigo ?? null)
    setEstado(fila?.estado ?? null)
    setFecha(fila?.fecha ?? null)
    setHoraInicio(fila?.hora_inicio ?? null)
    setFechaFin(fila?.fecha_fin ?? null)
    setHoraFin(fila?.hora_fin ?? null)
    setTurnoTipo(fila?.turno_tipo_codigo ?? null)
    setGrupo(fila?.grupo_codigo ?? null)
    setSupervisorUsuario(fila?.supervisor_usuario ?? null)
    setSupervisorNombre(fila?.supervisor_nombre ?? null)
    setTanquesEncontrados(
      fila?.tanques_encontrados
        ? fila.tanques_encontrados.map((t) => ({
            numeroTanque: t.numero_tanque,
            condicion: t.condicion,
            volumenL: t.volumen_l,
            saborNombre: saborSinFamiliaOculta(t.sabor_nombre),
            lote: t.lote,
          }))
        : null,
    )
  }

  /** Ver TurnoGraciaPT: solo se consulta cuando el usuario NO tiene turno ABIERTO. */
  async function cargarGraciaPT(u: string) {
    const { data, error } = await supabase.rpc("turno_pt_gracia_de", { p_usuario: u })
    if (error || !data) {
      setTurnoGraciaPT(null)
      return
    }
    const fila = data as FilaTurnoIdentidad
    setTurnoGraciaPT({ turnoId: fila.id, codigo: fila.codigo })
  }

  async function recargar(u: string) {
    setCargando(true)
    const { data, error } = await supabase.rpc("turno_activo_de", { p_usuario: u })
    const activo = !error && data ? (data as FilaTurnoIdentidad) : null
    tomarIdentidad(activo)
    if (activo) {
      setTurnoGraciaPT(null)
    } else {
      await cargarGraciaPT(u)
    }
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

    const { data, error } = await supabase.rpc("iniciar_turno", {
      p_usuario: usuario,
      p_area_codigo: session.area,
      p_turno_tipo_codigo: turnoTipo,
      p_grupo_codigo: grupo,
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
    // El chequeo de "no cerrar con una corrida en ESPERANDO_PT" vive en la
    // RPC finalizar_turno (migración 20261018090000, costura 2). Acá solo
    // se propaga el mensaje.
    const { error } = await supabase.rpc("finalizar_turno", { p_turno_id: turnoId })

    if (error) {
      return { ok: false as const, error: error.message || "No se pudo finalizar el turno. Intenta de nuevo." }
    }

    tomarIdentidad(null)
    // El turno recién cerrado entra directo en su ventana de gracia
    // (ver TurnoGraciaPT) — sin esto, quien sigue en la pantalla de
    // Producto Terminado tendría que refrescar para que aparezca.
    if (usuario) await cargarGraciaPT(usuario)
    return { ok: true as const }
  }

  return (
    <SesionTurnoContext.Provider
      value={{
        turnoId,
        codigo,
        estado,
        fecha,
        horaInicio,
        fechaFin,
        horaFin,
        turnoTipo,
        grupo,
        supervisorUsuario,
        supervisorNombre,
        tanquesEncontrados,
        turnoGraciaPT,
        usuario,
        cargando,
        iniciarTurno,
        finalizarTurno,
      }}
    >
      {children}
    </SesionTurnoContext.Provider>
  )
}

export function useSesionTurno(): SesionTurno {
  const ctx = useContext(SesionTurnoContext)
  if (!ctx) throw new Error("useSesionTurno debe usarse dentro de SesionTurnoProvider")
  return ctx
}
