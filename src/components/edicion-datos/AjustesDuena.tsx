import { useState } from "react"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { guardarCalidadLibera, useCalidadLibera } from "@/lib/calidad"
import { guardarMantenimientoFinaliza, useMantenimientoFinaliza } from "@/lib/paradas"
import { CorreoMantenimiento } from "./CorreoMantenimiento"
import { EnlaceSheetMantenimiento } from "./EnlaceSheetMantenimiento"

/** Sección "Ajustes de planta" de Edición de Datos: solo la dueña. */
export function AjustesDuena({ usuario }: { usuario: string }) {
  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <div>
        <h2 className="text-xl font-semibold text-foreground">Ajustes de planta</h2>
      </div>
      <InterruptorCalidad usuario={usuario} />
      <InterruptorMantenimiento usuario={usuario} />
      <EnlaceSheetMantenimiento usuario={usuario} />
      <CorreoMantenimiento usuario={usuario} />
    </div>
  )
}

/**
 * "Calidad libera los lotes" en Aséptico (areas.calidad_libera, migración
 * 20261096). Encendido: el supervisor ya no libera, Calidad analiza y
 * libera (ver docs/plan-calidad.md).
 */
function InterruptorCalidad({ usuario }: { usuario: string }) {
  return (
    <InterruptorAjuste
      titulo="Calidad libera los lotes (Aséptico)"
      cargado={useCalidadLibera("ASEPTICO")}
      encendido="Encendido · solo Calidad libera"
      apagado="Apagado · el supervisor libera"
      confirmarEncender="Desde ahora solo Calidad libera los tanques de Aséptico, con análisis conforme. Los tanques En Preparación esperarán su análisis. Hazlo en un cambio de turno, con Calidad presente. ¿Encender?"
      confirmarApagar="El supervisor vuelve a liberar los tanques desde Preparación, sin análisis. Los análisis ya hechos quedan guardados. ¿Apagar?"
      guardar={(activo) => guardarCalidadLibera(usuario, "ASEPTICO", activo)}
    />
  )
}

/**
 * "Mantenimiento termina las fallas" en Aséptico (areas.mantenimiento_finaliza,
 * migración 20261112590000). Producción inicia la falla; encendido, la termina
 * Mantenimiento desde su página y la línea sigue sola. Apagado, la termina
 * Producción con Continuar.
 */
function InterruptorMantenimiento({ usuario }: { usuario: string }) {
  return (
    <InterruptorAjuste
      titulo="Mantenimiento termina las fallas (Aséptico)"
      cargado={useMantenimientoFinaliza("ASEPTICO")}
      encendido="Encendido · Producción inicia, Mantenimiento termina"
      apagado="Apagado · Producción inicia y termina"
      confirmarEncender="Desde ahora, una línea parada con «No sé / es una falla» solo sigue cuando Mantenimiento termina la falla desde su página. El supervisor ya no le da Continuar. Hazlo con Mantenimiento usando la app. ¿Encender?"
      confirmarApagar="El supervisor vuelve a terminar las fallas con Continuar. Mantenimiento solo les pone el código. ¿Apagar?"
      guardar={(activo) => guardarMantenimientoFinaliza(usuario, "ASEPTICO", activo)}
    />
  )
}

/** Interruptor de un ajuste de planta: pide confirmar antes de cambiar. */
function InterruptorAjuste({
  titulo,
  cargado,
  encendido: textoEncendido,
  apagado: textoApagado,
  confirmarEncender,
  confirmarApagar,
  guardar: guardarAjuste,
}: {
  titulo: string
  /** null mientras carga. */
  cargado: boolean | null
  encendido: string
  apagado: string
  confirmarEncender: string
  confirmarApagar: string
  guardar: (activo: boolean) => Promise<{ ok: true } | { ok: false; error: string }>
}) {
  const [valor, setValor] = useState<boolean | null>(null)
  const [confirmar, setConfirmar] = useState<boolean | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const encendido = valor ?? cargado

  async function guardar(activo: boolean) {
    setGuardando(true)
    setError(null)
    const r = await guardarAjuste(activo)
    setGuardando(false)
    setConfirmar(null)
    if (!r.ok) {
      setError(r.error)
      return
    }
    setValor(activo)
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm">
      <label className="flex cursor-pointer flex-wrap items-center gap-2">
        <Switch
          checked={encendido === true}
          disabled={encendido === null || guardando || confirmar !== null}
          onCheckedChange={(v) => setConfirmar(v)}
        />
        <span className="font-medium text-foreground">{titulo}</span>
        <span className="text-xs text-muted-foreground">{encendido === null ? "Cargando…" : encendido ? textoEncendido : textoApagado}</span>
      </label>
      {confirmar !== null && (
        <div className="flex flex-col gap-2 rounded-md border border-dashed border-border bg-background p-2">
          <p className="text-xs text-foreground">{confirmar ? confirmarEncender : confirmarApagar}</p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant={confirmar ? "default" : "destructive"} disabled={guardando} onClick={() => guardar(confirmar)}>
              {guardando ? <Loader2 className="size-3.5 animate-spin" /> : null}
              {confirmar ? "Sí, encender" : "Sí, apagar"}
            </Button>
            <Button size="sm" variant="ghost" disabled={guardando} onClick={() => setConfirmar(null)}>
              Cancelar
            </Button>
          </div>
        </div>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}
