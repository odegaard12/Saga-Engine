import urllib.request, json, sys

with open('/home/odegaard12/.config/gh/hosts.yml') as f:
    for line in f:
        if 'oauth_token:' in line and 'gho_' in line:
            token = line.strip().split(': ')[1].strip()
            break

with open('/tmp/pr_body.md') as f:
    body = f.read()

data = json.dumps({
    'title': 'release: SAGA Engine v1.0.0 - First stable field mission platform',
    'body': body
}).encode('utf-8')

req = urllib.request.Request(
    'https://api.github.com/repos/odegaard12/Saga-Engine/pulls/253',
    data=data,
    method='PATCH',
    headers={
        'Authorization': 'Bearer ' + token,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
        'User-Agent': 'saga-engine-deploy'
    }
)
with urllib.request.urlopen(req) as r:
    resp = json.loads(r.read())
    print('OK:', resp['html_url'])
