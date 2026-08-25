import { createContext, useContext, useEffect, useState, type ReactNode } from "react"
import { supabase } from "@/lib/supabase"
import { useAuth } from "@/lib/auth"
import type { LineaCodigo, PresentacionCodigo } from "@/lib/catalogos"

/*
 * Versión EN VIVO (Supabase) de líneas, presentaciones y velocidades
 * de llenadora — reemplaza a las constantes hardcodeadas del mismo
 * nombre en catalogos.ts, que quedaron solo para AREAS/ROLES/
 * TURNO_TIPOS/GRUPOS (catálogos que casi no cambian). Se carga UNA
 * vez acá (ver CatalogosProvider en main.tsx) y la comparten todos
 * los componentes que antes leían las constantes estáticas —
 * Comenzar Turno, el banner de estado, el acta de Finalizar Turno, y
 * las pestañas de Edición de Datos, que llaman a recargar() después
 * de cada cambio para que se vea reflejado en el resto de la app sin
 * recargar la página.
 */
export interface LineaLive {
  id: string
  codigo: LineaCodigo
  nombre: string
  activo: boolean
}

export interface PresentacionLive {
  id: string
  /** Igual que antes: el volumen en ml, como string, hace de "código". */
  codigo: PresentacionCodigo
  nombre: string
  volumenMl: number
  cajasXCamada: number
  cantCamada: number
  cajasXPaleta: number
  litrosXCaja: number
  envasesXCaja: number
  activo: boolean
}

export interface VelocidadLive {
  id: string
  linea: LineaCodigo
  presentacion: PresentacionCodigo
  maquina: string
  envasesHora: number
  litrosHora: number
  activo: boolean
}

interface CatalogosContextValue {
  lineas: LineaLive[]
  presentaciones: PresentacionLive[]
  velocidades: VelocidadLive[]
  cargando: boolean
  recargar: () => Promise<void>
}

const CatalogosContext = createContext<CatalogosContextValue | null>(null)

interface FilaLinea {
  linea_id: string
  codigo: string
  nombre: string
  activo: boolean
}

interface FilaPresentacion {
  presentacion_id: string
  volumen_ml: number
  cajas_x_camada: number
  cant_camada: number
  cajas_x_paleta: number
  litros_x_caja: number
  envases_x_caja: number
  activo: boolean
}

interface FilaVelocidad {
  velocidad_id: string
  linea_codigo: string
  presentacion_volumen_ml: number
  maquina: string
  envases_hora: number
  litros_hora: number
  activo: boolean
}

export function CatalogosProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth()
  const [lineas, setLineas] = useState<LineaLive[]>([])
  const [presentaciones, setPresentaciones] = useState<PresentacionLive[]>([])
  const [velocidades, setVelocidades] = useState<VelocidadLive[]>([])
  const [cargando, setCargando] = useState(true)

  async function recargar() {
    // area null (SUPERADMINISTRADOR o todavía sin sesión) = sin filtrar,
    // mismo comportamiento que antes de que existiera el filtro.
    const [lineasRes, presentacionesRes, velocidadesRes] = await Promise.all([
      supabase.rpc("listar_lineas", { p_area_codigo: session?.area ?? null }),
      supabase.rpc("listar_presentaciones"),
      supabase.rpc("listar_velocidades"),
    ])

    setLineas(
      ((lineasRes.data ?? []) as FilaLinea[]).map((f) => ({
        id: f.linea_id,
        codigo: f.codigo as LineaCodigo,
        nombre: f.nombre,
        activo: f.activo,
      })),
    )
    setPresentaciones(
      ((presentacionesRes.data ?? []) as FilaPresentacion[]).map((f) => ({
        id: f.presentacion_id,
        codigo: String(f.volumen_ml),
        nombre: `${f.volumen_ml} ml`,
        volumenMl: f.volumen_ml,
        cajasXCamada: f.cajas_x_camada,
        cantCamada: f.cant_camada,
        cajasXPaleta: f.cajas_x_paleta,
        litrosXCaja: f.litros_x_caja,
        envasesXCaja: f.envases_x_caja,
        activo: f.activo,
      })),
    )
    setVelocidades(
      ((velocidadesRes.data ?? []) as FilaVelocidad[]).map((f) => ({
        id: f.velocidad_id,
        linea: f.linea_codigo as LineaCodigo,
        presentacion: String(f.presentacion_volumen_ml),
        maquina: f.maquina,
        envasesHora: f.envases_hora,
        litrosHora: f.litros_hora,
        activo: f.activo,
      })),
    )
    setCargando(false)
  }

  useEffect(() => {
    recargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.area])

  return (
    <CatalogosContext.Provider value={{ lineas, presentaciones, velocidades, cargando, recargar }}>
      {children}
    </CatalogosContext.Provider>
  )
}

export function useCatalogosLive() {
  const ctx = useContext(CatalogosContext)
  if (!ctx) throw new Error("useCatalogosLive debe usarse dentro de CatalogosProvider")
  return ctx
}

/** Presentaciones activas con alguna velocidad tabulada para una línea dada. */
export function presentacionesPorLineaLive(velocidades: VelocidadLive[], linea: LineaCodigo): PresentacionCodigo[] {
  return [...new Set(velocidades.filter((v) => v.activo && v.linea === linea).map((v) => v.presentacion))]
}

export function velocidadesParaLive(velocidades: VelocidadLive[], linea: LineaCodigo, presentacion: PresentacionCodigo) {
  return velocidades.filter((v) => v.activo && v.linea === linea && v.presentacion === presentacion)
}

export function litrosHoraDeLive(
  velocidades: VelocidadLive[],
  linea: LineaCodigo,
  presentacion: PresentacionCodigo,
  envasesHora: number,
): number | null {
  return velocidades.find((v) => v.linea === linea && v.presentacion === presentacion && v.envasesHora === envasesHora)
    ?.litrosHora ?? null
}
