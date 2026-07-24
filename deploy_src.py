import subprocess

print('Archiving...')
subprocess.run(['tar', '-czf', 'deploy_src.tar.gz', 'frontend/src', 'frontend/public', 'frontend/index.html', 'frontend/package.json', 'backend/app/routers/admin.py', 'backend/app/runtime/core_engine.py', 'main.py', 'fix_saga.py'])

print('Sending...')
subprocess.run(['scp', 'deploy_src.tar.gz', 'odegaard12@192.168.68.104:/home/odegaard12/saga_engine/'])

print('Deploying...')
remote_cmd = """
cd /home/odegaard12/saga_engine
tar -xzf deploy_src.tar.gz
docker run --rm -v /home/odegaard12/saga_engine/frontend:/app -w /app node:20-alpine sh -c "npm install && npm run build"
docker cp backend/app/routers/admin.py saga_engine_app:/app/backend/app/routers/admin.py
docker cp backend/app/runtime/core_engine.py saga_engine_app:/app/backend/app/runtime/core_engine.py
docker cp main.py saga_engine_app:/app/main.py
docker cp fix_saga.py saga_engine_app:/app/fix_saga.py
docker cp frontend/dist saga_engine_app:/app/frontend/
docker cp frontend/public saga_engine_app:/app/frontend/
docker cp frontend/index.html saga_engine_app:/app/frontend/
docker cp frontend/package.json saga_engine_app:/app/frontend/package.json
docker exec saga_engine_app python fix_saga.py
docker restart saga_engine_app
"""
subprocess.run(['ssh', 'odegaard12@192.168.68.104', remote_cmd])
print('Done.')
