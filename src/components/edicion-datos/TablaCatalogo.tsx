import { Pencil } from "lucide-react"
import { cn } from "@/lib/utils"
import { columnasTabla, type Campo, type ItemTabla, type Seccion } from "./tabla"

/** Tabla de un catálogo: encabezado fijo al bajar, grupos, números a la derecha y "Editar" en cada fila. */
export function TablaCatalogo({
  seccion,
  items,
  seleccionada,
  onEditar,
}: {
  seccion: Seccion
  items: ItemTabla[]
  seleccionada: string | null
  onEditar: (id: string) => void
}) {
  const columnas = columnasTabla(seccion)
  const grilla = { gridTemplateColumns: `${columnas.map((c) => c.ancho ?? "minmax(0, 1fr)").join(" ")} 104px` }
  const compacta = seccion.compacta

  return (
    <div className="max-h-[calc(100svh-15rem)] overflow-auto rounded-xl border border-border bg-card">
      <div className="min-w-[640px]">
        <div className="sticky top-0 z-10 grid border-b border-border bg-surface text-xs font-semibold text-muted-foreground" style={grilla}>
          {columnas.map((c) => (
            <div key={c.clave} className={cn("px-4 py-3", c.tipo === "numero" && "text-right")}>
              {c.etiqueta}
              {c.unidad && <span className="font-normal"> ({c.unidad})</span>}
            </div>
          ))}
          <div />
        </div>

        {items.map((item) =>
          item.tipo === "grupo" ? (
            <div
              key={`g-${item.clave}`}
              className={cn(
                "border-b border-border bg-muted/60 px-4 text-xs font-semibold tracking-wide text-foreground uppercase",
                compacta ? "py-1.5" : "py-2",
              )}
            >
              {item.etiqueta} <span className="font-normal tracking-normal text-muted-foreground normal-case">· {item.cantidad}</span>
            </div>
          ) : (
            <div
              key={item.fila.id}
              className={cn(
                "grid items-center border-b border-border/60",
                compacta ? "min-h-10 text-sm" : "min-h-12 text-base",
                seleccionada === item.fila.id ? "bg-info/10 shadow-[inset_3px_0_0_var(--info)]" : "hover:bg-muted/40",
                !item.fila.activo && "text-muted-foreground",
              )}
              style={grilla}
            >
              {item.celdas.map((texto, i) => (
                <Celda key={columnas[i].clave} campo={columnas[i]} texto={texto} primera={i === 0} inactiva={!item.fila.activo} />
              ))}
              <div className="px-2.5 text-right">
                <button
                  type="button"
                  onClick={() => onEditar(item.fila.id)}
                  aria-label={`Editar ${item.celdas[0] || ""}`}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-lg border border-info/30 bg-info-soft px-3 text-sm font-semibold text-info-foreground transition-colors hover:bg-info/20",
                    compacta ? "h-7 pointer-coarse:h-11" : "h-8 pointer-coarse:h-11",
                  )}
                >
                  <Pencil className="size-3.5" />
                  Editar
                </button>
              </div>
            </div>
          ),
        )}
      </div>
    </div>
  )
}

function Celda({ campo, texto, primera, inactiva }: { campo: Campo; texto: string; primera: boolean; inactiva: boolean }) {
  return (
    <div className={cn("truncate px-4", campo.tipo === "numero" && "text-right tabular-nums", primera && "font-semibold")}>
      <span className={cn(primera && inactiva && "line-through")}>{texto}</span>
      {primera && inactiva && <span className="ml-2 text-xs font-normal">· inactivo</span>}
    </div>
  )
}
