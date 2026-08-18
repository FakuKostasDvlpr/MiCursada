# Mi Cursada multiusuario y autohospedada — diseño

Fecha: 2026-08-16
Estado: **reemplazado el 2026-08-18** por
`2026-08-18-vercel-supabase-multiusuario-design.md` (se volvió al camino
Vercel + Supabase). Se conserva por las decisiones de privacidad y del panel,
que el spec nuevo hereda.

Reemplaza a `docs/PLAN-VERCEL.md`, que quedó obsoleto: asumía Vercel + Supabase y hoy
la decisión es autohospedar. Ese archivo se archiva al empezar la fase 1.

---

## 1. Objetivo

Que Mi Cursada viva en una URL pública, la usen unas 20 personas del instituto, cueste
$0 por mes, corra sobre software 100% libre y sirva además como proyecto de portfolio
demostrable (GitHub, LinkedIn, entrevistas).

Tres requisitos que salen de ahí y condicionan todo el resto:

1. **Sin lock-in.** Todo el stack tiene que poder mudarse a otra máquina copiando un
   archivo de configuración.
2. **Medible desde el día uno.** La curva de adopción no se puede reconstruir después.
3. **Privado por construcción.** El administrador puede ver *que* la app se usa, nunca
   *qué* escribe cada persona.

---

## 2. Arquitectura

```
Navegador
    │  https
    ▼
Caddy ──── TLS automático (Let's Encrypt)
    │
    ▼
Next.js ──┬──► Postgres 18        (contenedor, puerto NO publicado al host)
          └──► Aula Virtual ORT   (API Moodle, solo lectura)

restic ──► Backblaze B2           (backup nocturno cifrado del lado nuestro)

todo en docker compose, sobre una VM Oracle Cloud Always Free (ARM, 4 vCPU / 24 GB)
```

Cuatro contenedores: `app`, `postgres`, `caddy`, `backup`.

### Por qué esta plataforma

Los PaaS con free tier real se extinguieron para este caso: Vercel y Render no tienen
disco persistente, Fly.io eliminó el free tier en 2024 y Railway en 2023. Las únicas
opciones gratuitas permanentes con disco son las VMs *always free* de Oracle y Google.

La VM de Oracle no es un trial y no vence. Sus tres riesgos reales están en la sección 9.

---

## 3. Persistencia: Postgres

**Decisión: Postgres 18 en un contenedor, sin ORM.** Driver `postgres` (postgres.js), que
parametriza por *tagged template* — la inyección de SQL deja de ser posible por
construcción. `zod` valida en el borde, igual que hoy validan los overlays. Migraciones
como archivos `.sql` numerados, con un runner de ~40 líneas que registra las aplicadas en
una tabla `migraciones`. Sin librería de migraciones.

Esto **contradice CLAUDE.md**, que hoy dice *"No hay base de datos… No volver a agregar un
ORM ni un cliente de base"*. Actualizar ese archivo es parte de la fase 1, con el motivo
escrito: se sacó Supabase porque era un camino muerto (las variables de entorno nunca
estuvieron puestas); se agrega Postgres porque la app pasó a ser multiusuario y
autohospedada, que es un problema distinto.

Se evaluó y descartó:

- **Archivos por usuario** (`datos/u/<id>/`): cero dependencias nuevas y el código actual
  sobrevive casi entero, pero exige escritura atómica a mano, no da transacciones y deja
  las métricas del panel recorriendo archivos.
- **SQLite**: técnicamente el óptimo para una sola VM con ~20 usuarios y lectura
  dominante. Se descartó a favor de la opción convencional, más legible para un tercero
  que evalúe el repo y sin techo si algún día hay más de una instancia de la app.

### Esquema

El contenido del aula se guarda **compartido y como `jsonb`**: se lee entero, cambia solo
en el sync y modelar toda la estructura de Moodle en columnas no aporta nada. Los datos
que escribe cada persona sí van en columnas reales, porque se consultan y se filtran.

```sql
-- Compartido: si cinco personas cursan Fundamentos, esto existe una sola vez
cursos           (id_moodle PK, nombre, datos jsonb, sincronizado timestamptz)
inscripciones    (usuario_id, curso_id, PK(usuario_id, curso_id))

-- Identidad y acceso
usuarios         (id_moodle PK, nombre, carrera, alta, ultima_visita, baja)
credenciales     (usuario_id PK, token_cifrado bytea, nonce bytea, actualizado)
invitaciones     (codigo PK, creada, usada_por, usada_en)
sesiones         (id PK /* sha256 del token */, usuario_id, creada, expira)

-- De cada persona, privado
perfil           (usuario_id PK, nombre, instituto, avatar,
                  consentimiento_en, metricas_opt_out bool)
horarios         (id PK, usuario_id, curso_id, dia smallint /* 1=Lun … 6=Sáb */,
                  inicio time, fin time)
materias_extra   (usuario_id, curso_id, profe, aula, color, PK(usuario_id, curso_id))
bloques          (id PK, usuario_id, curso_id, tipo, texto, url, estado,
                  hecho bool, orden int, creado)          -- las notas y la bitácora
avisos_estado    (usuario_id, aviso_id, hecho bool, PK(usuario_id, aviso_id))
avisos_manuales  (id PK, usuario_id, curso_id, …)
archivos_manuales(id PK, usuario_id, curso_id, …)

-- Métricas (sin contenido, ver sección 6)
eventos          (id bigserial PK, ts timestamptz, usuario_hash, evento, datos jsonb)
```

Todas las marcas de tiempo son `timestamptz`; el render usa `date-fns-tz` sobre
`America/Argentina/Buenos_Aires`, como ya manda CLAUDE.md. Los días de la semana siguen
la convención existente: 1 = Lunes … 6 = Sábado.

### Aislamiento

La defensa primaria es que **toda lectura pasa por `lib/queries.ts`**, que filtra por
usuario siempre. La defensa secundaria es **Row Level Security**: la app abre la
transacción con `SET LOCAL app.usuario_id` y las políticas hacen el resto, de modo que un
bug en una consulta no pueda devolver datos de otra persona. RLS entra en la fase 1
después de que las consultas funcionen, no antes.

### Migración de los datos actuales

Un script de una sola corrida importa el `datos/` de hoy como el primer usuario (vos).
`datos/` queda en disco como respaldo hasta que la app en producción esté validada.

---

## 4. Multiusuario

Los tres módulos que hoy tocan disco — `lib/datos-locales.ts`, `lib/sesion.ts` y
`lib/moodle/credenciales.ts` — pasan a hablar con Postgres. Que las páginas ya lean
únicamente a través de `lib/queries.ts` es lo que vuelve acotado el cambio: hay una sola
puerta que adaptar, no una por página.

- `dirDatos()` desaparece. Las funciones de lectura y escritura reciben el usuario de forma
  **explícita** (nada de `AsyncLocalStorage` ni estado global implícito: el código de este
  repo es explícito y se testea así).
- `lib/queries.ts` sigue siendo la única puerta de lectura y es quien resuelve el usuario
  desde la sesión.
- El caché en memoria de `getDatosLocales()` es hoy una variable única del módulo,
  invalidada por `mtime`. Con Postgres desaparece: si más adelante hace falta cachear, se
  indexa por usuario o se filtran datos de una persona a otra.
- Los tests ya apuntan el almacenamiento a un temporal con `CURSADA_DATOS_DIR`; el
  equivalente pasa a ser una base de test descartable por corrida.
- El **contenido de los cursos se sincroniza una vez por curso**, no una vez por persona:
  menos llamadas al servidor de ORT, que es infraestructura del instituto y no conviene
  golpear veinte veces por lo mismo.

### Lo que hoy está fijo y hay que hacer por persona

- **Carrera, sede y turno** son constantes de `lib/instituto.ts`. Le mienten a cualquiera
  que no curse Analista de Sistemas en Almagro.
- **Los horarios no vienen de Moodle.** Hoy salen de leer el PDF de una carrera puntual.
  Para el resto: se cargan a mano en la app, que ya se puede. Un lector de esos PDFs queda
  fuera de alcance.

---

## 5. Seguridad

Guardar los tokens de 20 personas es asumir responsabilidad sobre sus cuentas del aula
virtual. Estos puntos no son negociables:

1. **Tokens cifrados** con AES-GCM, clave en variable de entorno de la VM. Hoy
   `datos/moodle.json` los guarda en claro: aceptable para un solo usuario que es el dueño
   de la máquina, no para cuentas ajenas.
2. **La contraseña nunca se guarda.** Ya funciona así: se usa para pedir el token y se
   descarta. Ni la contraseña ni el token vuelven jamás al cliente ni van a un log.
3. **Pantalla de consentimiento** en el primer ingreso, en castellano y sin eufemismos:
   qué se guarda, para qué, que el servidor lo administra una persona física y cómo borrar
   la cuenta.
4. **Borrar mi cuenta** que borra de verdad: credenciales, datos personales y eventos.
5. **RLS** como se describe en la sección 3.

### Las notas se guardan sin cifrar — decisión consciente

Se evaluó cifrarlas por usuario con una clave derivada de su contraseña (es viable: las
notas solo se escriben cuando la persona está conectada). Se descartó por el modo de
falla: si alguien cambia la contraseña del aula virtual, sus notas quedan ilegibles para
siempre.

En su lugar: la app no tiene ninguna ruta que permita al administrador leer contenido
ajeno (sección 6), los backups van cifrados, y **el consentimiento dice explícitamente que
quien opera el servidor tiene acceso físico a la base**. Eso es cierto en cualquier
sistema autohospedado; lo que corresponde es decirlo, no disimularlo.

### Endurecimiento de la VM

SSH solo con clave y contraseña deshabilitada; firewall abierto únicamente en 80 y 443;
`unattended-upgrades` activo; la app corriendo sin root dentro del contenedor; el puerto
de Postgres **no** publicado al host.

---

## 6. El back office

Ruta `/admin`. **Privada, solo para el administrador.**

### Cómo se cierra

- El admin es **un id de Moodle en una variable de entorno** (`CURSADA_ADMIN_ID`), no un
  rol en la base ni un usuario marcado. Va el id numérico: es estable, el nombre de usuario
  lo puede cambiar el instituto.
- Se entra con el mismo usuario del aula virtual. No hay segundo login que mantener.
- `exigirAdmin()` se llama en el layout de `app/(app)/admin/` **y por separado en cada
  action y cada route handler del panel**: los POST/GET no pasan por el layout, que es la
  regla que ya tiene CLAUDE.md.
- Para cualquier otro usuario, `/admin` devuelve **404, no 403**. Un 403 confirma que la
  ruta existe.
- Opcional, anotado y no implementado: volver a pedir la contraseña del aula al entrar a
  `/admin`, con validez de 30 minutos, para cubrir el robo de la cookie de sesión.

### La garantía, que es estructural y no una promesa

Las consultas del panel viven en `lib/admin/metricas.ts`, que lee **solo** `eventos`,
`usuarios` y agregados. **No importa los lectores de contenido.** No existe una función
que, desde el panel, abra los bloques de otra persona. Si alguien la agrega algún día, se
ve en el diff.

El panel muestra esa garantía escrita en la propia pantalla, no solo en el README:

> Este panel no muestra el contenido de las notas, la bitácora ni los avisos de nadie.

### Qué mide

Un log append-only de eventos, sin dependencias externas ni cookies de terceros. Cada
evento guarda el **hash** del id de usuario, nunca contenido:

```
{ ts, usuario_hash, evento }        sesion_iniciada · aula_conectada · horario_cargado
                                    nota_creada · materia_organizada · invitacion_usada
{ ts, evento, datos }               sync_ok / sync_error (cursos, ms, detalle)
```

Se descartó Umami y Plausible CE (los dos FOSS y autohospedables): dan páginas vistas, no
"cuántas materias organizó la gente", y suman un contenedor con su propia base.

### Qué muestra

- **Tiles**: activas (7 días), altas totales, materias organizadas, notas escritas.
- **Activas por semana** desde el lanzamiento — barras.
- **Embudo de activación**: invitadas → entraron → conectaron el aula → cargaron horario →
  escribieron su primera nota.
- **Retención por cohorte** semanal — grilla.
- **Personas**: nombre, carrera, alta, última visita, cantidad de materias. Sin contenido.
- **Salud**: última corrida del cron, duración, cursos actualizados, errores, uso de disco,
  último backup, versión desplegada.

Reglas de construcción:

- **Números absolutos, nunca porcentajes.** Con 20 personas una equivale al 5% y los
  porcentajes saltan solos. "17 de 23" es honesto; "74% WAU/MAU" es humo.
- **Sin librería de gráficos.** Barras, sparkline y grilla de cohortes en SVG y CSS grid,
  con los tokens del handoff, para que el panel se vea parte del producto.
- La grilla de cohortes usa una **escala secuencial de un solo tono, claro→oscuro**, no un
  color por celda; validada en tema claro y oscuro. El ámbar `--acc-bg` queda reservado
  para botones y pills, como manda CLAUDE.md.

---

## 7. Vidriera pública

El panel real **no se puede capturar**: salen nombres y carreras de personas reales.

**`/demo`**: la app y el panel completos con datos sintéticos sembrados — materias
inventadas y ~23 usuarios falsos con una curva de adopción creíble. Cualquiera entra desde
el README, hace clic por todo y no ve un dato real. Vale más que diez capturas y de paso
funciona como test de integración.

Además: README con las decisiones y por qué (contenido compartido, panel que no lee
contenido, Postgres y no archivos), `docker compose up` que funcione en la máquina de quien
clone, tests en CI, y licencia — **AGPL-3.0** si "100% open source" tiene que significar que
nadie lo cierre; **MIT** si se prioriza que cualquiera lo use. *Pendiente de decisión.*

---

## 8. Fases

| Fase | Qué | Se puede parar acá |
|---|---|---|
| **1. Datos** | Postgres, esquema, migraciones, RLS, multiusuario explícito, cifrado de tokens, log de eventos, import de `datos/` actual, CLAUDE.md actualizado | no |
| **2. Deploy** | Dockerfile, compose, Caddy, VM, dominio, hardening, cron diario, backup con restauración probada, prueba de portabilidad | **sí** — anda en línea para vos y dos amigos |
| **3. Puerta** | Invitaciones, consentimiento, borrar mi cuenta, opt-out de métricas, carrera por persona | **sí** — ya podés invitar a los 20 |
| **4. Vidriera** | `/admin` completo, `/demo`, README, CI, licencia | — |

El log de eventos va en la fase 1 **por diseño, no por comodidad**: cada semana que pase
sin instrumentación es una semana de curva de adopción que no se puede reconstruir nunca.

El backup con restauración probada va en la fase 2 y no al final: los datos que escribe cada
persona no existen en Moodle, así que no se regeneran. Hasta hoy el riesgo era perder tus
notas; a partir de la fase 3 es perder las de veinte personas.

---

## 9. Riesgos

| Riesgo | Mitigación |
|---|---|
| Oracle reclama la instancia por inactividad (CPU p95 < 20% en 7 días) | Convertir la cuenta a Pay As You Go: se sigue pagando $0 dentro de los límites Always Free y deja de aplicar el reclamo |
| "Out of host capacity" al crear la VM ARM | Reintentar o cambiar de región; si no, GCP e2-micro o un VPS de ~€4 |
| La cuenta de Oracle se suspende | Todo está en `docker compose`: levantarlo en otro VPS es una tarde. **Se prueba una vez en la fase 2**, no se asume |
| Olvidarse de actualizar el servidor | `unattended-upgrades` + recordatorio mensual |
| Perder datos de un compañero | Backup nocturno cifrado fuera de la VM + restauración probada |
| ORT deshabilita el servicio móvil de Moodle | Los datos ya sincronizados siguen visibles (hoy es así); aviso en el panel |
| Uso comercial | No aplica mientras sea entre compañeros y sin cobrar |

---

## 10. Fuera de alcance, a propósito

- **Notas compartidas entre compañeros de la misma materia.** Es la evolución obvia, pero
  cambia el modelo de privacidad entero: aparece contenido publicado, hay que poder
  despublicar y hay que decidir qué pasa si alguien sube algo que no corresponde. Es v2,
  cuando la v1 esté andando y se sepa si la usan.
- Cachear los PDFs y archivos del aula (se sirven a demanda por el proxy que ya existe).
- Notificaciones, app móvil, roles más allá de administrador y usuario.
- Un lector de los PDF de horarios de cada carrera.
- Cualquier métrica que toque contenido.

---

## 11. Decisiones pendientes

1. **Licencia**: AGPL-3.0 o MIT.
2. **Dominio propio** (~US$12/año) o el subdominio gratuito.
