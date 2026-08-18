# Specs — actualización de diseño del 17/08

Fuente de verdad: `design_handoff_mi_cursada/Mi Cursada.dc.html` (2033 líneas) y
`design_handoff_mi_cursada/NotaAviso.dc.html`. El README del paquete se usó solo
como índice: todas las medidas de estos specs salen del `.html`.

El paquete trae cuatro capacidades nuevas que se pisan entre sí. Se separaron en cinco
specs porque tienen dependencias reales de modelo de datos y se pueden implementar y
verificar de a uno.

| # | Spec | Qué agrega | Depende de |
|---|---|---|---|
| 1 | [`bloques-formato-y-referencias`](bloques-formato-y-referencias/spec.md) | Campos `fmt` y `ref` en el bloque, comandos `/todo`, copy exacto del composer, botón `⋯` | — |
| 2 | [`modal-de-card`](modal-de-card/spec.md) | Modal de detalle de card (580px), click en card, "+ Nueva card", borrar con confirmación, preview de link en el tablero | 1 |
| 3 | [`avisos-vinculados`](avisos-vinculados/spec.md) | `notaId` en el aviso, snippet `NotaAviso`, modal grande de aviso, deep-link aviso → nota | 1, 2 |
| 4 | [`toasts-y-logro`](toasts-y-logro/spec.md) | Toast de acción (ok/delete) con sus 11 mensajes, logro reubicado abajo a la derecha | — (se integra con 2 y 3) |
| 5 | [`paginas-de-nota`](paginas-de-nota/spec.md) | Tipo de bloque `pagina` con `hijos[]`, breadcrumb, badge TO-DO, ancho 1320px | 1, 2 |

Orden sugerido: **1 → 2 → 4 → 3 → 5**. El 4 no depende de nadie y conviene tenerlo antes
del 2 y el 3 porque los dos disparan toasts.

El 5 es el más invasivo: convierte el overlay de bloques de lista plana en árbol y toca
`reordenarBloques`, `agruparPorDia` y los contadores. Se puede postergar sin bloquear al
resto — nada de lo que agregan 1–4 lo necesita.

## Estado (17/08, después de implementar)

| Spec | Estado |
|---|---|
| 1 `bloques-formato-y-referencias` | **implementado** |
| 2 `modal-de-card` | **implementado**, con la sección Aviso incluida |
| 3 `avisos-vinculados` | **parcial**: `notaId`, la action `crearAvisoDesdeNota`, el botón "Crear aviso" del modal y el snippet `NotaAviso` en la lista de Avisos. Faltan el modal grande de aviso, el chevron y el deep-link a la nota |
| 4 `toasts-y-logro` | **implementado**, salvo el flag persistido del logro (`datos/logros.json`) |
| 5 `paginas-de-nota` | **sin implementar** |

Verificado con 438 tests, `tsc --noEmit` y `next lint` limpios, y capturas del
navegador contra el prototipo (menú `/`, tablero y modal de card).

## Regla que se respetó al escribirlos

Cada requisito trae la medida del `.html` con su línea. Donde el prototipo tiene un bug
(hay 14 anotados entre los cinco specs) el spec dice qué se hace en su lugar y por qué,
en vez de copiarlo fielmente.
