# Plan de correcciones de Natulac · Aséptico

El primer objetivo es que cada parada conserve su falla, su turno y sus minutos correctos. Después se implementará el flujo de CIP de 180 minutos acordado con Alexander. Cada bloque se puede revisar y probar por separado.

La referencia inicial es la auditoría local del 18 de noviembre de 2026. Pasaron TypeScript, 1.014 pruebas del frontend y 30 pruebas del puente PLC. La reconstrucción temporal aplicó 311 migraciones y 13 de 18 ensayos SQL pasaron, dos de ellos con cuentas ficticias añadidas como datos de prueba. Estos resultados corresponden a la copia local de la revisión.

## 1. Asociar la falla a la parada correcta

**Prioridad alta.** Al registrar dos paradas con la misma cuenta y en la misma línea, el guardado posterior de la falla puede actualizar la parada más reciente. El problema se reprodujo en la base local.

- Revisar las entradas que usan `asignarFallaRecienRegistrada`, incluidas apertura, anotación y cobertura. Enviar el ID de la falla al registrar la parada. Guardar el evento y su clasificación en la misma transacción SQL. Cuando se corrija una parada existente, usar su ID exacto.
- Validar en SQL el catálogo activo, que la falla pertenezca a la línea o corresponda a un equipo de servicios y que el usuario tenga permiso. Conservar los códigos del catálogo anterior para consultar el historial.
- Revisar los reintentos y el guardado de varios tramos tras un error. El guardado de un evento y su falla debe completarse íntegramente. Verificar el conteo de SIF y el registro en Auditoría.
- **Criterio de aceptación.** Dos sesiones con la misma cuenta registran A y B en la misma línea y los diagnósticos llegan en orden inverso. Cada falla queda en su parada. Una falla inválida se rechaza y el reintento no genera otra parada para la misma operación.

Referencias. [Formulario de apertura](../src/components/lineas/FormParadaLinea.tsx) · [Anotación y cobertura](../src/components/lineas/PanelParadasLinea.tsx) · [Funciones del catálogo modular](../supabase/migrations/20261113890000_falla_en_paradas.sql)

## 2. Corregir horarios, turno anterior y anotaciones retrospectivas

Puede avanzar en paralelo al bloque 1. El T2 nocturno de 12×12 conserva sus 210 minutos, pero hoy «Cubrir» los ubica en la ventana de 15:00 a 18:30. Mientras se consulta un turno anterior, el formulario usa la fecha actual para horas manuales y la base asigna el `+1` al turno abierto.

- Calcular los límites a partir del turno seleccionado y de su tramo real. Usar esos mismos límites en Modo Paradas, los paneles y el cálculo de minutos sin reportar. Contrastarlos con los límites que ya usa SQL para partir paradas.
- Buscar el turno anterior por la secuencia real de turnos del área. Revisar los dos T2 de 12×12, el paso de medianoche y el primer turno después de un día sin producción.
- Enviar el ID y la ventana del turno que el usuario está viendo. Derivar de ahí la fecha de las horas escritas y validar edición, área y permisos en SQL. El `+1` debe quedar en ese turno cuando se permita editarlo. Si el turno está cerrado para ese usuario, el formulario debe explicar el bloqueo.
- **Criterio de aceptación.** «Cubrir» en T2 nocturno usa 19:00–22:30 y «Turno anterior» abre el T2 diurno correcto. Una parada anotada para ayer queda en ayer. Un caso de madrugada conserva la fecha de jornada y los tramos correctos. Un supervisor recibe un rechazo claro cuando el turno ya no admite cambios.

Referencias. [Modo Paradas](../src/components/lineas/ModoParadas.tsx) · [Horarios 12×12](../src/lib/turno12x12.ts) · [Registro SQL de la anotación](../supabase/migrations/20261113290000_anotar_responsable_y_codigo_mtto.sql)

## 3. Implementar CIP sin pendientes de clasificación

Después del bloque 1, con los límites del bloque 2 verificados para el relevo. Se aplica a CIP por falla mecánica, suministro eléctrico y limpieza por 36 horas.

- Al elegir «Falla mecánica prolongada», abrir el catálogo modular para la línea. Si hay una parada que originó el CIP, mostrar su falla preseleccionada y conservar su hora de inicio. Si hay más de una parada candidata, el supervisor debe confirmar cuál originó el CIP. Guardar la elección al confirmar el inicio.
- Quitar el `+1` de los tres motivos. Vincular el CIP a una sola parada principal y registrar el comienzo del lavado. Guardar el motivo y la clase. La limpieza de 36 horas cuenta como programada. El CIP por falla mecánica o eléctrica conserva la clasificación de la causa.
- Fijar el término del lavado en inicio más 180 minutos. Si se carga tarde, «El lavado empezó antes» permite indicar el inicio real dentro del turno en curso. Habilitar «Terminó CIP» al cumplirse los 180 minutos y validar el mismo límite en SQL. Guardar por separado cuándo confirmó el supervisor. Si la línea ya arrancó, el supervisor puede indicar la hora real de arranque y registrar el motivo de la espera, si hubo.
- Registrar la duración de la reparación para Mantenimiento, incluso cuando ocurra dentro del lavado. Si se prolonga después del CIP, Mantenimiento registra el tramo adicional. Si la línea ya está lista y Producción aún no arranca, el supervisor registra el motivo de la espera. Calcular la indisponibilidad sin duplicar minutos entre la parada principal, el CIP y la reparación.
- Conservar la misma parada en el relevo. Si al desplegar queda un CIP iniciado con un `+1`, permitir terminarlo con el flujo que lo creó. El diseño usa un ciclo continuo de 180 minutos, según la aclaración de Alexander sobre interrupciones.
- **Criterio de aceptación.** Un CIP iniciado a las 10:00 rechaza el cierre antes de las 13:00. Si la reparación duró 45 minutos dentro del lavado, el reporte muestra 180 minutos de indisponibilidad y 45 de reparación. Si Mantenimiento libera a las 13:40, el reporte muestra 220 minutos de indisponibilidad. Si el arranque se retrasa después de liberar, la espera tiene su propio motivo. Un relevo durante el CIP asigna a cada turno solo sus minutos. Verificar también cancelación, doble confirmación y cada motivo de CIP.

Referencias. [Inicio de CIP en Líneas](../src/components/lineas/FormCipLinea.tsx) · [Registro de la parada del CIP](../supabase/migrations/20261111590000_paradas_linea_unificada.sql) · [Confirmación de fin](../supabase/migrations/20261091090000_lineas_cip_y_continuar_lote.sql)

## 4. Resolver el arranque con parada «Por definir»

Este bloque requiere una decisión de planta. Hoy el cierre automático al arrancar solo se aplica si la parada de la línea libre ya es Operacional.

- **Propuesta para confirmar.** Pedir al supervisor que clasifique la parada o que Mantenimiento la resuelva antes de arrancar. Así la responsabilidad queda registrada y la parada deja de sumar cuando corresponde. Si planta necesita arrancar con la clasificación pendiente, acordar cuándo se fija la hora de fin y quién clasifica el evento después.
- **Criterio de aceptación.** Probar el arranque con parada Por definir, Operacional y de Mantenimiento. El mensaje de la tarjeta debe coincidir con la regla aplicada en SQL, y la parada solo debe contar el tiempo que corresponda.

Referencia. [Cierre de paradas al arrancar](../supabase/migrations/20261112890000_parada_en_linea_libre.sql)

## 5. Mejorar los controles de pruebas, despliegue y documentación

Empezar esta etapa desde el primer bloque de trabajo para que las correcciones tengan una base de pruebas fiable.

- **Ensayos SQL.** Completar los datos ficticios que faltan en una base recién creada. Actualizar los ensayos que usan la firma anterior de Robot Tavil, cuentas sin puesto o un perfil incorrecto para probar acceso al catálogo. Para el rol esperado al crear puestos, contrastar el resultado con la regla acordada antes de cambiar la expectativa. Cubrir las cinco fallas de los ensayos y conservar los casos de negocio que tenían por objetivo.
- **Migraciones.** Conciliar los dos números duplicados con el historial y los catálogos de los entornos antes de decidir una corrección. Conservar el orden de migraciones ya aplicadas. Usar archivos nuevos para cambios de SQL, agregar sus marcas al verificador y probar tanto una instalación desde cero como una actualización desde la versión anterior. Verificar que PostgREST reconozca las funciones actualizadas.
- **Ingreso y diseño.** Mover las consultas que requieren credencial para que se ejecuten con sesión iniciada. Retirar el texto provisional del manual y ajustar el verbo «Parar» al vocabulario vigente, usando una etiqueta que se distinga de la acción de cierre de corrida. Revisar las pantallas modificadas en teléfono y PC, con los componentes y colores del diseño del proyecto.
- **Reportes.** Confirmar si el Panel de Producción debe conservar los límites de merma de envase de 2,5 % y 3 % o usar los de estadísticas de 3 % y 5 %. Comparar con un mismo turno el cálculo de merma del acta y del panel antes de armonizarlos. Si hay una diferencia deliberada, documentar qué mide cada vista. Dejar para una decisión aparte el alcance de los pendientes de 30 días y de las lecturas de Servicios Industriales.
- **Guías y referencias.** Actualizar `PRODUCT.md` para reflejar el acceso a Calidad por permiso. Actualizar `MAPA.md` y la guía de despliegue donde la revisión encontró rutas o pasos fuera de fecha. Identificar como históricos los planes ya sustituidos y registrar las decisiones nuevas de CIP y turnos en sus documentos vigentes.
- **Criterio de aceptación.** Los ensayos pertinentes arrancan con datos ficticios reproducibles y verifican los flujos actuales. El ingreso deja de lanzar las consultas de catálogos antes de autenticarse. El mapa apunta a las pantallas y funciones usadas y la guía de despliegue coincide con el procedimiento confirmado por Alexander.

## Validación y paso entre entornos

1. **Rama local.** Implementar y revisar un bloque por vez. Ejecutar TypeScript, las pruebas de frontend relacionadas, los ensayos SQL afectados y una comprobación de interfaz con datos ficticios. Para cambios de SQL, comprobar también permisos, Auditoría y reintentos.
2. **Servidor de pruebas.** Con autorización, desplegar el bloque y comprobar el flujo con PostgreSQL y PostgREST reales. En CIP, probar los tres motivos, la espera de 180 minutos y el relevo. Para los cambios que los afecten, comprobar también `pg_cron`, SMTP, PLC físico, impresión de tickets y los teléfonos de planta.
3. **Producción.** Pasar cada bloque una vez validado en pruebas y con confirmación de Alexander. Verificar la versión objetivo, las migraciones pendientes y el estado de los CIP activos. Definir y comprobar la recuperación antes de desplegar si el cambio modifica la base. Después, comprobar que se ve la versión esperada y que el flujo funciona con una operación autorizada.

La [regla de confirmación del proyecto](../AGENTS.md) se aplica antes de implementar los cambios críticos de código, configuración o datos, y antes de unir a `main`, aplicar migraciones en servidores o desplegar. La primera aprobación de implementación corresponde al bloque 1 en una rama local. La decisión sobre el arranque de una línea con parada «Por definir» y la confirmación de los umbrales de merma pueden resolverse en paralelo al trabajo ya aprobado.
