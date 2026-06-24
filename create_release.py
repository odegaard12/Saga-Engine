import urllib.request, json, sys

try:
    with open('/home/odegaard12/.config/gh/hosts.yml') as f:
        for line in f:
            if 'oauth_token:' in line and 'gho_' in line:
                token = line.strip().split(': ')[1].strip()
                break
except Exception as e:
    print(f"Error reading token: {e}")
    sys.exit(1)

with open('/home/odegaard12/saga_engine/RELEASE_NOTES.md') as f:
    body = f.read()

data = json.dumps({
    'tag_name': 'v1.0.1',
    'target_commitish': 'main',
    'name': 'SAGA Engine v1.0.1',
    'body': body,
    'draft': False,
    'prerelease': False
}).encode('utf-8')

req = urllib.request.Request(
    'https://api.github.com/repos/odegaard12/Saga-Engine/releases',
    data=data,
    method='POST',
    headers={
        'Authorization': 'Bearer ' + token,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
        'User-Agent': 'saga-engine-deploy'
    }
)

try:
    with urllib.request.urlopen(req) as r:
        resp = json.loads(r.read())
        print('Release OK:', resp.get('html_url'))
except urllib.error.HTTPError as e:
    print('Error creating release:', e.code, e.read().decode('utf-8'))
