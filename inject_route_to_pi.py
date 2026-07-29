import json
import urllib.request
import urllib.parse
import sys

def main():
    url = 'http://192.168.68.104:8096'
    admin_key = 'Pelochito13'
    
    with open('data/stages.json', 'r', encoding='utf-8') as f:
        stages = json.load(f)

    # 1. Login
    login_url = f'{url}/api/admin/login'
    login_data = json.dumps({'password': admin_key}).encode('utf-8')
    login_req = urllib.request.Request(login_url, data=login_data, headers={
        'Content-Type': 'application/json'
    }, method='POST')
    
    cookie = None
    try:
        with urllib.request.urlopen(login_req) as response:
            if response.status == 200:
                cookie = response.getheader('Set-Cookie')
                print('Login OK, cookie obtained.')
            else:
                print(f'Error login: {response.status}')
                return
    except Exception as e:
        print(f'Error login: {e}')
        return

    # 2. Save
    save_url = f'{url}/api/admin/save'
    payload = {'stages': stages}
    data = json.dumps(payload).encode('utf-8')
    save_req = urllib.request.Request(save_url, data=data, headers={
        'Content-Type': 'application/json',
        'Cookie': cookie
    }, method='POST')
    
    try:
        with urllib.request.urlopen(save_req) as response:
            if response.status == 200:
                print('OK - Ruta inyectada con éxito!')
            else:
                print(f'Error save: {response.status}')
    except urllib.error.HTTPError as e:
        print(f'HTTP Error save: {e.code} - {e.read().decode("utf-8")}')
    except Exception as e:
        print(f'Error save: {e}')

if __name__ == '__main__':
    main()
