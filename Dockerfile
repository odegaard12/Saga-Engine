FROM python:3.9-slim

WORKDIR /app

# Dependencias para FastAPI + templates + forms
RUN pip install --no-cache-dir fastapi uvicorn[standard] python-multipart jinja2

# Copia tu app dentro del contenedor
COPY . /app

EXPOSE 5000

# Arranque ASGI
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "5000"]
