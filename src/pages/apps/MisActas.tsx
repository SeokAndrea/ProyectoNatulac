import { useEffect, useState } from "react"
import { ArrowLeft, Eye, FileText, Loader2 } from "lucide-react"
import { AppShell } from "@/components/AppShell"
import { VisorActa } from "@/components/acta/VisorActa"
import { EmptyState } from "@/components/EmptyState"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { useAuth } from "@/lib/auth"
import { TURNO_TIPOS, nombreGrupo, nombrePorCodigo } from "@/lib/catalogos"
import { misActas, urlPublicaActa, type MiActa } from "@/lib/historialTurnos"

/*
 * Mis Actas: el supervisor ve las actas de SUS propios turnos (el Super
 * Administrador y el dueño, las de todos, migración 20261097). Cada una se
 * abre en pantalla, igual a la que se imprime, con Imprimir y Descargar PDF
 * (src/components/acta/VisorActa.tsx).
 */
export default function MisActas() {
  const { session } = useAuth()
  const veTodas = session?.rol === "SUPERADMINISTRADOR" || session?.esDueno === true
  const [actas, setActas] = useState<MiActa[]>([])
  const [cargando, setCargando] = useState(true)
  const [abierta, setAbierta] = useState<MiActa | null>(null)

  useEffect(() => {
    if (!session) return
    misActas(session.username).then((lista) => {
      setActas(lista)
      setCargando(false)
    })
  }, [session])

  const titulo = (a: MiActa) => `${a.fecha} · ${nombrePorCodigo(TURNO_TIPOS, a.turnoTipo)} · ${nombreGrupo(a.grupo)}`

  if (abierta) {
    return (
      <AppShell title="Mis Actas" description={`${titulo(abierta)} · ${abierta.turnoCodigo}`}>
        <div className="mx-auto flex max-w-3xl flex-col gap-3">
          <Button variant="ghost" className="self-start" onClick={() => setAbierta(null)}>
            <ArrowLeft className="size-4" />
            Volver a la lista
          </Button>
          <VisorActa fuente={urlPublicaActa(abierta.storagePath)} codigoTurno={abierta.turnoCodigo} />
        </div>
      </AppShell>
    )
  }

  return (
    <AppShell title="Mis Actas" description={veTodas ? "Actas de todos los turnos cerrados" : "Actas de tus turnos cerrados"}>
      <div className="mx-auto flex max-w-2xl flex-col gap-3">
        {cargando ? (
          <div className="flex justify-center py-16 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
          </div>
        ) : actas.length === 0 ? (
          <EmptyState icon={FileText} title="Todavía no tienes actas" description="Cuando finalices un turno, el acta va a aparecer acá." />
        ) : (
          actas.map((a) => (
            <Card key={a.id}>
              <CardContent className="flex items-center justify-between gap-3 py-4">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-foreground">{titulo(a)}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {a.turnoCodigo}
                    {veTodas && a.supervisorNombre ? ` · ${a.supervisorNombre}` : ""}
                    {veTodas && a.areaNombre ? ` · ${a.areaNombre}` : ""}
                  </p>
                </div>
                <Button size="sm" className="shrink-0" onClick={() => setAbierta(a)}>
                  <Eye className="size-3.5" />
                  Ver
                </Button>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </AppShell>
  )
}
