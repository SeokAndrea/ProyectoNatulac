import { useEffect, useState } from "react"
import { Loader2, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { actualizarDesdeSheet, ultimaActualizacionSheet, type ResumenSync } from "@/lib/sheetMantenimiento"

const fmt = new Intl.DateTimeFormat("es-VE", { timeZone: "America/Caracas", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })

/*
 * Trae las paradas que Mantenimiento cargó en su Google Sheet (src/lib/sheetMantenimiento.ts).
 * Se puede tocar las veces que haga falta: cada reporte entra una sola vez y
 * se actualiza si cambió en el Sheet (ej. un PENDIENTE que se finalizó).
 */
export function ActualizarDesdeSheet({ usuario, onListo }: { usuario: string; onListo?: () => void }) {
  const [ultima, setUltima] = useState<string | null>(null)
  const [trabajando, setTrabajando] = useState(false)
  const [resultado, setResultado] = useState<ResumenSync | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    ultimaActualizacionSheet().then(setUltima)
  }, [])

  async function actualizar() {
    setTrabajando(true)
    setError(null)
    setResultado(null)
    const r = await actualizarDesdeSheet(usuario)
    setTrabajando(false)
    if (!r.ok) return setError(r.error)
    setResultado(r.datos)
    setUltima(new Date().toISOString())
    onListo?.()
  }

  return (
    <div className="flex flex-col gap-1.5 rounded-lg border border-border bg-card px-3 py-2.5 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium text-foreground">Paradas de Mantenimiento (su Sheet)</p>
          <p className="text-xs text-muted-foreground">{ultima ? `Última actualización: ${fmt.format(new Date(ultima))}` : "Todavía no se actualizó."}</p>
        </div>
        <Button size="sm" variant="outline" onClick={actualizar} disabled={trabajando}>
          {trabajando ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
          Actualizar desde el Sheet
        </Button>
      </div>
      {resultado && (
        <p className="text-xs text-success-foreground" role="status">
          {resultado.nuevas} nuevas · {resultado.actualizadas} actualizadas · {resultado.sinCambios} sin cambios
          {resultado.corregidas > 0 ? ` · ${resultado.corregidas} con la fecha corregida` : ""}
        </p>
      )}
      {error && (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
