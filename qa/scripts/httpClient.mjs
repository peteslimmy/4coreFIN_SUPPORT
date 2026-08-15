import http from 'node:http';
import https from 'https';

const BASE = process.env.BASE || 'http://localhost:3001';
const jar = new Map();

function cookiesHeader() {
  return Array.from(jar.entries()).map(([k, v]) => `${k}=${v}`).join('; ');
}

function setCookies(raw) {
  if (!raw) return;
  for (const line of (Array.isArray(raw) ? raw : [raw])) {
    const name = line.split(';')[0].split('=')[0].trim();
    const value = line.split(';')[0].split('=')[1].trim();
    if (name) jar.set(name, value);
  }
}

function request(method, path, body, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE);
    const headers = {
      'Content-Type': 'application/json',
      'Cookie': cookiesHeader(),
      ...(body ? { 'Content-Length': Buffer.byteLength(body) } : {}),
      ...extraHeaders,
    };
    const transport = url.protocol === 'https:' ? https : http;
    const req = transport.request({ hostname: url.hostname, port: url.port, path: url.pathname + url.search, method, headers }, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString();
        setCookies(res.headers['set-cookie']);
        let parsed;
        try { parsed = JSON.parse(raw); } catch { parsed = raw; }
        resolve({ status: res.statusCode, body: parsed });
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

function post(path, body, headers = {}) { return request('POST', path, JSON.stringify(body), headers); }
function patch(path, body, headers = {}) { return request('PATCH', path, JSON.stringify(body), headers); }
function get(path, headers = {}) { return request('GET', path, null, headers); }
function del(path, headers = {}) { return request('DELETE', path, null, headers); }

export { jar, request, post, patch, get, del };