import { useEffect, useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { AlertTriangle, ClipboardCheck, FileText, Loader2, Square } from "lucide-react"
import { AppShell } from "@/components/AppShell"
import { ConfirmarEstadoTanque } from "@/components/ConfirmarEstadoTanque"
import { EmptyState } from "@/components/EmptyState"
import { ResumenTurno } from "@/components/ResumenTurno"
import { ListaContadores } from "@/components/ListaContadores"
import { ActaTurno } from "@/components/ActaTurno"
import { SeccionColapsable } from "@/components/SeccionColapsable"
import { Button } from "@/components/ui/button"
import { nombrePorCodigo } from "@/lib/catalogos"
import { useCatalogosLive } from "@/lib/catalogosLive"
import { useAuth } from "@/lib/auth"
import { listarSabores, type Sabor } from "@/lib/sabores"
import { useTurno } from "@/lib/turno"

/*
 * Finalizar Turno: el resumen formal del turno en curso (datos fijos
 * + todos los contadores de Contadores y Merma por línea, con sus
 * mermas y justificaciones) para revisar antes de cerrar — funciona
 * como el acta del turno. El cierre hace un UPDATE real en la tabla
 * "turnos" de Supabase (estado = 'CERRADO', ver finalizar_turno() en
 * supabase/migrations/20260825090000_conectar_turnos.sql).
 *
 * No hay una tarjeta de Checklist propia — si falta algo al apretar
 * "Finalizar Turno", se avisa ahí mismo (con un segundo clic para
 * confirmar igual), en vez de ocupar una tarjeta todo el tiempo. Las
 * demás secciones son colapsables (SeccionColapsable): cerradas por
 * defecto, un clic las abre si hace falta revisarlas.
 *
 * "Generar Acta (PDF)" usa la impresión del navegador (ver
 * src/components/ActaTurno.tsx) — no genera el PDF ella misma, abre
 * el diálogo de impresión, donde "Guardar como PDF" hace el resto.
 */
export default function FinalizarTurno() {
  const { turnoActivo, cargando, finalizarTurno, cambiarCondicionTanque, confirmarEstadoTanque } = useTurno()
  const { session } = useAuth()
  const { lineas, presentaciones } = useCatalogosLive()
  const navigate = useNavigate()
  const [finalizando, setFinalizando] = useState(false)
  const [confirmando, setConfirmando] = useState(false)
  const [sabores, setSabores] = useState<Sabor[]>([])

  useEffect(() => {
    listarSabores().then((lista) => setSabores(lista.filter((s) => s.activo)))
  }, [])

  if (cargando) {
    return (
      <AppShell title="Finalizar Turno" description="Resumen y cierre del turno">
        <div className="flex justify-center py-16 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" />
        </div>
      </AppShell>
    )
  }

  if (!turnoActivo) {
    return (
      <AppShell title="Finalizar Turno" description="Resumen y cierre del turno">
        <EmptyState
          icon={ClipboardCheck}
          title="No hay ningún turno en curso"
          description="Todavía no iniciaste un turno para finalizar. Inicia uno desde Comenzar Turno."
        />
        <div className="mt-4 flex justify-center">
          <Button asChild>
            <Link to="/turno">Ir a Comenzar Turno</Link>
          </Button>
        </div>
      </AppShell>
    )
  }

  /*
   * Lo que "debería" tener el acta de fin de turno — hoy cubre
   * Preparaciones, Contadores y Producto Terminado (lo que ya
   * existe). Ya no incluye "Recepción": tanques y líneas son estado
   * continuo y todo turno nace con los 3 tanques ya creados, así que
   * esa condición era siempre verdadera.
   */
  const itemsFaltantes = [
    ...turnoActivo.tanques
      .filter((t) => t.condicion === "EN_PREPARACION")
      .filter((t) => !turnoActivo.preparaciones.some((p) => p.numeroTanque === t.numeroTanque))
      .map((t) => `Preparación — Tanque ${t.numeroTanque}`),
    ...turnoActivo.tanques.filter((t) => !t.confirmadoFinEn).map((t) => `Estado final — Tanque ${t.numeroTanque} sin confirmar`),
    ...turnoActivo.lineas
      .filter((l) => !turnoActivo.contadores.some((c) => c.turnoLineaId === l.id))
      .map((l) => `Contadores — ${nombrePorCodigo(lineas, l.linea)}${l.lote ? ` (Lote ${l.lote})` : ""}`),
    ...turnoActivo.lineas
      .filter((l) => !turnoActivo.productoTerminado.some((p) => p.turnoLineaId === l.id))
      .map((l) => `Producto Terminado — ${nombrePorCodigo(lineas, l.linea)}${l.lote ? ` (Lote ${l.lote})` : ""}`),
  ]

  async function handleFinalizar() {
    if (itemsFaltantes.length > 0 && !confirmando) {
      setConfirmando(true)
      return
    }
    setFinalizando(true)
    await finalizarTurno()
    navigate("/hub", { replace: true })
  }

  return (
    <AppShell title="Finalizar Turno" description={`Turno ${turnoActivo.codigo}`}>
      <div className="mx-auto flex max-w-5xl flex-col gap-4 print:hidden">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <SeccionColapsable titulo="Datos del turno">
            <ResumenTurno turno={turnoActivo} />
          </SeccionColapsable>

          <SeccionColapsable
            titulo="Estado final de tanques"
            descripcion="Confirmá o corregí el estado de cada tanque antes de cerrar el turno."
            abiertoPorDefecto={turnoActivo.tanques.some((t) => !t.confirmadoFinEn)}
          >
            <div className="flex flex-col gap-2">
              {turnoActivo.tanques.map((t) => (
                <ConfirmarEstadoTanque
                  key={t.numeroTanque}
                  tanque={t}
                  sabores={sabores}
                  momento="FIN"
                  onConfirmar={() => confirmarEstadoTanque(t.numeroTanque, "FIN")}
                  onGuardarEdicion={(datos) => cambiarCondicionTanque({ ...datos, momento: "FIN" })}
                />
              ))}
              {turnoActivo.tanques.every((t) => t.confirmadoFinEn) && (
                <p className="text-sm text-muted-foreground">Los 3 tanques ya tienen su estado final confirmado.</p>
              )}
            </div>
          </SeccionColapsable>

          {turnoActivo.tanques.some((t) => t.condicion === "EN_PREPARACION") && (
            <SeccionColapsable titulo="Preparaciones" descripcion="Tambores y ajustes cargados por tanque.">
              {turnoActivo.preparaciones.length === 0 ? (
                <p className="text-sm text-muted-foreground">Todavía no se cargó ninguna preparación en este turno.</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {turnoActivo.preparaciones.map((p) => (
                    <div key={p.id} className="rounded-lg border border-border px-3 py-2 text-sm">
                      <p className="font-medium text-foreground">
                        Tanque {p.numeroTanque} · {p.saborNombre ?? "Sin sabor"}
                        {p.lote ? ` · Lote ${p.lote}` : ""}
                      </p>
                      <p className="text-muted-foreground">
                        {p.tambores} tambores
                        {p.agua !== null ? ` · Agua ${p.agua} L` : ""}
                        {p.azucar !== null ? ` · Azúcar ${p.azucar} kg` : ""}
                        {p.acidoCitrico !== null ? ` · Ácido cítrico ${p.acidoCitrico} kg` : ""}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </SeccionColapsable>
          )}

          <SeccionColapsable
            titulo="Contadores por línea"
            descripcion="Envases de la llenadora registrados durante este turno."
          >
            {turnoActivo.contadores.length === 0 ? (
              <p className="text-sm text-muted-foreground">Todavía no se cargó ningún contador en este turno.</p>
            ) : (
              <ListaContadores contadores={turnoActivo.contadores} productoTerminado={turnoActivo.productoTerminado} mostrarTotales />
            )}
          </SeccionColapsable>

          <SeccionColapsable
            titulo="Producto Terminado por línea"
            descripcion="Paletas y cajas sueltas (resto) registradas en Producto Terminado."
          >
            {turnoActivo.productoTerminado.length === 0 ? (
              <p className="text-sm text-muted-foreground">Todavía no se cargó Producto Terminado en este turno.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {turnoActivo.productoTerminado.map((p) => {
                  const cajasXPaleta = presentaciones.find((pr) => pr.codigo === p.presentacion)?.cajasXPaleta ?? 0
                  const cajasTotales = p.paletas * cajasXPaleta + p.cajasSueltas
                  return (
                    <div
                      key={p.linea}
                      className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 text-sm"
                    >
                      <div>
                        <p className="font-medium text-foreground">{nombrePorCodigo(lineas, p.linea)}</p>
                        <p className="text-muted-foreground">
                          {p.saborNombre ?? "Sin sabor"} · {p.paletas} paletas · {p.cajasSueltas} cajas sueltas
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-medium text-foreground">{cajasTotales.toLocaleString("es-CO")} cajas</p>
                        <p className="text-xs text-muted-foreground">{p.litrosProducidos.toLocaleString("es-CO")} L</p>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </SeccionColapsable>
        </div>

        {confirmando && itemsFaltantes.length > 0 && (
          <div className="flex flex-col gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
            <p className="flex items-center gap-1.5 font-medium">
              <AlertTriangle className="size-4 shrink-0" />
              Falta cargar {itemsFaltantes.length} cosa{itemsFaltantes.length === 1 ? "" : "s"}:
            </p>
            <ul className="list-inside list-disc pl-1">
              {itemsFaltantes.map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex flex-col gap-3 sm:flex-row">
          <Button variant="outline" className="sm:flex-1" onClick={() => window.print()}>
            <FileText className="size-4" />
            Generar Acta (PDF)
          </Button>

          <Button
            variant="outline"
            className="border-destructive/40 text-destructive hover:bg-destructive/10 sm:flex-1"
            onClick={handleFinalizar}
            disabled={finalizando}
          >
            {finalizando ? <Loader2 className="size-4 animate-spin" /> : <Square className="size-4" />}
            {confirmando && itemsFaltantes.length > 0 ? "Finalizar de todos modos" : "Finalizar Turno"}
          </Button>
        </div>
      </div>

      <div className="hidden print:block">
        <ActaTurno turno={turnoActivo} supervisorNombre={session?.nombre ?? ""} area={session?.area ?? null} />
      </div>
    </AppShell>
  )
}
