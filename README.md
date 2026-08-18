# Mi Cursada

App mobile-first para organizar la cursada nocturna. Tiene dos modos:

- **Multiusuario (Supabase + Vercel)**: con `.env.local` (o las env vars de Vercel)
  configuradas, cada persona entra con su cuenta del aula virtual y ve solo lo suyo. Ver
  la sección [Multiusuario (Supabase + Vercel)](#multiusuario-supabase--vercel) más abajo.
- **Local, un solo usuario**: sin esas variables, los datos salen de un snapshot del aula
  virtual (Moodle) y de unos overlays de edición, todos en la carpeta `datos/` del repo
  (ignorada por git — son datos personales). Sigue siendo el modo de desarrollo por
  defecto: no hace falta un proyecto de Supabase para levantar la app localmente.

## Desarrollo

```bash
npm install
npm run dev
```

Anda en http://localhost:3000. Si no existe `datos/aula-virtual.json`, la app arranca
vacía sin romperse.

Otros comandos:

```bash
npm run typecheck   # tsc --noEmit
npm test            # vitest
npm run build       # build de producción
```

## Login: el del aula virtual

Para entrar a la app se usan **el mismo usuario y la misma contraseña del aula
virtual**. No hay cuentas propias ni registro.

Qué pasa cuando entrás (`iniciarSesion` en `app/actions-sesion.ts`):

1. usuario + contraseña van a `{url}/login/token.php`;
2. si Moodle los acepta, el token de lectura que devuelve queda en
   `datos/moodle.json` — el mismo que usa la sincronización, así que **entrar
   también renueva el token vencido**;
3. se abre una sesión de la app: cookie `cursada_sesion` (httpOnly, 30 días).

Las sesiones abiertas viven en `datos/sesiones.json`, y ahí se guarda **el
SHA-256 del token de sesión, nunca el token**: quien lea ese archivo no puede
fabricarse una sesión. La contraseña no se guarda en ningún lado (solo se usa
para el fetch a `/login/token.php`).

**Un solo dueño**: la primera cuenta que entra se queda con la app. Después, si
otra cuenta del aula virtual intenta entrar, la app la rechaza (compara el
`userid` guardado) para que nadie más vea tus datos ni pise tu token. Para
reasignarla, borrá `datos/moodle.json`.

**Cerrar sesión** está en la sidebar (desktop) y abajo del perfil (móvil), con
un modal de confirmación. Cierra la sesión de ese dispositivo —las demás siguen
abiertas— y **no** borra el token del aula virtual: para eso está "Desconectar",
en el panel del aula virtual.

**El instituto no se escribe a mano**: sale del `sitename` que devuelve
`core_webservice_get_site_info`. Se guarda en el perfil al entrar y se refresca
cada vez que se verifica el token, así que si el aula virtual cambia de nombre,
la app lo sigue. La carrera, la sede y el turno siguen siendo constantes de
`lib/instituto.ts` porque la API de Moodle no los expone.

### No hay forma de saltear el login

Existió un `CURSADA_SIN_LOGIN=1` que desactivaba la autenticación, y estaba mal:
con eso prendido, cerrar sesión borraba la sesión, redirigía a `/login`… y
`/login` te devolvía a la app de una, porque seguía habiendo acceso. O sea, el
botón de cerrar sesión parecía no hacer nada. Se eliminó: entrar es tener
sesión, y nada más.

Si alguna vez el aula virtual está caída y necesitás ver tus datos sin poder
loguearte, la salida es abrir `datos/` a mano (son JSON) o levantar la app con
un `datos/sesiones.json` armado; no hay un interruptor que deje la puerta
abierta sin querer.

## Multiusuario (Supabase + Vercel)

Todo lo de arriba (`## Login: el del aula virtual`) describe el modo local, de un solo
dueño. Con un proyecto de Supabase configurado, la app pasa a multiusuario: cada persona
entra con su propia cuenta del aula virtual y ve solo lo suyo, con [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)
real en Postgres. El **modo `datos/` sigue funcionando tal cual para desarrollo**: sin
`.env.local`, la app arranca en modo local sin tocar Supabase para nada.

### Configurar `.env.local`

```bash
cp .env.example .env.local
```

y completar (ver `.env.example`):

- `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` — del proyecto de Supabase.
- `SUPABASE_SERVICE_ROLE_KEY` — **solo servidor**, nunca con prefijo `NEXT_PUBLIC_`. La usa
  `adminClient()` (`lib/supabase/admin.ts`) para el alta del usuario sombra, leer y
  escribir `credenciales`, el sync compartido, `eventos` y el borrado de cuenta. Nunca
  llega al cliente.
- `CURSADA_TOKEN_KEY` — 32 bytes en base64 (`openssl rand -base64 32`) que cifran el token
  del aula virtual (AES-256-GCM, `lib/cifrado.ts`) antes de guardarlo en `credenciales`.
- `CURSADA_ADMIN_ID` — tu `userid` de Moodle (site info), para habilitar el panel `/admin`
  más adelante.
- `CRON_SECRET` — protege `app/api/cron/sync` (Vercel lo manda como header
  `Authorization: Bearer <CRON_SECRET>` según el cron de `vercel.json`).

Con todas cargadas alcanza para correr `npm run dev` en modo multiusuario contra ese
proyecto de Supabase. Las migraciones del esquema viven en `supabase/migrations/`.

### Qué guarda cada tabla

Compartido — una sola vez aunque cinco personas cursen la misma materia, lo escribe solo
el sync compartido (service role):

- `cursos` — el contenido de cada materia tal como lo arma el sync (`jsonb`), sin overlays
  personales.
- `archivo_refs` — refs opacas de archivos del aula (`"{cmid}:{indice}"`) que resuelve el
  proxy `/api/archivo`.
- `avisos_curso` — avisos que trae el sync del aula virtual.
- `inscripciones` — qué `user_id` está inscripto en qué `curso_id`.

Identidad y acceso:

- `perfiles` — nombre, carrera (editable por persona), instituto, avatar, fecha de
  consentimiento, alta y última visita.
- `credenciales` — el token del aula virtual cifrado (`token_cifrado`, `nonce`) más
  metadatos no sensibles (url, usuario, fechas).

Personal de cada persona (RLS por `auth.uid()`): `horarios`, `materias_extra` (profe,
aula, color), `bloques` (las notas estilo Notion), `avisos_estado`, `avisos_manuales`,
`archivos_manuales`.

Métricas y sync (solo servidor, sin contenido): `eventos` (hash del usuario + nombre de
evento, nunca contenido) y `sync_log` (resultado de cada corrida del sync).

**Regla de acceso**: el contenido del aula (`cursos`, `avisos_curso`) es compartido con
policy de `select` condicionada a estar inscripto; lo personal lleva RLS por `auth.uid()`
para todo; `credenciales`, `eventos`, `archivo_refs` y `sync_log` no tienen policies —
solo se leen y escriben con la service role, siempre desde el servidor.

### Consentimiento y borrado de cuenta

En el primer ingreso, `/consentimiento` explica qué se guarda (nombre, carrera, el token
de solo lectura cifrado, horarios, notas, avisos) y quién administra el servidor. Sin
aceptar no se entra a la app; `perfiles.consentimiento_en` queda como constancia. Todas
las Server Actions que tocan datos del usuario chequean ese consentimiento por su cuenta
(una action es un POST que no pasa por el layout).

Desde el perfil, **"Borrar mi cuenta"** borra de verdad: el usuario de Supabase Auth
(cascada sobre `perfiles`, `credenciales`, `inscripciones` y todas las tablas personales)
y el avatar del bucket. Los `eventos` quedan — son hashes, no identifican a nadie.

### Sync compartido

El contenido se sincroniza **una vez por curso, no por persona**: al entrar (o con
"Sincronizar ahora") se mira `cursos.sincronizado` de cada curso inscripto; si tiene más
de 6 horas, se refresca con el token de quien dispara. Además hay un **cron diario**
(`app/api/cron/sync`, programado en `vercel.json`) que recorre los cursos con inscriptos
y los refresca, protegido con `CRON_SECRET`, y solo sincroniza a quienes ya dieron su
consentimiento.

## Correr con Docker

```bash
docker compose up --build
```

Queda en http://localhost:3000.

La imagen es multi-stage sobre el build `standalone` de Next (~320 MB) y corre con un
usuario sin privilegios (`nextjs`).

### Dónde viven los datos

**`datos/` NO va adentro de la imagen.** El compose la monta como bind mount:

```
./datos  →  /app/datos
```

O sea que el snapshot y todo lo que edites desde la app (horarios, avisos, materias
extra, archivos manuales) quedan en la carpeta `datos/` de Windows y sobreviven a
`docker compose down` y a los rebuilds. La ruta se puede cambiar con la variable
`CURSADA_DATOS_DIR`.

Para chequear que el contenedor puede escribir ahí:

```bash
docker compose exec app sh -c 'touch /app/datos/_perm_test && rm /app/datos/_perm_test && echo OK'
```

Bajar todo:

```bash
docker compose down
```

## Actualizar los datos del aula virtual

La app habla directamente con la API de Moodle del aula virtual: el cliente vive en
`lib/moodle/` (allowlist de **solo lectura**, cola de 500 ms entre llamadas) y las
mutaciones son server actions de `app/actions-moodle.ts`:

- `iniciarSesion(usuario, password)` — el login de la app (ver arriba): pide el token y
  abre la sesión.
- `estadoToken()` — verifica el token contra `core_webservice_get_site_info`. Moodle **no
  expone la expiración** del token, así que lo que se muestra es "activo sí/no", cuándo se
  verificó y hace cuánto se generó — nunca un countdown.
- `generarToken(usuario, password)` — pide un token nuevo a `/login/token.php`.
- `sincronizarAhora()` — reescribe `datos/aula-virtual.json`.
- `olvidarToken()` — borra `datos/moodle.json`.

El token queda en `datos/moodle.json` (carpeta ignorada por git). Alternativa: exportar
`MOODLE_TOKEN` en el entorno, que se usa si no existe ese archivo.

### ⚠️ Dónde puede correr esto

La app guarda **un token con acceso de LECTURA a tu cuenta del aula virtual** en un
archivo local, en texto plano. La puerta de entrada es el login del aula virtual (ver
arriba), así que ya no está abierta de par en par; aun así, cualquiera que llegue al
**volumen de datos** se lleva el token igual. Sigue siendo una app pensada para correr
**en tu máquina o en tu red privada** (Docker + Tailscale); si la exponés, que sea por
https (la cookie de sesión se marca `secure` sola cuando el request llega por
`x-forwarded-proto: https`).

El cliente es incapaz de escribir en Moodle: `lib/moodle/cliente.ts` solo acepta funciones
de una allowlist de lectura, validada en tipos **y** en runtime antes del fetch. La
contraseña del login se usa únicamente para el fetch a `/login/token.php`: no se guarda,
no se loguea y no vuelve al cliente.

También sigue funcionando el flujo viejo por terminal, con el repo hermano
[`cursada-sync`](../cursada-sync):

```bash
cd ../cursada-sync
npm run exportar
```

Cualquiera de los dos reescribe `datos/aula-virtual.json` de este repo. La app relee el
archivo sola cuando cambia el mtime: alcanza con **refrescar la página**, no hace falta
reiniciar el contenedor.

Los overlays (`horarios.json`, `materias-extra.json`, `avisos-manuales.json`,
`archivos-manuales.json`, `avisos-estado.json`) los escribe la app y el export no los
pisa.

## Desplegar en la nube — leé esto antes

Esta sección describe el **modo local** (`datos/*.json`). Si vas a desplegar en
**multiusuario, usá Supabase + Vercel** (ver la sección de arriba): ahí el estado vive en
Postgres, no en disco, así que serverless funciona sin el problema que sigue.

⚠️ En modo local, esta app guarda su estado en archivos del disco (`datos/*.json`), no en
una base de datos. Eso condiciona dónde se puede desplegar en ese modo:

- **Plataformas serverless (Vercel, Netlify y similares): las escrituras NO persisten.**
  El filesystem es efímero y de sólo lectura fuera de `/tmp`; cada invocación puede caer en
  una instancia distinta. Podrías servir un snapshot de sólo lectura, pero todo lo que
  edites desde la app se pierde.
- **Plataformas con contenedores** (VPS, Fly.io, Render, Railway, Docker en un server
  propio, etc.): funciona, pero **hay que montar un volumen persistente** en `/app/datos`.
  Sin volumen, los datos se van con cada redeploy.
- El snapshot se sigue generando afuera (`cursada-sync`), así que hay que resolver cómo
  llega ese archivo al volumen del entorno desplegado.

Si en algún momento esto tiene que vivir en serverless de verdad, el paso previo es mover
el estado de archivos a una base de datos o a un blob store.
