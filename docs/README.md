# Documentación de Natulac · Aséptico

El [contexto del proyecto](CONTEXTO-PARA-IA.md) reúne las reglas de operación y las convenciones de trabajo. Para comprobar el comportamiento de esta copia, consulta el código y la última migración que define cada función. La versión de cada servidor se confirma por separado.

## Referencias generales

- [README del proyecto](../README.md) y [mapa del código](../MAPA.md) para orientarse. Algunas rutas del mapa son históricas.
- [Producto](../PRODUCT.md) y [sistema de diseño](../DESIGN.md) para trabajar con la interfaz.
- [Esquema de la base de datos](../supabase/ESQUEMA.md) para ubicar tablas y funciones. Contrasta el esquema con las migraciones recientes.
- [Instrucciones del proyecto](../AGENTS.md) para confirmar cambios críticos.

## Líneas, corridas, paradas y CIP

- **Comportamiento de la copia revisada.** Una parada pausa la corrida y Continuar la retoma. Detener la línea deja la corrida esperando Producto Terminado. Al abrir una parada en curso, el supervisor la deja «Por definir». Puede marcarla Operacional, o Mantenimiento puede tomarla. El CIP todavía crea o reutiliza un `+1`, y el CIP mecánico abre el selector anterior al completar ese pendiente. [Contexto de operación](CONTEXTO-PARA-IA.md#líneas-pt-meta-y-eficiencia) · [Responsable de la parada](../supabase/migrations/20261115590000_responsable_por_definir.sql) · [Inicio de CIP](../supabase/migrations/20261111590000_paradas_linea_unificada.sql#L485)
- **Cambio acordado y pendiente de implementar.** Eliminar el `+1` de los tres motivos de CIP, elegir la falla mecánica en el catálogo modular y habilitar el cierre tras 180 minutos. El CIP y su reparación vinculada cuentan una sola vez en el tiempo de indisponibilidad de la línea. Antes, el plan corrige la asignación de fallas y el conteo por turno. [Plan de correcciones](plan-correcciones-revision.md)
- **Decisión pendiente.** Confirmar qué debe pasar si el supervisor intenta arrancar con una parada «Por definir». [Propuesta de arranque](plan-correcciones-revision.md#4-resolver-el-arranque-con-parada-por-definir)

## Otros módulos

- **Preparación.** [Diseño de preparación con PLC](superpowers/specs/2026-11-06-preparacion-plc-design.md) y [plan de implementación](superpowers/plans/2026-11-09-preparacion-plc.md).
- **Paletizado.** [Diseño de Robot Tavil](superpowers/specs/2026-11-04-operador-robot-tavil-design.md), [trazabilidad](superpowers/specs/2026-11-11-trazabilidad-paletizado-design.md), [referencias del formato](robot-tavil-trazabilidad/README.md) y [tickets](ticket-paletas/plan-tickets-paletas.md).
- **Personal y Calidad.** [Diseño de áreas y puestos](superpowers/specs/2026-11-01-personal-areas-puestos-design.md), [plan de Personal](superpowers/plans/2026-11-01-personal-areas-puestos-fase1.md) y [plan de Calidad](plan-calidad.md). El acceso actual a Calidad se describe en el contexto del proyecto.

## Procedimientos

- [Guía de despliegue](GUIA-SUBIR-AL-SERVIDOR.docx) y [verificador de migraciones pendientes](../scripts/revisar-migraciones-pendientes.sql). Confirma el entorno antes de aplicar cambios.
- [Pruebas de navegador con Playwright](../.claude/skills/probar-app/SKILL.md).

## Planes e historial

- [Correcciones de la revisión](plan-correcciones-revision.md), [Adenpior V2.0](adenpior-v2/plan-adenpior-v2.0.md) y [mejoras futuras](mejoras-futuras.md).
- **Historial de Líneas y Paradas.** [Flujo de Líneas y Producto Terminado del 30 de septiembre](flujos-lineas-y-producto-terminado.md), [plan de Líneas, PT y Paradas](plan-lineas-pt-paradas.md), [plan de Paradas](plan-paradas.md), [rediseño del 26 de octubre](superpowers/specs/2026-10-26-paradas-rework-final-design.md), [catálogo modular](superpowers/specs/2026-10-31-catalogo-fallas-modular-design.md) y [estado único de línea](superpowers/specs/2026-11-05-estado-linea-unico-design.md). Estas referencias explican cómo evolucionó el flujo.
