import { Link, useNavigate } from "react-router-dom"
import { ClipboardCheck, Square } from "lucide-react"
import { AppShell } from "@/components/AppShell"
import { EmptyState } from "@/components/EmptyState"
import { ResumenTurno } from "@/components/ResumenTurno"
import { ListaContadores } from "@/components/ListaContadores"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useTurno } from "@/lib/turno"

/*
 * Finalizar Turno: el resumen formal del turno en curso (datos fijos
 * + todos los contadores de Contadores y Merma por línea, con sus
 * mermas y justificaciones) para revisar antes de cerrar — funciona
 * como el acta del turno. Todavía no genera un PDF ni queda guardada
 * en ningún lado al finalizar: eso llega cuando esto se conecte a la
 * tabla "turnos" de Supabase (el cierre pasaría a ser un UPDATE con
 * estado = 'CERRADO').
 */
export default function FinalizarTurno() {
  const { turnoActivo, finalizarTurno } = useTurno()
  const navigate = useNavigate()

  if (!turnoActivo) {
    return (
      <AppShell title="Finalizar Turno" description="Resumen y cierre del turno">
        <EmptyState
          icon={ClipboardCheck}
          title="No hay ningún turno en curso"
          description="Todavía no iniciaste un turno para finalizar. Inicia uno desde Comenzar Turno."
        />
        <div className="mt-4 flex justify-center">
          <Button asChild>
            <Link to="/turno">Ir a Comenzar Turno</Link>
          </Button>
        </div>
      </AppShell>
    )
  }

  function handleFinalizar() {
    finalizarTurno()
    navigate("/hub", { replace: true })
  }

  return (
    <AppShell title="Finalizar Turno" description={`Turno ${turnoActivo.codigo}`}>
      <div className="mx-auto flex max-w-lg flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Datos del turno</CardTitle>
          </CardHeader>
          <CardContent>
            <ResumenTurno turno={turnoActivo} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Contadores por línea</CardTitle>
            <CardDescription>
              Envases de la llenadora, buenos y desechados registrados en Contadores y Merma durante
              este turno.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {turnoActivo.contadores.length === 0 ? (
              <p className="text-sm text-muted-foreground">Todavía no se cargó ningún contador en este turno.</p>
            ) : (
              <ListaContadores contadores={turnoActivo.contadores} mostrarTotales />
            )}
          </CardContent>
        </Card>

        <Button
          variant="outline"
          className="border-destructive/40 text-destructive hover:bg-destructive/10"
          onClick={handleFinalizar}
        >
          <Square className="size-4" />
          Finalizar Turno
        </Button>
      </div>
    </AppShell>
  )
}
