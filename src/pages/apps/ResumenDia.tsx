import { useEffect, useMemo, useState } from "react"
import { Loader2, MessageSquareText } from "lucide-react"
import { AppShell } from "@/components/AppShell"
import { ActasDelDia } from "@/components/resumen-dia/ActasDelDia"
import { CajasPorGrupo } from "@/components/resumen-dia/CajasPorGrupo"
import { CajasPorSabor } from "@/components/resumen-dia/CajasPorSabor"
import { ContadoresDelDia } from "@/components/resumen-dia/ContadoresDelDia"
import { LineasDelDia } from "@/components/resumen-dia/LineasDelDia"
import { MensajeWhatsApp } from "@/components/resumen-dia/MensajeWhatsApp"
import { NovedadesDelDia } from "@/components/resumen-dia/NovedadesDelDia"
import { ParadasDelDia } from "@/components/resumen-dia/ParadasDelDia"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useAuth } from "@/lib/auth"
import { useCatalogosLive } from "@/lib/catalogosLive"
import { puede } from "@/lib/permisos"
import { franjaDeHora, restarDias } from "@/lib/tiempoPlanta"
import {
  cargarResumenDia,
  cargarValidacionesTurno,
  itemsDelDia,
  itemsDelDiaConTurnos,
  mensajeResumenDia,
  validarTurno,
  type FilaResumenDia,
  type ItemTurno,
  type ValidacionDia,
  type ValidacionTurno,
} from "@/lib/resumenDia"
import {
  cajasPorGrupo,
  cajasPorSaborYTurno,
  cargarResumenDiario,
  contadoresDelDia,
  lineasDelDia,
  paradasQueMasQuitaron,
  type DatosResumenDiario,
} from "@/lib/resumenDiario"

/*
 * Resumen Diario (boceto aprobado por la dueña, 2026-10-08): la jornada de
 * Aséptico (7:00 a 7:00, por turnos.fecha) para el Jefe y la Analista de
 * Producción (RESUMEN_VER). Arriba las actas de los turnos con datos; luego
 * cajas por sabor y presentación, por línea, paradas y novedades. La
 * analista (VALIDAR) ve además las cajas por grupo y el mensaje de WhatsApp,
 * donde corrige el número oficial del día. Ver src/lib/resumenDiario.ts y
 * src/lib/resumenDia.ts.
 */
const AREA = "ASEPTICO"

type Cargado = {
  fecha: string
  dia: { filas: FilaResumenDia[]; validaciones: ValidacionDia[] } | null
  diario: DatosResumenDiario | null
  validacionesTurno: ValidacionTurno[]
  error: string | null
}

export default function ResumenDia() {
  const { session } = useAuth()
  const { lineas, presentaciones } = useCatalogosLive()
  // Jornada operativa en curso (7:00 a 7:00): de madrugada, todavía es la del día anterior.
  const hoy = franjaDeHora().fecha
  const [fecha, setFecha] = useState(() => restarDias(hoy, 1))
  const [cargado, setCargado] = useState<Cargado | null>(null)
  /** Sube con cada corrección: vuelve a pedir el resumen sin cambiar la fecha. */
  const [version, setVersion] = useState(0)
  const esAnalista = puede(session, "VALIDAR")

  useEffect(() => {
    if (!session || !fecha) return
    let vivo = true
    Promise.all([
      cargarResumenDia(session.username, AREA, fecha),
      cargarResumenDiario(session.username, AREA, fecha),
      cargarValidacionesTurno(session.username, AREA, fecha),
    ]).then(([dia, diario, valTurno]) => {
      if (!vivo) return
      const error = "error" in dia ? dia.error : "error" in diario ? diario.error : "error" in valTurno ? valTurno.error : null
      setCargado({
        fecha,
        dia: "error" in dia ? null : dia,
        diario: "error" in diario ? null : diario,
        validacionesTurno: "error" in valTurno ? [] : valTurno,
        error,
      })
    })
    return () => {
      vivo = false
    }
  }, [session, fecha, version])
  const vigente = cargado?.fecha === fecha ? cargado : null

  // Solo las líneas físicas (LINEA_1, LINEA_2...), sin las de Pruebas.
  const lineasPlanta = useMemo(() => lineas.filter((l) => /^LINEA_\d+$/.test(l.codigo)), [lineas])
  const nombreLinea = (codigo: string) => lineasPlanta.find((l) => l.codigo.replace(/^LINEA_/, "") === codigo.replace(/^LINEA_T?/, ""))?.nombre ?? codigo
  const diario = vigente?.diario ?? null
  // El día sale de los turnos (corrección por turno); sin los turnos, como antes.
  const conTurnos =
    vigente?.dia && diario ? itemsDelDiaConTurnos(diario.porTurno, vigente.validacionesTurno, vigente.dia.validaciones) : null
  const items = conTurnos?.dia ?? (vigente?.dia ? itemsDelDia(vigente.dia.filas, vigente.dia.validaciones) : [])
  const itemsTurno: ItemTurno[] = conTurnos?.turnos ?? []
  const etiquetaTurno = (turnoId: string) => {
    const t = diario?.turnos.find((x) => x.turno.id === turnoId)
    return t ? `${t.etiqueta} · ${t.turno.supervisorNombre}` : "Turno"
  }
  const volumenes = presentaciones.filter((p) => p.activo).map((p) => p.volumenMl)
  const validar = (turnoId: string, saborNombre: string, volumenMl: number, cajas: number | null, nota: string) =>
    validarTurno(session?.username ?? "", turnoId, saborNombre, volumenMl, cajas, nota)

  return (
    <AppShell title="Resumen Diario" description="Jornada de Aséptico, de 7:00 a 7:00">
      <div className="mx-auto flex max-w-6xl flex-col gap-4">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Fecha</span>
              <Input type="date" value={fecha} max={hoy} onChange={(e) => setFecha(e.target.value)} className="w-[170px]" />
            </label>
            <Button size="sm" variant={fecha === hoy ? "default" : "outline"} onClick={() => setFecha(hoy)}>
              Hoy
            </Button>
            <Button size="sm" variant={fecha === restarDias(hoy, 1) ? "default" : "outline"} onClick={() => setFecha(restarDias(hoy, 1))}>
              Ayer
            </Button>
          </div>
          {esAnalista && vigente?.dia && (
            <Button size="sm" onClick={() => document.getElementById("mensaje-whatsapp")?.scrollIntoView({ behavior: "smooth", block: "start" })}>
              <MessageSquareText className="size-3.5" />
              Mensaje para WhatsApp
            </Button>
          )}
        </div>

        {vigente?.error && (
          <p className="text-sm text-destructive" role="alert">
            {vigente.error}
          </p>
        )}

        {!vigente ? (
          <div className="flex justify-center py-16 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
          </div>
        ) : (
          <>
            {diario && (
              <>
                <ActasDelDia turnos={diario.turnos} />
                <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
                  <CajasPorSabor filas={cajasPorSaborYTurno(items, diario.porTurno, diario.turnos)} etiquetas={diario.turnos.map((t) => t.etiqueta)} />
                  <LineasDelDia lineas={lineasDelDia(lineasPlanta, diario.turnos, diario.porTurno, diario.paradas, presentaciones)} />
                  <ParadasDelDia paradas={paradasQueMasQuitaron(diario.paradas)} nombreLinea={nombreLinea} />
                  <NovedadesDelDia turnos={diario.turnos} />
                </div>
                {esAnalista && <CajasPorGrupo grupos={cajasPorGrupo(diario.turnos)} />}
                {esAnalista && <ContadoresDelDia filas={contadoresDelDia(diario.turnos, presentaciones)} nombreLinea={nombreLinea} />}
              </>
            )}
            {esAnalista && vigente.dia && diario && (
              <MensajeWhatsApp
                dia={items}
                turnos={itemsTurno}
                etiquetaTurno={etiquetaTurno}
                volumenes={volumenes}
                mensaje={mensajeResumenDia(fecha, items)}
                validar={validar}
                onCambio={() => setVersion((v) => v + 1)}
              />
            )}
          </>
        )}
      </div>
    </AppShell>
  )
}
