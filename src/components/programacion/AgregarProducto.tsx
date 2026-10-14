import { useMemo, useState } from "react"
import { Loader2, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { PresentacionLive } from "@/lib/catalogosLive"
import { nombreSaborConFamilia, type Sabor } from "@/lib/sabores"

const LISTA = "programacion-semana-sabores"

/** Agregar un producto (sabor + presentación) a la semana. Si ya estaba, le cambia las cajas. */
export function AgregarProducto({
  sabores,
  presentaciones,
  onAgregar,
}: {
  sabores: Sabor[]
  presentaciones: PresentacionLive[]
  onAgregar: (saborId: string, presentacionId: string, cajas: number) => Promise<boolean>
}) {
  const [sabor, setSabor] = useState("")
  const [presentacionId, setPresentacionId] = useState("")
  const [cajas, setCajas] = useState("")
  const [enviando, setEnviando] = useState(false)

  const porNombre = useMemo(() => new Map(sabores.map((s) => [nombreSaborConFamilia(s.nombre, s.familiaNombre), s])), [sabores])
  const saborId = porNombre.get(sabor.trim())?.id ?? ""
  const n = Number(cajas.replace(/[^\d]/g, ""))
  const listo = !!saborId && !!presentacionId && n > 0

  async function agregar(ev: React.FormEvent) {
    ev.preventDefault()
    if (!listo) return
    setEnviando(true)
    const ok = await onAgregar(saborId, presentacionId, n)
    setEnviando(false)
    if (ok) {
      setSabor("")
      setCajas("")
    }
  }

  return (
    <form onSubmit={agregar} className="flex flex-wrap items-end gap-2 border-t p-3">
      <datalist id={LISTA}>
        {[...porNombre.keys()].map((nombre) => (
          <option key={nombre} value={nombre} />
        ))}
      </datalist>
      <label className="flex min-w-48 flex-1 flex-col gap-1 text-xs font-semibold text-muted-foreground">
        Sabor
        <Input id="semana-sabor" list={LISTA} value={sabor} onChange={(e) => setSabor(e.target.value)} placeholder="Elegir o escribir" aria-invalid={sabor.trim() !== "" && !saborId} />
      </label>
      <label className="flex w-36 flex-col gap-1 text-xs font-semibold text-muted-foreground">
        Presentación
        <Select value={presentacionId} onValueChange={setPresentacionId}>
          <SelectTrigger id="semana-presentacion">
            <SelectValue placeholder="Elegir" />
          </SelectTrigger>
          <SelectContent>
            {presentaciones.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.nombre}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </label>
      <label className="flex w-36 flex-col gap-1 text-xs font-semibold text-muted-foreground">
        Cajas de la semana
        <Input id="semana-cajas" inputMode="numeric" value={cajas} onChange={(e) => setCajas(e.target.value)} placeholder="0" className="font-mono" />
      </label>
      <Button type="submit" disabled={!listo || enviando} className="gap-1.5">
        {enviando ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
        Agregar a la semana
      </Button>
    </form>
  )
}
