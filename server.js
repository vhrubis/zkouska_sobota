// Maly staticky server pro dashboard FVE-UK. Servuje korenovou slozku projektu.
// Spusteni: node server.js   ->   http://localhost:8080/web/
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const PORT = 8080;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
};

const server = http.createServer((req, res) => {
  let urlPath = decodeURIComponent(req.url.split('?')[0]);
  if (urlPath === '/') { res.writeHead(302, { Location: '/web/' }); res.end(); return; }
  if (urlPath === '/web' || urlPath === '/web/') urlPath = '/web/index.html';
  const filePath = path.join(ROOT, urlPath);

  // ochrana proti vystupu z korene
  if (!filePath.startsWith(ROOT)) { res.writeHead(403); res.end('403'); return; }

  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('404 Nenalezeno'); return; }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': TYPES[ext] || 'application/octet-stream' });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`FVE-ÚK dashboard běží na  http://localhost:${PORT}/web/`);
  console.log('Ukončení: Ctrl+C');
});
