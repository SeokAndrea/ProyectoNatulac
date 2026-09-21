import { useState } from "react"
import { Loader2, NotebookPen, Send } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { horaCortaPlanta } from "@/lib/tiempoPlanta"
import { useNovedadesTurno } from "@/lib/novedades"

/**
 * Bitácora corta del turno ("8:42 falla el fluido eléctrico", "lote 5
 * envasandose"...) — alimenta "2.3 Novedades del turno" del Acta de
 * Entrega (ver src/lib/actaPdf.ts). Append-only: se agrega una línea a
 * la vez, con hora automática; no se edita ni se borra.
 */
export function NovedadesTurno() {
  const { novedades, cargando, registrarNovedad } = useNovedadesTurno()
  const [texto, setTexto] = useState("")
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function agregar() {
    if (texto.trim() === "" || enviando) return
    setEnviando(true)
    setError(null)
    const resultado = await registrarNovedad(texto.trim())
    setEnviando(false)
    if (!resultado.ok) {
      setError(resultado.error)
      return
    }
    setTexto("")
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <NotebookPen className="size-4 text-muted-foreground" />
          Novedades del turno
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex gap-2">
          <Input
            placeholder="Ej. Falla el fluido eléctrico"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") agregar()
            }}
            disabled={enviando}
          />
          <Button size="sm" onClick={agregar} disabled={texto.trim() === "" || enviando}>
            {enviando ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
          </Button>
        </div>
        {error && (
          <p className="text-xs text-destructive" role="alert">
            {error}
          </p>
        )}

        {cargando ? (
          <div className="flex justify-center py-2 text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
          </div>
        ) : novedades.length === 0 ? (
          <p className="text-xs text-muted-foreground">Sin novedades cargadas todavía.</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {[...novedades].reverse().map((n) => (
              <li key={n.id} className="flex items-start gap-2 text-sm">
                <span className="num shrink-0 text-xs text-muted-foreground">{horaCortaPlanta(n.creadoEn, n.creadoEn)}</span>
                <span className="text-foreground">{n.texto}</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
