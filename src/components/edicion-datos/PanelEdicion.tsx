import { useState } from "react"
import { Loader2, Lock, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cambiarActivoCatalogo, guardarCatalogo, type FilaCatalogo } from "@/lib/edicionDatos"
import { useAccion } from "@/lib/useAccion"
import { cn } from "@/lib/utils"
import { leerFormulario, opcionesDe, textoCelda, valorParaFormulario, type Campo, type OpcionesExternas, type Seccion } from "./tabla"

/**
 * Panel de la derecha para editar (o crear, con fila null) un registro:
 * todos los campos, lo cambiado en azul, un solo Guardar y Desactivar con
 * confirmación. Lo que solo se escribe al crear sale con candado.
 */
export function PanelEdicion({
  seccion,
  fila,
  externas,
  usuario,
  onCerrar,
  onCambio,
}: {
  seccion: Seccion
  fila: FilaCatalogo | null
  externas: OpcionesExternas
  usuario: string
  onCerrar: () => void
  /** Después de guardar o (des)activar: recargar la tabla. */
  onCambio: (id: string) => void
}) {
  const esNuevo = fila === null
  const original = Object.fromEntries(seccion.campos.map((c) => [c.clave, valorParaFormulario(c, fila?.[c.clave] ?? defecto(c))]))
  const [borrador, setBorrador] = useState<Record<string, string>>(original)
  const [confirmar, setConfirmar] = useState(false)
  const { enviando, error, setError, ejecutar } = useAccion()

  const cambiados = seccion.campos.filter((c) => !(c.soloAlCrear && !esNuevo) && borrador[c.clave] !== original[c.clave])
  const titulo = esNuevo
    ? `Nuevo ${seccion.singular}`
    : textoCelda(seccion.campos[0], fila[seccion.campos[0].clave], externas)

  function cambiar(clave: string, valor: string) {
    setBorrador((b) => ({ ...b, [clave]: valor }))
    setError(null)
  }

  async function guardar() {
    const leido = leerFormulario(seccion, borrador, esNuevo)
    if (!leido.ok) return setError(leido.error)
    let id = fila?.id ?? ""
    const ok = await ejecutar(async () => {
      const r = await guardarCatalogo(usuario, seccion.id, fila?.id ?? null, leido.valores)
      if (r.ok) id = r.valor
      return r.ok ? { ok: true } : r
    })
    if (ok) onCambio(id)
  }

  async function cambiarActivo() {
    if (!fila) return
    const ok = await ejecutar(() => cambiarActivoCatalogo(usuario, seccion.id, fila.id, !fila.activo))
    setConfirmar(false)
    if (ok) onCambio(fila.id)
  }

  return (
    <aside aria-label={esNuevo ? `Nuevo ${seccion.singular}` : `Editar ${titulo}`} className="flex flex-col rounded-xl border border-border bg-card lg:sticky lg:top-4">
      <div className="flex items-start gap-3 border-b border-border px-5 py-4">
        <div className="min-w-0 flex-1">
          <p className="text-xs text-muted-foreground">{esNuevo ? "Nuevo" : `Editar ${seccion.singular}`}</p>
          <h2 className="truncate text-lg font-semibold text-foreground">{titulo}</h2>
        </div>
        <Button variant="outline" size="icon-sm" onClick={onCerrar} aria-label="Cerrar">
          <X className="size-4" />
        </Button>
      </div>

      <div className="flex flex-col gap-4 px-5 py-4">
        {seccion.campos.map((campo) => (
          <CampoFormulario
            key={campo.clave}
            campo={campo}
            valor={borrador[campo.clave] ?? ""}
            bloqueado={!!campo.soloAlCrear && !esNuevo}
            cambiado={cambiados.includes(campo)}
            externas={externas}
            onCambiar={(v) => cambiar(campo.clave, v)}
          />
        ))}
        {!esNuevo && fila.editado_en && (
          <p className="border-t border-dashed border-border pt-3 text-xs text-muted-foreground">
            Último cambio: {fila.editado_por_nombre ?? "—"} · {fechaHora(fila.editado_en)}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-3 border-t border-border px-5 py-4">
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex gap-2">
          <Button className="h-11 flex-1" onClick={guardar} disabled={enviando || cambiados.length === 0}>
            {enviando && <Loader2 className="size-4 animate-spin" />}
            {cambiados.length === 0
              ? "Sin cambios"
              : esNuevo
                ? "Agregar"
                : cambiados.length === 1
                  ? "Guardar 1 cambio"
                  : `Guardar ${cambiados.length} cambios`}
          </Button>
          <Button variant="outline" className="h-11" onClick={onCerrar} disabled={enviando}>
            Cancelar
          </Button>
        </div>
        {!esNuevo &&
          (confirmar ? (
            <div className="flex flex-wrap items-center gap-2 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger-foreground">
              <span className="min-w-0 flex-1">
                ¿{fila.activo ? "Desactivar" : "Reactivar"} «{titulo}»?
              </span>
              <Button size="sm" variant={fila.activo ? "destructive" : "default"} onClick={cambiarActivo} disabled={enviando}>
                Sí
              </Button>
              <Button size="sm" variant="outline" onClick={() => setConfirmar(false)} disabled={enviando}>
                No
              </Button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmar(true)}
              className={cn("self-start text-sm font-medium", fila.activo ? "text-destructive" : "text-info")}
            >
              {fila.activo ? "Desactivar" : "Reactivar"}
            </button>
          ))}
      </div>
    </aside>
  )
}

function CampoFormulario({
  campo,
  valor,
  bloqueado,
  cambiado,
  externas,
  onCambiar,
}: {
  campo: Campo
  valor: string
  bloqueado: boolean
  cambiado: boolean
  externas: OpcionesExternas
  onCambiar: (v: string) => void
}) {
  const id = `ed-${campo.clave}`
  const etiqueta = (
    <span className="text-sm font-semibold text-foreground">
      {campo.etiqueta}
      {campo.unidad && <span className="font-normal text-muted-foreground"> ({campo.unidad})</span>}
    </span>
  )

  if (bloqueado) {
    return (
      <div className="flex flex-col gap-1.5">
        {etiqueta}
        <div className="flex h-11 items-center gap-2 rounded-lg bg-muted px-3 text-base text-foreground">
          <Lock className="size-3.5 text-muted-foreground" />
          {textoCelda(campo, valor, externas)}
          <span className="ml-auto text-xs text-muted-foreground">No se cambia</span>
        </div>
      </div>
    )
  }

  if (campo.tipo === "opciones") {
    return (
      <div className="flex flex-col gap-1.5">
        {etiqueta}
        <div role="group" aria-label={campo.etiqueta} className="flex flex-wrap gap-1.5">
          {opcionesDe(campo, externas).map((o) => (
            <button
              key={o.valor}
              type="button"
              aria-pressed={valor === o.valor}
              onClick={() => onCambiar(o.valor)}
              className={cn(
                "h-9 rounded-lg border px-3 text-sm transition-colors",
                valor === o.valor ? "border-primary bg-primary text-primary-foreground" : "border-input bg-background hover:bg-muted",
              )}
            >
              {o.etiqueta}
            </button>
          ))}
        </div>
        {cambiado && campo.notaAlCambiar && <p className="text-xs text-warning-foreground">{campo.notaAlCambiar}</p>}
      </div>
    )
  }

  return (
    <label htmlFor={id} className="flex flex-col gap-1.5">
      {etiqueta}
      <Input
        id={id}
        value={valor}
        inputMode={campo.tipo === "numero" ? "decimal" : "text"}
        onChange={(e) => onCambiar(e.target.value)}
        className={cn("h-11 text-base", campo.tipo === "numero" && "text-right tabular-nums", cambiado && "border-info bg-info/5")}
      />
    </label>
  )
}

/** Valor con el que arranca un registro nuevo (ej. el redondeo de una bobina). */
function defecto(campo: Campo): unknown {
  if (campo.tipo !== "opciones" || !campo.opciones?.length) return null
  return campo.opciones[0].valor
}

function fechaHora(iso: string): string {
  return new Date(iso).toLocaleString("es-VE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })
}
