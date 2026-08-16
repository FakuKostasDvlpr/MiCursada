# Mi Cursada

App mobile-first personal para organizar la cursada nocturna. Los datos salen de un
snapshot del aula virtual (Moodle) y de unos overlays de edición, todos en la carpeta
`datos/` del repo (ignorada por git — son datos personales).

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

- `estadoToken()` — verifica el token contra `core_webservice_get_site_info`. Moodle **no
  expone la expiración** del token, así que lo que se muestra es "activo sí/no", cuándo se
  verificó y hace cuánto se generó — nunca un countdown.
- `generarToken(usuario, password)` — pide un token nuevo a `/login/token.php`.
- `sincronizarAhora()` — reescribe `datos/aula-virtual.json`.
- `olvidarToken()` — borra `datos/moodle.json`.

El token queda en `datos/moodle.json` (carpeta ignorada por git). Alternativa: exportar
`MOODLE_TOKEN` en el entorno, que se usa si no existe ese archivo.

### ⚠️ Dónde puede correr esto

La pantalla de login guarda **un token con acceso de LECTURA a tu cuenta del aula
virtual** en un archivo local, en texto plano. Cualquiera que llegue a la app (o al
volumen de datos) puede sincronizar con tu cuenta. Por eso la app está pensada para correr
**en tu máquina o en tu red privada** (Docker + Tailscale), **nunca expuesta a internet
sin una capa de autenticación propia** delante.

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

⚠️ **Esta app guarda su estado en archivos del disco** (`datos/*.json`), no en una base de
datos. Eso condiciona dónde se puede desplegar:

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
