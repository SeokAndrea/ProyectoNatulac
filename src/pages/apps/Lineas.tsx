import { Link } from "react-router-dom"
import { Beaker, Factory, Loader2 } from "lucide-react"
import { AppShell } from "@/components/AppShell"
import { EmptyState } from "@/components/EmptyState"
import { LineasEstadoPlanta } from "@/components/LineasEstadoPlanta"
import { Button } from "@/components/ui/button"
import { useSesionTurno } from "@/lib/sesionTurno"

/*
 * Líneas: activar/detener corridas de las 3 líneas (ver
 * src/components/LineasEstadoPlanta.tsx, modo="preparacion") — antes
 * era una pestaña compartida adentro de Preparación
 * (src/components/EstadoPlantaTabs.tsx), ahora es su propia página.
 * Ver plan-rework-3-modulos-y-merma.md, Fase 1: "la página de líneas
 * debe ser su propia página como tal".
 */
export default function Lineas() {
  const { turnoId, codigo, cargando } = useSesionTurno()

  if (cargando) {
    return (
      <AppShell title="Líneas" description="Corridas de la planta" fullWidth>
        <div className="flex justify-center py-16 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" />
        </div>
      </AppShell>
    )
  }

  if (!turnoId) {
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
    <AppShell title="Líneas" description={`Turno ${codigo}`} fullWidth>
      <div className="flex flex-col gap-4">
        <LineasEstadoPlanta modo="preparacion" />
        <div className="flex justify-center">
          <Button asChild variant="outline">
            <Link to="/preparacion">
              <Beaker className="size-3.5" />
              Ir a Preparación
            </Link>
          </Button>
        </div>
      </div>
    </AppShell>
  )
}
