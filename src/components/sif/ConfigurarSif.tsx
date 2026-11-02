import { useEffect, useState } from "react"
import { Loader2, Minus, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { CONFIG_SIF_POR_DEFECTO, errorConfigSif, fraseControlSif, guardarConfigSif, VENTANAS_SIF, type ConfigSif } from "@/lib/sif"
import { cn } from "@/lib/utils"
import { ErrorSif } from "./ErrorSif"

const PAGINA = "Solicitudes de Intervención"

/** Un número entero con – y + (44 px para el dedo) y el campo para escribirlo. */
function ContadorVeces({ id, etiqueta, valor, onCambio }: { id: string; etiqueta: string; valor: number; onCambio: (n: number) => void }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{etiqueta}</Label>
      <div className="flex items-center gap-2">
        <Button type="button" variant="outline" className="size-11 shrink-0 p-0" aria-label={`Una vez menos: ${etiqueta}`} onClick={() => onCambio(valor - 1)}>
          <Minus className="size-4" />
        </Button>
        <Input
          id={id}
          type="number"
          inputMode="numeric"
          className="h-11 w-20 text-center text-base num"
          value={Number.isNaN(valor) ? "" : valor}
          onChange={(e) => onCambio(e.target.value === "" ? Number.NaN : Number(e.target.value))}
        />
        <Button type="button" variant="outline" className="size-11 shrink-0 p-0" aria-label={`Una vez más: ${etiqueta}`} onClick={() => onCambio(valor + 1)}>
          <Plus className="size-4" />
        </Button>
      </div>
    </div>
  )
}

interface Props {
  abierto: boolean
  onCerrar: () => void
  usuario: string
  /** Área que se está configurando. */
  area: string
  /** Lo guardado hoy para esa área. */
  config: ConfigSif | null
  /** La lectura de esa área falló: no se muestra ni se guarda nada hasta que salga bien. */
  errorLectura?: string | null
  onReintentar?: () => void
  /** Áreas de producción para elegir (solo quien administra todo); con una sola o ninguna no se muestra el selector. */
  areas?: { codigo: string; nombre: string }[]
  onCambiarArea?: (codigo: string) => void
  /** Se llamó a guardar y salió bien. */
  onGuardado: () => void
}

/** Panel «Configurar SIF»: ventana, a la cuántas veces es Inspección y a la cuántas Intervención. */
export function ConfigurarSif({ abierto, onCerrar, usuario, area, config, errorLectura, onReintentar, areas, onCambiarArea, onGuardado }: Props) {
  const [borrador, setBorrador] = useState<ConfigSif>(config ?? CONFIG_SIF_POR_DEFECTO)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Al abrir (o cambiar de área) se parte de lo guardado.
  useEffect(() => {
    if (abierto) {
      setBorrador(config ?? CONFIG_SIF_POR_DEFECTO)
      setError(null)
    }
  }, [abierto, config, area])

  const sinLectura = config === null
  const aviso = errorConfigSif(borrador)

  async function guardar() {
    setGuardando(true)
    setError(null)
    const r = await guardarConfigSif(usuario, area, borrador, PAGINA)
    setGuardando(false)
    if (!r.ok) return setError(r.error)
    onGuardado()
  }

  return (
    <Dialog open={abierto} onOpenChange={(o) => !o && !guardando && onCerrar()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Configurar SIF</DialogTitle>
          <DialogDescription className="text-foreground">Cuántas veces se repite la misma falla en una línea para generar cada solicitud.</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          {areas && areas.length > 1 && (
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">Área</span>
              <div role="group" aria-label="Área" className="flex flex-wrap gap-2">
                {areas.map((a) => (
                  <Button
                    key={a.codigo}
                    type="button"
                    variant={a.codigo === area ? "default" : "outline"}
                    aria-pressed={a.codigo === area}
                    className="min-h-11"
                    disabled={guardando}
                    onClick={() => onCambiarArea?.(a.codigo)}
                  >
                    {a.nombre}
                  </Button>
                ))}
              </div>
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Ventana en que se cuentan</span>
            <div role="group" aria-label="Ventana" className="grid grid-cols-3 gap-2">
              {VENTANAS_SIF.map((v) => (
                <Button
                  key={v.codigo}
                  type="button"
                  variant={borrador.ventana === v.codigo ? "default" : "outline"}
                  aria-pressed={borrador.ventana === v.codigo}
                  className={cn("min-h-11 px-2")}
                  onClick={() => setBorrador({ ...borrador, ventana: v.codigo })}
                >
                  {v.boton}
                </Button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 min-[420px]:grid-cols-2">
            <ContadorVeces id="sif-inspeccion" etiqueta="Inspección a la N.ª vez" valor={borrador.inspeccionEn} onCambio={(n) => setBorrador({ ...borrador, inspeccionEn: n })} />
            <ContadorVeces id="sif-intervencion" etiqueta="Intervención a la N.ª vez" valor={borrador.intervencionEn} onCambio={(n) => setBorrador({ ...borrador, intervencionEn: n })} />
          </div>

          <p className="rounded-lg bg-muted px-3 py-2.5 text-sm font-medium text-foreground" aria-live="polite" data-testid="frase-control">
            {Number.isNaN(borrador.inspeccionEn) || Number.isNaN(borrador.intervencionEn) ? "Escribe los dos números." : fraseControlSif(borrador)}
          </p>
          {errorLectura && <ErrorSif mensaje={`No se pudo leer la configuración de esta área. ${errorLectura}`} accion="Reintentar" onAccion={onReintentar} />}
          {!sinLectura && aviso && <ErrorSif mensaje={aviso} />}
          <p className="text-sm text-foreground">Aplica a las fallas desde ahora; las solicitudes que ya existen no cambian.</p>
          {error && <ErrorSif mensaje={error} />}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button type="button" variant="outline" className="min-h-11" disabled={guardando} onClick={onCerrar}>
            Cancelar
          </Button>
          <Button type="button" className="min-h-11" disabled={guardando || sinLectura || aviso !== null} onClick={() => void guardar()}>
            {guardando && <Loader2 className="size-4 animate-spin" />}
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
