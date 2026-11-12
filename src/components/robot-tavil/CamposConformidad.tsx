import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import { OBSERVACIONES, type DatosConformidad } from "@/lib/trazabilidadPaletizado"

/**
 * Conformidad de una paleta (1.3.7 a 1.3.9 de la hoja): interruptor «No
 * conforme» y, si está encendido, la observación 1 a 7 (el 7 pide texto) y la
 * acción de corrección. `opcional`: la observación no es obligatoria (quien
 * corrige desde la tarjeta de Trazabilidad).
 */
export function CamposConformidad({
  valor,
  onCambio,
  opcional = false,
  idBase,
}: {
  valor: DatosConformidad
  onCambio: (v: DatosConformidad) => void
  opcional?: boolean
  idBase: string
}) {
  const nc = !valor.conforme
  const marcar = (codigo: number, si: boolean) =>
    onCambio({
      ...valor,
      observacionCodigos: si
        ? [...valor.observacionCodigos.filter((c) => c !== codigo), codigo].sort((a, b) => a - b)
        : valor.observacionCodigos.filter((c) => c !== codigo),
    })

  return (
    <div className="flex flex-col gap-3">
      <label
        htmlFor={`${idBase}-nc`}
        className={cn(
          "flex cursor-pointer items-center justify-between gap-3 rounded-lg border px-3 py-2.5",
          nc ? "border-danger/50 bg-danger-soft" : "border-border",
        )}
      >
        <span className="flex flex-col">
          <span className="font-medium">No conforme</span>
          <span className="text-xs text-muted-foreground">
            {nc ? (opcional ? "Marca la observación si aplica." : "Marca la observación de la hoja.") : "Apagado = conforme (C)."}
          </span>
        </span>
        <Switch id={`${idBase}-nc`} checked={nc} onCheckedChange={(si) => onCambio({ ...valor, conforme: !si })} />
      </label>

      {nc && (
        <>
          <fieldset className="flex flex-col gap-1.5">
            <legend className="mb-1.5 text-sm font-medium">
              Observación / desviación {opcional && <span className="font-normal text-muted-foreground">(opcional)</span>}
            </legend>
            {OBSERVACIONES.map((o) => {
              const marcada = valor.observacionCodigos.includes(o.codigo)
              const id = `${idBase}-obs-${o.codigo}`
              return (
                <label
                  key={o.codigo}
                  htmlFor={id}
                  className={cn(
                    "flex cursor-pointer items-center gap-3 rounded-md border px-3 py-2 text-sm",
                    marcada ? "border-danger/50 bg-danger-soft" : "border-border",
                  )}
                >
                  <Checkbox id={id} checked={marcada} onCheckedChange={(si) => marcar(o.codigo, si === true)} />
                  <span className="num w-4 font-semibold">{o.codigo}</span>
                  <span>{o.texto}</span>
                </label>
              )
            })}
          </fieldset>
          {valor.observacionCodigos.includes(7) && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${idBase}-otros`}>Otros: especifica</Label>
              <Input
                id={`${idBase}-otros`}
                value={valor.observacionOtros}
                placeholder="Describe la desviación"
                onChange={(e) => onCambio({ ...valor, observacionOtros: e.target.value })}
              />
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${idBase}-accion`}>
              Acción de corrección <span className="font-normal text-muted-foreground">(opcional)</span>
            </Label>
            <Textarea
              id={`${idBase}-accion`}
              value={valor.accionCorreccion}
              placeholder="Qué se hizo con la paleta"
              onChange={(e) => onCambio({ ...valor, accionCorreccion: e.target.value })}
            />
          </div>
        </>
      )}
    </div>
  )
}
