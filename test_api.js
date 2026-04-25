import http from 'http';

const data = JSON.stringify({ message: 'Lỗi ncr 123', context: '' });

const req = http.request({
  hostname: 'localhost',
  port: 3000,
  path: '/api/chat',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': data.length
  }
}, (res) => {
  let chunks = '';
  res.on('data', d => chunks += d);
  res.on('end', () => console.log('Status:', res.statusCode, 'Body:', chunks));
});

req.on('error', error => {
  console.error(error);
});

req.write(data);
req.end();
