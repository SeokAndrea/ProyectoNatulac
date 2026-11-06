import { useCallback, useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { MarcoPanel } from "@/components/MarcoPanel"
import { PanelParadasVista, type CargarOee, type CargarParadas, type EstadoLineaEnVivo } from "@/components/PanelParadasVista"
import { aspectoDeLinea } from "@/components/lineas/estadoLinea"
import { listarParadas, LINEAS_PARADAS } from "@/lib/paradas"
import { useProduccion } from "@/lib/produccion/useProduccion"
import { aplicarParadasEnVivo, estadoDeLineas } from "@/components/panel/calculosPanel"
import { useAuth } from "@/lib/auth"
import { esAreaDeApoyo } from "@/lib/catalogos"
import { useCatalogosLive } from "@/lib/catalogosLive"
import { ReportesMantenimiento } from "@/components/paradas/ReportesMantenimiento"
import { puede } from "@/lib/permisos"
import { obtenerEstadoPlantaActual } from "@/lib/panelProduccion"
import { textoParadaEnVivo, useParadasAbiertas } from "@/lib/paradasEnVivo"
import { cargarOeePeriodo } from "@/lib/eficienciaPeriodo"
import { conEstadosDeLaBase, useEstadoLineas, useRecargarAlCambiar } from "@/lib/estadoLineas"
import type { TurnoActivo } from "@/lib/turno"
import { inicioCuentaTurno } from "@/lib/paradasTurnoCompleto"

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

/*
 * El estado de cada línea sale del MISMO cálculo que el Panel de Producción,
 * la tarjeta de Líneas y el Modo Paradas (estadoDeLineas +
 * aplicarParadasEnVivo, calculosPanel.ts), y su escena de la tabla única
 * (aspectoDeLinea, src/components/lineas/estadoLinea.ts). Dueña, 2026-11-05.
 */

/** Mientras cargan los catálogos (líneas, velocidades): el OEE se muestra "calculando", no "sin datos". */
const OEE_PENDIENTE: CargarOee = () => new Promise(() => {})

/** Cada REFRESCO_MS se vuelve a resolver el turno activo del área + se recargan sus líneas — panel de pared, tiene que verse solo sin recargar la página. */
const REFRESCO_MS = 20 * 1000

/** `enTv`: dentro del modo TV, sin encabezado ni menú y en modo presentar (src/pages/apps/ModoTv.tsx). */
export default function PanelParadas({ enTv = false }: { enTv?: boolean } = {}) {
  const navigate = useNavigate()
  const { session } = useAuth()
  // Las áreas de apoyo (Calidad, Servicios Industriales, Mantenimiento) no tienen turno propio:
  // miran producción, igual que el Super Admin (null = todas menos Pruebas).
  const area =
    session?.area && !esAreaDeApoyo(session.area) ? session.area : null
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
  const [versionParadas] = useState(0)
  const cargarParadas = useCallback<CargarParadas>(
    ({ desde, hasta }) => listarParadas({ desde, hasta, area: areaParadas }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [areaParadas, versionParadas],
  )
  const puedeActualizarSheet = areaParadas !== "PRUEBAS" && (puede(session, "PARADAS_REGISTRAR") || session?.area === "MANTENIMIENTO")
  // Paradas abiertas para la cinta en vivo; quien puede, trae el Sheet de Mantenimiento solo cada 5 min.
  const paradasAbiertas = useParadasAbiertas(areaParadas, puedeActualizarSheet ? (session?.username ?? null) : null)

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

  // El estado de cada línea lo dice la base (cada 15 s, el mismo que Líneas y el Panel de
  // Producción); si cambió algo, se recargan ya el turno y sus corridas.
  const estadoBase = useEstadoLineas(areaParadas)
  useRecargarAlCambiar(estadoBase, () => {
    void obtenerEstadoPlantaActual(area).then(setTurno)
    void prod.recargar()
  })

  // Desde cuándo cuenta el turno en vivo: la cinta suma los minutos desde ahí, igual que el Panel de
  // Producción (dueña, 2026-10-28: el mismo tiempo en los dos, y desde las 7 aunque abran tarde).
  const desdeTurno = turno ? inicioCuentaTurno(turno.turnoTipo, turno.fecha, `${turno.fecha}T${turno.horaInicio}`) : null

  // Las líneas reales del área (LINEA_T1/T2/T3 en Pruebas, LINEA_1/2/3 en
  // Producción — ver LineaCodigo) no comparten código con LINEAS_PARADAS
  // (genérico, mismo en todas las áreas). Se matchea por POSICIÓN: ambas
  // listas están ordenadas igual (por código), así que el n-ésimo elemento
  // de cada una es "la misma línea física".
  // Sin turno ABIERTO (estado_planta_actual devuelve el último cerrado entre un turno y otro), las
  // líneas no heredan el estado del turno cerrado: quedan Libres, salvo una parada abierta.
  const turnoEnCurso = turno?.estado === "ABIERTO"
  const ahora = new Date()
  // Lo que dice la base; si no responde, el cálculo de respaldo (la misma regla).
  const enVivo = conEstadosDeLaBase(
    aplicarParadasEnVivo(
      estadoDeLineas(turnoEnCurso ? prod.corridas : [], turnoEnCurso ? prod.lineasEstado : [], lineasReales),
      paradasAbiertas,
      ahora,
      turnoEnCurso ? desdeTurno : null,
    ),
    estadoBase,
    ahora,
    turnoEnCurso ? desdeTurno : null,
  )
  const estadoLineas: EstadoLineaEnVivo[] | undefined = prod.cargando
    ? undefined
    : LINEAS_PARADAS.map((l, i) => {
        const lineaReal = lineasReales[i]
        const real = lineaReal ? enVivo.find((e) => e.codigo === lineaReal.codigo) : undefined
        const corrida = real?.corrida ?? null
        const parada = real?.paradaEnVivo ?? null
        return {
          lineaCodigo: l.codigo,
          estado: real ? aspectoDeLinea(real).vista : "LIBRE",
          aviso: parada ? textoParadaEnVivo(parada) : null,
          avisoUrgente: parada?.visible ?? false,
          nota: parada?.nota ?? null,
          saborNombre: corrida?.saborNombre ?? null,
          lote: corrida?.lote ?? null,
          presentacion: corrida?.presentacion ?? null,
        }
      })

  return (
    <MarcoPanel enTv={enTv} title="Panel de Paradas" fullWidth ocultarEstadoBanner>
      <div className="w-full">
        <PanelParadasVista
          cargarParadas={cargarParadas}
          estadoLineas={estadoLineas}
          cargarOee={cargandoCatalogos ? OEE_PENDIENTE : cargarOee}
          modoTv={enTv}
          onModoTv={() => {
            // La pantalla completa se pide con el toque (el navegador no la da después de navegar).
            document.documentElement.requestFullscreen?.().catch(() => {})
            navigate("/modo-tv")
          }}
          mantenimiento={
            areaParadas === "PRUEBAS"
              ? undefined
              : (paradas, ahora) => (
                  <div className="w-full">
                    <ReportesMantenimiento
                      paradas={paradas}
                      ahora={ahora}
                    />
                  </div>
                )
          }
        />
      </div>
    </MarcoPanel>
  )
}
