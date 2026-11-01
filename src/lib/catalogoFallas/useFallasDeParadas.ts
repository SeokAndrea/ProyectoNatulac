import { useEffect, useState } from "react"
import type { Parada } from "@/lib/paradas"
import { leerFallasDeParadas, type FallasDeParada } from "./paradas"

const POR_PEDIDO = 400
const VACIO = new Map<string, FallasDeParada>()

/**
 * Las fallas del catálogo nuevo de cada parada de la lista (fallas_de_paradas,
 * migración 20261113890000), en pedidos de a 400. Solo trae las que tienen
 * alguna; mientras carga, vacío.
 */
export function useFallasDeParadas(paradas: Parada[]): Map<string, FallasDeParada> {
  const clave = paradas.map((p) => p.id).join(",")
  const [resultado, setResultado] = useState<{ clave: string; mapa: Map<string, FallasDeParada> } | null>(null)

  useEffect(() => {
    let vivo = true
    const ids = clave ? clave.split(",") : []
    const pedidos: Promise<Map<string, FallasDeParada>>[] = []
    for (let i = 0; i < ids.length; i += POR_PEDIDO) pedidos.push(leerFallasDeParadas(ids.slice(i, i + POR_PEDIDO)))
    void Promise.all(pedidos).then((partes) => {
      if (!vivo) return
      const mapa = new Map<string, FallasDeParada>()
      for (const parte of partes) for (const [id, f] of parte) if (f.fallaProduccionId || f.fallaFinalId) mapa.set(id, f)
      setResultado({ clave, mapa })
    })
    return () => {
      vivo = false
    }
  }, [clave])

  return resultado?.clave === clave ? resultado.mapa : VACIO
}
