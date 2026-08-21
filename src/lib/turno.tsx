import { createContext, useContext, useEffect, useState, type ReactNode } from "react"
import type { GrupoCodigo, LineaCodigo, PresentacionCodigo, TurnoTipoCodigo } from "@/lib/catalogos"
import { useAuth } from "@/lib/auth"
import { useCatalogosLive, litrosHoraDeLive } from "@/lib/catalogosLive"
import { supabase } from "@/lib/supabase"

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
 * Una línea en uso durante el turno, con la presentación y la
 * velocidad (envases/hora) elegidas para ella — cada línea puede
 * estar llenando algo distinto al mismo tiempo, por eso esto va por
 * línea y no una sola vez para todo el turno. "saborId" es opcional:
 * solo se carga cuando la línea viene corriendo del turno anterior
 * (no arranca de cero) y ya se sabe qué sabor tiene.
 */
export interface LineaEnTurno {
  linea: LineaCodigo
  presentacion: PresentacionCodigo
  envasesHora: number
  saborId: string | null
  saborNombre: string | null
}

export type CondicionTanque = "VOLUMEN" | "SUCIO" | "VACIO" | "EN_PREPARACION"

/**
 * Recepción: estado de uno de los 3 tanques de materia prima al
 * llegar el supervisor de turno. Sabor y volumen solo tienen sentido
 * cuando condicion = "VOLUMEN" (un tanque sucio, vacío o en
 * preparación no tiene sabor ni lote cargado acá — un tanque "en
 * preparación" se resuelve en la sección Preparaciones).
 */
export interface TanqueRecepcion {
  numeroTanque: 1 | 2 | 3
  saborId: string | null
  saborNombre: string | null
  condicion: CondicionTanque
  volumenL: number | null
  lote: string | null
}

/**
 * Preparación: mezcla de un tanque (tambores de concentrado + agua/
 * azúcar/ácido cítrico). Puede haber VARIAS por tanque en el mismo
 * turno (se prepara, se usa, se vuelve a preparar) — por eso se
 * acumulan como los contadores, no se pisan. Carga 100% manual: el
 * cálculo cajas→litros→tambores lo hace el analista de producción
 * fuera de la app; los ajustes son solo para calidad/inventario, sin
 * ningún efecto calculado.
 */
export interface PreparacionRegistro {
  id: string
  numeroTanque: 1 | 2 | 3
  saborId: string | null
  saborNombre: string | null
  lote: string | null
  tambores: number
  agua: number | null
  azucar: number | null
  acidoCitrico: number | null
  creadoEn: string
}

/**
 * Producto Terminado: conteo físico de paletas + "restos" (cajas
 * sueltas que no llegaron a armar una paleta entera) por línea,
 * cargado una vez al finalizar el turno — no depende de los
 * contadores de envases. Es un registro por línea (se actualiza si
 * se vuelve a cargar, no se acumula como los contadores).
 */
export interface ProductoTerminadoRegistro {
  linea: LineaCodigo
  saborId: string | null
  saborNombre: string | null
  presentacion: PresentacionCodigo
  paletas: number
  cajasSueltas: number
  litrosProducidos: number
  creadoEn: string
}

export interface TurnoActivo {
  id: string
  codigo: string
  fecha: string
  horaInicio: string
  turnoTipo: TurnoTipoCodigo
  grupo: GrupoCodigo
  /** Vacío = "Ninguna" (parada / limpieza / mantenimiento). */
  lineas: LineaEnTurno[]
  tanques: TanqueRecepcion[]
  contadores: ContadorRegistro[]
  productoTerminado: ProductoTerminadoRegistro[]
  preparaciones: PreparacionRegistro[]
}

export interface DatosNuevoTanque {
  numeroTanque: 1 | 2 | 3
  saborId: string | null
  condicion: CondicionTanque
  volumenL: number | null
  lote: string | null
}

export interface DatosNuevoTurno {
  turnoTipo: TurnoTipoCodigo
  grupo: GrupoCodigo
  lineas: LineaEnTurno[]
  /** Los 3 tanques de Recepción — obligatorio completarlos para iniciar. */
  tanques: DatosNuevoTanque[]
}

interface DatosNuevoContador {
  linea: LineaCodigo
  envasesLlenadora: number
  envasesBuenos: number
  envasesDesechados: number
  justificacion: string
}

interface DatosProductoTerminado {
  linea: LineaCodigo
  saborId: string | null
  presentacion: PresentacionCodigo
  paletas: number
  cajasSueltas: number
}

interface DatosPreparacion {
  numeroTanque: 1 | 2 | 3
  saborId: string | null
  lote: string
  tambores: number
  agua: number | null
  azucar: number | null
  acidoCitrico: number | null
}

type Resultado = { ok: true } | { ok: false; error: string }

interface TurnoContextValue {
  turnoActivo: TurnoActivo | null
  /** true mientras se busca si el usuario tiene un turno abierto en Supabase. */
  cargando: boolean
  iniciarTurno: (datos: DatosNuevoTurno) => Promise<Resultado>
  finalizarTurno: () => Promise<void>
  registrarContador: (datos: DatosNuevoContador) => Promise<Resultado>
  registrarProductoTerminado: (datos: DatosProductoTerminado) => Promise<Resultado>
  registrarPreparacion: (datos: DatosPreparacion) => Promise<Resultado>
}

const LIMITE_MERMA = 0.03

const TurnoContext = createContext<TurnoContextValue | null>(null)

/*
 * Todo esto vive en las tablas "turnos", "turno_lineas",
 * "recepcion_tanques" y "contadores" de Supabase — ver
 * supabase/migrations/20260825090000_conectar_turnos.sql. Como esas
 * tablas tienen RLS activado y sin políticas, todo pasa por las
 * funciones RPC de esa migración (mismo patrón que
 * src/lib/personal.ts): turno_activo_de, iniciar_turno,
 * finalizar_turno, registrar_contador. turno_activo_de devuelve el
 * turno abierto de un supervisor como un solo objeto JSON (turno +
 * líneas + tanques + contadores juntos).
 */
interface FilaLinea {
  linea_codigo: string
  presentacion_volumen_ml: number | null
  envases_hora: number | null
  litros_hora: number | null
  sabor_id: string | null
  sabor_nombre: string | null
}

interface FilaTanque {
  numero_tanque: number
  sabor_id: string | null
  sabor_nombre: string | null
  condicion: CondicionTanque
  volumen_l: number | null
  lote: string | null
}

interface FilaContador {
  id: string
  linea_codigo: string
  envases_llenadora: number
  envases_buenos: number
  envases_desechados: number
  merma_pct: number
  requiere_justificacion: boolean
  justificacion: string | null
  creado_en: string
}

interface FilaProductoTerminado {
  linea_codigo: string
  sabor_id: string | null
  sabor_nombre: string | null
  presentacion_volumen_ml: number
  paletas: number
  cajas_sueltas: number
  litros_producidos: number
  creado_en: string
}

interface FilaPreparacion {
  id: string
  numero_tanque: number
  sabor_id: string | null
  sabor_nombre: string | null
  lote: string | null
  tambores: number
  agua: number | null
  azucar: number | null
  acido_citrico: number | null
  creado_en: string
}

export interface FilaTurno {
  id: string
  codigo: string
  fecha: string
  hora_inicio: string
  turno_tipo_codigo: string
  grupo_codigo: string
  lineas: FilaLinea[]
  tanques: FilaTanque[]
  contadores: FilaContador[]
  producto_terminado: FilaProductoTerminado[]
  preparaciones: FilaPreparacion[]
}

/*
 * Fecha/hora LOCAL del navegador, en vez de dejar que Postgres use
 * current_date/current_time (esas corren en el reloj del servidor,
 * UTC — daban un desfase de varias horas contra la hora real de la
 * planta). Se calculan acá y se mandan como parámetro a
 * iniciar_turno/finalizar_turno.
 */
function fechaLocal(d: Date) {
  const anio = d.getFullYear()
  const mes = String(d.getMonth() + 1).padStart(2, "0")
  const dia = String(d.getDate()).padStart(2, "0")
  return `${anio}-${mes}-${dia}`
}

function horaLocal(d: Date) {
  const horas = String(d.getHours()).padStart(2, "0")
  const minutos = String(d.getMinutes()).padStart(2, "0")
  const segundos = String(d.getSeconds()).padStart(2, "0")
  return `${horas}:${minutos}:${segundos}`
}

export function mapearTurno(fila: FilaTurno): TurnoActivo {
  return {
    id: fila.id,
    codigo: fila.codigo,
    fecha: fila.fecha,
    horaInicio: fila.hora_inicio,
    turnoTipo: fila.turno_tipo_codigo as TurnoTipoCodigo,
    grupo: fila.grupo_codigo as GrupoCodigo,
    lineas: fila.lineas.map((l) => ({
      linea: l.linea_codigo as LineaCodigo,
      presentacion: String(l.presentacion_volumen_ml ?? ""),
      envasesHora: l.envases_hora ?? 0,
      saborId: l.sabor_id,
      saborNombre: l.sabor_nombre,
    })),
    tanques: fila.tanques.map((t) => ({
      numeroTanque: t.numero_tanque as 1 | 2 | 3,
      saborId: t.sabor_id,
      saborNombre: t.sabor_nombre,
      condicion: t.condicion,
      volumenL: t.volumen_l,
      lote: t.lote,
    })),
    contadores: fila.contadores.map((c) => ({
      id: c.id,
      linea: c.linea_codigo as LineaCodigo,
      envasesLlenadora: c.envases_llenadora,
      envasesBuenos: c.envases_buenos,
      envasesDesechados: c.envases_desechados,
      mermaPct: c.merma_pct,
      requiereJustificacion: c.requiere_justificacion,
      justificacion: c.justificacion ?? "",
      creadoEn: c.creado_en,
    })),
    productoTerminado: fila.producto_terminado.map((p) => ({
      linea: p.linea_codigo as LineaCodigo,
      saborId: p.sabor_id,
      saborNombre: p.sabor_nombre,
      presentacion: String(p.presentacion_volumen_ml),
      paletas: p.paletas,
      cajasSueltas: p.cajas_sueltas,
      litrosProducidos: p.litros_producidos,
      creadoEn: p.creado_en,
    })),
    preparaciones: fila.preparaciones.map((p) => ({
      id: p.id,
      numeroTanque: p.numero_tanque as 1 | 2 | 3,
      saborId: p.sabor_id,
      saborNombre: p.sabor_nombre,
      lote: p.lote,
      tambores: p.tambores,
      agua: p.agua,
      azucar: p.azucar,
      acidoCitrico: p.acido_citrico,
      creadoEn: p.creado_en,
    })),
  }
}

export function TurnoProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth()
  const { velocidades } = useCatalogosLive()
  const usuario = session?.username ?? null

  const [turnoActivo, setTurnoActivo] = useState<TurnoActivo | null>(null)
  const [cargando, setCargando] = useState(true)

  async function recargar(u: string) {
    setCargando(true)
    const { data, error } = await supabase.rpc("turno_activo_de", { p_usuario: u })
    setTurnoActivo(!error && data ? mapearTurno(data as FilaTurno) : null)
    setCargando(false)
  }

  // Si cambia el usuario logueado (login/logout, o cambio de cuenta),
  // recargar el turno de ESE usuario en vez de arrastrar el anterior.
  useEffect(() => {
    if (!usuario) {
      setTurnoActivo(null)
      setCargando(false)
      return
    }
    recargar(usuario)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usuario])

  async function iniciarTurno(datos: DatosNuevoTurno): Promise<Resultado> {
    if (!usuario || !session?.area) {
      return { ok: false, error: "No se pudo identificar el área del usuario." }
    }

    const ahora = new Date()
    const { data, error } = await supabase.rpc("iniciar_turno", {
      p_usuario: usuario,
      p_area_codigo: session.area,
      p_turno_tipo_codigo: datos.turnoTipo,
      p_grupo_codigo: datos.grupo,
      p_lineas: datos.lineas.map((l) => ({
        linea_codigo: l.linea,
        presentacion_volumen_ml: Number(l.presentacion),
        envases_hora: l.envasesHora,
        litros_hora: litrosHoraDeLive(velocidades, l.linea, l.presentacion, l.envasesHora),
        sabor_id: l.saborId,
      })),
      p_tanques: datos.tanques.map((t) => ({
        numero_tanque: t.numeroTanque,
        sabor_id: t.saborId,
        condicion: t.condicion,
        volumen_l: t.volumenL,
        lote: t.lote,
      })),
      p_fecha: fechaLocal(ahora),
      p_hora_inicio: horaLocal(ahora),
    })

    if (error || !data) {
      return { ok: false, error: "No se pudo iniciar el turno. Intenta de nuevo." }
    }

    setTurnoActivo(mapearTurno(data as FilaTurno))
    return { ok: true }
  }

  async function finalizarTurno() {
    if (!turnoActivo) return
    const ahora = new Date()
    await supabase.rpc("finalizar_turno", {
      p_turno_id: turnoActivo.id,
      p_fecha_fin: fechaLocal(ahora),
      p_hora_fin: horaLocal(ahora),
    })
    setTurnoActivo(null)
  }

  async function registrarContador(datos: DatosNuevoContador): Promise<Resultado> {
    if (!turnoActivo || !usuario) {
      return { ok: false, error: "No hay un turno en curso." }
    }

    const { data, error } = await supabase.rpc("registrar_contador", {
      p_turno_id: turnoActivo.id,
      p_linea_codigo: datos.linea,
      p_envases_llenadora: datos.envasesLlenadora,
      p_envases_buenos: datos.envasesBuenos,
      p_envases_desechados: datos.envasesDesechados,
      p_justificacion: datos.justificacion,
      p_usuario: usuario,
    })

    if (error || !data) {
      return { ok: false, error: "No se pudo registrar el contador. Intenta de nuevo." }
    }

    const nuevo = data as FilaContador
    setTurnoActivo((actual) =>
      actual
        ? {
            ...actual,
            contadores: [
              {
                id: nuevo.id,
                linea: nuevo.linea_codigo as LineaCodigo,
                envasesLlenadora: nuevo.envases_llenadora,
                envasesBuenos: nuevo.envases_buenos,
                envasesDesechados: nuevo.envases_desechados,
                mermaPct: nuevo.merma_pct,
                requiereJustificacion: nuevo.requiere_justificacion,
                justificacion: nuevo.justificacion ?? "",
                creadoEn: nuevo.creado_en,
              },
              ...actual.contadores,
            ],
          }
        : actual,
    )
    return { ok: true }
  }

  async function registrarProductoTerminado(datos: DatosProductoTerminado): Promise<Resultado> {
    if (!turnoActivo || !usuario) {
      return { ok: false, error: "No hay un turno en curso." }
    }

    const { data, error } = await supabase.rpc("registrar_producto_terminado", {
      p_turno_id: turnoActivo.id,
      p_linea_codigo: datos.linea,
      p_sabor_id: datos.saborId,
      p_volumen_ml: Number(datos.presentacion),
      p_paletas: datos.paletas,
      p_cajas_sueltas: datos.cajasSueltas,
      p_usuario: usuario,
    })

    if (error || !data) {
      return { ok: false, error: "No se pudo registrar Producto Terminado. Intenta de nuevo." }
    }

    const nuevo = data as FilaProductoTerminado
    setTurnoActivo((actual) =>
      actual
        ? {
            ...actual,
            productoTerminado: [
              ...actual.productoTerminado.filter((p) => p.linea !== nuevo.linea_codigo),
              {
                linea: nuevo.linea_codigo as LineaCodigo,
                saborId: nuevo.sabor_id,
                saborNombre: nuevo.sabor_nombre,
                presentacion: String(nuevo.presentacion_volumen_ml),
                paletas: nuevo.paletas,
                cajasSueltas: nuevo.cajas_sueltas,
                litrosProducidos: nuevo.litros_producidos,
                creadoEn: nuevo.creado_en,
              },
            ],
          }
        : actual,
    )
    return { ok: true }
  }

  async function registrarPreparacion(datos: DatosPreparacion): Promise<Resultado> {
    if (!turnoActivo || !usuario) {
      return { ok: false, error: "No hay un turno en curso." }
    }

    const { data, error } = await supabase.rpc("registrar_preparacion", {
      p_turno_id: turnoActivo.id,
      p_numero_tanque: datos.numeroTanque,
      p_sabor_id: datos.saborId,
      p_lote: datos.lote,
      p_tambores: datos.tambores,
      p_agua: datos.agua,
      p_azucar: datos.azucar,
      p_acido_citrico: datos.acidoCitrico,
      p_usuario: usuario,
    })

    if (error || !data) {
      return { ok: false, error: "No se pudo registrar la preparación. Intenta de nuevo." }
    }

    const nuevo = data as FilaPreparacion
    setTurnoActivo((actual) =>
      actual
        ? {
            ...actual,
            preparaciones: [
              {
                id: nuevo.id,
                numeroTanque: nuevo.numero_tanque as 1 | 2 | 3,
                saborId: nuevo.sabor_id,
                saborNombre: nuevo.sabor_nombre,
                lote: nuevo.lote,
                tambores: nuevo.tambores,
                agua: nuevo.agua,
                azucar: nuevo.azucar,
                acidoCitrico: nuevo.acido_citrico,
                creadoEn: nuevo.creado_en,
              },
              ...actual.preparaciones,
            ],
          }
        : actual,
    )
    return { ok: true }
  }

  return (
    <TurnoContext.Provider
      value={{
        turnoActivo,
        cargando,
        iniciarTurno,
        finalizarTurno,
        registrarContador,
        registrarProductoTerminado,
        registrarPreparacion,
      }}
    >
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
