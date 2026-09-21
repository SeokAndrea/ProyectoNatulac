import { useEffect, useState } from "react"
import { Download, FileText, Loader2 } from "lucide-react"
import { AppShell } from "@/components/AppShell"
import { EmptyState } from "@/components/EmptyState"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { useAuth } from "@/lib/auth"
import { GRUPOS, TURNO_TIPOS, nombrePorCodigo } from "@/lib/catalogos"
import { misActas, urlPublicaActa, type MiActa } from "@/lib/historialTurnos"

/*
 * Mis Actas: el supervisor ve y descarga las actas de SUS propios
 * turnos cerrados, sin pasar por Auditoría (esa pestaña sigue siendo
 * solo Super Administrador / Administrador de Área). Antes el único
 * momento en que veía el link de su acta era justo al finalizar el
 * turno (FinalizarTurno.tsx) — si navegaba a otro lado, lo perdía.
 */
export default function MisActas() {
  const { session } = useAuth()
  const [actas, setActas] = useState<MiActa[]>([])
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    if (!session) return
    misActas(session.username).then((lista) => {
      setActas(lista)
      setCargando(false)
    })
  }, [session])

  return (
    <AppShell title="Mis Actas" description="Actas de tus turnos cerrados">
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
                  <p className="truncate text-sm font-semibold text-foreground">
                    {a.fecha} · {nombrePorCodigo(TURNO_TIPOS, a.turnoTipo)} · {nombrePorCodigo(GRUPOS, a.grupo)}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">{a.turnoCodigo}</p>
                </div>
                <Button asChild size="sm" variant="outline" className="shrink-0">
                  <a href={urlPublicaActa(a.storagePath)} target="_blank" rel="noreferrer">
                    <Download className="size-3.5" />
                    Descargar
                  </a>
                </Button>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </AppShell>
  )
}
