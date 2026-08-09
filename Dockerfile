# Stage 1: Build React Frontend
FROM node:20-slim AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
# `ci` y no `install`: instala exactamente lo que dice package-lock.json.
# Sin fichero de bloqueo, cada construccion traia lo ultimo que hubiera ese dia
# y dos imagenes de la misma version podian llevar dependencias distintas.
RUN npm ci --no-audit --no-fund
# VERSION entra en esta etapa porque vite.config.ts la inyecta en el bundle.
COPY VERSION /app/VERSION
COPY frontend/ ./
# Aqui habia una puerta que abortaba la construccion si faltaba
# frontend/public/opencv.js: 11 MB que no estaban en git y habia que copiar a
# mano en cada maquina, asi que un clon limpio del repositorio no compilaba.
# El motor de vision ya no existe; el lector de QR va dentro del paquete.
RUN npm run build

# Stage 2: Python Application Server
FROM python:3.13-slim
WORKDIR /app

COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

COPY backend /app/backend
COPY frontend /app/frontend
COPY --from=frontend-builder /app/frontend/dist /app/frontend/dist
COPY scripts /app/scripts
COPY main.py /app/main.py
COPY VERSION /app/VERSION
COPY config.json /app/config.json

RUN useradd --create-home --uid 10001 app \
    && mkdir -p /app/data \
    && chown -R app:app /app

USER app

EXPOSE 5000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "5000"]

