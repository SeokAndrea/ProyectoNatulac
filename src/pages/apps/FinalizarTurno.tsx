import { useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { CheckCircle2, Circle, ClipboardCheck, FileText, Loader2, Square } from "lucide-react"
import { AppShell } from "@/components/AppShell"
import { EmptyState } from "@/components/EmptyState"
import { ResumenTurno } from "@/components/ResumenTurno"
import { ListaContadores } from "@/components/ListaContadores"
import { ActaTurno } from "@/components/ActaTurno"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { nombrePorCodigo } from "@/lib/catalogos"
import { useCatalogosLive } from "@/lib/catalogosLive"
import { useAuth } from "@/lib/auth"
import { useTurno } from "@/lib/turno"
import { construirHistorial } from "@/lib/historial"

/*
 * Finalizar Turno: el resumen formal del turno en curso (datos fijos
 * + todos los contadores de Contadores y Merma por línea, con sus
 * mermas y justificaciones) para revisar antes de cerrar — funciona
 * como el acta del turno. El cierre hace un UPDATE real en la tabla
 * "turnos" de Supabase (estado = 'CERRADO', ver finalizar_turno() en
 * supabase/migrations/20260825090000_conectar_turnos.sql).
 *
 * "Generar Acta (PDF)" usa la impresión del navegador (ver
 * src/components/ActaTurno.tsx) — no genera el PDF ella misma, abre
 * el diálogo de impresión, donde "Guardar como PDF" hace el resto.
 */
export default function FinalizarTurno() {
  const { turnoActivo, cargando, finalizarTurno } = useTurno()
  const { session } = useAuth()
  const { lineas, presentaciones } = useCatalogosLive()
  const navigate = useNavigate()
  const [finalizando, setFinalizando] = useState(false)

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

  async function handleFinalizar() {
    setFinalizando(true)
    await finalizarTurno()
    navigate("/hub", { replace: true })
  }

  const historial = construirHistorial(turnoActivo, lineas, presentaciones)

  /*
   * Checklist de lo que "debe llevar" el acta de fin de turno — hoy
   * cubre Recepción, Preparaciones, Contadores y Producto Terminado
   * (lo que ya existe). Cuando se agreguen más secciones, sumar acá
   * su propia condición de "completo".
   */
  const itemsChecklist = [
    { etiqueta: "Recepción", completo: turnoActivo.tanques.length > 0 },
    ...turnoActivo.tanques
      .filter((t) => t.condicion === "EN_PREPARACION")
      .map((t) => ({
        etiqueta: `Preparación — Tanque ${t.numeroTanque}`,
        completo: turnoActivo.preparaciones.some((p) => p.numeroTanque === t.numeroTanque),
      })),
    ...turnoActivo.lineas.map((l) => ({
      etiqueta: `Contadores y Merma — ${nombrePorCodigo(lineas, l.linea)}`,
      completo: turnoActivo.contadores.some((c) => c.linea === l.linea),
    })),
    ...turnoActivo.lineas.map((l) => ({
      etiqueta: `Producto Terminado — ${nombrePorCodigo(lineas, l.linea)}`,
      completo: turnoActivo.productoTerminado.some((p) => p.linea === l.linea),
    })),
  ]
  const faltan = itemsChecklist.filter((i) => !i.completo).length

  return (
    <AppShell title="Finalizar Turno" description={`Turno ${turnoActivo.codigo}`}>
      <div className="mx-auto flex max-w-lg flex-col gap-6 print:hidden">
        <Card>
          <CardHeader>
            <CardTitle>Checklist</CardTitle>
            <CardDescription>
              {faltan === 0 ? "Todo listo para finalizar." : `Falta cargar ${faltan} cosa${faltan === 1 ? "" : "s"}.`}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {itemsChecklist.map((item, i) => (
              <div key={i} className="flex items-center gap-2 text-sm">
                {item.completo ? (
                  <CheckCircle2 className="size-4 shrink-0 text-secondary-foreground" />
                ) : (
                  <Circle className="size-4 shrink-0 text-muted-foreground" />
                )}
                <span className={item.completo ? "text-foreground" : "text-muted-foreground"}>{item.etiqueta}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Datos del turno</CardTitle>
          </CardHeader>
          <CardContent>
            <ResumenTurno turno={turnoActivo} />
          </CardContent>
        </Card>

        {turnoActivo.tanques.some((t) => t.condicion === "EN_PREPARACION") && (
          <Card>
            <CardHeader>
              <CardTitle>Preparaciones</CardTitle>
              <CardDescription>Tambores y ajustes cargados por tanque.</CardDescription>
            </CardHeader>
            <CardContent>
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
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Contadores por línea</CardTitle>
            <CardDescription>
              Envases de la llenadora, buenos y desechados registrados en Contadores y Merma durante
              este turno.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {turnoActivo.contadores.length === 0 ? (
              <p className="text-sm text-muted-foreground">Todavía no se cargó ningún contador en este turno.</p>
            ) : (
              <ListaContadores contadores={turnoActivo.contadores} mostrarTotales />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Producto Terminado por línea</CardTitle>
            <CardDescription>Paletas y cajas sueltas (resto) registradas en Producto Terminado.</CardDescription>
          </CardHeader>
          <CardContent>
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
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Historial del turno</CardTitle>
            <CardDescription>Todo lo registrado durante el turno, en orden.</CardDescription>
          </CardHeader>
          <CardContent>
            {historial.length === 0 ? (
              <p className="text-sm text-muted-foreground">Todavía no hay nada registrado.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {historial.map((e, i) => (
                  <div key={i} className="flex gap-3 rounded-lg border border-border px-3 py-2 text-sm">
                    <span className="w-12 shrink-0 font-medium text-foreground">{e.hora}</span>
                    <span className="w-36 shrink-0 text-muted-foreground">{e.seccion}</span>
                    <span className="text-foreground">{e.detalle}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Button variant="outline" onClick={() => window.print()}>
          <FileText className="size-4" />
          Generar Acta (PDF)
        </Button>

        <Button
          variant="outline"
          className="border-destructive/40 text-destructive hover:bg-destructive/10"
          onClick={handleFinalizar}
          disabled={finalizando}
        >
          {finalizando ? <Loader2 className="size-4 animate-spin" /> : <Square className="size-4" />}
          Finalizar Turno
        </Button>
      </div>

      <div className="hidden print:block">
        <ActaTurno turno={turnoActivo} supervisorNombre={session?.nombre ?? ""} area={session?.area ?? null} />
      </div>
    </AppShell>
  )
}
