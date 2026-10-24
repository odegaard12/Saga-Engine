"""ETag y 304 para los GET de la API (24/10, ahorro de datos).

El móvil pide cada minuto la lista de fotos del grupo (`/api/field-proofs`), que casi nunca cambia: con cuarenta
fotos son ~14 KB de JSON, 1,4 KB comprimidos: unos 85 KB por hora y móvil para volver a bajar lo mismo. Esas
peticiones van con el `fetch` por defecto, y el navegador, si la respuesta trae `ETag`, manda solo `If-None-Match`
en la siguiente: así contesta un 304 sin cuerpo y la app que ya está instalada se ahorra el viaje sin cambiar nada.

La huella sale del CUERPO, así que un 304 sólo sale cuando lo que tiene el móvil es exactamente lo de ahora. Por eso
`/api/game` (lleva la hora del último latido) o `/api/config` (lleva la hora del servidor) casi nunca dan 304: no
pasa nada, contestan como siempre. Las peticiones con `cache: 'no-store'` no mandan `If-None-Match` y tampoco
cambian.

Va DENTRO de la compresión: la huella es del JSON, no de lo comprimido, y el 304 no se comprime.
"""
import hashlib

#: Sin `Cache-Control` propio, que el navegador guarde la respuesta pero pregunte siempre antes de usarla (y nunca
#: una caché compartida: son datos del grupo).
REVALIDAR = b"private, no-cache"


def huella(cuerpo: bytes) -> str:
    return '"%s"' % hashlib.sha256(cuerpo).hexdigest()[:20]


def coincide(if_none_match: str, etag: str) -> bool:
    """`If-None-Match` puede traer varias, y Cloudflare las pasa a débiles (`W/`) si recomprime."""
    for valor in (if_none_match or "").split(","):
        valor = valor.strip()
        if valor.startswith("W/"):
            valor = valor[2:]
        if valor == "*" or valor == etag:
            return True
    return False


class EtagDeApi:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http" or scope["method"] != "GET" or not scope["path"].startswith("/api/"):
            await self.app(scope, receive, send)
            return

        pedida = ""
        for clave, valor in scope.get("headers") or []:
            if clave == b"if-none-match":
                pedida = valor.decode("latin-1")
        inicio = None
        trozos = []
        directo = False

        async def enviar(mensaje):
            nonlocal inicio, directo
            if mensaje["type"] == "http.response.start":
                cabeceras = dict(mensaje.get("headers") or [])
                tipo = cabeceras.get(b"content-type", b"").lower()
                # Sólo un JSON 200 sin ETag propio; lo demás (fotos, errores, descargas) sale tal cual, sin guardarlo.
                directo = mensaje["status"] != 200 or b"application/json" not in tipo or b"etag" in cabeceras
                if directo:
                    await send(mensaje)
                else:
                    inicio = mensaje
                return
            if directo or mensaje["type"] != "http.response.body":
                await send(mensaje)
                return
            trozos.append(mensaje.get("body", b""))
            if mensaje.get("more_body"):
                return

            cuerpo = b"".join(trozos)
            etag = huella(cuerpo)
            # El tipo se queda también en el 304: con él las cabeceras de seguridad saben que es un JSON (las cortas).
            cabeceras = [(k, v) for k, v in inicio["headers"] if k != b"content-length"]
            if not any(k == b"cache-control" for k, _ in cabeceras):
                cabeceras.append((b"cache-control", REVALIDAR))
            cabeceras.append((b"etag", etag.encode()))
            if coincide(pedida, etag):
                await send({"type": "http.response.start", "status": 304, "headers": cabeceras})
                await send({"type": "http.response.body", "body": b""})
                return
            largo = [(k, v) for k, v in inicio["headers"] if k == b"content-length"]
            await send({**inicio, "headers": cabeceras + largo})
            await send({"type": "http.response.body", "body": cuerpo})

        await self.app(scope, receive, enviar)
