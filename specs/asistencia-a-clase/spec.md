# Asistencia a clase — llegadas por click, no por espionaje

**Estado: plan futuro, NO implementado.** (18/08/2026)

## 1. Por qué

Queremos saber a qué hora entró cada persona a cada clase (o si no entró),
para métricas de asistencia en el panel admin.

## 2. Lo que NO se hace, y por qué

**No se detectan las ventanas abiertas del usuario** (p. ej. "tiene Zoom
abierto"). Una web app no puede enumerar ventanas ni procesos — el navegador lo
bloquea a propósito — y la única alternativa (un agente nativo o extensión que
escanee procesos) es funcionalmente un spyware. Rompería la promesa estructural
del panel admin (specs/panel-admin §2: se ve *que* usás la app, no *qué* hacés)
y la confianza sobre la que se sostiene toda la app multiusuario.

## 3. El diseño: el click es el dato

La app pasa a ser la puerta de entrada a la clase; el registro sale de una
acción visible y voluntaria, no de vigilancia.

- **R1.** Cada materia guarda su **link de Zoom/Meet** (campo editable junto a
  profe/aula/color; overlay del usuario, no viene de Moodle).
- **R2.** En Hoy, con clase de hoy próxima o en curso, el hero muestra
  **"Entrar a la clase"**: abre el link en una pestaña nueva y registra el
  evento `clase_entrada { curso_id, horario_id }` (timestamp del servidor).
- **R3.** **"Ya estoy en clase"** como fallback manual para quien entró por
  otro lado. Base existente: `TileAsistencia` + `estadoAsistencia`
  (lib/cursada.ts, ventana de `MIN_ANTES_ASISTENCIA`) — hoy no registra evento;
  pasa a registrar `clase_entrada { origen: 'manual' }`.
- **R4.** Clasificación contra el horario (funciones puras con tests, mismo
  criterio que `badgeLlegada`):
  - click ≤ inicio → **a tiempo**
  - inicio < click < fin → **tarde** (+N min)
  - sin evento en [inicio − MIN_ANTES_ASISTENCIA, fin] → **no entró** (derivado,
    no se registra nada: la ausencia es la falta del evento)
- **R5.** Panel admin: sección "Llegadas" — por clase (quiénes y a qué hora) y
  por persona (racha, promedio de demora, ausencias). Solo metadata; misma
  regla estructural de specs/panel-admin.
- **R6.** **Consentimiento actualizado**: la pantalla del primer ingreso pasa a
  decir explícitamente que el botón de entrar a clase registra la hora. La
  asistencia es dato sensible; nadie debe descubrirlo en el panel.
- **R7.** La persona ve sus propias llegadas (en la materia o el perfil) — lo
  que el admin ve de vos, vos también lo ves.

## 4. Fuera de alcance

- Detección de ventanas/procesos/apps abiertas, en cualquier forma.
- Verificar que la persona *siguió* en la clase (ni heartbeat, ni foco de
  pestaña): el dato es la entrada, no la permanencia.
- Integración con la API de Zoom (reportes de asistencia del host): el host es
  el instituto, no nosotros.

## 5. Dependencias

Ya existen: `eventos` (tabla + `registrarEvento`), `estadoAsistencia` y
`TileAsistencia`, `badgeLlegada`, el panel admin con feed de eventos.
Falta: campo de link por materia, el botón, la clasificación pura con tests,
la sección del panel y el texto de consentimiento.
