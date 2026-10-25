import { useMemo, useState } from "react"
import { Loader2, Plus, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { FilaCatalogo } from "@/lib/edicionDatos"
import { cn } from "@/lib/utils"
import { PanelEdicion } from "./PanelEdicion"
import { TablaCatalogo } from "./TablaCatalogo"
import { armarItems, filtrarFilas, type OpcionesExternas, type Seccion } from "./tabla"

/** Una sección de Edición de Datos: buscador, "Ver inactivos", "Agregar", la tabla y el panel de edición. */
export function SeccionCatalogo({
  seccion,
  filas,
  error,
  externas,
  usuario,
  onRecargar,
}: {
  seccion: Seccion
  /** null = cargando. */
  filas: FilaCatalogo[] | null
  error: string | null
  externas: OpcionesExternas
  usuario: string
  onRecargar: () => Promise<void>
}) {
  const [busqueda, setBusqueda] = useState("")
  const [verInactivos, setVerInactivos] = useState(false)
  /** Registro abierto en el panel: su id, "nuevo" o null (cerrado). */
  const [abierta, setAbierta] = useState<string | null>(null)

  const visibles = useMemo(
    () => (filas ? filtrarFilas(filas, seccion, externas, busqueda, verInactivos) : []),
    [filas, seccion, externas, busqueda, verInactivos],
  )
  const items = useMemo(() => armarItems(visibles, seccion, externas), [visibles, seccion, externas])
  const filaAbierta = abierta && abierta !== "nuevo" ? (filas?.find((f) => f.id === abierta) ?? null) : null
  const panelAbierto = abierta === "nuevo" || filaAbierta !== null

  async function despuesDeCambio() {
    await onRecargar()
    setAbierta(null)
  }

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-48 flex-1">
          <h2 className="text-xl font-semibold text-foreground">{seccion.titulo}</h2>
          <p className="text-sm text-muted-foreground">
            {filas ? `${visibles.length} de ${filas.length} registros` : "Cargando…"}
          </p>
        </div>
        <label className="flex h-10 min-w-56 pointer-coarse:h-11 items-center gap-2 rounded-lg border border-input bg-background px-3">
          <Search className="size-4 text-muted-foreground" />
          <span className="sr-only">Buscar</span>
          <input
            type="search"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar…"
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </label>
        <Button
          variant="outline"
          className={cn("h-10 pointer-coarse:h-11", verInactivos && "bg-muted")}
          aria-pressed={verInactivos}
          onClick={() => setVerInactivos((v) => !v)}
        >
          Ver inactivos
        </Button>
        {!seccion.sinAgregar && (
          <Button className="h-10 pointer-coarse:h-11" onClick={() => setAbierta("nuevo")}>
            <Plus className="size-4" />
            Agregar {seccion.singular}
          </Button>
        )}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1">
          {filas === null ? (
            <div className="flex items-center justify-center rounded-xl border border-border bg-card py-16 text-muted-foreground">
              <Loader2 className="size-5 animate-spin" />
            </div>
          ) : items.length === 0 ? (
            <div className="rounded-xl border border-border bg-card px-4 py-12 text-center text-sm text-muted-foreground">
              {busqueda ? `Nada coincide con «${busqueda}».` : "Todavía no hay registros."}
            </div>
          ) : (
            <TablaCatalogo seccion={seccion} items={items} seleccionada={abierta} onEditar={setAbierta} />
          )}
        </div>

        {panelAbierto && (
          <div className="order-first lg:order-none lg:w-[400px] lg:shrink-0">
            <PanelEdicion
              key={abierta}
              seccion={seccion}
              fila={filaAbierta}
              externas={externas}
              usuario={usuario}
              onCerrar={() => setAbierta(null)}
              onCambio={despuesDeCambio}
            />
          </div>
        )}
      </div>
    </div>
  )
}
