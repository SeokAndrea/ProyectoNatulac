import { Link } from "react-router-dom"
import { Beaker, Factory, Loader2 } from "lucide-react"
import { AppShell } from "@/components/AppShell"
import { EmptyState } from "@/components/EmptyState"
import { LineasEstadoPlanta } from "@/components/LineasEstadoPlanta"
import { ModoCorreccionBanner } from "@/components/ModoCorreccionBanner"
import { Button } from "@/components/ui/button"
import { useTurnoEfectivo } from "@/lib/turnoCorreccion"

/*
 * Líneas: activar/detener corridas de las 3 líneas (ver
 * src/components/LineasEstadoPlanta.tsx, modo="preparacion") — antes
 * era una pestaña compartida adentro de Preparación
 * (src/components/EstadoPlantaTabs.tsx), ahora es su propia página.
 * Ver plan-rework-3-modulos-y-merma.md, Fase 1: "la página de líneas
 * debe ser su propia página como tal".
 */
export default function Lineas() {
  const { turnoIdEfectivo, cargando, enModoCorreccion, turnoCorregido, errorCorreccion, salirDeCorreccion } =
    useTurnoEfectivo()

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
          title="Primero debes iniciar un turno"
          description="Líneas se administra dentro de un turno en curso. Inicia uno desde Comenzar Turno."
        />
        <div className="mt-4 flex justify-center">
          <Button asChild>
            <Link to="/turno">Ir a Comenzar Turno</Link>
          </Button>
        </div>
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
        <LineasEstadoPlanta modo="preparacion" turnoId={turnoIdEfectivo} />
        <div className="flex justify-center">
          <Button asChild variant="outline">
            <Link to={enModoCorreccion ? `/preparacion?turnoId=${turnoIdEfectivo}` : "/preparacion"}>
              <Beaker className="size-3.5" />
              Ir a Preparación
            </Link>
          </Button>
        </div>
      </div>
    </AppShell>
  )
}
