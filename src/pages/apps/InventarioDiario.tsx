import { useEffect, useState } from "react"
import { useSearchParams } from "react-router-dom"
import { ClipboardCheck, Loader2, Search, Warehouse } from "lucide-react"
import { AppShell } from "@/components/AppShell"
import { EmptyState } from "@/components/EmptyState"
import { FormInventarioDiario } from "@/components/inventario/FormInventarioDiario"
import { TablaSaldos } from "@/components/inventario/TablaSaldos"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useAuth } from "@/lib/auth"
import { inventarioReal, type AreaInventario, type FilaInventario } from "@/lib/inventario"
import { inventarioDemo } from "@/lib/inventarioDemo"
import { puede } from "@/lib/permisos"
import { cn } from "@/lib/utils"

/*
 * Inventario diario de materia prima (etapa 1): tambores y kits por
 * sabor. Lo que debería haber = último conteo − lo que usaron las
 * preparaciones desde entonces. La analista (o un jefe / supervisor) hace
 * el Inventario diario mañana y tarde: confirma o corrige y anota lo que
 * llegó. Migración 20261103.
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
  /** El Super Administrador elige el área (para probar en Pruebas); el resto ve la suya. */
  const eligeArea = session?.rol === "SUPERADMINISTRADOR"
  const [area, setArea] = useState<AreaInventario>("ASEPTICO")
  const areaPedida = eligeArea ? area : null
  const [filas, setFilas] = useState<FilaInventario[] | null>(null)
  const [contando, setContando] = useState(false)
  const [busqueda, setBusqueda] = useState("")
  const [version, setVersion] = useState(0)

  useEffect(() => {
    let vivo = true
    api.listar(usuario, areaPedida).then((f) => {
      if (vivo) setFilas(f)
    })
    return () => {
      vivo = false
    }
  }, [api, usuario, areaPedida, version])

  const texto = busqueda.trim().toLowerCase()
  const visibles = (filas ?? []).filter((f) => texto === "" || f.saborNombre.toLowerCase().includes(texto))
  const areaMostrada = filas?.[0]?.areaCodigo ?? areaPedida

  return (
    <AppShell title="Inventario diario" description="Materia prima: tambores y kits por sabor">
      <div className="flex flex-col gap-3">
        {demo && (
          <p className="rounded-lg border border-info/40 bg-info/10 px-3 py-2 text-sm text-info">
            Modo de muestra: datos inventados para ver la pantalla. No se guarda nada y se borra al recargar.
          </p>
        )}
        <div className="flex flex-wrap items-center gap-2">
          {eligeArea && (
            <div className="flex rounded-lg border border-border p-0.5">
              {(["ASEPTICO", "PRUEBAS"] as const).map((a) => (
                <button
                  key={a}
                  type="button"
                  onClick={() => {
                    if (a === area) return
                    setFilas(null)
                    setArea(a)
                    setContando(false)
                  }}
                  className={cn(
                    "rounded-md px-3 py-1 text-xs font-medium",
                    area === a ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {a === "ASEPTICO" ? "Aséptico" : "Área de Pruebas"}
                </button>
              ))}
            </div>
          )}
          {!eligeArea && areaMostrada === "PRUEBAS" && (
            <span className="rounded-full border border-warning/40 bg-warning-soft px-2.5 py-1 text-xs text-warning">Área de Pruebas</span>
          )}
          <div className="relative min-w-40 flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input className="h-9 pl-8" placeholder="Buscar sabor" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
          </div>
          {puedeCargar && !contando && filas && filas.length > 0 && (
            <Button onClick={() => setContando(true)}>
              <ClipboardCheck className="size-4" />
              Hacer inventario diario
            </Button>
          )}
        </div>

        {filas === null ? (
          <div className="flex justify-center py-12 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
          </div>
        ) : filas.length === 0 ? (
          <EmptyState icon={Warehouse} title="Sin sabores" description="No hay sabores activos para llevar inventario." />
        ) : contando ? (
          <FormInventarioDiario
            api={api}
            usuario={usuario}
            area={areaPedida}
            filas={visibles}
            onGuardado={() => {
              setContando(false)
              setVersion((v) => v + 1)
            }}
            onCancelar={() => setContando(false)}
          />
        ) : (
          <TablaSaldos api={api} usuario={usuario} area={areaPedida} filas={visibles} />
        )}
      </div>
    </AppShell>
  )
}
