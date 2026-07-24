import subprocess

print("Creating tarball of frontend...")
subprocess.run(["tar", "-czf", "deploy_frontend.tar.gz", "-C", "frontend/src/player", "PlayerApp.tsx", "components/InteractionSheet.tsx"])

print("Sending to Raspberry Pi...")
cmd = [
    "scp", "deploy_frontend.tar.gz", "odegaard12@192.168.68.104:/home/odegaard12/saga_engine/"
]
subprocess.run(cmd)

print("Extracting and building on Raspberry Pi...")
remote_cmd = """
cd /home/odegaard12/saga_engine
tar -xzf deploy_frontend.tar.gz -C frontend/src/player/
sudo docker compose build saga_engine_app
sudo docker compose up -d
"""
subprocess.run(["ssh", "odegaard12@192.168.68.104", remote_cmd])
print("Done.")
