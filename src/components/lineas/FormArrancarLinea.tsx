import { useEffect, useState } from "react"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { nombrePorCodigo, type LineaCodigo, type PresentacionCodigo } from "@/lib/catalogos"
import { presentacionesPorLineaLive, velocidadesParaLive, type PresentacionLive, type VelocidadLive } from "@/lib/catalogosLive"
import { obtenerUltimaConfiguracionLinea } from "@/lib/lineas"
import type { TanqueRecepcion } from "@/lib/preparacion/tipos"
import type { Corrida } from "@/lib/produccion/tipos"
import { MensajeError } from "@/components/MensajeError"
import type { AccionesLinea } from "./tipos"
import { useAccion } from "@/lib/useAccion"

/**
 * Formulario de Activar/Cambiar corrida — compartido entre Preparación
 * y el "Corregir"/"Editar" de Status. En Status, guardar además
 * cuenta como revisión (confirmarInicio) — la corrida nueva que
 * reemplaza a la anterior nace ya confirmada, en vez de quedar
 * pendiente de revisar de nuevo apenas se corrige.
 *
 * Paso 1: llenar el formulario y pasar al resumen. Paso 2: mandar
 * (cambio brusco → confirmar dos veces).
 */
export function FormArrancarLinea({
  lineaCodigo,
  nombreLinea,
  areaCodigo,
  corridaActual,
  confirmarInicio,
  tanquesListos,
  presentaciones,
  velocidades,
  activar,
  onCerrar,
}: {
  lineaCodigo: LineaCodigo
  nombreLinea: string
  areaCodigo: string | null
  /** La corrida que se corrige (Status), o null si se arranca una nueva. */
  corridaActual: Corrida | null
  confirmarInicio: boolean
  tanquesListos: TanqueRecepcion[]
  presentaciones: PresentacionLive[]
  velocidades: VelocidadLive[]
  activar: AccionesLinea["activar"]
  onCerrar: () => void
}) {
  const [presentacion, setPresentacion] = useState<PresentacionCodigo | "">(corridaActual?.presentacion ?? "")
  const [envasesHora, setEnvasesHora] = useState<number | "">(corridaActual?.envasesHora ?? "")
  const [numeroTanque, setNumeroTanque] = useState<1 | 2 | 3 | "">("")
  const [confirmar, setConfirmar] = useState(false)
  const { enviando, error, ejecutar } = useAccion()

  const presentacionesDisponibles = presentacionesPorLineaLive(velocidades, lineaCodigo)
  const opcionesVelocidad = presentacion ? velocidadesParaLive(velocidades, lineaCodigo, presentacion) : []
  const tanqueElegido = tanquesListos.find((t) => t.numeroTanque === numeroTanque) ?? null
  const valido = presentacion !== "" && envasesHora !== "" && numeroTanque !== ""

  /*
   * Sin corrida que corregir, prellena presentación/velocidad con lo
   * ÚLTIMO que esa línea usó (plan-rework-tanques-lineas-recepcion.md
   * §12) — así el supervisor no tiene que retipear lo mismo cada vez que
   * arranca una corrida nueva. Solo si el valor sigue siendo válido para
   * esta línea (el catálogo pudo haber cambiado). Se lee una vez, al abrir.
   */
  useEffect(() => {
    if (corridaActual || !areaCodigo) return
    let vigente = true
    void obtenerUltimaConfiguracionLinea(areaCodigo, lineaCodigo).then((ultima) => {
      if (!vigente || !ultima || ultima.presentacionVolumenMl === null) return
      const codigo = String(ultima.presentacionVolumenMl)
      if (!presentacionesPorLineaLive(velocidades, lineaCodigo).includes(codigo)) return
      setPresentacion(codigo)
      if (ultima.envasesHora === null) return
      if (velocidadesParaLive(velocidades, lineaCodigo, codigo).some((o) => o.envasesHora === ultima.envasesHora)) {
        setEnvasesHora(ultima.envasesHora)
      }
    })
    return () => {
      vigente = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al abrir el formulario
  }, [])

  async function guardar() {
    if (presentacion === "" || envasesHora === "" || numeroTanque === "") return
    if (!confirmar) {
      setConfirmar(true)
      return
    }
    const ok = await ejecutar(() =>
      activar({ linea: lineaCodigo, presentacion, envasesHora: Number(envasesHora), numeroTanque, confirmarInicio }),
    )
    if (ok) onCerrar()
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-dashed border-border p-3">
      <div className="grid grid-cols-2 gap-2">
        <Select value={numeroTanque === "" ? "" : String(numeroTanque)} onValueChange={(v) => setNumeroTanque(Number(v) as 1 | 2 | 3)}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder={tanquesListos.length === 0 ? "Ningún tanque Listo" : "Tanque"} />
          </SelectTrigger>
          <SelectContent>
            {tanquesListos.length === 0 ? (
              <SelectItem value="__ninguno" disabled>
                Ningún tanque está Listo (liberado) todavía
              </SelectItem>
            ) : (
              tanquesListos.map((t) => (
                <SelectItem key={t.numeroTanque} value={String(t.numeroTanque)}>
                  Tanque {t.numeroTanque} · {t.saborNombre ?? "Sin sabor"}
                  {t.lote ? ` · Lote ${t.lote}` : ""}
                </SelectItem>
              ))
            )}
          </SelectContent>
        </Select>

        <Select
          value={presentacion}
          onValueChange={(v) => {
            setPresentacion(v)
            setEnvasesHora("")
          }}
          disabled={presentacionesDisponibles.length === 0}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder={presentacionesDisponibles.length === 0 ? "Sin datos" : "Presentación"} />
          </SelectTrigger>
          <SelectContent>
            {presentacionesDisponibles.map((codigo) => (
              <SelectItem key={codigo} value={codigo}>
                {nombrePorCodigo(presentaciones, codigo)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={envasesHora === "" ? "" : String(envasesHora)}
          onValueChange={(v) => setEnvasesHora(Number(v))}
          disabled={!presentacion || opcionesVelocidad.length === 0}
        >
          <SelectTrigger className="col-span-2 w-full">
            <SelectValue placeholder="Velocidad" />
          </SelectTrigger>
          <SelectContent>
            {opcionesVelocidad.map((v) => (
              <SelectItem key={v.envasesHora} value={String(v.envasesHora)}>
                {v.envasesHora} env/h · {v.litrosHora} L/h
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {tanqueElegido && (
        <p className="text-xs text-muted-foreground">
          Toma {tanqueElegido.saborNombre ?? "sin sabor"}
          {tanqueElegido.lote ? ` · Lote ${tanqueElegido.lote}` : ""} del Tanque {tanqueElegido.numeroTanque}.
        </p>
      )}

      {confirmar && valido && tanqueElegido && (
        <p className="rounded-md bg-muted/60 p-2 text-xs text-foreground">
          Vas a arrancar <span className="font-medium">{nombreLinea}</span> con{" "}
          <span className="font-medium">{tanqueElegido.saborNombre ?? "sin sabor"}</span>
          {tanqueElegido.lote ? ` · Lote ${tanqueElegido.lote}` : ""} del Tanque {tanqueElegido.numeroTanque}, a {presentacion} ml ·{" "}
          {envasesHora} env/h. ¿Confirmar?
        </p>
      )}

      <MensajeError error={error} />

      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={!valido || enviando} onClick={guardar}>
          {enviando ? <Loader2 className="size-3.5 animate-spin" /> : null}
          {confirmar ? "Sí, arrancar línea" : "Arrancar línea"}
        </Button>
        <Button size="sm" variant="ghost" onClick={onCerrar}>
          Cancelar
        </Button>
      </div>
    </div>
  )
}
