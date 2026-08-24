import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { ClipboardList, Loader2 } from "lucide-react"
import { AppShell } from "@/components/AppShell"
import { EmptyState } from "@/components/EmptyState"
import { EstadoPlantaTabs } from "@/components/EstadoPlantaTabs"
import { Button } from "@/components/ui/button"
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useCatalogosLive } from "@/lib/catalogosLive"
import { listarSabores, type Sabor } from "@/lib/sabores"
import { useTurno } from "@/lib/turno"

/*
 * Recepción: la "foto" con la que el supervisor arranca su turno —
 * con qué condición encontró cada tanque y qué líneas están
 * funcionando. Es la misma vista y las mismas acciones que
 * Preparación (ver src/components/EstadoPlantaTabs.tsx) — Recepción
 * no es un paso obligatorio ni bloqueante, es simplemente adonde
 * conviene entrar primero: después de Comenzar Turno se llega acá
 * derecho, y se puede volver en cualquier momento (el estado es
 * continuo, no se "pierde" si no se revisa apenas arranca el turno).
 */
export default function Recepcion() {
  const { turnoActivo, cargando } = useTurno()
  const { cargando: cargandoCatalogos } = useCatalogosLive()
  const [sabores, setSabores] = useState<Sabor[]>([])

  useEffect(() => {
    listarSabores().then((lista) => setSabores(lista.filter((s) => s.activo)))
  }, [])

  if (cargando || cargandoCatalogos) {
    return (
      <AppShell title="Recepción" description="Condición de tanques y líneas al llegar de turno">
        <div className="flex justify-center py-16 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" />
        </div>
      </AppShell>
    )
  }

  if (!turnoActivo) {
    return (
      <AppShell title="Recepción" description="Condición de tanques y líneas al llegar de turno">
        <EmptyState
          icon={ClipboardList}
          title="Primero debes iniciar un turno"
          description="Recepción se administra dentro de un turno en curso. Inicia uno desde Comenzar Turno."
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
    <AppShell title="Recepción" description={`Turno ${turnoActivo.codigo}`}>
      <div className="mx-auto flex max-w-3xl flex-col gap-4">
        <Card>
          <CardHeader>
            <CardTitle>¿Con qué encontraste la planta?</CardTitle>
            <CardDescription>
              Tanques y líneas vienen heredados del turno anterior. Corregí solo lo que haya cambiado — se
              puede seguir ajustando después desde Preparación.
            </CardDescription>
          </CardHeader>
        </Card>

        <EstadoPlantaTabs turno={turnoActivo} sabores={sabores} />
      </div>
    </AppShell>
  )
}
