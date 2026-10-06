import { useState } from "react"
import { Link } from "react-router-dom"
import { AlertTriangle, Loader2, PackageCheck } from "lucide-react"
import { AppShell } from "@/components/AppShell"
import { EmptyState } from "@/components/EmptyState"
import { ModoCorreccionBanner } from "@/components/ModoCorreccionBanner"
import { Button } from "@/components/ui/button"
import { CorridasCerradas, ListaCorridas, type DatosListaCorridas } from "@/components/producto-terminado/ListaCorridas"
import { useCatalogosLive } from "@/lib/catalogosLive"
import { useSesionTurno } from "@/lib/sesionTurno"
import { useTurnoEfectivo } from "@/lib/turnoCorreccion"
import { useProduccion } from "@/lib/produccion/useProduccion"
import { usePreparacion } from "@/lib/preparacion/usePreparacion"
import { useProductoTerminado } from "@/lib/productoTerminado"
import { AvisoActa } from "@/components/producto-terminado/AvisoActa"
import { useActaAlDia } from "@/components/producto-terminado/useActaAlDia"

/*
 * Producto Terminado: una lista con TODA línea que se usó en el turno
 * (activa, esperando cierre, o ya finalizada — no solo las activas),
 * organizada en 3 niveles — Sabor → Lote → Línea — porque un sabor
 * puede tener varios lotes a lo largo del turno, y un lote puede estar
 * alimentando varias líneas a la vez. Envases de la llenadora
 * (Contador, un log que se acumula solo) se cargan junto a
 * Paletas/Cajas sueltas, pero estas últimas son el TOTAL actual (se
 * editan, no se suman) — ver src/components/producto-terminado/. El sabor sale
 * solo de la corrida (el mismo que se copió del tanque al activar la
 * línea) — no se elige aparte. Un registro es por CORRIDA
 * (turnoLineaId), no por línea suelta.
 */
export default function ProductoTerminado() {
  const sesion = useSesionTurno()
  const {
    turnoIdEfectivo: turnoIdCorreccion,
    cargando: cargandoCorreccion,
    enModoCorreccion,
    turnoCorregido,
    errorCorreccion,
    salirDeCorreccion,
  } = useTurnoEfectivo()
  /*
   * Ventana de gracia (30 min, ver TurnoGraciaPT en sesionTurno.tsx):
   * si el turno propio ya cerró pero sigue dentro de la gracia, esta
   * página se usa igual — para Contador y Producto Terminado (soloPT
   * más abajo apaga Terminar/Entregar línea en FilaProductoTerminado; el
   * contador se deja para que la merma y el acta salgan bien, dueña
   * 2026-10-06). Evita que un supervisor ansioso que
   * finalizó el turno le tape a otro la carga de su PT. Modo corrección
   * (superadmin, ?turnoId=) tiene la misma restricción soloPT — el
   * guard nuevo en el servidor solo cubre registrar_producto_terminado,
   * no Contador/Entregar/Terminar (ver Fuera de alcance en el plan).
   */
  // Con otro turno ya abierto, el anterior en gracia se elige a mano (botón de abajo).
  const [verTurnoAnterior, setVerTurnoAnterior] = useState(false)
  const graciaDisponible =
    !enModoCorreccion && sesion.turnoGraciaPT !== null && sesion.turnoGraciaPT.turnoId !== sesion.turnoId
  const enGraciaPT = graciaDisponible && (!sesion.turnoId || verTurnoAnterior)
  const turnoIdEfectivo = enModoCorreccion
    ? turnoIdCorreccion
    : enGraciaPT
      ? sesion.turnoGraciaPT!.turnoId
      : sesion.turnoId
  const soloPT = enGraciaPT || enModoCorreccion
  // Turno propio ya cerrado: al cargar contador o PT el acta se rearma sola (migración 20261107).
  const acta = useActaAlDia(enGraciaPT ? turnoIdEfectivo : null)
  const {
    corridas,
    contadores,
    cargando: cargandoProduccion,
    registrarContador,
    entregarCorrida,
    terminarSaborLinea,
  } = useProduccion(turnoIdEfectivo)
  const { registros: productoTerminado, cargando: cargandoPT, registrarProductoTerminado } = useProductoTerminado(turnoIdEfectivo)
  const {
    tanques,
    preparaciones,
    medirTanque,
    recargar: recargarPreparacion,
    cargando: cargandoPreparacion,
  } = usePreparacion(turnoIdEfectivo)
  const { lineas, presentaciones, cargando: cargandoCatalogos } = useCatalogosLive()
  const cargando = sesion.cargando || cargandoCorreccion || cargandoProduccion || cargandoPT || cargandoPreparacion

  // Cargar PT baja preparaciones.volumen_l en el servidor, pero esta
  // página lee el volumen del tanque de usePreparacion() — un hook
  // aparte que no se entera solo. Sin este refresco, el tanque en
  // pantalla se queda con el número de ANTES de cargar hasta que se
  // recarga la página, aunque el servidor ya restó bien (Javier,
  // 2026-09-16: le pidió a Deivis "bajar" el tanque a mano creyendo que
  // no se había restado, y esa resta manual duplicó el consumo real).
  async function registrarProductoTerminadoYRefrescarTanque(datos: Parameters<typeof registrarProductoTerminado>[0]) {
    const resultado = await registrarProductoTerminado(datos)
    if (resultado.ok) void recargarPreparacion()
    return resultado
  }

  if (cargando || cargandoCatalogos) {
    return (
      <AppShell title="Producto Terminado y Contador" description="Carga de lotes de producto terminado" fullWidth>
        <div className="flex justify-center py-16 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" />
        </div>
      </AppShell>
    )
  }

  if (errorCorreccion) {
    return (
      <AppShell title="Producto Terminado y Contador" description="Carga de lotes de producto terminado" fullWidth>
        <EmptyState
          icon={PackageCheck}
          title="Ese turno no se pudo abrir"
          description="No se encontró, o ya no es el turno inmediatamente anterior al actual de esa área."
        />
        <div className="mt-4 flex justify-center">
          <Button asChild>
            <Link to="/auditoria">Volver a Auditoría</Link>
          </Button>
        </div>
      </AppShell>
    )
  }

  if (!turnoIdEfectivo) {
    return (
      <AppShell title="Producto Terminado y Contador" description="Carga de lotes de producto terminado" fullWidth>
        <EmptyState
          icon={PackageCheck}
          title="Primero debes iniciar un turno"
          description="Producto Terminado se asocia al turno en curso. Inicia uno desde Comenzar Turno."
        />
        <div className="mt-4 flex justify-center">
          <Button asChild>
            <Link to="/turno">Ir a Comenzar Turno</Link>
          </Button>
        </div>
      </AppShell>
    )
  }

  const corridasUsadas = [...corridas].sort((a, b) => b.activadaEn.localeCompare(a.activadaEn))

  /** Cambiar entre el turno en curso y el anterior en gracia (solo si hay turno en curso). */
  const selectorGracia =
    graciaDisponible && sesion.turnoId ? (
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm">
        <span className="flex-1 text-muted-foreground">
          {verTurnoAnterior
            ? `Estás cargando el turno anterior (${sesion.turnoGraciaPT!.codigo}).`
            : `El turno anterior (${sesion.turnoGraciaPT!.codigo}) ya cerró y todavía acepta contadores y Producto Terminado.`}
        </span>
        <Button size="sm" variant="outline" onClick={() => setVerTurnoAnterior((v) => !v)}>
          {verTurnoAnterior ? "Volver al turno en curso" : "Cargar en el turno anterior"}
        </Button>
      </div>
    ) : null

  if (corridasUsadas.length === 0) {
    return (
      <AppShell title="Producto Terminado y Contador" description="Carga de lotes de producto terminado" fullWidth>
        {selectorGracia}
        <EmptyState
          icon={PackageCheck}
          title="Ninguna línea usada todavía"
          description="Activa una corrida en Líneas para poder registrar su producto terminado."
        />
      </AppShell>
    )
  }

  // Cerrada = ya finalizada, o ya "Cerrada" por este supervisor (entregada al siguiente turno) — ambas dejan de pedir carga.
  const datosLista: Omit<DatosListaCorridas, "corridas"> = {
    contadores,
    productoTerminado,
    tanques,
    preparaciones,
    lineas,
    presentaciones,
    acciones: {
      registrarProducto: enGraciaPT ? acta.conActa(registrarProductoTerminadoYRefrescarTanque) : registrarProductoTerminadoYRefrescarTanque,
      registrarContador: enGraciaPT ? acta.conActa(registrarContador) : registrarContador,
      entregarCorrida,
      terminarSabor: terminarSaborLinea,
      medirTanque,
    },
    soloPT,
  }
  const pendientes = corridasUsadas.filter((l) => (l.activa || l.esperandoCierre) && l.entregadaEn === null)
  const cerradas = corridasUsadas.filter((l) => (!l.activa && !l.esperandoCierre) || l.entregadaEn !== null)

  return (
    <AppShell
      title="Producto Terminado y Contador"
      description={
        enModoCorreccion
          ? `Turno ${turnoCorregido?.codigo} (corrección)`
          : enGraciaPT
            ? `Turno ${sesion.turnoGraciaPT?.codigo} — ya cerrado`
            : `Turno ${sesion.codigo}`
      }
      fullWidth
    >
      <div className="flex flex-col gap-3">
        {enModoCorreccion && turnoCorregido && <ModoCorreccionBanner turno={turnoCorregido} onSalir={salirDeCorreccion} />}
        {selectorGracia}
        {enGraciaPT && (
          <p className="flex items-center gap-2 rounded-lg border border-warning/40 bg-warning-soft px-3 py-2 text-sm text-warning">
            <AlertTriangle className="size-4 shrink-0" />
            Este turno ya se cerró. Puedes cargar contadores y Producto Terminado; al guardar, el acta se vuelve a generar
            sola. Terminar o entregar la línea ya no se puede.
          </p>
        )}
        {enGraciaPT && <AvisoActa estado={acta.estado} />}
        {enModoCorreccion && (
          <p className="flex items-center gap-2 rounded-lg border border-warning/40 bg-warning-soft px-3 py-2 text-sm text-warning">
            <AlertTriangle className="size-4 shrink-0" />
            En modo corrección se cargan contadores y Producto Terminado. Terminar o entregar la línea no está disponible
            para un turno ya cerrado.
          </p>
        )}
        {pendientes.length === 0 && cerradas.length > 0 && (
          <p className="py-4 text-center text-sm text-muted-foreground">
            No hay corridas pendientes de carga — todas las de este turno ya están cerradas.
          </p>
        )}
        <ListaCorridas corridas={pendientes} {...datosLista} />

        {cerradas.length > 0 && <CorridasCerradas corridas={cerradas} {...datosLista} />}
      </div>
    </AppShell>
  )
}
