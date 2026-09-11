import { useCallback, useEffect, useState } from "react"
import { Loader2 } from "lucide-react"
import { AppShell } from "@/components/AppShell"
import { PanelParadasVista } from "@/components/PanelParadasVista"
import { listarParadas, type Parada } from "@/lib/paradas"

/*
 * Panel de Paradas — dashboard solo lectura del downtime de las líneas,
 * mismo estilo que el Panel de Producción. El render vive en
 * <PanelParadasVista> (compartido con el preview /paradas-demo).
 * FASE A′: listarParadas() lee el fixture.
 */
export default function PanelParadas() {
  const [paradas, setParadas] = useState<Parada[] | null>(null)

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

  return (
    <AppShell title="Panel de Paradas" description="Downtime de las líneas — tiempo perdido, ocioso y desvío por tipo" fullWidth>
      <div className="mx-auto w-full max-w-4xl">
        {paradas === null ? (
          <div className="flex justify-center py-16 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
          </div>
        ) : (
          <PanelParadasVista paradas={paradas} presetInicial="DIAS_7" />
        )}
      </div>
    </AppShell>
  )
}
