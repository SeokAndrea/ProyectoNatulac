# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Principal: el supervisor de turno, en la planta.** Usa la app en el teléfono durante el turno, entre una tarea y otra, con ruido y apuro (no usa guantes). Carga lo que pasa en las líneas: arranque del turno, preparación de tanques, corridas, paradas, producto terminado y contador, y el cierre con su acta.
- **También:** Jefe de Producción y Analista (revisan, validan la jornada y sacan indicadores, sobre todo en la PC), Mantenimiento (atiende paradas y Solicitudes de Inspección o Intervención), Calidad, Servicios Industriales, Super Administrador, la dueña de la app (por encima del Super Administrador) y usuarios de solo vista.

## Product Purpose

App web de la planta Aséptico de Natulac (néctares, líneas de envasado aséptico L1 a L3) que reemplaza las planillas y actas en papel del turno. El objetivo es llevar el control, pero hay quejas de que cargar es tedioso: cada paso de más pesa. Funciona bien cuando:

- los datos son confiables (PT, paradas, merma, OEE) y no hay que corregirlos después;
- el supervisor carga rápido y sin equivocarse;
- el papel ya no hace falta: las actas salen de la app, listas para imprimir;
- los paneles muestran lo que pasa en las líneas en el momento.

## Positioning

Hecha a la medida de esta planta y de su forma de trabajar: la jornada de 7:00 a 7:00, los turnos, los lotes y corridas de cada línea, el catálogo propio de paradas con sus códigos de planilla y las reglas de Mantenimiento. No es un sistema genérico de producción.

## Operating Context

- Teléfonos propios o compartidos, de pantalla chica y a veces viejos; el supervisor tiene poco tiempo y atención para leer.
- Paneles en vivo (Producción, Paradas) en pantallas o TV de la planta, que se miran de lejos.
- PC de oficina para revisar, validar y sacar indicadores.
- Corre en el servidor de planta: PostgreSQL propio (`db_control_nectares`) con PostgREST; antes era Supabase.
- Hora de planta: America/Caracas. La jornada va de 7:00 a 7:00.
- La entrega real de una línea después de una reparación es el acta impresa y firmada; por eso cerrar una Solicitud de Intervención se trata como acción sin vuelta atrás (rojo, con confirmación).
- Existe un Área de Pruebas, con sus propias líneas, para probar sin tocar la producción real.

## Capabilities and Constraints

- Módulos: Comenzar y Finalizar Turno, Preparación de tanques (y llenado PLC en prueba), Líneas, Producto Terminado y Contador, Resumen Diario, Validar jornada, Mis Actas, Panel de Producción, Panel de Paradas, Registrar Paradas, Catálogo de Paradas, Solicitudes de Inspección e Intervención, Indicadores, Programación, Servicios Industriales, Auditoría, Calculadoras, Personal, Edición de Datos y Errores.
- Calidad existe, pero solo en el Área de Pruebas: no incluirla en diseños nuevos.
- Cada pantalla depende del rol, el área y los permisos de la sesión; muchos roles solo miran.
- La lógica vive en la base (funciones SQL): el front solo muestra y llama. Para frenar errores se prefieren bloqueos y botones directos a los avisos de texto.
- Idioma: español, sin voseo ni argentinismos; descripciones cortas.
- Términos de la planta: turno, jornada, corrida, lote, tanque, PT (producto terminado), parada, CIP, llenadora, merma, acta, SIF (Solicitud de Inspección o Intervención de Falla).

## Brand Commitments

- Nombre: Natulac. La app se presenta como "Producción Natulac".
- Logo e íconos: `public/Logo.webp`, `public/IconoNatulac.png`, `public/icon-*.png`; fondo: `public/fondo.webp`.

## Evidence on Hand

- Los datos reales son de la planta (turnos, paradas, PT): no publicar fotos de pantallas con datos reales sin permiso de la dueña.
- No hay testimonios, clientes ni cifras públicas: no inventarlos.

## Product Principles

1. **Cargar en segundos, en el teléfono, en la planta.** Si algo pide leer mucho, escribir mucho o atinarle a un botón chico, está mal.
2. **El dato correcto antes que el dato rápido.** Mejor un bloqueo claro o un botón directo que un aviso que se ignora.
3. **Reemplazar el papel de verdad.** Lo que antes era una planilla o un acta sale completo de la app, listo para imprimir.
4. **La planta en vivo, legible de lejos.** Los paneles se entienden de un vistazo desde la distancia.
5. **Cada rol ve lo suyo.** Quien solo mira no ve botones que no puede usar, y quien gestiona ve primero lo que le toca atender.

## Accessibility & Inclusion

- Uso con apuro y en movimiento: botones grandes y separados, y textos que se entienden sin leerlos dos veces.
- Pantallas chicas y teléfonos viejos: todo tiene que funcionar a 400 px de ancho.
- Paneles en TV: tamaños y contrastes que se lean a varios metros.
