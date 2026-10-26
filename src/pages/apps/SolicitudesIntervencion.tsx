import { useCallback, useEffect, useState } from "react"
import { useLocation, useNavigate, useSearchParams } from "react-router-dom"
import { ArrowLeft, Loader2, Wrench } from "lucide-react"
import { AppShell } from "@/components/AppShell"
import { EmptyState } from "@/components/EmptyState"
import { DetalleSif } from "@/components/sif/DetalleSif"
import { ErrorSif } from "@/components/sif/ErrorSif"
import { ListaSif } from "@/components/sif/ListaSif"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/lib/auth"
import { useCatalogoParadas } from "@/lib/paradasCatalogo"
import { puede } from "@/lib/permisos"
import { listarSif, nombreSolicitud, type Sif } from "@/lib/sif"

const TITULO = "Solicitudes de Intervención"

/*
 * Solicitudes de Falla (migraciones 20261109390000 y 20261111690000). Las
 * genera el servidor: Inspección a la 3.ª vez que una parada se repite en una
 * línea en la jornada, Intervención a la 4.ª. Mantenimiento (SIF_GESTIONAR)
 * marca revisada la Inspección y asigna el responsable y cierra la
 * Intervención; el resto las ve en solo lectura. Como Mis Actas: la lista de
 * tarjetas, y ?sif=<id> abre una (la tarjeta o el aviso de pendientes).
 */
export default function SolicitudesIntervencion() {
  const { session } = useAuth()
  useCatalogoParadas() // para mostrar el código de planilla de cada falla (ej. CPL2-6)
  const [params, setParams] = useSearchParams()
  const location = useLocation()
  const navigate = useNavigate()
  const [lista, setLista] = useState<Sif[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [cargando, setCargando] = useState(true)
  const usuario = session?.username ?? ""
  const puedeGestionar = puede(session, "SIF_GESTIONAR")

  // Si falla, queda la lista que había: una caída de la red no la borra ni la hace pasar por vacía.
  const recargar = useCallback(async () => {
    if (!usuario) return
    setCargando(true)
    const r = await listarSif(usuario)
    setCargando(false)
    if (r.ok) {
      setLista(r.data)
      setError(null)
    } else setError(r.error)
  }, [usuario])

  useEffect(() => {
    void recargar()
  }, [recargar])

  const idPedido = params.get("sif")
  const abierta = lista?.find((s) => s.id === idPedido) ?? null
  // Abierta desde la lista: volver es un paso atrás, así la flecha del encabezado no repite la lista.
  const elegir = (id: string) => setParams({ sif: id }, { state: { desdeLista: true } })
  const volver = () => ((location.state as { desdeLista?: boolean } | null)?.desdeLista ? navigate(-1) : setParams({}, { replace: true }))
  const botonVolver = (
    <Button variant="ghost" className="self-start" onClick={volver}>
      <ArrowLeft className="size-4" />
      Volver a la lista
    </Button>
  )
  const errorCarga = error && <ErrorSif mensaje={`No se pudieron cargar las solicitudes. ${error}`} accion="Reintentar" onAccion={() => void recargar()} />

  if (abierta) {
    return (
      <AppShell title={TITULO} description={`${nombreSolicitud(abierta.estado)} · ${abierta.codigo}`}>
        <div className="mx-auto flex max-w-3xl flex-col gap-3">
          {botonVolver}
          {errorCarga}
          <DetalleSif key={abierta.id} sif={abierta} usuario={usuario} puedeGestionar={puedeGestionar} onCambio={recargar} />
        </div>
      </AppShell>
    )
  }

  // Un enlace (del aviso o de un correo) a una solicitud que no está entre las que se cargan.
  if (idPedido && lista) {
    return (
      <AppShell title={TITULO} description="Solicitud no encontrada">
        <div className="mx-auto flex max-w-3xl flex-col gap-3">
          {botonVolver}
          {errorCarga}
          <div className="rounded-xl bg-card p-4 ring-1 ring-foreground/10 sm:p-5">
            <h2 className="font-semibold">No se encontró esta solicitud</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Puede ser de otra área o una cerrada hace tiempo: la lista trae las abiertas y las últimas 100 terminadas.
            </p>
          </div>
        </div>
      </AppShell>
    )
  }

  return (
    <AppShell title={TITULO} description="Fallas repetidas: inspección a la 3.ª, intervención a la 4.ª">
      <div className="mx-auto flex max-w-2xl flex-col gap-3">
        {errorCarga}
        {lista === null ? (
          cargando && (
            <div className="flex justify-center py-16 text-muted-foreground">
              <Loader2 className="size-5 animate-spin" />
            </div>
          )
        ) : lista.length === 0 ? (
          <EmptyState
            icon={Wrench}
            title="No hay solicitudes"
            description="Se generan solas: de inspección cuando la misma falla se repite 3 veces en una línea en el día, y pasa a intervención a la 4.ª."
          />
        ) : (
          <ListaSif lista={lista} onElegir={elegir} />
        )}
      </div>
    </AppShell>
  )
}
