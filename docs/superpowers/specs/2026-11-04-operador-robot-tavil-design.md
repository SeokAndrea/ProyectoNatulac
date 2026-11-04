# Operador del Robot Tavil: precarga de paletas

Estado: aprobado por Alexander y Andrea el 2026-11-04. Implementado en la migración
`20261114690000_robot_tavil_precarga.sql` y en la pantalla `/robot-tavil`.

## Para qué

Hoy el Producto Terminado (PT) se carga una vez por corrida: el supervisor escribe el total de
paletas y cajas sueltas al cerrarla. Se quiere llevar el control paleta por paleta, en el momento
en que sale, con una persona del Robot Tavil que cuenta.

## Flujo

1. **Quien tenga el permiso del Robot Tavil** (el operador): carga las paletas y el «Resto» del
   lote en curso. Es una **precarga**; no toca el PT oficial.
2. **Supervisor**: en la tarjeta de Producto Terminado ve la precarga de cada corrida. La
   **confirma** si está correcta o la **corrige**. Al confirmar queda cargado el PT de siempre
   (`registrar_producto_terminado`), así que Panel, acta y mermas no cambian.
3. **Validación**: la información ya confirmada se valida en la tarjeta de **Validar jornada**, como hoy.

## Pantalla del operador

- Ve las **líneas activas** del área de planta (Pruebas si su sesión es de Pruebas; si no,
  Aséptico). No abre turno. No se configura a qué línea está conectado el robot: el operador mira
  qué paleta está saliendo, elige su línea y suma.
- Por cada línea: la misma cabecera de la tarjeta de PT (línea, lote, presentación), el contador de
  paletas con botones **+** y **−**, la hora de la última paleta y el **Resto** en una caja de
  texto (se escribe el número; se guarda solo al dejar de escribir o al salir del campo).
- Sin más pasos ni formularios. Equivocarse se corrige con el **−**.
- La pantalla se relee cada 10 s.

### Qué pasa cuando el supervisor cierra la corrida

- **Termina la corrida**: la tarjeta se bloquea («Corrida terminada») con un aviso de cómo quedó.
  No se carga nada hasta que el supervisor cargue un lote nuevo en la línea.
- **Carga un lote nuevo**: el aviso azul lo muestra (lote, sabor, presentación) con el botón
  **«Iniciar con el lote …»**. Al tocarlo, la tarjeta pasa al lote nuevo con la cuenta en cero y un
  aviso verde de cómo cerró el anterior. El cambio no es automático, para que una paleta que sale
  justo en el cambio no quede en el lote equivocado. Si el lote anterior seguía abierto, hasta
  tocar Iniciar se sigue sumando en él.
- **Entrega la línea**: la corrida queda cerrada. Las paletas que salen mientras el turno siguiente
  no abre se guardan sin corrida; cuando abre (misma línea y mismo lote), la cuenta pasa sola a la
  corrida nueva con esas paletas.
- Una corrida cerrada hace más de 12 h deja de mostrarse.

## Qué se registra

**Paleta** (un registro por cada «+», tabla `robot_tavil_paletas`):
- hora de salida (la del servidor);
- corrida, de la que se heredan **línea, lote, sabor y presentación**; el operador no los escribe;
- quién la registró.

El «−» **anula** la última paleta de esa corrida (no la borra: queda quién y cuándo). El operador no
tiene otra corrección.

**Resto** (tabla `robot_tavil_resto`): las cajas que quedan cuando el lote termina sin completar una
paleta. Se cuentan una a una y se guardan como **un número por corrida**, con hora y autor, sin
hora por caja.

**Lote que cambia**: la paleta se queda con la corrida que estaba en curso al registrarla. El
supervisor puede corregirla al confirmar.

## Confirmar o corregir (supervisor)

- Se guarda siempre **lo que cargó el operador** (sus tablas) y **lo que confirmó el supervisor**
  (`producto_terminado`), cada uno con su hora y su autor, de modo que la diferencia queda a la vista.
- La tarjeta de PT muestra un aviso azul con la precarga (paletas, Resto, última paleta y quién la
  cargó) y, bajo Paletas y Cajas sueltas, «Robot: N». Si el supervisor escribe otro número dice
  «Corriges la precarga: Robot N». Si lo ya registrado no coincide con la precarga, lo avisa.
- **Cuándo se llenan los campos con la precarga**: con el botón «Usar la precarga», o solos cuando
  el PT es obligatorio (al elegir Terminar o Entregar línea, o con la corrida esperando su PT) y los
  campos están vacíos. No se llenan solos a media corrida: registrar el contador mandaría también el
  PT, y pasada 1 h el PT ya no se puede cambiar.
- La tarjeta del supervisor relee la precarga cada 20 s.

## Permisos

No se crea un puesto. Se crea el **permiso** `ROBOT_TAVIL_CARGAR` («Cargar paletas del Robot
Tavil», tema Turnos), que habilita la tarjeta del Robot Tavil; **cualquiera que lo tenga puede
cargar** las paletas y el Resto. No nace en ningún puesto: se da desde Áreas y puestos o como
permiso extra en Personal (ver `2026-11-01-personal-areas-puestos-design.md`). El Super
Administrador y el Probador lo tienen por tener todos.

- El servidor valida el permiso en cada función del operador; no basta con ocultar la tarjeta.
- El supervisor confirma con los permisos de Producto Terminado que ya tiene.

## Fuera de alcance por ahora

- Conexión automática con el robot o el PLC.
- Cambiar cómo se calculan el Panel, el acta o las mermas.
- Mostrar la precarga en la vista de una corrida ya cerrada y en Validar jornada.
