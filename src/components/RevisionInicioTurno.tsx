import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { EstadoPlantaTabs } from "@/components/EstadoPlantaTabs"
import { LineasEstadoPlanta } from "@/components/LineasEstadoPlanta"
import { NitrogenoAlRecibir } from "@/components/NitrogenoTurno"
import { useSesionTurno } from "@/lib/sesionTurno"
import type { Sabor } from "@/lib/sabores"

/*
 * Cuerpo de la revisión de inicio de turno (antes la página aparte
 * "Status"): cómo quedaron tanques y líneas heredados del turno
 * anterior. Ahora vive dentro de Comenzar Turno, como el paso
 * siguiente después de confirmar el turno — no cambia de ruta. Arriba, el
 * nitrógeno al recibir (obligatorio en los turnos nuevos, migración 20261116290000).
 */
export function RevisionInicioTurno({ sabores }: { sabores: Sabor[] }) {
  const sesion = useSesionTurno()
  return (
    <div className="flex flex-col gap-4">
      <Card className="mx-auto w-full max-w-3xl">
        <CardHeader>
          <CardTitle>¿Con qué encontraste la planta?</CardTitle>
          <CardDescription>
            Así quedaron tanques y líneas heredados del turno anterior. Verifica que coincida con la
            realidad y corrige lo que haga falta — para arrancar algo nuevo, ve a Preparación o Líneas.
          </CardDescription>
        </CardHeader>
      </Card>

      {sesion.nitrogeno.aplica && <NitrogenoAlRecibir />}

      <EstadoPlantaTabs sabores={sabores} modo="status" />
      <LineasEstadoPlanta modo="status" />
    </div>
  )
}
