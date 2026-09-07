import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { CheckCircle2, ClipboardList, Loader2 } from "lucide-react"
import { AppShell } from "@/components/AppShell"
import { EmptyState } from "@/components/EmptyState"
import { EstadoPlantaTabs } from "@/components/EstadoPlantaTabs"
import { LineasEstadoPlanta } from "@/components/LineasEstadoPlanta"
import { Button } from "@/components/ui/button"
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { usePreparacion } from "@/lib/preparacion/usePreparacion"
import { useProduccion } from "@/lib/produccion/useProduccion"
import { useSesionTurno } from "@/lib/sesionTurno"
import { listarSabores, type Sabor } from "@/lib/sabores"

/*
 * Status: cómo quedaron tanques y líneas heredados del turno anterior
 * — el paso de revisión Confirmar/Editar de INICIO (ver
 * ConfirmarEstadoTanque). Es de una sola vez: en cuanto los 3 tanques
 * y toda línea con corrida activa quedan confirmados, se cierra el
 * acceso — cualquier corrección de ahí en más (si algo no coincide con
 * la realidad después) se hace desde Preparación/Líneas, que tienen su
 * propio "Corregir" con exactamente la misma acción (ver
 * src/components/EstadoPlantaTabs.tsx y LineasEstadoPlanta.tsx,
 * modo="preparacion"), así que no se pierde ninguna capacidad al
 * cerrar Status.
 *
 * Tanques y Líneas eran una sola pieza con pestañas (EstadoPlantaTabs);
 * ahora son dos piezas separadas (Fase 1 del plan) — Status sigue
 * necesitando las dos juntas para la revisión de inicio, así que las
 * arma acá como dos secciones en vez de dos tabs.
 */
export default function Status() {
  const { turnoId, codigo, cargando: cargandoSesion } = useSesionTurno()
  const { tanques, cargando: cargandoPreparacion } = usePreparacion()
  const { corridas, cargando: cargandoProduccion } = useProduccion()
  const [sabores, setSabores] = useState<Sabor[]>([])

  useEffect(() => {
    listarSabores().then((lista) => setSabores(lista.filter((s) => s.activo)))
  }, [])

  const cargando = cargandoSesion || cargandoPreparacion || cargandoProduccion

  if (cargando) {
    return (
      <AppShell title="Status" description="Estado real de tanques y líneas" fullWidth>
        <div className="flex justify-center py-16 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" />
        </div>
      </AppShell>
    )
  }

  if (!turnoId) {
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

  /** Revisión de inicio completa: los 3 tanques y toda corrida activa quedaron confirmados (ver antes revisionInicioCompleta en turno.tsx). */
  const revisionCompleta =
    tanques.every((t) => t.confirmadoInicioEn !== null) && corridas.filter((c) => c.activa).every((c) => c.confirmadoInicioEn !== null)

  if (revisionCompleta) {
    return (
      <AppShell title="Status" description={`Turno ${codigo}`} fullWidth>
        <EmptyState
          icon={CheckCircle2}
          title="Ya revisaste el inicio de este turno"
          description="Status es de una sola vez, al arrancar el turno. Para corregir un tanque o una línea de acá en más, usa Preparación o Líneas."
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
    <AppShell title="Status" description={`Turno ${codigo}`} fullWidth>
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

        <EstadoPlantaTabs sabores={sabores} modo="status" />
        <LineasEstadoPlanta modo="status" />
      </div>
    </AppShell>
  )
}
