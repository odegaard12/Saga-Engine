# Stage 1: Build React Frontend
FROM node:20-slim AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm install
# VERSION entra en esta etapa porque vite.config.ts la inyecta en el bundle
# para versionar la URL del worker de visión. Sin este COPY quedaba en "dev"
# y el CDN seguía sirviendo el worker antiguo entre despliegues.
COPY VERSION /app/VERSION
COPY frontend/ ./
# opencv.js (11 MB) no esta en git: se coloca a mano en el despliegue. Sin el,
# el reconocimiento de las pegatinas QR con logo falla EN SILENCIO en el monte.
# Mejor que la imagen no llegue a construirse.
RUN test -s public/opencv.js || (       echo "ERROR: falta frontend/public/opencv.js (motor de vision del QR)." &&       echo "Colocalo antes de construir la imagen." &&       exit 1 )
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

