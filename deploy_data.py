import base64
import subprocess

def deploy_file(local_path, remote_path):
    with open(local_path, "rb") as f:
        data = f.read()
    
    b64_data = base64.b64encode(data).decode('ascii')
    
    cmd = [
        "ssh", "odegaard12@192.168.68.104",
        f"echo {b64_data} | base64 -d | sudo tee {remote_path} > /dev/null && sudo chmod 600 {remote_path} && sudo chown 10001:10001 {remote_path}"
    ]
    print(f"Deploying {local_path} to {remote_path}...")
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode == 0:
        print("Success.")
    else:
        print("Error:", result.stderr)

deploy_file("config.json", "/home/odegaard12/saga_engine_data/config.json")
deploy_file("stages.json", "/home/odegaard12/saga_engine_data/stages.json")
