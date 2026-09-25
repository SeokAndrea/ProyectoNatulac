import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { Beaker, Factory, Loader2 } from "lucide-react"
import { AppShell } from "@/components/AppShell"
import { EmptyState } from "@/components/EmptyState"
import { EstadoPlantaTabs } from "@/components/EstadoPlantaTabs"
import { ModoCorreccionBanner } from "@/components/ModoCorreccionBanner"
import { NovedadesTurno } from "@/components/NovedadesTurno"
import { Button } from "@/components/ui/button"
import { useTurnoEfectivo } from "@/lib/turnoCorreccion"
import { listarSabores, type Sabor } from "@/lib/sabores"

/*
 * Preparación: arrancar cosas NUEVAS en TANQUES — iniciar y liberar un
 * tanque (ver src/components/EstadoPlantaTabs.tsx, modo="preparacion").
 * También tiene "Corregir" (igual que Status) para el día a día —
 * Status queda para la revisión puntual de inicio de turno. Disponible
 * en cualquier momento del turno, no solo justo después de Comenzar
 * Turno.
 *
 * Líneas ya NO vive acá — tiene su propia página (src/pages/apps/Lineas.tsx),
 * ver plan-rework-3-modulos-y-merma.md, Fase 1. Se deja un atajo abajo
 * porque preparar un tanque y activar una línea son pasos seguidos
 * ("libero el tanque, activo la línea").
 */
export default function Preparacion() {
  const { turnoIdEfectivo, cargando, enModoCorreccion, turnoCorregido, errorCorreccion, salirDeCorreccion } =
    useTurnoEfectivo()
  const [sabores, setSabores] = useState<Sabor[]>([])

  useEffect(() => {
    listarSabores().then((lista) => setSabores(lista.filter((s) => s.activo)))
  }, [])

  if (cargando) {
    return (
      <AppShell title="Preparación" description="Tanques de la planta" fullWidth>
        <div className="flex justify-center py-16 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" />
        </div>
      </AppShell>
    )
  }

  if (errorCorreccion) {
    return (
      <AppShell title="Preparación" description="Tanques de la planta" fullWidth>
        <EmptyState
          icon={Beaker}
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
      <AppShell title="Preparación" description="Tanques de la planta" fullWidth>
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
    <AppShell
      title="Preparación"
      description={enModoCorreccion ? `Turno ${turnoCorregido?.codigo} (corrección)` : "Tanques de la planta"}
      fullWidth
    >
      <div className="flex flex-col gap-4">
        {enModoCorreccion && turnoCorregido && (
          <ModoCorreccionBanner turno={turnoCorregido} onSalir={salirDeCorreccion} />
        )}
        <EstadoPlantaTabs sabores={sabores} modo="preparacion" turnoId={turnoIdEfectivo} />
        <div className="flex justify-center">
          <Button asChild variant="outline">
            <Link to={enModoCorreccion ? `/lineas?turnoId=${turnoIdEfectivo}` : "/lineas"}>
              <Factory className="size-3.5" />
              Ir a Líneas
            </Link>
          </Button>
        </div>
        {!enModoCorreccion && <NovedadesTurno />}
      </div>
    </AppShell>
  )
}
