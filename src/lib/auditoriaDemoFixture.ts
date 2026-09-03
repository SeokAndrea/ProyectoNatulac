import type { LineaLive, PresentacionLive } from "@/lib/catalogosLive"
import type { TurnoResumen } from "@/lib/historialTurnos"
import {
  fechaLocal,
  type ContadorRegistro,
  type LineaEnTurno,
  type PreparacionRegistro,
  type ProductoTerminadoRegistro,
  type TanqueRecepcion,
  type TurnoActivo,
} from "@/lib/turno"
import type { RegistroAuditoria } from "@/lib/auditoria"
import type { TurnoAuditoria } from "@/components/AuditoriaTurnos"

/*
 * DATOS DE PRUEBA para src/lib/auditoriaVista.test.ts (y referencia
 * rápida de cómo se ve un turno completo). No se importa desde ningún
 * flujo de la app — Auditoría real trae los turnos de turno_detalle.
 * Las fechas se calculan relativas a hoy para que los presets de
 * fecha ("Turnos de hoy" / "Ayer" / "Últimos 7 días") tengan datos.
 */

export const LINEAS_DEMO: LineaLive[] = [
  { id: "l1", codigo: "LINEA_1", nombre: "Línea 1", activo: true },
  { id: "l2", codigo: "LINEA_2", nombre: "Línea 2", activo: true },
  { id: "l3", codigo: "LINEA_3", nombre: "Línea 3", activo: true },
]

export const PRESENTACIONES_DEMO: PresentacionLive[] = [
  {
    id: "p350",
    codigo: "350",
    nombre: "350 ml",
    volumenMl: 350,
    cajasXCamada: 20,
    cantCamada: 6,
    cajasXPaleta: 120,
    litrosXCaja: 8.4,
    envasesXCaja: 24,
    activo: true,
  },
  {
    id: "p1000",
    codigo: "1000",
    nombre: "1000 ml",
    volumenMl: 1000,
    cajasXCamada: 12,
    cantCamada: 4,
    cajasXPaleta: 48,
    litrosXCaja: 12,
    envasesXCaja: 12,
    activo: true,
  },
]

/** Fecha ISO de "hace N días" respecto a hoy. */
function dia(offset: number): string {
  const d = new Date()
  d.setDate(d.getDate() - offset)
  return fechaLocal(d)
}

/** El día siguiente a una fecha ISO — para los eventos de un T3 que cruzan medianoche. */
function diaSiguiente(fecha: string): string {
  const d = new Date(`${fecha}T12:00:00`)
  d.setDate(d.getDate() + 1)
  return fechaLocal(d)
}

// ------------------------------------------------------------
// Fábrica: un TurnoActivo completo con valores por defecto,
// y overrides por turno para no repetir 20 campos cada vez.
// ------------------------------------------------------------
type Override = Partial<TurnoActivo> &
  Pick<TurnoActivo, "id" | "codigo" | "fecha" | "horaInicio" | "turnoTipo" | "grupo" | "supervisorUsuario" | "supervisorNombre">

function tanque(over: Partial<TanqueRecepcion> & Pick<TanqueRecepcion, "numeroTanque" | "activadaEn">): TanqueRecepcion {
  return {
    saborId: null,
    saborNombre: null,
    condicion: "LISTO",
    volumenL: null,
    volumenInicialL: null,
    lote: null,
    ultimoSaborId: null,
    ultimoSaborNombre: null,
    ultimoLote: null,
    confirmadoInicioEn: null,
    confirmadoFinEn: null,
    cipIniciadoEn: null,
    cipFinalizadoEn: null,
    ...over,
  }
}

function corrida(over: Partial<LineaEnTurno> & Pick<LineaEnTurno, "id" | "linea" | "activadaEn">): LineaEnTurno {
  return {
    presentacion: "350",
    envasesHora: 9000,
    saborId: null,
    saborNombre: null,
    lote: null,
    loteId: null,
    activa: true,
    pausadaEn: null,
    loteTerminado: null,
    finalizadaEn: null,
    esperandoCierre: false,
    entregadaEn: null,
    confirmadoInicioEn: null,
    ...over,
  }
}

function prep(
  over: Partial<PreparacionRegistro> & Pick<PreparacionRegistro, "id" | "numeroTanque" | "creadoEn">,
): PreparacionRegistro {
  return {
    turnoId: null,
    saborId: null,
    saborNombre: null,
    lote: null,
    volumenL: 8000,
    volumenInicialL: 8000,
    volumenLInicio: 8000,
    tambores: 12,
    agua: 6000,
    azucar: 900,
    acidoCitrico: 18,
    liberadoEn: null,
    cerradoEn: null,
    ...over,
  }
}

function contador(
  over: Partial<ContadorRegistro> & Pick<ContadorRegistro, "id" | "linea" | "creadoEn" | "envasesLlenadora">,
): ContadorRegistro {
  return { turnoLineaId: null, justificacion: "", parcial: false, ...over }
}

function pt(
  over: Partial<ProductoTerminadoRegistro> &
    Pick<ProductoTerminadoRegistro, "id" | "linea" | "creadoEn" | "paletas" | "cajasSueltas">,
): ProductoTerminadoRegistro {
  return {
    turnoLineaId: null,
    saborId: null,
    saborNombre: null,
    presentacion: "350",
    litrosProducidos: 0,
    productoRetenido: false,
    cajasRetenidas: null,
    tieneParciales: false,
    parciales: [],
    registradoPorNombre: null,
    editadoPorNombre: null,
    editadoEn: null,
    ...over,
  }
}

function turnoDemo(over: Override): TurnoActivo {
  return {
    estado: "CERRADO",
    fechaFin: over.fecha,
    horaFin: "07:00:00",
    cierreAutomatico: false,
    lineas: [],
    lineasEstado: [],
    tanques: [],
    tanquesEncontrados: null,
    contadores: [],
    productoTerminado: [],
    preparaciones: [],
    ...over,
  }
}

function mmdd(fecha: string): string {
  return fecha.slice(5).replace("-", "")
}

// ------------------------------------------------------------
// Los turnos de muestra
// ------------------------------------------------------------
const HOY = dia(0)
const AYER = dia(1)
const ANTEAYER = dia(2)
const NOCHE_AYER = diaSiguiente(AYER)
const NOCHE_ANTEAYER = diaSiguiente(ANTEAYER)

const detalles: TurnoActivo[] = [
  // HOY · Turno 1 · Aséptico · Andrés
  turnoDemo({
    id: "t1",
    codigo: `${mmdd(HOY)}-A-1`,
    fecha: HOY,
    horaInicio: "07:00:00",
    turnoTipo: "TURNO_1",
    grupo: "GRUPO_3",
    supervisorUsuario: "agomez",
    supervisorNombre: "Andrés Gómez",
    tanques: [tanque({ numeroTanque: 1, activadaEn: `${HOY}T07:15:00`, saborNombre: "Mora", volumenL: 8000, lote: `${mmdd(HOY)}-A3` })],
    preparaciones: [prep({ id: "pr1", numeroTanque: 1, creadoEn: "07:10:00", saborNombre: "Mora", lote: `${mmdd(HOY)}-A3`, liberadoEn: "07:40:00" })],
    lineas: [corrida({ id: "c1", linea: "LINEA_1", activadaEn: "08:05:00", saborNombre: "Mora", lote: `${mmdd(HOY)}-A3`, loteId: "pr1", envasesHora: 9100 })],
    contadores: [contador({ id: "co1", linea: "LINEA_1", creadoEn: "14:20:00", turnoLineaId: "c1", envasesLlenadora: 52800 })],
    productoTerminado: [pt({ id: "pt1", linea: "LINEA_1", creadoEn: "14:30:00", turnoLineaId: "c1", saborNombre: "Mora", paletas: 17, cajasSueltas: 60 })],
  }),

  // HOY · Turno 1 · Vacío · Lucía
  turnoDemo({
    id: "t2",
    codigo: `${mmdd(HOY)}-V-1`,
    fecha: HOY,
    horaInicio: "07:00:00",
    turnoTipo: "TURNO_1",
    grupo: "GRUPO_2",
    supervisorUsuario: "lfernandez",
    supervisorNombre: "Lucía Fernández",
    tanques: [tanque({ numeroTanque: 3, activadaEn: `${HOY}T07:20:00`, saborNombre: "Piña", volumenL: 7800, lote: `${mmdd(HOY)}-V2` })],
    preparaciones: [prep({ id: "pr2", numeroTanque: 3, creadoEn: "07:15:00", saborNombre: "Piña", lote: `${mmdd(HOY)}-V2`, liberadoEn: "07:45:00" })],
    lineas: [corrida({ id: "c2", linea: "LINEA_2", activadaEn: "08:10:00", saborNombre: "Piña", lote: `${mmdd(HOY)}-V2`, loteId: "pr2", presentacion: "1000", envasesHora: 6100 })],
    contadores: [contador({ id: "co2", linea: "LINEA_2", creadoEn: "14:15:00", turnoLineaId: "c2", envasesLlenadora: 30600 })],
    productoTerminado: [pt({ id: "pt2", linea: "LINEA_2", creadoEn: "14:25:00", turnoLineaId: "c2", saborNombre: "Piña", presentacion: "1000", paletas: 9, cajasSueltas: 4 })],
  }),

  // HOY · Turno 2 · Aséptico · Pedro (en curso)
  turnoDemo({
    id: "t3",
    codigo: `${mmdd(HOY)}-A-2`,
    fecha: HOY,
    horaInicio: "15:00:00",
    turnoTipo: "TURNO_2",
    grupo: "GRUPO_1",
    supervisorUsuario: "psalas",
    supervisorNombre: "Pedro Salas",
    estado: "ABIERTO",
    tanques: [
      tanque({ numeroTanque: 3, activadaEn: `${HOY}T15:20:00`, saborNombre: "Fresa", volumenL: 8000, lote: `${mmdd(HOY)}-A5` }),
      tanque({ numeroTanque: 2, activadaEn: `${HOY}T18:40:00`, saborNombre: "Durazno", volumenL: 7000, lote: `${mmdd(HOY)}-A6` }),
    ],
    preparaciones: [
      prep({ id: "pr3", numeroTanque: 3, creadoEn: "15:15:00", saborNombre: "Fresa", lote: `${mmdd(HOY)}-A5`, liberadoEn: "15:50:00" }),
      prep({ id: "pr3b", numeroTanque: 2, creadoEn: "18:20:00", saborNombre: "Durazno", lote: `${mmdd(HOY)}-A6`, liberadoEn: "18:55:00" }),
    ],
    lineas: [
      corrida({ id: "c3", linea: "LINEA_3", activadaEn: "16:10:00", saborNombre: "Fresa", lote: `${mmdd(HOY)}-A5`, loteId: "pr3", envasesHora: 8800 }),
      corrida({ id: "c3b", linea: "LINEA_1", activadaEn: "19:15:00", saborNombre: "Durazno", lote: `${mmdd(HOY)}-A6`, loteId: "pr3b", envasesHora: 9000 }),
    ],
    contadores: [contador({ id: "co3", linea: "LINEA_3", creadoEn: "20:30:00", turnoLineaId: "c3", envasesLlenadora: 34100 })],
    productoTerminado: [
      pt({ id: "pt3", linea: "LINEA_3", creadoEn: "20:30:00", turnoLineaId: "c3", saborNombre: "Fresa", paletas: 7, cajasSueltas: 22 }),
      pt({ id: "pt3b", linea: "LINEA_1", creadoEn: "21:40:00", turnoLineaId: "c3b", saborNombre: "Durazno", paletas: 4, cajasSueltas: 10 }),
    ],
  }),

  // AYER · Turno 3 · Aséptico · Deivis — 2 sabores, 2 líneas, PT editado
  turnoDemo({
    id: "t4",
    codigo: `${mmdd(AYER)}-A-3`,
    fecha: AYER,
    horaInicio: "22:30:00",
    turnoTipo: "TURNO_3",
    grupo: "GRUPO_2",
    supervisorUsuario: "drojas",
    supervisorNombre: "Deivis Rojas",
    tanques: [
      tanque({ numeroTanque: 1, activadaEn: `${AYER}T22:41:00`, saborNombre: "Fresa", volumenL: 8000, lote: `${mmdd(AYER)}-A1` }),
      tanque({ numeroTanque: 2, activadaEn: `${NOCHE_AYER}T01:05:00`, saborNombre: "Mango", volumenL: 7600, lote: `${mmdd(AYER)}-A2` }),
    ],
    preparaciones: [
      prep({ id: "pr4", numeroTanque: 1, creadoEn: "22:35:00", saborNombre: "Fresa", lote: `${mmdd(AYER)}-A1`, liberadoEn: "22:55:00" }),
      prep({ id: "pr5", numeroTanque: 2, creadoEn: `${NOCHE_AYER}T00:40:00`, saborNombre: "Mango", lote: `${mmdd(AYER)}-A2`, liberadoEn: `${NOCHE_AYER}T01:00:00` }),
    ],
    lineas: [
      corrida({ id: "c4", linea: "LINEA_1", activadaEn: "23:05:00", saborNombre: "Fresa", lote: `${mmdd(AYER)}-A1`, loteId: "pr4", envasesHora: 9000 }),
      corrida({ id: "c5", linea: "LINEA_3", activadaEn: `${NOCHE_AYER}T01:15:00`, saborNombre: "Mango", lote: `${mmdd(AYER)}-A2`, loteId: "pr5", envasesHora: 8200 }),
    ],
    contadores: [contador({ id: "co4", linea: "LINEA_1", creadoEn: `${NOCHE_AYER}T02:30:00`, turnoLineaId: "c4", envasesLlenadora: 41200 })],
    productoTerminado: [
      pt({
        id: "pt4",
        linea: "LINEA_1",
        creadoEn: `${NOCHE_AYER}T02:35:00`,
        turnoLineaId: "c4",
        saborNombre: "Fresa",
        paletas: 13,
        cajasSueltas: 40,
        editadoPorNombre: "Andrea Seok",
        editadoEn: `${NOCHE_AYER}T09:12:00`,
      }),
      pt({ id: "pt5", linea: "LINEA_3", creadoEn: `${NOCHE_AYER}T05:50:00`, turnoLineaId: "c5", saborNombre: "Mango", paletas: 8, cajasSueltas: 12 }),
    ],
  }),

  // AYER · Turno 3 · Vacío · Karla
  turnoDemo({
    id: "t5",
    codigo: `${mmdd(AYER)}-V-3`,
    fecha: AYER,
    horaInicio: "22:30:00",
    turnoTipo: "TURNO_3",
    grupo: "GRUPO_1",
    supervisorUsuario: "kmendez",
    supervisorNombre: "Karla Méndez",
    tanques: [tanque({ numeroTanque: 2, activadaEn: `${AYER}T22:50:00`, saborNombre: "Naranja", volumenL: 8000, lote: `${mmdd(AYER)}-V1` })],
    preparaciones: [prep({ id: "pr6", numeroTanque: 2, creadoEn: "22:45:00", saborNombre: "Naranja", lote: `${mmdd(AYER)}-V1`, liberadoEn: "23:10:00" })],
    lineas: [corrida({ id: "c6", linea: "LINEA_2", activadaEn: "23:20:00", saborNombre: "Naranja", lote: `${mmdd(AYER)}-V1`, loteId: "pr6", presentacion: "1000", envasesHora: 6000 })],
    contadores: [contador({ id: "co5", linea: "LINEA_2", creadoEn: `${NOCHE_AYER}T04:10:00`, turnoLineaId: "c6", envasesLlenadora: 22800 })],
    productoTerminado: [pt({ id: "pt6", linea: "LINEA_2", creadoEn: `${NOCHE_AYER}T04:20:00`, turnoLineaId: "c6", saborNombre: "Naranja", presentacion: "1000", paletas: 6, cajasSueltas: 15 })],
  }),

  // ANTEAYER · Turno 3 · Aséptico · Deivis
  turnoDemo({
    id: "t6",
    codigo: `${mmdd(ANTEAYER)}-A-3`,
    fecha: ANTEAYER,
    horaInicio: "22:30:00",
    turnoTipo: "TURNO_3",
    grupo: "GRUPO_2",
    supervisorUsuario: "drojas",
    supervisorNombre: "Deivis Rojas",
    tanques: [tanque({ numeroTanque: 1, activadaEn: `${ANTEAYER}T22:45:00`, saborNombre: "Guayaba", volumenL: 8000, lote: `${mmdd(ANTEAYER)}-A1` })],
    preparaciones: [prep({ id: "pr7", numeroTanque: 1, creadoEn: "22:40:00", saborNombre: "Guayaba", lote: `${mmdd(ANTEAYER)}-A1`, liberadoEn: "23:05:00" })],
    lineas: [corrida({ id: "c7", linea: "LINEA_1", activadaEn: "23:15:00", saborNombre: "Guayaba", lote: `${mmdd(ANTEAYER)}-A1`, loteId: "pr7", envasesHora: 9000 })],
    contadores: [contador({ id: "co6", linea: "LINEA_1", creadoEn: `${NOCHE_ANTEAYER}T03:00:00`, turnoLineaId: "c7", envasesLlenadora: 39800 })],
    productoTerminado: [pt({ id: "pt7", linea: "LINEA_1", creadoEn: `${NOCHE_ANTEAYER}T03:10:00`, turnoLineaId: "c7", saborNombre: "Guayaba", paletas: 12, cajasSueltas: 35 })],
  }),

  // ANTEAYER · Turno 2 · Vacío · Karla
  turnoDemo({
    id: "t7",
    codigo: `${mmdd(ANTEAYER)}-V-2`,
    fecha: ANTEAYER,
    horaInicio: "15:00:00",
    turnoTipo: "TURNO_2",
    grupo: "GRUPO_3",
    supervisorUsuario: "kmendez",
    supervisorNombre: "Karla Méndez",
    tanques: [tanque({ numeroTanque: 2, activadaEn: `${ANTEAYER}T15:25:00`, saborNombre: "Naranja", volumenL: 8000, lote: `${mmdd(ANTEAYER)}-V1` })],
    preparaciones: [prep({ id: "pr8", numeroTanque: 2, creadoEn: "15:20:00", saborNombre: "Naranja", lote: `${mmdd(ANTEAYER)}-V1`, liberadoEn: "15:55:00" })],
    lineas: [corrida({ id: "c8", linea: "LINEA_2", activadaEn: "16:15:00", saborNombre: "Naranja", lote: `${mmdd(ANTEAYER)}-V1`, loteId: "pr8", presentacion: "1000", envasesHora: 6000 })],
    contadores: [contador({ id: "co7", linea: "LINEA_2", creadoEn: "21:40:00", turnoLineaId: "c8", envasesLlenadora: 24200 })],
    productoTerminado: [pt({ id: "pt8", linea: "LINEA_2", creadoEn: "21:50:00", turnoLineaId: "c8", saborNombre: "Naranja", presentacion: "1000", paletas: 6, cajasSueltas: 30 })],
  }),
]

// ------------------------------------------------------------
// Cuadra los números de cada corrida para que el resumen tenga
// sentido: contador ≈ envases de PT / (1 − merma envases), y el lote
// que la alimentó consume ≈ litros de PT / (1 − merma semielaborado),
// dejando un resto en el tanque. Así "consumidos → producidos" y las
// dos mermas dan valores creíbles (4–8 %) sin cargarlos a mano.
// ------------------------------------------------------------
function cuadrarNumeros(turno: TurnoActivo) {
  const infoPres = (codigo: string) => PRESENTACIONES_DEMO.find((p) => p.codigo === codigo)
  for (const l of turno.lineas) {
    const pt = turno.productoTerminado.find((p) => p.turnoLineaId === l.id)
    if (!pt) continue
    const info = infoPres(pt.presentacion)
    if (!info) continue

    const cajas = pt.paletas * info.cajasXPaleta + pt.cajasSueltas
    const mermaEnvases = 0.04 + (l.id.charCodeAt(l.id.length - 1) % 4) / 100 // 4–7 %
    const mermaSemi = 0.05 + (l.id.charCodeAt(0) % 3) / 100 // 5–7 %

    const contador = turno.contadores.find((c) => c.turnoLineaId === l.id)
    if (contador) contador.envasesLlenadora = Math.round((cajas * info.envasesXCaja) / (1 - mermaEnvases))

    pt.litrosProducidos = Math.round(cajas * info.litrosXCaja)

    const lote = turno.preparaciones.find((p) => p.id === l.loteId)
    if (lote) {
      const consumo = Math.round(pt.litrosProducidos / (1 - mermaSemi))
      lote.volumenInicialL = consumo + 140
      lote.volumenLInicio = consumo + 140
      lote.volumenL = 140
    }
  }
}

detalles.forEach(cuadrarNumeros)

const AREA_POR_TURNO: Record<string, "ASEPTICO" | "VACIO"> = {
  t1: "ASEPTICO",
  t2: "VACIO",
  t3: "ASEPTICO",
  t4: "ASEPTICO",
  t5: "VACIO",
  t6: "ASEPTICO",
  t7: "VACIO",
}

export const TURNOS_DEMO: TurnoAuditoria[] = detalles.map((detalle) => ({
  detalle,
  resumen: {
    id: detalle.id,
    codigo: detalle.codigo,
    fecha: detalle.fecha,
    horaInicio: detalle.horaInicio,
    estado: detalle.estado,
    supervisorUsuario: detalle.supervisorUsuario,
    supervisorNombre: detalle.supervisorNombre,
    area: AREA_POR_TURNO[detalle.id],
    turnoTipo: detalle.turnoTipo,
    grupo: detalle.grupo,
  } satisfies TurnoResumen,
}))

// Registro de cambios (auditoría universal) — muestra del formato
// "resumen auditable": una línea por cambio, con cuándo / qué / quién.
export const CAMBIOS_DEMO: RegistroAuditoria[] = [
  {
    ocurridoEn: `${NOCHE_AYER}T09:12:00`,
    usuario: "aseok",
    usuarioNombre: "Andrea Seok",
    usuarioCargo: "JEFE_PRODUCCION",
    accion: "EDITAR",
    entidad: "producto_terminado",
    entidadId: "pt4",
    pagina: "Editar Turno",
    resumen: "Producto Terminado · Línea 1 · Fresa",
    antes: { paletas: 12, cajas_sueltas: 40 },
    despues: { paletas: 13, cajas_sueltas: 40 },
  },
  {
    ocurridoEn: `${NOCHE_AYER}T02:35:00`,
    usuario: "drojas",
    usuarioNombre: "Deivis Rojas",
    usuarioCargo: "SUPERVISOR",
    accion: "CREAR",
    entidad: "producto_terminado",
    entidadId: "pt4",
    pagina: "Producto Terminado",
    resumen: "Producto Terminado · Línea 1 · Fresa · 12 paletas + 40 cajas",
    antes: null,
    despues: { paletas: 12, cajas_sueltas: 40 },
  },
  {
    ocurridoEn: `${AYER}T22:55:00`,
    usuario: "drojas",
    usuarioNombre: "Deivis Rojas",
    usuarioCargo: "SUPERVISOR",
    accion: "EDITAR",
    entidad: "preparaciones",
    entidadId: "pr4",
    pagina: "Preparación",
    resumen: "Lote liberado · Tanque 1 · Fresa",
    antes: { liberado_en: null },
    despues: { liberado_en: `${AYER}T22:55:00` },
  },
  {
    ocurridoEn: `${AYER}T22:35:00`,
    usuario: "drojas",
    usuarioNombre: "Deivis Rojas",
    usuarioCargo: "SUPERVISOR",
    accion: "CREAR",
    entidad: "preparaciones",
    entidadId: "pr4",
    pagina: "Preparación",
    resumen: "Preparación · Tanque 1 · Fresa · 12 tambores",
    antes: null,
    despues: { sabor: "Fresa", tambores: 12, agua: 6000, azucar: 900 },
  },
  {
    ocurridoEn: `${AYER}T18:20:00`,
    usuario: "psalas",
    usuarioNombre: "Pedro Salas",
    usuarioCargo: "SUPERVISOR",
    accion: "EDITAR",
    entidad: "recepcion_tanques",
    entidadId: "rt-2",
    pagina: "Recepción",
    resumen: "Tanque 2 · condición",
    antes: { condicion: "LIMPIO" },
    despues: { condicion: "EN_PREPARACION" },
  },
]
