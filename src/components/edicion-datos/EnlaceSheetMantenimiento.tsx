import { useEffect, useState } from "react"
import { Check, ExternalLink, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { guardarEnlaceSheet, obtenerEnlaceSheet, probarEnlaceSheet } from "@/lib/sheetMantenimiento"

/*
 * Enlace del Google Sheet de Mantenimiento (configuracion_app,
 * 'sheet_mantenimiento_url'). Solo el dueño. De ahí sale "Actualizar desde el
 * Sheet" en Registrar Paradas y el Panel de Paradas (src/lib/sheetMantenimiento.ts).
 */
export function EnlaceSheetMantenimiento({ usuario }: { usuario: string }) {
  const [guardado, setGuardado] = useState<string | null>(null)
  const [enlace, setEnlace] = useState("")
  const [trabajando, setTrabajando] = useState<"guardar" | "probar" | null>(null)
  const [mensaje, setMensaje] = useState<{ ok: boolean; texto: string } | null>(null)

  useEffect(() => {
    obtenerEnlaceSheet().then((e) => {
      setGuardado(e)
      setEnlace(e ?? "")
    })
  }, [])

  async function probar() {
    setTrabajando("probar")
    setMensaje(null)
    const r = await probarEnlaceSheet(enlace)
    setTrabajando(null)
    setMensaje(r.ok ? { ok: true, texto: `Se lee bien: ${r.datos.reportes} reportes de Aséptico (${r.datos.enCurso} en curso).` } : { ok: false, texto: r.error })
  }

  async function guardar() {
    setTrabajando("guardar")
    setMensaje(null)
    const r = await guardarEnlaceSheet(usuario, enlace)
    setTrabajando(null)
    if (!r.ok) return setMensaje({ ok: false, texto: r.error })
    setGuardado(enlace.trim())
    setMensaje({ ok: true, texto: "Enlace guardado." })
  }

  const cambiado = enlace.trim() !== (guardado ?? "")

  return (
    <div className="mb-4 flex flex-col gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-medium text-foreground">Sheet de Mantenimiento (paradas)</span>
        {guardado && (
          <a href={guardado} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-muted-foreground underline hover:text-foreground">
            <ExternalLink className="size-3" />
            Abrir el Sheet
          </a>
        )}
      </div>
      <p className="text-xs text-muted-foreground">Compartido con «cualquiera con el enlace». Se lee la pestaña ÁREAS.</p>
      <div className="flex flex-wrap gap-2">
        <Input
          aria-label="Enlace del Sheet de Mantenimiento"
          placeholder="https://docs.google.com/spreadsheets/d/…"
          value={enlace}
          onChange={(e) => setEnlace(e.target.value)}
          className="h-9 min-w-0 flex-1 basis-72"
        />
        <Button size="sm" variant="outline" className="h-9" onClick={probar} disabled={!enlace.trim() || trabajando !== null}>
          {trabajando === "probar" && <Loader2 className="size-3.5 animate-spin" />}
          Probar
        </Button>
        <Button size="sm" className="h-9" onClick={guardar} disabled={!cambiado || !enlace.trim() || trabajando !== null}>
          {trabajando === "guardar" ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
          Guardar
        </Button>
      </div>
      {mensaje && (
        <p className={`text-xs ${mensaje.ok ? "text-success-foreground" : "text-destructive"}`} role={mensaje.ok ? "status" : "alert"}>
          {mensaje.texto}
        </p>
      )}
    </div>
  )
}
