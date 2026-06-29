# Docker runtime

SAGA Engine can run as a Docker container for self-hosted deployments.

## Runtime base

The Dockerfile uses Python 3.13 slim to match the local validation/runtime used by the project tests.

## Template dependency

The backend uses Starlette/FastAPI Jinja2Templates, so Jinja2 must be installed in the Docker runtime dependencies.

## Build context

.dockerignore excludes local development artifacts such as:

- .git
- .venv
- node_modules
- caches
- logs
- backups
- local databases
- environment files

The image should not include secrets, local runtime databases, logs or private environment files.

## Frontend assets

Run the frontend production build before creating a deployment image:

cd frontend
npm run build
cd ..
docker build -t saga_engine:latest .

## Despliegue limpio de producción

Ver `clean-docker-production-deploy.md` para la regla de producción:

- no montar código del host sobre `/app`
- ejecutar el código desde la imagen Docker
- montar solo datos runtime
- usar `/app_data` como directorio de datos de producción
- apuntar Cloudflare Tunnel al puerto `8096`, no al puerto dev de Vite `5173`

## Safety

Do not bake production secrets, local .env files, live SQLite databases, backups or logs into the image.
