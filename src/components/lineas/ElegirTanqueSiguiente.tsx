import { useState } from "react"
import { Loader2, PlayCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { TanqueRecepcion } from "@/lib/preparacion/tipos"

/** Selector de tanque a mano cuando "Continuar al siguiente lote" / "Cambiar de lote" no detectó solo el siguiente. */
export function ElegirTanqueSiguiente({
  tanquesListos,
  enviando,
  onContinuar,
  onCancelar,
}: {
  tanquesListos: TanqueRecepcion[]
  enviando: boolean
  onContinuar: (numeroTanque: number) => void
  onCancelar: () => void
}) {
  const [tanque, setTanque] = useState<number | "">("")
  return (
    <div className="flex flex-col gap-2 rounded-md border border-dashed border-border p-2">
      <p className="text-xs text-foreground">No se detectó solo el tanque del siguiente lote. Elige cuál toma la línea:</p>
      {tanquesListos.length === 0 ? (
        <p className="text-xs text-muted-foreground">Ningún tanque está Listo todavía.</p>
      ) : (
        <div className="flex flex-col gap-2">
          <Select value={tanque === "" ? "" : String(tanque)} onValueChange={(v) => setTanque(Number(v))}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Tanque" />
            </SelectTrigger>
            <SelectContent>
              {tanquesListos.map((t) => (
                <SelectItem key={t.numeroTanque} value={String(t.numeroTanque)}>
                  Tanque {t.numeroTanque} · {t.saborNombre ?? "Sin sabor"}
                  {t.lote ? ` · Lote ${t.lote}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" disabled={tanque === "" || enviando} onClick={() => tanque !== "" && onContinuar(tanque)}>
              {enviando ? <Loader2 className="size-3.5 animate-spin" /> : <PlayCircle className="size-3.5" />}
              Continuar con ese tanque
            </Button>
            <Button size="sm" variant="ghost" disabled={enviando} onClick={onCancelar}>
              Cancelar
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
