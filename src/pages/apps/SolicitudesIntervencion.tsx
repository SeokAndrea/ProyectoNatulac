import { useCallback, useEffect, useState } from "react"
import { useSearchParams } from "react-router-dom"
import { Loader2, Wrench } from "lucide-react"
import { AppShell } from "@/components/AppShell"
import { EmptyState } from "@/components/EmptyState"
import { DetalleSif } from "@/components/sif/DetalleSif"
import { ListaSif } from "@/components/sif/ListaSif"
import { useAuth } from "@/lib/auth"
import { useCatalogoParadas } from "@/lib/paradasCatalogo"
import { puede } from "@/lib/permisos"
import { listarSif, type Sif } from "@/lib/sif"

/*
 * Solicitudes de Intervención de Falla (migración 20261109390000). Las genera
 * el servidor cuando una parada se repite 3 veces en una línea en la jornada.
 * Mantenimiento (SIF_GESTIONAR) asigna el responsable y la cierra; el resto la
 * ve en solo lectura. ?sif=<id> abre una puntual (el aviso de pendientes).
 */
export default function SolicitudesIntervencion() {
  const { session } = useAuth()
  useCatalogoParadas() // para mostrar el código de planilla de cada falla (ej. CPL2-6)
  const [params, setParams] = useSearchParams()
  const [lista, setLista] = useState<Sif[] | null>(null)
  const usuario = session?.username ?? ""
  const puedeGestionar = puede(session, "SIF_GESTIONAR")

  const recargar = useCallback(async () => {
    if (!usuario) return
    setLista(await listarSif(usuario))
  }, [usuario])

  useEffect(() => {
    void recargar()
  }, [recargar])

  const elegida = lista?.find((s) => s.id === params.get("sif")) ?? lista?.[0] ?? null
  const elegir = (id: string) => setParams({ sif: id }, { replace: true })

  return (
    <AppShell title="Solicitudes de Intervención" description="Fallas repetidas que Mantenimiento tiene que intervenir">
      {lista === null ? (
        <div className="flex justify-center py-16 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" />
        </div>
      ) : lista.length === 0 || !elegida ? (
        <EmptyState
          icon={Wrench}
          title="No hay solicitudes de intervención"
          description="Se generan solas cuando la misma falla se repite 3 veces en una línea en el día."
        />
      ) : (
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(260px,340px)_1fr]">
          <ListaSif lista={lista} seleccionada={elegida.id} onElegir={elegir} />
          <DetalleSif key={elegida.id} sif={elegida} usuario={usuario} puedeGestionar={puedeGestionar} onCambio={recargar} />
        </div>
      )}
    </AppShell>
  )
}
