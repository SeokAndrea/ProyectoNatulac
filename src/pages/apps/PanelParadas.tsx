import { useCallback, useEffect, useState } from "react"
import { AppShell } from "@/components/AppShell"
import { PanelParadasVista, type CargarOee, type CargarParadas, type EstadoLineaEnVivo } from "@/components/PanelParadasVista"
import type { EstadoLineaVista } from "@/components/CintaLinea"
import { listarParadas, LINEAS_PARADAS } from "@/lib/paradas"
import { useProduccion } from "@/lib/produccion/useProduccion"
import type { Corrida, LineaEstado } from "@/lib/produccion/tipos"
import { useAuth } from "@/lib/auth"
import { useCatalogosLive } from "@/lib/catalogosLive"
import { ActualizarDesdeSheet } from "@/components/paradas/ActualizarDesdeSheet"
import { ReportesMantenimiento } from "@/components/paradas/ReportesMantenimiento"
import { puede } from "@/lib/permisos"
import { obtenerEstadoPlantaActual } from "@/lib/panelProduccion"
import { cargarOeePeriodo } from "@/lib/eficienciaPeriodo"
import type { TurnoActivo } from "@/lib/turno"

/*
 * Panel de Paradas — dashboard solo lectura del downtime de las líneas,
 * mismo estilo que el Panel de Producción. El render vive en
 * <PanelParadasVista>.
 * listarParadas() lee la base (migración 20261061); el estado EN VIVO de
 * las 3 líneas (la cinta animada) sí sale de datos reales
 * (useProduccion), porque eso ya existe hoy y no depende del módulo
 * Paradas: no tiene sentido mostrar el turno activo "de mentira".
 *
 * DOS bugs corregidos acá (dueño activó una línea y el Panel no se
 * movía):
 * 1. `useProduccion()` sin argumento cae al turno PROPIO de la sesión
 *    (ver useProduccion.ts) — un dashboard de planta tiene que mostrar
 *    el turno activo del ÁREA, no el turno personal de quien mira el
 *    Panel. Mismo fix que ya tiene PanelProduccion.tsx (comentario
 *    "null vs. undefined" ahí): se resuelve con
 *    obtenerEstadoPlantaActual(área) + `useProduccion(turno?.id ?? null)`.
 * 2. LINEAS_PARADAS (paradas.ts) da por hecho los códigos de Producción
 *    Aséptico (LINEA_1/2/3) — el Área de Pruebas usa LINEA_T1/T2/T3
 *    (ver LineaCodigo en catalogos.ts). Comparar por código nunca
 *    matcheaba en Pruebas. Se matchea por POSICIÓN contra las líneas
 *    reales del área (useCatalogosLive, ya ordenadas por código) en vez
 *    de por string, y se etiqueta con el código genérico LINEA_1/2/3
 *    solo para que <PanelParadasVista> lo ubique en su slot visual.
 */

/** Traduce corrida/lineasEstado (Producción, real) al estado visual de la cinta. Mismo criterio que LineaVisual.tsx / FinalizarTurno.tsx. */
function estadoLineaVista(lineaCodigo: string, corridas: Corrida[], lineasEstado: LineaEstado[]): EstadoLineaVista {
  const estado = lineasEstado.find((le) => le.linea === lineaCodigo)
  // En CIP con el lote que sigue, la corrida queda activa: igual se ve el CIP, no "corriendo".
  if (estado?.condicion === "CIP") return "CIP"
  const corrida = corridas.find((c) => c.linea === lineaCodigo && c.activa)
  if (corrida) {
    if (corrida.loteTerminado != null) return "TERMINO"
    if (corrida.pausadaEn != null) return "PARADA"
    return "CORRIENDO"
  }
  if (estado?.condicion === "CAMBIO_PRESENTACION") return "CAMBIO"
  if (estado?.condicion === "DETENIDA") return "DETENIDA"
  return "LIBRE"
}

/** Mientras cargan los catálogos (líneas, velocidades): el OEE se muestra "calculando", no "sin datos". */
const OEE_PENDIENTE: CargarOee = () => new Promise(() => {})

/** Cada REFRESCO_MS se vuelve a resolver el turno activo del área + se recargan sus líneas — panel de pared, tiene que verse solo sin recargar la página. */
const REFRESCO_MS = 20 * 1000

export default function PanelParadas() {
  const { session } = useAuth()
  // Las áreas de apoyo (Calidad, Servicios Industriales, Mantenimiento) no tienen turno propio:
  // miran producción, igual que el Super Admin (null = todas menos Pruebas).
  const area =
    session?.area && !["CALIDAD", "SERVICIOS_INDUSTRIALES", "MANTENIMIENTO"].includes(session.area) ? session.area : null
  const { lineas: lineasReales, presentaciones, velocidades, cargando: cargandoCatalogos } = useCatalogosLive()
  const [turno, setTurno] = useState<TurnoActivo | null>(null)
  // `turno?.id ?? null` (nunca undefined): si todavía no hay turno resuelto
  // del área, useProduccion tiene que ver vacío, NUNCA caer al turno propio
  // de quien está mirando el Panel — ver nota de cabecera.
  const prod = useProduccion(turno?.id ?? null)

  // Aséptico y Pruebas ven solo lo suyo; el resto (superadmin, Mantenimiento…) ve producción, nunca Pruebas.
  const areaParadas = area === "ASEPTICO" || area === "PRUEBAS" ? area : null
  // Solo las paradas del período elegido en la vista (antes se traía todo el historial).
  // Sube al actualizar desde el Sheet de Mantenimiento: la vista vuelve a pedir las paradas.
  const [versionParadas, setVersionParadas] = useState(0)
  const cargarParadas = useCallback<CargarParadas>(
    ({ desde, hasta }) => listarParadas({ desde, hasta, area: areaParadas }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [areaParadas, versionParadas],
  )
  const puedeActualizarSheet = areaParadas !== "PRUEBAS" && (puede(session, "PARADAS_REGISTRAR") || session?.area === "MANTENIMIENTO")

  // OEE por línea del período elegido en la vista — mismo cálculo que el
  // Panel de Producción, turno por turno (src/lib/eficienciaPeriodo.ts).
  const cargarOee = useCallback<CargarOee>(
    ({ desde, hasta, turnoTipo }) =>
      cargarOeePeriodo({
        desde,
        hasta,
        turnoTipo,
        area: areaParadas,
        lineas: lineasReales.map((l) => l.codigo),
        presentaciones,
        velocidades,
      }),
    [areaParadas, lineasReales, presentaciones, velocidades],
  )

  useEffect(() => {
    let vivo = true
    const cargarTurno = () => obtenerEstadoPlantaActual(area).then((t) => vivo && setTurno(t))
    cargarTurno()
    const id = setInterval(cargarTurno, REFRESCO_MS)
    return () => {
      vivo = false
      clearInterval(id)
    }
  }, [area])

  useEffect(() => {
    const id = setInterval(() => prod.recargar(), REFRESCO_MS)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turno?.id])

  // Las líneas reales del área (LINEA_T1/T2/T3 en Pruebas, LINEA_1/2/3 en
  // Producción — ver LineaCodigo) no comparten código con LINEAS_PARADAS
  // (genérico, mismo en todas las áreas). Se matchea por POSICIÓN: ambas
  // listas están ordenadas igual (por código), así que el n-ésimo elemento
  // de cada una es "la misma línea física".
  const estadoLineas: EstadoLineaEnVivo[] | undefined = prod.cargando
    ? undefined
    : LINEAS_PARADAS.map((l, i) => {
        const lineaReal = lineasReales[i]
        const corrida = lineaReal ? prod.corridas.find((c) => c.linea === lineaReal.codigo && c.activa) : undefined
        return {
          lineaCodigo: l.codigo,
          estado: lineaReal ? estadoLineaVista(lineaReal.codigo, prod.corridas, prod.lineasEstado) : "LIBRE",
          saborNombre: corrida?.saborNombre ?? null,
          lote: corrida?.lote ?? null,
          presentacion: corrida?.presentacion ?? null,
        }
      })

  return (
    <AppShell title="Panel de Paradas" fullWidth ocultarEstadoBanner>
      <div className="w-full">
        {puedeActualizarSheet && (
          <div className="mx-auto mb-3 max-w-3xl">
            <ActualizarDesdeSheet usuario={session?.username ?? ""} onListo={() => setVersionParadas((v) => v + 1)} />
          </div>
        )}
        <PanelParadasVista
          cargarParadas={cargarParadas}
          estadoLineas={estadoLineas}
          cargarOee={cargandoCatalogos ? OEE_PENDIENTE : cargarOee}
        />
        {areaParadas !== "PRUEBAS" && (
          <div className="mx-auto mt-4 max-w-5xl">
            <ReportesMantenimiento />
          </div>
        )}
      </div>
    </AppShell>
  )
}
