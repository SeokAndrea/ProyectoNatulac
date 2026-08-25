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
 * Status: cómo quedaron tanques y líneas heredados del turno
 * anterior — solo ver y, si algo no coincide con la realidad,
 * corregir a mano (ver el escape hatch "Cambiar estado manualmente"
 * en src/components/EstadoPlantaTabs.tsx, modo="status"). No tiene
 * los botones para arrancar algo nuevo (Iniciar Preparación, Activar
 * línea) — eso es Preparación (src/pages/apps/Preparacion.tsx).
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
      <AppShell title="Status" description="Estado real de tanques y líneas">
        <div className="flex justify-center py-16 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" />
        </div>
      </AppShell>
    )
  }

  if (!turnoActivo) {
    return (
      <AppShell title="Status" description="Estado real de tanques y líneas">
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

  return (
    <AppShell title="Status" description={`Turno ${turnoActivo.codigo}`}>
      <div className="mx-auto flex max-w-3xl flex-col gap-4">
        <Card>
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
