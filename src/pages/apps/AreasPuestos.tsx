import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Pencil, Plus } from "lucide-react"
import { AppShell } from "@/components/AppShell"
import { FormArea } from "@/components/personal/FormArea"
import { FormPuesto } from "@/components/personal/FormPuesto"
import { MatrizPermisos } from "@/components/personal/MatrizPermisos"
import { MenuAreas } from "@/components/personal/MenuAreas"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/lib/auth"
import { useCatalogosLive } from "@/lib/catalogosLive"
import { guardarPermisosPuestos, listarEstructura, type CambioMatriz, type Estructura } from "@/lib/estructura"

const PAGINA = "/areas-puestos"

type Panel = { que: "area"; codigo: string | null } | { que: "puesto"; id: string | null } | null

/* Áreas, puestos y matriz de permisos (maqueta B): menú de áreas, matriz del área y formularios a la derecha. */
export default function AreasPuestos() {
  const { session } = useAuth()
  const { recargar: recargarCatalogos } = useCatalogosLive()
  const usuario = session?.username ?? ""
  const [estructura, setEstructura] = useState<Estructura | null>(null)
  const [fallo, setFallo] = useState(false)
  const [sinRefrescar, setSinRefrescar] = useState(false)
  const estructuraRef = useRef<Estructura | null>(null)
  const [elegida, setElegida] = useState<string | null>(null)
  const [panel, setPanel] = useState<Panel>(null)

  const cargar = useCallback(async () => {
    if (!usuario) return
    const e = await listarEstructura(usuario)
    // Si la recarga falla se deja lo que ya hay en pantalla (y los avisos de guardado).
    if (e) {
      setEstructura(e)
      setFallo(false)
      setSinRefrescar(false)
    } else {
      setSinRefrescar(true)
      setFallo((previo) => previo || estructuraRef.current === null)
    }
  }, [usuario])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial desde la base
    void cargar()
  }, [cargar])

  useEffect(() => {
    estructuraRef.current = estructura
  }, [estructura])

  const areas = estructura?.areas ?? []
  const areaCodigo = elegida ?? areas[0]?.codigo ?? null
  const area = areas.find((a) => a.codigo === areaCodigo) ?? null
  const puestosDelArea = useMemo(() => (estructura?.puestos ?? []).filter((p) => p.areaCodigo === areaCodigo), [estructura, areaCodigo])
  const puestoAbierto = panel?.que === "puesto" && panel.id ? (puestosDelArea.find((p) => p.id === panel.id) ?? null) : null

  async function guardarMatriz(cambios: CambioMatriz[]) {
    const r = await guardarPermisosPuestos(usuario, cambios, PAGINA)
    if (!r.ok) return r
    await cargar() // si falla, la matriz conserva lo marcado y el aviso de guardado
    return { ok: true }
  }

  return (
    <AppShell title="Áreas y puestos" description="Áreas, puestos y qué puede hacer cada puesto" fullWidth>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <MenuAreas
          areas={areas.map((a) => ({ codigo: a.codigo, nombre: a.nombre, activo: a.activo, personas: a.personas }))}
          actual={areaCodigo ?? ""}
          onElegir={(codigo) => {
            setElegida(codigo)
            setPanel(null)
          }}
          onNueva={() => setPanel({ que: "area", codigo: null })}
          sinEnlaceAdministracion
        />

        <div className="flex min-w-0 flex-1 flex-col gap-4">
          {sinRefrescar && estructura && <p className="text-sm text-destructive">No se pudo actualizar la lista. Lo guardado está a salvo; recarga la página para verlo.</p>}
          {fallo ? (
            <p className="rounded-xl border border-border bg-card px-4 py-6 text-sm text-foreground">No se pudo leer la estructura. Revisa la conexión e intenta de nuevo.</p>
          ) : !estructura ? (
            <p className="text-sm text-foreground">Cargando…</p>
          ) : !area ? (
            <p className="rounded-xl border border-border bg-card px-4 py-6 text-sm text-foreground">Todavía no hay áreas. Crea una con «+ Área».</p>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-3">
                <div className="min-w-48 flex-1">
                  <h2 className="text-xl font-semibold text-foreground">{area.nombre}</h2>
                  <p className="text-sm text-foreground">
                    {area.tipo === "APOYO" ? "Apoyo" : "Producción"} · {area.activo ? "activa" : "inactiva"} · {area.personas} {area.personas === 1 ? "persona" : "personas"}
                  </p>
                </div>
                <Button variant="outline" onClick={() => setPanel({ que: "area", codigo: area.codigo })}>
                  <Pencil className="size-4" />
                  Editar área
                </Button>
                <Button onClick={() => setPanel({ que: "puesto", id: null })}>
                  <Plus className="size-4" />
                  Puesto
                </Button>
              </div>
              <MatrizPermisos
                key={area.codigo}
                puestos={puestosDelArea}
                permisos={estructura.permisos}
                onGuardar={guardarMatriz}
                onEditarPuesto={(p) => setPanel({ que: "puesto", id: p.id })}
              />
            </>
          )}
        </div>

        {panel?.que === "area" && (
          <FormArea
            key={panel.codigo ?? "nueva"}
            area={panel.codigo ? (areas.find((a) => a.codigo === panel.codigo) ?? null) : null}
            usuario={usuario}
            pagina={PAGINA}
            onCerrar={() => setPanel(null)}
            onGuardada={async (codigo) => {
              setPanel(null)
              setElegida(codigo)
              // El catálogo vivo (menú de Personal, tipo de área) se refresca sin recargar la página.
              await Promise.all([cargar(), recargarCatalogos()])
            }}
          />
        )}
        {panel?.que === "puesto" && area && (panel.id === null || puestoAbierto) && (
          <FormPuesto
            key={panel.id ?? "nuevo"}
            puesto={puestoAbierto}
            areaCodigo={area.codigo}
            nombreArea={area.nombre}
            usuario={usuario}
            pagina={PAGINA}
            onCerrar={() => setPanel(null)}
            onGuardado={async () => {
              setPanel(null)
              await cargar()
            }}
          />
        )}
      </div>
    </AppShell>
  )
}
