import type { LucideIcon } from "lucide-react"
import {
  PlayCircle,
  PackageCheck,
  ClipboardCheck,
  DatabaseZap,
  History,
  Beaker,
  Factory,
  RadioTower,
  CalendarRange,
  Thermometer,
  Wrench,
  ShieldAlert,
  FileText,
  Calculator,
  FlaskConical,
  Scale,
  BookOpen,
  Droplets,
  Users,
  ClipboardList,
} from "lucide-react"
import type { Session } from "@/lib/auth"
import type { AreaCodigo, RolCodigo } from "@/lib/catalogos"
import { puede, type Permiso } from "@/lib/permisos"

export interface AppDef {
  slug: string
  title: string
  /** Opcional: los atajos del Inicio pueden ir sin descripción. */
  description?: string
  /** Sin href = todavía no tiene página propia (tarjeta deshabilitada, "Próximamente"). */
  href?: string
  icon: LucideIcon
  /**
   * Si es true, la tarjeta aparece bloqueada en el hub (gris, con
   * candado, sin link) mientras no haya un turno en curso. Ver la
   * lógica en Hub.tsx y el estado en src/lib/turno.ts.
   */
  requiereTurno: boolean
  /**
   * Si se define, la tarjeta (y su ruta, ver ProtectedRoute) solo es
   * para quien tenga este permiso, o cualquiera de la lista (ver src/lib/permisos.ts). Sin esta
   * propiedad, la ve cualquier sesión.
   */
  permiso?: Permiso | Permiso[]
  /** Roles que NO ven la tarjeta aunque no pida permiso (ej. Mantenimiento solo ve los paneles y sus paradas). */
  rolesExcluidos?: RolCodigo[]
  /** Si se define, la tarjeta solo aparece para usuarios de estas áreas (ej. Servicios Industriales, que no tiene un rol propio). */
  areasPermitidas?: AreaCodigo[]
  /**
   * Si se define, la tarjeta NO aparece para usuarios de estas áreas,
   * aunque su rol sí califique (ej. Servicios Industriales usa el rol
   * SUPERVISOR — igual que Aséptico — pero no tiene que ver
   * corridas de producción: Comenzar Turno, Preparación, Líneas,
   * Producto Terminado, Finalizar Turno, Mis Actas y Programación
   * quedan afuera para esa área).
   */
  areasExcluidas?: AreaCodigo[]
  /** Atajo chico junto al saludo del hub, en vez de la grilla principal (ver Hub.tsx). */
  atajo?: boolean
  /** Se bloquea (gris) cuando SÍ hay un turno en curso — lo opuesto de requiereTurno (ver Comenzar Turno). */
  bloqueaConTurno?: boolean
  /** Se resalta en rojo cuando hay un turno en curso, para que sea obvio el siguiente paso (ver Finalizar Turno). */
  resaltarConTurno?: boolean
  /** Color fijo del ícono/tarjeta (por defecto: primary) — para distinguir a simple vista pasos como Comenzar/Preparación/Finalizar. */
  color?: "success" | "blue" | "purple" | "warning" | "danger"
  /** Si es true, la tarjeta solo aparece para el dueño (ver session.esDueno). */
  soloDueno?: boolean
  /** Si se define, la tarjeta solo aparece para ese username exacto (case-insensitive), sin importar rol o área — para vistas de prueba de un solo usuario. */
  usuarioPermitido?: string
  /**
   * Grupo bajo el que aparece la tarjeta en la grilla principal del hub,
   * con un separador y título arriba (ver Hub.tsx). Sin esta propiedad,
   * la tarjeta va suelta, sin sección (ej. Servicios Industriales, que
   * ya tiene su propia vista acotada por área).
   */
  seccion?: "produccion" | "auditoria" | "base-datos"
}

/*
 * Listado de aplicaciones que aparecen como tarjetas en el hub (Hub.tsx).
 * Para agregar una app nueva:
 *   1. Sumar un objeto aquí con su slug, título, descripción, ruta (href)
 *      e ícono (ver la lista completa en https://lucide.dev/icons), si
 *      requiere o no un turno iniciado, y qué permiso pide (permiso,
 *      opcional).
 *   2. Crear la página en src/pages/apps/ y registrar esa misma ruta
 *      (href) en src/App.tsx dentro de <Routes>, protegida con
 *      <ProtectedRoute app="slug">: toma los mismos criterios de acá.
 * No hace falta tocar Hub.tsx: la grilla se genera automáticamente a
 * partir de este arreglo, filtrada por puedeVerApp().
 */
export const apps: AppDef[] = [
  {
    slug: "comenzar-turno",
    title: "Comenzar Turno",
    description: "Registra el inicio de tu turno de producción.",
    href: "/turno",
    icon: PlayCircle,
    requiereTurno: false,
    permiso: "TURNO_ASUMIR",
    // Servicios Industriales usa el rol SUPERVISOR pero no arranca turnos de producción.
    areasExcluidas: ["SERVICIOS_INDUSTRIALES"],
    bloqueaConTurno: true,
    color: "success",
    seccion: "produccion",
  },
  {
    slug: "preparacion",
    title: "Preparación",
    description: "Preparar y liberar tanques — en cualquier momento del turno.",
    href: "/preparacion",
    icon: Beaker,
    requiereTurno: true,
    permiso: "TURNO_CARGAR",
    areasExcluidas: ["SERVICIOS_INDUSTRIALES"],
    color: "blue",
    seccion: "produccion",
  },
  {
    slug: "calidad",
    title: "Calidad",
    description: "Analizar y liberar los lotes preparados: Brix, acidez y conformidad.",
    href: "/calidad",
    icon: FlaskConical,
    requiereTurno: false,
    permiso: "LOTE_LIBERAR",
    // Área Calidad (apoyo: ve el turno de Aséptico, migración 20261089) y Pruebas para probar. Ver plan-calidad.md.
    areasPermitidas: ["CALIDAD", "PRUEBAS"],
    color: "purple",
    seccion: "produccion",
  },
  {
    slug: "lineas",
    title: "Líneas",
    description: "Activar o detener corridas de las 3 líneas — en cualquier momento del turno.",
    href: "/lineas",
    icon: Factory,
    requiereTurno: true,
    permiso: "TURNO_CARGAR",
    areasExcluidas: ["SERVICIOS_INDUSTRIALES"],
    color: "blue",
    seccion: "produccion",
  },
  {
    slug: "producto-terminado",
    title: "Producto Terminado y Contador",
    description: "Carga los lotes de producto terminado y el contador de envases por línea.",
    href: "/producto-terminado",
    icon: PackageCheck,
    requiereTurno: true,
    permiso: "TURNO_CARGAR",
    areasExcluidas: ["SERVICIOS_INDUSTRIALES"],
    seccion: "produccion",
  },
  {
    slug: "finalizar-turno",
    title: "Finalizar Turno",
    description: "Resumen y cierre del turno con los contadores por línea.",
    href: "/finalizar-turno",
    icon: ClipboardCheck,
    requiereTurno: true,
    permiso: "TURNO_ASUMIR",
    areasExcluidas: ["SERVICIOS_INDUSTRIALES"],
    resaltarConTurno: true,
    seccion: "produccion",
  },
  {
    slug: "resumen-dia",
    title: "Resumen Diario",
    href: "/resumen-dia",
    icon: ClipboardList,
    requiereTurno: false,
    // Lo ven el jefe y la analista; solo la analista (VALIDAR) corrige el mensaje (dueña, 2026-10-08).
    permiso: "RESUMEN_VER",
    seccion: "auditoria",
  },
  {
    slug: "mis-actas",
    title: "Mis Actas",
    description: "Actas de tus turnos cerrados — verlas y descargarlas cuando quieras.",
    href: "/mis-actas",
    icon: FileText,
    requiereTurno: false,
    permiso: "TURNO_CARGAR",
    areasExcluidas: ["SERVICIOS_INDUSTRIALES"],
    seccion: "auditoria",
  },
  {
    slug: "panel-produccion",
    title: "Panel de Producción",
    description: "Tanques, meta y merma del turno en curso — en vivo.",
    href: "/panel-produccion",
    icon: RadioTower,
    requiereTurno: false,
    atajo: true,
  },
  {
    slug: "paradas",
    title: "Registrar Paradas",
    description: "Sumar paradas de las líneas y poner cuánto duraron.",
    href: "/paradas",
    icon: Wrench,
    requiereTurno: false,
    // Pantalla única (antes había una para supervisores y otra para Mantenimiento): entra quien tenga cualquiera de los dos permisos.
    permiso: ["PARADAS_REGISTRAR", "PARADAS_MANTENIMIENTO"],
    areasExcluidas: ["SERVICIOS_INDUSTRIALES"],
    seccion: "produccion",
  },
  {
    slug: "catalogo-paradas",
    title: "Catálogo de Paradas",
    description: "Editar los tipos de parada, su clase, código y tiempo guía.",
    href: "/catalogo-paradas",
    icon: Wrench,
    requiereTurno: false,
    permiso: "CATALOGO_PARADAS",
    seccion: "base-datos",
  },
  {
    slug: "panel-paradas",
    title: "Panel de Paradas",
    href: "/panel-paradas",
    icon: RadioTower,
    requiereTurno: false,
    // Dashboard de solo lectura: visible para cualquier sesión, como el Panel de Producción.
    atajo: true,
  },
  {
    slug: "programacion",
    title: "Programación",
    description: "Qué se planificó producir en la jornada, por sabor y en cajas.",
    href: "/programacion",
    icon: CalendarRange,
    requiereTurno: false,
    // Programación es de producción — Servicios Industriales y Mantenimiento no la necesitan.
    areasExcluidas: ["SERVICIOS_INDUSTRIALES"],
    rolesExcluidos: ["MANTENIMIENTO"],
    atajo: true,
  },
  {
    // Placeholder: sin href, el hub la muestra deshabilitada ("Próximamente").
    slug: "manual",
    title: "Manual",
    description: "Manual de usuario de la aplicación.",
    icon: BookOpen,
    rolesExcluidos: ["MANTENIMIENTO"],
    requiereTurno: false,
    atajo: true,
  },
  {
    slug: "servicios-industriales",
    title: "Servicios Industriales",
    description: "Cargar Temperatura del Quantum, Agua Osmotizada y Gasoil.",
    href: "/servicios-industriales",
    icon: Thermometer,
    requiereTurno: false,
    areasPermitidas: ["SERVICIOS_INDUSTRIALES"],
  },
  {
    slug: "registros-servicios-industriales",
    title: "Registros del Área",
    description: "Historial de Temperatura del Quantum, Agua Osmotizada y Gasoil cargados.",
    href: "/registros-servicios-industriales",
    icon: History,
    requiereTurno: false,
    areasPermitidas: ["SERVICIOS_INDUSTRIALES"],
  },
  {
    slug: "auditoria",
    title: "Auditoría",
    description: "Qué hizo cada supervisor, turno por turno: resumen, línea de tiempo, actas y registro de cambios.",
    href: "/auditoria",
    icon: History,
    requiereTurno: false,
    permiso: "AUDITORIA_VER",
    color: "blue",
    seccion: "auditoria",
  },
  {
    slug: "calculadoras",
    title: "Calculadoras",
    description: "Fórmula de producto, bobina y conteo por peso.",
    href: "/calculadoras",
    icon: Calculator,
    requiereTurno: false,
    permiso: "CALCULADORAS",
    atajo: true,
  },
  {
    slug: "personal",
    title: "Personal",
    description: "Altas, roles y permisos del personal.",
    href: "/personal",
    icon: Users,
    permiso: "PERSONAL_GESTIONAR",
    requiereTurno: false,
    seccion: "base-datos",
  },
  {
    slug: "edicion-datos",
    title: "Edición de Datos",
    description: "Catálogos generales de la planta: sabores, presentaciones, líneas y más.",
    href: "/edicion-datos",
    icon: DatabaseZap,
    requiereTurno: false,
    permiso: "EDICION_DATOS",
    seccion: "base-datos",
  },
  {
    slug: "preparacion-plc",
    title: "Llenado PLC (prueba)",
    description: "Litros y válvulas en vivo del PLC de Preparación — vista de prueba, en simulación.",
    href: "/preparacion-plc",
    icon: Droplets,
    requiereTurno: false,
    usuarioPermitido: "arondon",
    atajo: true,
  },
  {
    slug: "errores",
    title: "Errores",
    description: "Errores que le salieron a alguien usando la app — quién, cuándo, qué intentaba hacer.",
    href: "/errores",
    icon: ShieldAlert,
    requiereTurno: false,
    soloDueno: true,
    color: "danger",
    seccion: "base-datos",
  },
]

/*
 * Las 3 calculadoras no aparecen sueltas en el Hub — se agrupan bajo
 * la tarjeta "Calculadoras" de arriba (ver src/pages/apps/Calculadoras.tsx).
 * Sus rutas siguen registradas normalmente en src/App.tsx.
 */
export const appsCalculadoras: AppDef[] = [
  {
    slug: "calculadora-bobina",
    title: "Calculadora de Bobina",
    description: "Envases restantes en una bobina de material de empaque, según la medida del core al borde.",
    href: "/calculadora-bobina",
    icon: Calculator,
    requiereTurno: false,
    permiso: "CALCULADORAS",
    color: "success",
  },
  {
    slug: "calculadora-formula",
    title: "Calculadora de Fórmula",
    description: "Insumos de materia prima a pedir según el sabor y la cantidad de tambores o kits a preparar.",
    href: "/calculadora-formula",
    icon: FlaskConical,
    requiereTurno: false,
    permiso: "CALCULADORAS",
    color: "purple",
  },
  {
    slug: "calculadora-conteo-peso",
    title: "Calculadora de Conteo por Peso",
    description: "Pitillos y tapas restantes en una caja, según su peso.",
    href: "/calculadora-conteo-peso",
    icon: Scale,
    requiereTurno: false,
    permiso: "CALCULADORAS",
    color: "blue",
  },
]

/** Una app por slug (tarjetas del hub y calculadoras). */
export function appPorSlug(slug: string): AppDef | undefined {
  return apps.find((a) => a.slug === slug) ?? appsCalculadoras.find((a) => a.slug === slug)
}

/**
 * ¿Esta sesión puede ver/entrar a la app? Único criterio para el hub y
 * para las rutas (ProtectedRoute). El Área de Pruebas entra a todo: es
 * la cuenta de prueba y tiene que poder ejercitar cualquier pantalla.
 */
export function puedeVerApp(session: Session | null, app: AppDef): boolean {
  if (!session) return false
  if (session.area === "PRUEBAS") return true
  if (app.permiso && ![app.permiso].flat().some((p) => puede(session, p))) return false
  if (app.rolesExcluidos?.includes(session.rol)) return false
  if (app.areasPermitidas && !(session.area && app.areasPermitidas.includes(session.area))) return false
  if (app.areasExcluidas && session.area && app.areasExcluidas.includes(session.area)) return false
  if (app.soloDueno && !session.esDueno) return false
  if (app.usuarioPermitido && session.username.toLowerCase() !== app.usuarioPermitido.toLowerCase()) return false
  return true
}
