import urllib.request
from pathlib import Path

path = Path(r'c:\files\Final-Year-Project\AI-Clothing-AI\testimage.jpg')
data = path.read_bytes()
boundary = '----WebKitFormBoundary7MA4YWxkTrZu0gW'
body = []
body.append(f'--{boundary}\r\n'.encode())
body.append(b'Content-Disposition: form-data; name="image"; filename="testimage.jpg"\r\n')
body.append(b'Content-Type: image/jpeg\r\n\r\n')
body.append(data)
body.append(f'\r\n--{boundary}--\r\n'.encode())
req = urllib.request.Request('http://127.0.0.1:5000/api/visual-search?top_k=3', data=b''.join(body), method='POST')
req.add_header('Content-Type', f'multipart/form-data; boundary={boundary}')
with urllib.request.urlopen(req, timeout=120) as resp:
    print(resp.status)
    print(resp.read().decode('utf-8')[:1000])
