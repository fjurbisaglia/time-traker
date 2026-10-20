# Servicio privado de Tiempo de Leo

Este servicio guarda un único estado familiar como JSON en un Durable Object.
La interfaz de GitHub Pages todavía necesita conectarse a esta API; publicar el servicio por sí solo no activa la sincronización.

## Publicación desde la carpeta del proyecto

1. Ejecuta `npx wrangler@latest login` y autoriza tu cuenta en el navegador.
2. Ejecuta `npx wrangler@latest deploy --config cloudflare/wrangler.jsonc`.
3. En Cloudflare, abre **Workers & Pages → time-tracker → Settings → Variables and Secrets**.
4. Añade `ALLOWED_ORIGIN` como texto: el origen de tu página, sin ruta ni barra final. Por ejemplo, para `https://usuario.github.io/time-traker/`, usa `https://usuario.github.io`. Si usas dominio propio, usa ese origen.
5. Añade `SYNC_KEY` como **Secret**: una clave aleatoria de al menos 32 caracteres, conservada en tu gestor de contraseñas. No uses tu contraseña ni token de Cloudflare. No la incluyas en archivos, capturas ni commits.
6. Guarda y despliega los cambios. Copia la dirección HTTPS `https://time-tracker.…workers.dev`.

No necesitas cambiar DNS ni mover GitHub Pages. Sin las variables el servicio devuelve 503 y no permite consultar datos.

## Contrato para la interfaz

Todas las peticiones incluyen `Authorization: Bearer <clave familiar>`.

- `GET /state`: `{revision: 0, state: null}` si no hay datos, o el estado existente.
- `PUT /state`: cuerpo `{revision, state}`. Envía la revisión que se leyó antes de editar. Devuelve la siguiente revisión.
- `409`: otro dispositivo guardó antes. Devuelve la revisión y estado actuales. La interfaz debe recuperar esos datos y pedir repetir la acción; nunca reenviar automáticamente una copia antigua completa.

La interfaz deberá pedir la clave por dispositivo (no incrustarla en el HTML público), consultar periódicamente el estado y al recuperar el foco, y enviar cambios solo ante acciones del usuario. El paso de cada segundo se calcula visualmente desde la marca temporal, sin escribir al servidor cada segundo. En modo compartido, los cambios deben esperar la confirmación del servidor y bloquearse sin conexión para evitar divergencias. Antes de la primera importación hay que confirmar qué dispositivo contiene los datos que se desean conservar. Las operaciones entre distintas zonas horarias deberán usar un día familiar común.

La clave familiar da acceso de lectura y escritura. Cambiarla en Cloudflare revoca el acceso de todos los dispositivos hasta que introduzcan la nueva clave.
