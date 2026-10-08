import { CheckCircle2 } from "lucide-react"
import { VisorActa } from "@/components/acta/VisorActa"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

/** Después de cerrar: el acta en pantalla, lista para imprimir o descargar. */
export function TurnoCerrado({
  codigoTurno,
  actaPdf,
  errorActa,
  onVolver,
}: {
  codigoTurno: string
  actaPdf: Blob | null
  errorActa: string | null
  onVolver: () => void
}) {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <div className="flex flex-col items-center gap-2 py-6 text-center">
        <CheckCircle2 className="size-10 text-success" />
        <p className="text-lg font-semibold text-foreground">Turno cerrado</p>
        <p className="text-sm text-muted-foreground">Turno {codigoTurno}</p>
        <ul className="mt-1 flex flex-col gap-0.5 text-sm text-muted-foreground">
          {actaPdf && <li>El acta quedó guardada en Mis Actas.</li>}
          <li>Durante 24 h puedes cargar contadores y cajas que falten; el acta se rearma sola.</li>
        </ul>
        {errorActa && (
          <p className="text-sm text-destructive" role="alert">
            {errorActa}
          </p>
        )}
      </div>

      {actaPdf && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Tu acta</CardTitle>
          </CardHeader>
          <CardContent>
            <VisorActa fuente={actaPdf} codigoTurno={codigoTurno} />
          </CardContent>
        </Card>
      )}

      <Button variant="ghost" className="self-center" onClick={onVolver}>
        Volver al inicio
      </Button>
    </div>
  )
}
