import { useState } from "react"
import { FileText, X } from "lucide-react"
import { VisorActa } from "@/components/acta/VisorActa"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { urlPublicaActa } from "@/lib/historialTurnos"
import type { TurnoDelDia } from "@/lib/resumenDiario"

const miles = (n: number) => n.toLocaleString("es-CO")

/** Un botón por turno con datos: abre su acta vigente en pantalla (la misma de Mis Actas), para verla o imprimirla. */
export function ActasDelDia({ turnos }: { turnos: TurnoDelDia[] }) {
  const [abierta, setAbierta] = useState<TurnoDelDia | null>(null)
  if (turnos.length === 0) return null
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[repeat(auto-fit,minmax(220px,1fr))]">
        {turnos.map((t) => (
          <div key={t.turno.id} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2.5">
            <div className="min-w-0">
              <p className="font-semibold text-foreground">Acta {t.etiqueta}</p>
              <p className="truncate text-xs text-muted-foreground">
                {t.turno.supervisorNombre} · <span className="num">{miles(t.cajas)}</span> cajas
              </p>
            </div>
            {t.actaStoragePath ? (
              <Button size="sm" variant={abierta?.turno.id === t.turno.id ? "secondary" : "default"} onClick={() => setAbierta(t)}>
                <FileText className="size-3.5" />
                Ver acta
              </Button>
            ) : (
              <Button size="sm" variant="outline" disabled>
                Acta pendiente
              </Button>
            )}
          </div>
        ))}
      </div>
      {abierta?.actaStoragePath && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <CardTitle className="text-base">
              Acta {abierta.etiqueta} · {abierta.turno.codigo}
            </CardTitle>
            <Button size="sm" variant="ghost" onClick={() => setAbierta(null)}>
              <X className="size-4" />
              Cerrar
            </Button>
          </CardHeader>
          <CardContent>
            <VisorActa fuente={urlPublicaActa(abierta.actaStoragePath)} codigoTurno={abierta.turno.codigo} />
          </CardContent>
        </Card>
      )}
    </div>
  )
}
