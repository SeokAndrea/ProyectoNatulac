import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { Beaker, Factory, Loader2, PackageCheck } from "lucide-react"
import { AppShell } from "@/components/AppShell"
import { EmptyState } from "@/components/EmptyState"
import { LineasEstadoPlanta } from "@/components/LineasEstadoPlanta"
import { ModoCorreccionBanner } from "@/components/ModoCorreccionBanner"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/lib/auth"
import { areaPlantaDeSesion, esDeMantenimiento } from "@/lib/mantenimientoSesion"
import { obtenerEstadoPlantaActual } from "@/lib/panelProduccion"
import { useTurnoEfectivo } from "@/lib/turnoCorreccion"

/*
 * Líneas: activar/detener corridas de las 3 líneas (ver
 * src/components/LineasEstadoPlanta.tsx, modo="preparacion") — antes
 * era una pestaña compartida adentro de Preparación
 * (src/components/EstadoPlantaTabs.tsx), ahora es su propia página.
 * Ver docs/plan-rework-3-modulos-y-merma.md, Fase 1: "la página de líneas
 * debe ser su propia página como tal".
 */
export default function Lineas() {
  const efectivo = useTurnoEfectivo()
  const { enModoCorreccion, turnoCorregido, errorCorreccion, salirDeCorreccion } = efectivo
  // Mantenimiento no abre turnos: ve el turno en curso de la planta y entra al Modo Paradas.
  const { session } = useAuth()
  const esMantenimiento = esDeMantenimiento(session)
  // El turno de la planta del área de la sesión: Pruebas en Pruebas, Aséptico en el resto.
  const areaPlanta = areaPlantaDeSesion(session)
  const [turnoPlanta, setTurnoPlanta] = useState<string | null | undefined>(undefined)
  useEffect(() => {
    if (!esMantenimiento) return
    let vivo = true
    void obtenerEstadoPlantaActual(areaPlanta).then((t) => vivo && setTurnoPlanta(t?.id ?? null))
    return () => {
      vivo = false
    }
  }, [esMantenimiento, areaPlanta])
  const cargando = esMantenimiento ? turnoPlanta === undefined : efectivo.cargando
  const turnoIdEfectivo = esMantenimiento ? (turnoPlanta ?? null) : efectivo.turnoIdEfectivo

  if (cargando) {
    return (
      <AppShell title="Líneas" description="Corridas de la planta" fullWidth>
        <div className="flex justify-center py-16 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" />
        </div>
      </AppShell>
    )
  }

  if (errorCorreccion) {
    return (
      <AppShell title="Líneas" description="Corridas de la planta" fullWidth>
        <EmptyState
          icon={Factory}
          title="Ese turno no se pudo abrir"
          description="No se encontró, o ya no es el turno inmediatamente anterior al actual de esa área."
        />
        <div className="mt-4 flex justify-center">
          <Button asChild>
            <Link to="/auditoria">Volver a Auditoría</Link>
          </Button>
        </div>
      </AppShell>
    )
  }

  if (!turnoIdEfectivo) {
    return (
      <AppShell title="Líneas" description="Corridas de la planta" fullWidth>
        <EmptyState
          icon={Factory}
          title={esMantenimiento ? "No hay un turno abierto" : "Primero debes iniciar un turno"}
          description={esMantenimiento ? "Las paradas se ven y se terminan con un turno en curso." : "Líneas se administra dentro de un turno en curso. Inicia uno desde Comenzar Turno."}
        />
        {!esMantenimiento && (
          <div className="mt-4 flex justify-center">
            <Button asChild>
              <Link to="/turno">Ir a Comenzar Turno</Link>
            </Button>
          </div>
        )}
      </AppShell>
    )
  }

  return (
    <AppShell
      title="Líneas"
      description={enModoCorreccion ? `Turno ${turnoCorregido?.codigo} (corrección)` : "Corridas de la planta"}
      fullWidth
    >
      <div className="flex flex-col gap-4">
        {enModoCorreccion && turnoCorregido && (
          <ModoCorreccionBanner turno={turnoCorregido} onSalir={salirDeCorreccion} />
        )}
        {/* En corrección, solo lectura: un turno cerrado no cambia líneas (el servidor también lo rechaza). */}
        <fieldset disabled={enModoCorreccion} className="m-0 min-w-0 border-0 p-0">
          <LineasEstadoPlanta modo="preparacion" turnoId={turnoIdEfectivo} />
        </fieldset>
        {!esMantenimiento && (
        <div className="flex flex-wrap justify-center gap-2">
          <Button asChild variant="outline">
            <Link to={enModoCorreccion ? `/preparacion?turnoId=${turnoIdEfectivo}` : "/preparacion"}>
              <Beaker className="size-3.5" />
              Ir a Preparación
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link to={enModoCorreccion ? `/producto-terminado?turnoId=${turnoIdEfectivo}` : "/producto-terminado"}>
              <PackageCheck className="size-3.5" />
              Ir a Producto Terminado
            </Link>
          </Button>
        </div>
        )}
      </div>
    </AppShell>
  )
}
