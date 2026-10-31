import { useMemo, useState } from "react"
import { Search } from "lucide-react"
import { Input } from "@/components/ui/input"
import { gruposOtrasParadas } from "@/lib/otrasParadas"
import { codigoPlanilla } from "@/lib/paradas"
import { useCatalogoParadas, useErrorCatalogo } from "@/lib/paradasCatalogo"
import { tienePalabras } from "@/lib/texto"
import { cn } from "@/lib/utils"
import { COLUMNAS_TIPOS, FilaTipoParada } from "./FilaTipoParada"
import { FormNuevaParada } from "./FormNuevaParada"

/**
 * Pestaña «Otras paradas» del Catálogo: las que no son fallas de equipo (PP,
 * LNPE, OP, S…), en una franja por grupo de código. Arriba se agregan; el
 * código y la clase salen solos. Guarda en paradas_tipos como siempre.
 */
export function OtrasParadas({ usuario, editable, pagina }: { usuario: string; editable: boolean; pagina: string }) {
  const todos = useCatalogoParadas()
  const errorCatalogo = useErrorCatalogo()
  const [busqueda, setBusqueda] = useState("")
  const [verInactivas, setVerInactivas] = useState(false)

  const gruposTodos = useMemo(() => gruposOtrasParadas(todos), [todos])
  const grupos = useMemo(
    () =>
      gruposOtrasParadas(todos, verInactivas)
        .map((g) => ({ ...g, tipos: g.tipos.filter((t) => tienePalabras(`${t.nombre} ${t.prefijoPlanilla ? codigoPlanilla(t, "LINEA_1") : ""} ${g.nombre}`, busqueda)) }))
        .filter((g) => g.tipos.length > 0),
    [todos, verInactivas, busqueda],
  )

  return (
    <div className="flex flex-col gap-4">
      {editable && (
        <section aria-labelledby="op-titulo-agregar" className="flex flex-col gap-3 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
          <h2 id="op-titulo-agregar" className="font-semibold text-foreground">
            Agregar
          </h2>
          <FormNuevaParada grupos={gruposTodos} todos={todos} usuario={usuario} pagina={pagina} />
        </section>
      )}

      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input type="search" aria-label="Buscar parada" placeholder="Buscar parada o código" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} className="pl-8" />
      </div>
      <label className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <input type="checkbox" checked={verInactivas} onChange={(e) => setVerInactivas(e.target.checked)} />
        Mostrar inactivas
      </label>
      {errorCatalogo && <p className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger-foreground">{errorCatalogo}</p>}

      {grupos.length === 0 ? (
        <p className="rounded-xl bg-card p-4 text-sm text-muted-foreground ring-1 ring-foreground/10">
          {busqueda.trim() ? `Nada coincide con «${busqueda.trim()}».` : "Cargando…"}
        </p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <div className={cn(COLUMNAS_TIPOS, "hidden gap-x-3 border-b border-border bg-surface px-3 py-2.5 text-xs font-semibold text-muted-foreground sm:grid")}>
            <span>Código (Línea 1)</span>
            <span>Parada</span>
            <span>Tiempo guía</span>
          </div>
          {grupos.map((g) => (
            <section key={g.clave} aria-label={g.nombre} className="border-b border-border last:border-b-0">
              <div className="flex flex-wrap items-baseline gap-x-2 border-b border-border/60 bg-muted/60 px-3 py-2">
                <span className="text-sm font-semibold text-foreground">{g.nombre}</span>
                <span className="text-xs text-muted-foreground">{g.cuenta}</span>
                <span className="num ml-auto text-xs text-muted-foreground">{g.tipos.length}</span>
              </div>
              <ul className="divide-y divide-border/60">
                {g.tipos.map((t) => (
                  <li key={t.codigo}>
                    <FilaTipoParada tipo={t} usuario={usuario} pagina={pagina} editable={editable} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
