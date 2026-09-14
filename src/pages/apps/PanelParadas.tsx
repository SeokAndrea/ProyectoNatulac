import { useCallback, useEffect, useState } from "react"
import { Loader2 } from "lucide-react"
import { AppShell } from "@/components/AppShell"
import { PanelParadasVista, type EstadoLineaEnVivo } from "@/components/PanelParadasVista"
import type { EstadoLineaVista } from "@/components/CintaLinea"
import { listarParadas, LINEAS_PARADAS, type Parada } from "@/lib/paradas"
import { useProduccion } from "@/lib/produccion/useProduccion"
import type { Corrida, LineaEstado } from "@/lib/produccion/tipos"

/*
 * Panel de Paradas — dashboard solo lectura del downtime de las líneas,
 * mismo estilo que el Panel de Producción. El render vive en
 * <PanelParadasVista> (compartido con el preview /paradas-demo).
 * FASE A′: listarParadas() lee el fixture — pero el estado EN VIVO de
 * las 3 líneas (la cinta animada) sí sale de datos reales
 * (useProduccion), porque eso ya existe hoy y no depende del módulo
 * Paradas: no tiene sentido mostrar el turno activo "de mentira".
 */

/** Traduce corrida/lineasEstado (Producción, real) al estado visual de la cinta. Mismo criterio que LineaVisual.tsx / FinalizarTurno.tsx. */
function estadoLineaVista(lineaCodigo: string, corridas: Corrida[], lineasEstado: LineaEstado[]): EstadoLineaVista {
  const corrida = corridas.find((c) => c.linea === lineaCodigo && c.activa)
  if (corrida) {
    if (corrida.loteTerminado != null) return "TERMINO"
    if (corrida.pausadaEn != null) return "PARADA"
    return "CORRIENDO"
  }
  const estado = lineasEstado.find((le) => le.linea === lineaCodigo)
  if (estado?.condicion === "CIP") return "CIP"
  if (estado?.condicion === "CAMBIO_PRESENTACION") return "CAMBIO"
  if (estado?.condicion === "DETENIDA") return "PARADA"
  return "LIBRE"
}

export default function PanelParadas() {
  const [paradas, setParadas] = useState<Parada[] | null>(null)
  const prod = useProduccion()

  const cargar = useCallback(() => {
    // rango amplio: la vista filtra por fecha en memoria
    return listarParadas({ desde: "2000-01-01", hasta: "2999-12-31" })
  }, [])

  useEffect(() => {
    let vivo = true
    cargar().then((filas) => {
      if (vivo) setParadas(filas)
    })
    return () => {
      vivo = false
    }
  }, [cargar])

  const estadoLineas: EstadoLineaEnVivo[] | undefined = prod.cargando
    ? undefined
    : LINEAS_PARADAS.map((l) => {
        const corrida = prod.corridas.find((c) => c.linea === l.codigo && c.activa)
        return {
          lineaCodigo: l.codigo,
          estado: estadoLineaVista(l.codigo, prod.corridas, prod.lineasEstado),
          saborNombre: corrida?.saborNombre ?? null,
          lote: corrida?.lote ?? null,
        }
      })

  return (
    <AppShell title="Panel de Paradas" description="Downtime de las líneas — tiempo perdido, ocioso y desvío por tipo" fullWidth>
      <div className="w-full">
        {paradas === null ? (
          <div className="flex justify-center py-16 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
          </div>
        ) : (
          <PanelParadasVista paradas={paradas} estadoLineas={estadoLineas} />
        )}
      </div>
    </AppShell>
  )
}
