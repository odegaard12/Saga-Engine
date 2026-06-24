# Despliegue limpio en Docker

SAGA Engine en producción debe ejecutarse desde la imagen Docker, no desde una carpeta del host montada encima del código de la imagen.

## Regla principal de producción

No montar nunca un repositorio o carpeta de código del host sobre /app.

Patrón incorrecto en producción:

    /home/usuario/saga_engine -> /app

Ese patrón puede pisar el contenido de la imagen Docker con código antiguo o legacy y hacer que producción sirva plantillas, rutas o ficheros viejos aunque la imagen Docker sea nueva.

Patrón correcto en producción:

    Código de la imagen Docker -> /app
    Datos runtime              -> /app_data

El contenedor activo de producción debe montar solo los datos runtime:

    /srv/saga-engine-data -> /app_data

## Estado esperado de producción

Estado esperado:

    Repositorio de trabajo: /opt/saga-engine
    Datos runtime:          /srv/saga-engine-data
    Puerto del contenedor:  8096 -> 5000
    Dominio público:        sagaengine.odegaard12.es
    Origen del túnel:       http://127.0.0.1:8096

El puerto 5173 de Vite es solo para desarrollo local. No debe usarse como origen público del túnel de Cloudflare.

## Comprobaciones runtime esperadas

Comandos de comprobación:

    docker ps --filter name=saga_engine_app
    docker inspect saga_engine_app --format '{{range .Mounts}}{{println .Type .Source "->" .Destination}}{{end}}'
    curl -fsS http://127.0.0.1:8096/ >/dev/null
    curl -fsS http://127.0.0.1:8096/admin-react >/dev/null
    curl -fsS "http://127.0.0.1:8096/player/PLAYER%201" >/dev/null

Salida esperada de mounts:

    bind /srv/saga-engine-data -> /app_data

No debe aparecer ningún mount que termine en:

    -> /app

## Admin

/admin redirige a /admin-react.

El CMS React de administración es la interfaz admin activa.

## Datos runtime

La aplicación guarda ficheros mutables bajo DATA_DIR.

Producción usa:

    DATA_DIR=/app_data

Ficheros runtime habituales:

    /app_data/admin_auth.json
    /app_data/gamestate.json
    /app_data/stages.json
    /app_data/positions.json
    /app_data/events.json

No se deben commitear datos runtime, backups locales, logs, secretos ni ficheros de entorno.

## Checklist de despliegue limpio

Antes de desplegar:

    git fetch --prune origin
    git switch main
    git reset --hard origin/main
    git pull --ff-only origin main
    cd frontend
    npm run build
    cd ..
    python scripts/check_audit_guards.py --base origin/main
    ADMIN_PASS='contract_test_admin_password' ./.venv/bin/python scripts/contract_check.py
    ADMIN_PASS='pytest_admin_password' PYTHONPATH=. ./.venv/bin/python -m pytest -q
    docker build -t saga_engine:latest .

Ejemplo de contenedor de producción:

    docker run -d \
      --name saga_engine_app \
      --restart unless-stopped \
      --env-file /ruta/a/production.env \
      -v /srv/saga-engine-data:/app_data \
      -p 0.0.0.0:8096:5000 \
      saga_engine:latest \
      uvicorn main:app --host 0.0.0.0 --port 5000

## Regla de rollback

Antes de reemplazar producción, conservar un backup breve del contenedor anterior o un archivo de datos.

No mantener contenedores con bind mount sobre /app como ruta normal de producción.

## Resumen operativo

Producción limpia significa:

- código servido desde la imagen Docker
- datos runtime fuera de la imagen
- nada de Vite 5173 como origen público
- nada de carpetas legacy montadas sobre /app
- admin activo en /admin-react
