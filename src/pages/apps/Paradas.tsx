import { useEffect, useState } from "react"
import { Loader2 } from "lucide-react"
import { AppShell } from "@/components/AppShell"
import { RegistroParadas, type LineaDelDia } from "@/components/RegistroParadas"
import { listarParadas, LINEAS_PARADAS, type Parada } from "@/lib/paradas"
import { useProduccion } from "@/lib/produccion/useProduccion"
import { useCatalogosLive } from "@/lib/catalogosLive"

/*
 * Registro de Paradas — el supervisor elige la LÍNEA (la parada nunca es
 * del lote) y carga las paradas PROGRAMADA (catálogo) y el TIEMPO OCIOSO
 * (texto libre); NO PROGRAMADA es solo lectura, llega del Sheet de
 * Mantenimiento. Cada línea se muestra con el lote/sabor que tiene
 * corriendo ahora (mismo dato que Producción al activar) — solo contexto
 * para reconocerla, no cambia que la parada se guarda por línea. La vista
 * vive en <RegistroParadas> (compartida con el preview /paradas-demo, que
 * arma sus propias líneas genéricas sin login).
 * FASE A′: listarParadas() lee el fixture y el registro no persiste — el
 * lote/sabor de contexto sí es real (useProduccion, turno propio de la
 * sesión). LINEA_T1/T2/T3 (Pruebas) vs. LINEA_1/2/3 (Producción) no
 * comparten código — se matchea por POSICIÓN contra LINEAS_PARADAS, mismo
 * criterio que PanelParadas.tsx.
 */
export default function Paradas() {
  const [paradas, setParadas] = useState<Parada[] | null>(null)
  const prod = useProduccion()
  const { lineas: lineasReales } = useCatalogosLive()

  useEffect(() => {
    let vivo = true
    // rango amplio: la vista de registro trabaja sobre lo del turno, no filtra por fecha
    listarParadas({ desde: "2000-01-01", hasta: "2999-12-31" }).then((filas) => {
      if (vivo) setParadas(filas)
    })
    return () => {
      vivo = false
    }
  }, [])

  const lineasHoy: LineaDelDia[] = LINEAS_PARADAS.map((l, i) => {
    const lineaReal = lineasReales[i]
    const corrida = lineaReal ? prod.corridas.find((c) => c.linea === lineaReal.codigo && c.activa) : undefined
    return {
      lineaCodigo: l.codigo,
      lineaNombre: lineaReal?.nombre ?? l.nombre,
      loteTexto: corrida?.lote ?? null,
      saborNombre: corrida?.saborNombre ?? null,
      activa: corrida != null,
    }
  })

  return (
    <AppShell title="Registrar Paradas" description="Paradas programadas y tiempo ocioso, por línea">
      <div className="mx-auto w-full max-w-3xl">
        {paradas === null ? (
          <div className="flex justify-center py-16 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
          </div>
        ) : (
          <RegistroParadas paradas={paradas} lineasHoy={lineasHoy} />
        )}
      </div>
    </AppShell>
  )
}
