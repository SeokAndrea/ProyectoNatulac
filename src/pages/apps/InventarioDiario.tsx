import { useEffect, useState } from "react"
import { useSearchParams } from "react-router-dom"
import { Loader2, Moon, Sun } from "lucide-react"
import { AppShell } from "@/components/AppShell"
import { FormInventario } from "@/components/inventario/FormInventario"
import { InventariosHechos } from "@/components/inventario/InventariosHechos"
import { SaldosInventario } from "@/components/inventario/SaldosInventario"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/lib/auth"
import { inventarioReal, type AreaInventario, type InventarioHecho, type ItemInventario, type Momento } from "@/lib/inventario"
import { inventarioDemo } from "@/lib/inventarioDemo"
import { puede } from "@/lib/permisos"

/*
 * Inventario diario (migración 20261103): "Inventario de la mañana" /
 * "de la tarde" en dos secciones, Materia prima (pulpa y kits por sabor)
 * y Material de empaque. Solo la pulpa baja sola con las preparaciones.
 *
 * ?demo=1: modo de muestra con datos inventados en memoria (inventarioDemo.ts),
 * para ver la pantalla sin la migración aplicada. No guarda nada.
 */
export default function InventarioDiario() {
  const { session } = useAuth()
  const usuario = session?.username ?? ""
  const demo = useSearchParams()[0].get("demo") === "1"
  const api = demo ? inventarioDemo : inventarioReal
  // En la muestra se puede contar aunque la base todavía no conozca el permiso nuevo.
  const puedeCargar = demo || puede(session ?? null, "INVENTARIO_CARGAR")
  /** Sin elegir área (dueña, 2026-10-26): la decide la base (area_de_inventario). */
  const areaPedida: AreaInventario | null = null
  const [items, setItems] = useState<ItemInventario[] | null>(null)
  const [hechos, setHechos] = useState<InventarioHecho[]>([])
  const [contando, setContando] = useState<Momento | null>(null)
  const [version, setVersion] = useState(0)

  useEffect(() => {
    let vivo = true
    Promise.all([api.listar(usuario, areaPedida), api.inventarios(usuario, areaPedida)]).then(([its, invs]) => {
      if (!vivo) return
      setItems(its)
      setHechos(invs)
    })
    return () => {
      vivo = false
    }
  }, [api, usuario, areaPedida, version])

  return (
    <AppShell title="Inventario diario" description="Materia prima y material de empaque">
      <div className="flex flex-col gap-4">
        {demo && (
          <p className="rounded-lg border border-info/40 bg-info/10 px-3 py-2 text-sm text-info">
            Modo de muestra: datos inventados para ver la pantalla. No se guarda nada y se borra al recargar.
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2">
          {puedeCargar && !contando && items && (
            <>
              <Button onClick={() => setContando("MANANA")}>
                <Sun className="size-4" />
                Inventario de la mañana
              </Button>
              <Button variant="outline" onClick={() => setContando("TARDE")}>
                <Moon className="size-4" />
                Inventario de la tarde
              </Button>
            </>
          )}
          {!puedeCargar && items && (
            <p className="text-sm text-muted-foreground">
              Para contar hace falta el permiso «Cargar el Inventario diario» (Analista, Jefe de Producción y Supervisor). Si te lo acaban de dar, recarga la página.
            </p>
          )}
        </div>

        {items === null ? (
          <div className="flex justify-center py-12 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
          </div>
        ) : contando ? (
          <FormInventario
            key={contando}
            api={api}
            usuario={usuario}
            area={areaPedida}
            momento={contando}
            items={items}
            onGuardado={() => {
              setContando(null)
              setVersion((v) => v + 1)
            }}
            onCancelar={() => setContando(null)}
          />
        ) : (
          <>
            <InventariosHechos inventarios={hechos} />
            <SaldosInventario api={api} usuario={usuario} area={areaPedida} items={items} />
          </>
        )}
      </div>
    </AppShell>
  )
}
