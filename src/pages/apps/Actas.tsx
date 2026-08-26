import { useEffect, useState } from "react"
import { Download, FileText, Loader2 } from "lucide-react"
import { AppShell } from "@/components/AppShell"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { AREAS, nombrePorCodigo } from "@/lib/catalogos"
import { useAuth } from "@/lib/auth"
import { listarActas, urlPublicaActa, type Acta } from "@/lib/historialTurnos"

/*
 * Actas: el PDF real generado al Finalizar cada turno (ver
 * src/lib/actaPdf.ts) — código, versión y estado (VIGENTE/ANULADA,
 * ver registrar_acta()) con descarga directa. Área propia, separada de
 * Auditoría (que es el registro cronológico de acciones del turno) —
 * mismo alcance por rol que allá: Super Administrador ve todas las
 * áreas (menos PRUEBAS), Administrador de Área solo la suya (ver
 * listar_actas()).
 */
export default function Actas() {
  const { session } = useAuth()
  const [actas, setActas] = useState<Acta[]>([])
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    if (!session) return
    setCargando(true)
    listarActas(session.username).then((lista) => {
      setActas(lista)
      setCargando(false)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.username])

  return (
    <AppShell title="Actas" description="Actas de cierre de turno, con su PDF">
      <div className="mx-auto flex max-w-2xl flex-col gap-2">
        {cargando ? (
          <div className="flex justify-center py-16 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
          </div>
        ) : actas.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Todavía no se generó ningún acta.</p>
        ) : (
          actas.map((a) => (
            <div
              key={a.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3 text-sm"
            >
              <div className="flex min-w-0 items-center gap-3">
                <FileText className="size-5 shrink-0 text-muted-foreground" />
                <div className="min-w-0">
                  <p className="truncate font-mono font-medium text-foreground">{a.codigo}</p>
                  <p className="truncate text-muted-foreground">
                    {a.supervisorNombre} · {a.fecha} · {nombrePorCodigo(AREAS, a.area)}
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Badge variant={a.estado === "VIGENTE" ? "success" : "muted"}>
                  {a.estado === "VIGENTE" ? "Vigente" : "Anulada"}
                </Badge>
                <Button size="sm" variant="outline" asChild>
                  <a href={urlPublicaActa(a.storagePath)} target="_blank" rel="noreferrer">
                    <Download className="size-3.5" />
                    Descargar
                  </a>
                </Button>
              </div>
            </div>
          ))
        )}
      </div>
    </AppShell>
  )
}
