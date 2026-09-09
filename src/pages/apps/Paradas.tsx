import { useCallback, useEffect, useState } from "react"
import { Loader2 } from "lucide-react"
import { AppShell } from "@/components/AppShell"
import { ParadasLista } from "@/components/ParadasLista"
import { rangoDePreset, type RangoFecha } from "@/lib/auditoriaVista"
import { listarParadas, type Parada } from "@/lib/paradas"

/*
 * Paradas — histórico de downtime de las líneas (lo carga Mantenimiento
 * en un Google Sheet externo; se sincroniza a la tabla `paradas`).
 * Solo lectura. La vista vive en <ParadasLista> (compartida con el
 * preview /paradas-demo). FASE A: listarParadas() lee el fixture.
 */
export default function Paradas() {
  const [rango, setRango] = useState<RangoFecha>(() => rangoDePreset("DIAS_7", ""))
  const [paradas, setParadas] = useState<Parada[] | null>(null)

  useEffect(() => {
    let vivo = true
    listarParadas({ desde: rango.desde, hasta: rango.hasta, area: "ASEPTICO" }).then((filas) => {
      if (vivo) setParadas(filas)
    })
    return () => {
      vivo = false
    }
  }, [rango.desde, rango.hasta])

  const onRangoChange = useCallback((r: RangoFecha) => {
    setRango((actual) => (actual.desde === r.desde && actual.hasta === r.hasta ? actual : r))
  }, [])

  return (
    <AppShell title="Paradas" description="Downtime de las líneas (reportes de Mantenimiento)" fullWidth>
      <div className="mx-auto w-full max-w-3xl">
        {paradas === null ? (
          <div className="flex justify-center py-16 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
          </div>
        ) : (
          <ParadasLista paradas={paradas} presetInicial="DIAS_7" onRangoChange={onRangoChange} />
        )}
      </div>
    </AppShell>
  )
}
