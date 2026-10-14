import { useEffect, useMemo, useRef, useState } from "react"
import { Loader2, Pencil } from "lucide-react"
import { AppShell } from "@/components/AppShell"
import { MensajeError } from "@/components/MensajeError"
import { BarraIndicadores } from "@/components/indicadores/BarraIndicadores"
import { BotonPdf } from "@/components/indicadores/BotonPdf"
import { FranjaTotal } from "@/components/indicadores/FranjaTotal"
import { SECCIONES, SIEMPRE_A_MANO, useFlechas, type Seccion } from "@/components/indicadores/secciones"
import { VistaAusentismo } from "@/components/indicadores/VistaAusentismo"
import { VistaIncidencias } from "@/components/indicadores/VistaIncidencias"
import { Button } from "@/components/ui/button"
import { EditorManual } from "@/components/indicadores/editor/EditorManual"
import { Observacion } from "@/components/indicadores/Observacion"
import { useIndicadores } from "@/components/indicadores/useIndicadores"
import { VistaLinea } from "@/components/indicadores/VistaLinea"
import { VistaSemielaborado, type VistaSemi } from "@/components/indicadores/VistaSemielaborado"
import { useAuth } from "@/lib/auth"
import { useCatalogosLive } from "@/lib/catalogosLive"
import { capital, nombreMes, presentacionesDeLinea, sumarMeses, tieneCargaDeLineas } from "@/lib/indicadores/calculos"
import { guardarMes, guardarObservacion } from "@/lib/indicadores/datos"
import { mesVacio, type DatosMes, type ModoMes } from "@/lib/indicadores/tipos"
import { esSoloLectura } from "@/lib/rolVista"
import { listarSabores, type Sabor } from "@/lib/sabores"
import { franjaDeHora } from "@/lib/tiempoPlanta"
import { useAccion } from "@/lib/useAccion"

/*
 * Indicadores (prototipo aprobado 2026-10-14): una pantalla, sin scroll en
 * PC. Por línea (eficiencia, paradas y una columna por presentación) o
 * semielaborado; cada mes AUTOMÁTICO (solo jornadas validadas) o MANUAL. Cuentas en
 * src/lib/indicadores/, piezas en src/components/indicadores/.
 */
export default function Indicadores() {
  const { session } = useAuth()
  const { lineas, presentaciones, velocidades, cargando: cargandoCatalogos } = useCatalogosLive()
  const area = session?.area === "PRUEBAS" ? "PRUEBAS" : "ASEPTICO"
  const usuario = session?.username ?? ""
  const puedeEditar = !esSoloLectura(session)
  // El modo del mes y la carga a mano: solo la analista (por rol o por cargo, como Daniela, que es
  // superadmin con cargo Analista de Producción) y la dueña. Jorge (superadmin, Jefe de Producción)
  // expone los Indicadores y no debe ver nada del modo manual (dueña, 2026-10-14). La base lo exige igual
  // (migración 20261110690000).
  const puedeCargar =
    puedeEditar && (session?.rol === "ANALISTA" || session?.cargo === "ANALISTA_PRODUCCION" || session?.esDueno === true)
  const mesActual = `${franjaDeHora().fecha.slice(0, 7)}-01`
  // Por defecto, el último mes cerrado.
  const [mes, setMes] = useState(() => sumarMeses(mesActual, -1))
  const [seccion, setSeccion] = useState<Seccion>("1")
  const [vistaSemi, setVistaSemi] = useState<VistaSemi>("graficas")
  const [editando, setEditando] = useState(false)
  const [sabores, setSabores] = useState<Sabor[] | null>(null)
  const accionModo = useAccion()
  // La franja y la pantalla: lo que se fotografía para el PDF.
  const lamina = useRef<HTMLDivElement>(null)
  // ← → cambian de pantalla, para exponer.
  useFlechas(seccion, setSeccion, !editando)

  useEffect(() => {
    listarSabores().then(setSabores)
  }, [])

  const cat = useMemo(
    () =>
      cargandoCatalogos || !sabores
        ? null
        : { lineas: lineas.map((l) => l.codigo), presentaciones, velocidades, familiaDeSabor: new Map(sabores.map((s) => [s.id, s.familiaNombre])) },
    [cargandoCatalogos, sabores, lineas, presentaciones, velocidades],
  )
  const ind = useIndicadores(usuario, area, mes, cat)
  const elegido = ind.meses[ind.meses.length - 1]
  const calculando = ind.cargando || (elegido.modo === "AUTO" && !elegido.datos && !elegido.error)
  const d = elegido.datos
  const sinValidadas = elegido.modo === "AUTO" && !!d && [d.eficiencia, d.presentaciones, d.semielaborado].every((x) => Object.keys(x).length === 0)
  const opcionesMes = Array.from({ length: 12 }, (_, i) => sumarMeses(mesActual, -i))
  const familias = [...new Set([...(sabores ?? []).filter((s) => s.activo).map((s) => s.familiaNombre), ...Object.keys(elegido.datos?.semielaborado ?? {})])]
  const claves = ind.meses.flatMap((m) => Object.keys(m.datos?.presentaciones ?? {}))
  // Ausentismo e incidencias: siempre a mano, se editan aunque el mes sea automático.
  const aMano = SIEMPRE_A_MANO.includes(seccion)
  const esLinea = seccion === "1" || seccion === "2" || seccion === "3"
  const seccionesEditor = elegido.modo === "MANUAL" ? SECCIONES.map((s) => s.valor) : SIEMPRE_A_MANO
  const botonEditar = puedeCargar ? (
    <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setEditando(true)}>
      <Pencil className="size-3.5" /> Editar
    </Button>
  ) : null

  const manualDe = (m: string) => ind.aMano.find((x) => x.mes === m)?.datos ?? null
  const modoDe = (m: string) => ind.meses.find((x) => x.mes === m)?.modo ?? "AUTO"

  /** Lo que calculó la app para el mes, con lo que siempre es a mano (ausentismo, incidencias, % total sin cajas). */
  async function autoConLoAMano(m: string): Promise<DatosMes> {
    const manual = manualDe(m)
    const auto = await ind.obtenerAuto(m)
    return {
      ...("error" in auto ? mesVacio() : auto),
      ausentismo: manual?.ausentismo ?? null,
      incidencias: manual?.incidencias ?? [],
      tituloIncidencias: manual?.tituloIncidencias,
      totalAseptico: manual?.totalAseptico,
      paradasGenerales: manual?.paradasGenerales,
    }
  }

  // La primera vez que un mes pasa a manual, arranca con lo que calculó la app.
  // Si solo tenía ausentismo o incidencias, esas se conservan.
  const arrancaConAuto = (m: string) => !tieneCargaDeLineas(manualDe(m))

  async function cambiarModo(modo: ModoMes) {
    const datos = modo === "MANUAL" && arrancaConAuto(mes) ? await autoConLoAMano(mes) : null
    if (await accionModo.ejecutar(() => guardarMes(usuario, area, mes, modo, datos))) ind.recargar()
  }

  /** Con qué arranca cada mes en el editor. Un mes anterior en AUTO, con lo automático (al guardarlo pasa a MANUAL). */
  async function inicialDe(m: string): Promise<DatosMes> {
    if (m !== mes && modoDe(m) === "AUTO" && arrancaConAuto(m)) return autoConLoAMano(m)
    return manualDe(m) ?? mesVacio()
  }

  async function guardarObs(clave: string, texto: string) {
    const r = await guardarObservacion(usuario, area, mes, clave, texto)
    if (r.ok) ind.recargar()
    return r
  }

  const observacion = (clave: string) => (
    <Observacion
      texto={ind.observaciones[clave]}
      nombreMes={nombreMes(mes)}
      placeholder="Qué pasó en el mes con este producto"
      puedeEditar={puedeEditar}
      onGuardar={(texto) => guardarObs(clave, texto)}
    />
  )

  return (
    <AppShell title="Indicadores" description="Por línea y presentación" fullWidth ocultarEstadoBanner sinMenuLateral>
      {/* En PC entra todo en una pantalla, sin scroll (dueña, 2026-10-13): alto de la ventana menos el encabezado. */}
      <div className="flex flex-col gap-2.5 lg:h-[calc(100svh-7.25rem)]">
        <BarraIndicadores
          seccion={seccion}
          onSeccion={setSeccion}
          mes={mes}
          opcionesMes={opcionesMes}
          onMes={setMes}
          modo={elegido.modo}
          onModo={cambiarModo}
          onCargar={() => setEditando(true)}
          puedeEditar={puedeCargar}
          cambiandoModo={accionModo.enviando}
          extra={<BotonPdf mes={mes} seccion={seccion} onSeccion={setSeccion} lamina={lamina} />}
        />
        <div ref={lamina} className="flex min-h-0 flex-1 flex-col gap-2.5">
          {/* Solo en las pantallas de línea (dueña, 2026-10-14). */}
          {esLinea && !ind.cargando && !calculando && <FranjaTotal meses={ind.meses} />}
          <MensajeError error={ind.error ?? (aMano ? null : elegido.error) ?? accionModo.error} />
          {aMano ? (
            ind.cargando ? (
              <Loader2 className="m-auto size-5 animate-spin text-muted-foreground" />
            ) : seccion === "aus" ? (
              <VistaAusentismo meses={ind.aMano} editar={botonEditar} />
            ) : (
              <VistaIncidencias
                mes={mes}
                titulo={ind.aMano[ind.aMano.length - 1].datos?.tituloIncidencias}
                incidencias={ind.aMano[ind.aMano.length - 1].datos?.incidencias ?? []}
                editar={botonEditar}
              />
            )
          ) : calculando ? (
            <p className="m-auto flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Calculando {nombreMes(mes)} con las jornadas validadas…
            </p>
          ) : sinValidadas ? (
            <p className="m-auto max-w-md text-center text-sm text-muted-foreground">
              {/* Quien no carga datos no ve nada del modo manual (se expone en reuniones, dueña 2026-10-14). */}
              {puedeCargar
                ? `${capital(nombreMes(mes))} no tiene jornadas validadas todavía. El modo automático cuenta solo lo validado en Validar jornada; mientras tanto, se puede pasar el mes a MANUAL.`
                : `${capital(nombreMes(mes))} todavía no tiene datos.`}
            </p>
          ) : seccion === "semi" ? (
            <VistaSemielaborado meses={ind.meses} vista={vistaSemi} onVista={setVistaSemi} renderObservacion={observacion} />
          ) : (
            <VistaLinea
              linea={seccion}
              meses={ind.meses}
              velocidades={velocidades}
              observaciones={ind.observaciones}
              puedeEditar={puedeEditar}
              onGuardarObservacion={guardarObs}
            />
          )}
        </div>
      </div>
      {editando && (
        <EditorManual
          // En MANUAL se cargan también los 2 meses anteriores (dueña, 2026-10-14); en AUTO, solo ausentismo e incidencias del elegido.
          meses={(elegido.modo === "MANUAL" ? [...ind.meses].reverse() : [elegido]).map((m) => ({ mes: m.mes, modo: m.modo }))}
          seccionInicial={seccionesEditor.includes(seccion) ? seccion : seccionesEditor[0]}
          secciones={seccionesEditor}
          presentacionesDe={(l) => presentacionesDeLinea(l, velocidades, claves)}
          familias={familias}
          inicialDe={inicialDe}
          obtenerAuto={ind.obtenerAuto}
          onGuardar={async (m, datos) => {
            // Un mes anterior que se carga a mano pasa a MANUAL; el elegido conserva su modo.
            const r = await guardarMes(usuario, area, m, m === mes ? elegido.modo : "MANUAL", datos)
            if (r.ok) ind.recargar()
            return r
          }}
          onCerrar={() => setEditando(false)}
        />
      )}
    </AppShell>
  )
}
