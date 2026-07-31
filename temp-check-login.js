const http = require('http');
const payload = JSON.stringify({ email: 'admin@lumina.com', password: 'admin123' });

const req = http.request({
  hostname: '127.0.0.1',
  port: 5000,
  path: '/api/admin/auth/login',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload)
  }
}, (res) => {
  let body = '';
  res.setEncoding('utf8');
  res.on('data', (chunk) => body += chunk);
  res.on('end', () => {
    console.log('STATUS', res.statusCode);
    console.log(body);
    console.log('HEADERS', JSON.stringify(res.headers, null, 2));
  });
});

req.on('error', (err) => {
  console.error(err);
  process.exit(1);
});

req.end(payload);
