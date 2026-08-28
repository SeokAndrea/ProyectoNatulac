import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { CheckCircle2, ClipboardList, Loader2 } from "lucide-react"
import { AppShell } from "@/components/AppShell"
import { EmptyState } from "@/components/EmptyState"
import { EstadoPlantaTabs } from "@/components/EstadoPlantaTabs"
import { Button } from "@/components/ui/button"
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useCatalogosLive } from "@/lib/catalogosLive"
import { listarSabores, type Sabor } from "@/lib/sabores"
import { revisionInicioCompleta, useTurno } from "@/lib/turno"

/*
 * Status: cómo quedaron tanques y líneas heredados del turno anterior
 * — el paso de revisión Confirmar/Editar de INICIO (ver
 * ConfirmarEstadoTanque). Es de una sola vez: en cuanto los 3 tanques
 * y toda línea con corrida activa quedan confirmados, se cierra el
 * acceso — cualquier corrección de ahí en más (si algo no coincide con
 * la realidad después) se hace desde Preparación, que tiene su propio
 * "Corregir" con exactamente la misma acción (ver
 * src/components/EstadoPlantaTabs.tsx, modo="preparacion"), así que no
 * se pierde ninguna capacidad al cerrar Status.
 */
export default function Status() {
  const { turnoActivo, cargando } = useTurno()
  const { cargando: cargandoCatalogos } = useCatalogosLive()
  const [sabores, setSabores] = useState<Sabor[]>([])

  useEffect(() => {
    listarSabores().then((lista) => setSabores(lista.filter((s) => s.activo)))
  }, [])

  if (cargando || cargandoCatalogos) {
    return (
      <AppShell title="Status" description="Estado real de tanques y líneas" fullWidth>
        <div className="flex justify-center py-16 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" />
        </div>
      </AppShell>
    )
  }

  if (!turnoActivo) {
    return (
      <AppShell title="Status" description="Estado real de tanques y líneas" fullWidth>
        <EmptyState
          icon={ClipboardList}
          title="Primero debes iniciar un turno"
          description="Status se administra dentro de un turno en curso. Inicia uno desde Comenzar Turno."
        />
        <div className="mt-4 flex justify-center">
          <Button asChild>
            <Link to="/turno">Ir a Comenzar Turno</Link>
          </Button>
        </div>
      </AppShell>
    )
  }

  if (revisionInicioCompleta(turnoActivo)) {
    return (
      <AppShell title="Status" description={`Turno ${turnoActivo.codigo}`} fullWidth>
        <EmptyState
          icon={CheckCircle2}
          title="Ya revisaste el inicio de este turno"
          description="Status es de una sola vez, al arrancar el turno. Para corregir un tanque o una línea de acá en más, usa Preparación."
        />
        <div className="mt-4 flex justify-center">
          <Button asChild>
            <Link to="/preparacion">Ir a Preparación</Link>
          </Button>
        </div>
      </AppShell>
    )
  }

  return (
    <AppShell title="Status" description={`Turno ${turnoActivo.codigo}`} fullWidth>
      <div className="flex flex-col gap-4">
        <Card className="mx-auto w-full max-w-3xl">
          <CardHeader>
            <CardTitle>¿Con qué encontraste la planta?</CardTitle>
            <CardDescription>
              Así quedaron tanques y líneas heredados del turno anterior. Verifica que coincida con la
              realidad y corrige lo que haga falta — para arrancar algo nuevo, ve a Preparación.
            </CardDescription>
          </CardHeader>
        </Card>

        <EstadoPlantaTabs turno={turnoActivo} sabores={sabores} modo="status" />
      </div>
    </AppShell>
  )
}
