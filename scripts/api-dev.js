// Server API lokal untuk pengembangan: meniru Vercel Functions di http://localhost:3001/api/*
// Pakai bersama "npm run dev" (Vite mem-proxy /api ke server ini).
import http from 'node:http';
import { loadEnv } from './setup-db.js';

loadEnv();
const PORT = Number(process.env.API_PORT || 3001);
const handlers = {};

http.createServer(async (req, res) => {
  const m = req.url.match(/^\/api\/([a-z]+)/);
  if (!m) { res.statusCode = 404; return res.end('Not found'); }
  try {
    handlers[m[1]] = handlers[m[1]] || (await import(`../api/${m[1]}.js`)).default;
  } catch {
    res.statusCode = 404;
    return res.end(JSON.stringify({ error: `Endpoint /api/${m[1]} tidak ada` }));
  }
  return handlers[m[1]](req, res);
}).listen(PORT, () => console.log(`API lokal jalan di http://localhost:${PORT}/api (DATABASE_URL ${process.env.DATABASE_URL ? 'terisi' : 'KOSONG'})`));
