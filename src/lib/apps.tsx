import type { LucideIcon } from "lucide-react"
import {
  Warehouse,
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
  BookOpen,
  Droplets,
  Users,
  ClipboardList,
  Siren,
  ListChecks,
  BarChart3,
} from "lucide-react"
import type { Session } from "@/lib/auth"
import type { RolCodigo } from "@/lib/catalogos"
import { puede, type Permiso } from "@/lib/permisos"
import { esSoloVista, PANELES_SOLO_VISTA } from "@/lib/rolVista"

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
  /** Si se define, la tarjeta solo aparece para estos roles (ej. Calidad, Servicios Industriales). Lo decide el rol, no el área. */
  rolesPermitidos?: RolCodigo[]
  /** Tarjeta en prueba: solo la ve el Área de Pruebas hasta que se apruebe (ej. Validar jornada). */
  enPrueba?: boolean
  /** Atajo chico junto al saludo del hub, en vez de la grilla principal (ver Hub.tsx). */
  atajo?: boolean
  /** Se bloquea (gris) cuando SÍ hay un turno en curso — lo opuesto de requiereTurno (ver Comenzar Turno). */
  bloqueaConTurno?: boolean
  /** Se resalta en rojo cuando hay un turno en curso, para que sea obvio el siguiente paso (ver Finalizar Turno). */
  resaltarConTurno?: boolean
  /** Con candado mientras el turno es una continuación recién abierta por el sistema (ver src/lib/continuidadTurno.ts). */
  bloqueaEnContinuidad?: boolean
  /** Color fijo del ícono/tarjeta (por defecto: primary) — para distinguir a simple vista pasos como Comenzar/Preparación/Finalizar. */
  color?: "success" | "blue" | "purple" | "warning" | "danger"
  /** Si es true, la tarjeta solo aparece para el dueño (ver session.esDueno). */
  soloDueno?: boolean
  /** Si se define, la tarjeta solo aparece para ese username exacto (case-insensitive), sin importar rol o área — para vistas de prueba de un solo usuario. */
  usuarioPermitido?: string
  /**
   * Grupo bajo el que aparece la tarjeta en la grilla principal del hub,
   * con un separador y título arriba (ver Hub.tsx). Sin esta propiedad,
   * la tarjeta va suelta, sin sección. "apoyo": tarjetas de las áreas de
   * apoyo (Calidad, Servicios Industriales); para quien es de un área de
   * apoyo, las de "produccion" que ve (ej. Registrar Paradas en
   * Mantenimiento) también van ahí.
   */
  seccion?: "produccion" | "apoyo" | "auditoria" | "base-datos"
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
    bloqueaConTurno: true,
    color: "success",
    seccion: "produccion",
  },
  {
    slug: "preparacion",
    title: "Preparación",
    href: "/preparacion",
    icon: Beaker,
    requiereTurno: true,
    permiso: "TURNO_CARGAR",
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
    // Solo los roles de Calidad (ven el turno de Aséptico, migración 20261089); Pruebas entra a todo. Ver docs/plan-calidad.md.
    rolesPermitidos: ["CALIDAD", "SUPERVISOR_CALIDAD"],
    color: "purple",
    seccion: "apoyo",
  },
  {
    slug: "inventario",
    title: "Inventario diario",
    description: "Materia prima y material de empaque: inventario de la mañana y de la tarde.",
    href: "/inventario",
    icon: Warehouse,
    requiereTurno: false,
    // Analista, Jefe y Supervisor (migración 20261112290000).
    permiso: "INVENTARIO_CARGAR",
    seccion: "produccion",
  },
  {
    slug: "lineas",
    title: "Líneas",
    href: "/lineas",
    icon: Factory,
    requiereTurno: true,
    permiso: "TURNO_CARGAR",
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
    seccion: "produccion",
  },
  {
    slug: "finalizar-turno",
    title: "Finalizar Turno",
    href: "/finalizar-turno",
    icon: ClipboardCheck,
    requiereTurno: true,
    permiso: "TURNO_ASUMIR",
    resaltarConTurno: true,
    bloqueaEnContinuidad: true,
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
    slug: "validar-jornada",
    title: "Validar jornada",
    description: "Revisar el día (cajas, envases, semielaborado y paradas) y validarlo para los KPIs.",
    href: "/validar-jornada",
    icon: ListChecks,
    requiereTurno: false,
    permiso: "VALIDAR",
    // En prueba (2026-10-12): solo el Área de Pruebas hasta que la Analista lo apruebe. Ver src/lib/validarJornada.ts.
    enPrueba: true,
    seccion: "auditoria",
  },
  {
    slug: "mis-actas",
    title: "Mis Actas",
    href: "/mis-actas",
    icon: FileText,
    requiereTurno: false,
    permiso: "TURNO_CARGAR",
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
    seccion: "produccion",
  },
  {
    slug: "solicitudes-intervencion",
    title: "Solicitudes de Intervención",
    description: "Fallas repetidas para Mantenimiento.",
    href: "/solicitudes-intervencion",
    icon: Siren,
    requiereTurno: false,
    // Las genera el servidor (migración 20261109390000). Mantenimiento las gestiona (SIF_GESTIONAR); quien registra paradas o audita las ve.
    permiso: ["SIF_GESTIONAR", "PARADAS_REGISTRAR", "PARADAS_MANTENIMIENTO", "AUDITORIA_VER"],
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
    slug: "indicadores",
    title: "Indicadores",
    href: "/indicadores",
    icon: BarChart3,
    requiereTurno: false,
    // Jefe, analista y la dueña (2026-10-13): los mismos del Resumen Diario. Cada mes, automático o cargado a mano.
    permiso: ["RESUMEN_VER", "VALIDAR"],
    // Atajo al lado del Panel de Paradas, en amarillo (dueña, 2026-10-15).
    atajo: true,
    color: "warning",
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
    slug: "programacion",
    title: "Programación",
    description: "Qué se planificó producir en la jornada, por sabor y en cajas.",
    href: "/programacion",
    icon: CalendarRange,
    requiereTurno: false,
    // Programación es de producción: la ve quien carga el turno o la edita (las áreas de apoyo no la necesitan).
    permiso: ["TURNO_CARGAR", "PROGRAMACION_EDITAR"],
    atajo: true,
  },
  {
    slug: "servicios-industriales",
    title: "Servicios Industriales",
    description: "Cargar Temperatura del Quantum, Agua Osmotizada y Gasoil.",
    href: "/servicios-industriales",
    icon: Thermometer,
    requiereTurno: false,
    rolesPermitidos: ["SERVICIOS_INDUSTRIALES"],
    seccion: "apoyo",
  },
  {
    slug: "registros-servicios-industriales",
    title: "Registros del Área",
    description: "Historial de Temperatura del Quantum, Agua Osmotizada y Gasoil cargados.",
    href: "/registros-servicios-industriales",
    icon: History,
    requiereTurno: false,
    rolesPermitidos: ["SERVICIOS_INDUSTRIALES"],
    seccion: "apoyo",
  },
  {
    slug: "auditoria",
    title: "Auditoría",
    description: "Línea de tiempo.",
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
    // Ya no es atajo: arriba van solo los paneles, Indicadores, Manual y Programación (dueña, 2026-10-15).
    seccion: "produccion",
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
    // TEMPORAL (rama feature/preparacion-plc, solo para sacar capturas con
    // el usuario "pruebas"): revertir a "arondon" o decidir el permiso final
    // antes de mezclar a main.
    usuarioPermitido: "pruebas",
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

/** Una app por slug (tarjetas del hub). Las tres calculadoras viven dentro de "Calculadoras" (src/pages/apps/Calculadoras.tsx). */
export function appPorSlug(slug: string): AppDef | undefined {
  return apps.find((a) => a.slug === slug)
}

/**
 * ¿Esta sesión puede ver/entrar a la app? Único criterio para el hub y
 * para las rutas (ProtectedRoute). El Área de Pruebas entra a todo: es
 * la cuenta de prueba y tiene que poder ejercitar cualquier pantalla.
 */
export function puedeVerApp(session: Session | null, app: AppDef): boolean {
  if (!session) return false
  // Solo Vista: los dos paneles y nada más, aunque esté en Pruebas.
  if (esSoloVista(session)) return PANELES_SOLO_VISTA.some((p) => p.slug === app.slug)
  if (session.area === "PRUEBAS") return true
  if (app.enPrueba) return false
  if (app.permiso && ![app.permiso].flat().some((p) => puede(session, p))) return false
  if (app.rolesExcluidos?.includes(session.rol)) return false
  if (app.rolesPermitidos && !app.rolesPermitidos.includes(session.rol)) return false
  if (app.soloDueno && !session.esDueno) return false
  if (app.usuarioPermitido && session.username.toLowerCase() !== app.usuarioPermitido.toLowerCase()) return false
  return true
}
