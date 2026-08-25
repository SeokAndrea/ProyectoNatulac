import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { Beaker, Loader2 } from "lucide-react"
import { AppShell } from "@/components/AppShell"
import { EmptyState } from "@/components/EmptyState"
import { EstadoPlantaTabs } from "@/components/EstadoPlantaTabs"
import { Button } from "@/components/ui/button"
import { useCatalogosLive } from "@/lib/catalogosLive"
import { listarSabores, type Sabor } from "@/lib/sabores"
import { useTurno } from "@/lib/turno"

/*
 * Preparación: arrancar cosas NUEVAS — iniciar y liberar un tanque,
 * activar o detener una corrida (ver src/components/EstadoPlantaTabs.tsx,
 * modo="preparacion"). Preparar un tanque y activar una línea son
 * pasos seguidos ("libero el tanque, activo la línea"), por eso viven
 * juntos acá. A diferencia de Status (que solo muestra el estado
 * heredado y deja corregirlo a mano), Preparación no tiene esa
 * corrección manual — es pura acción. Disponible en cualquier momento
 * del turno, no solo justo después de Comenzar Turno.
 */
export default function Preparacion() {
  const { turnoActivo, cargando } = useTurno()
  const { cargando: cargandoCatalogos } = useCatalogosLive()
  const [sabores, setSabores] = useState<Sabor[]>([])

  useEffect(() => {
    listarSabores().then((lista) => setSabores(lista.filter((s) => s.activo)))
  }, [])

  if (cargando || cargandoCatalogos) {
    return (
      <AppShell title="Preparación" description="Tanques y líneas de la planta">
        <div className="flex justify-center py-16 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" />
        </div>
      </AppShell>
    )
  }

  if (!turnoActivo) {
    return (
      <AppShell title="Preparación" description="Tanques y líneas de la planta">
        <EmptyState
          icon={Beaker}
          title="Primero debes iniciar un turno"
          description="Preparación se administra dentro de un turno en curso. Inicia uno desde Comenzar Turno."
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
    <AppShell title="Preparación" description={`Turno ${turnoActivo.codigo}`}>
      <EstadoPlantaTabs turno={turnoActivo} sabores={sabores} modo="preparacion" />
    </AppShell>
  )
}
