'use strict';

const express = require('express');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const http = require('http');
const https = require('https');
const os = require('os');
const crypto = require('crypto');
const YAML = require('yaml');

const PORT = Number(process.env.PORT) || 3000;
const CONFIG_DIR = process.env.CONFIG_DIR || path.join(__dirname, 'config');
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const HOST_PROC = process.env.HOST_PROC || '/proc';
const HOST_SYS = process.env.HOST_SYS || '/sys';
const DOCKER_SOCKET = process.env.DOCKER_SOCKET || '/var/run/docker.sock';
const AUTH_USER = process.env.AUTH_USER || '';
const AUTH_PASSWORD = process.env.AUTH_PASSWORD || '';

const CONFIG_FILE = path.join(CONFIG_DIR, 'config.yml');
const EXAMPLE_CONFIG = path.join(__dirname, 'config.example.yml');
const TODO_FILE = path.join(DATA_DIR, 'todos.json');

fs.mkdirSync(CONFIG_DIR, { recursive: true });
fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(CONFIG_FILE)) {
  fs.copyFileSync(EXAMPLE_CONFIG, CONFIG_FILE);
  console.log(`Geen config gevonden, voorbeeld gekopieerd naar ${CONFIG_FILE}`);
}

/* ---------- Config (hot reload) ---------- */
let configCache = { mtime: 0, data: {} };
function getConfig() {
  try {
    const { mtimeMs } = fs.statSync(CONFIG_FILE);
    if (mtimeMs !== configCache.mtime) {
      configCache = { mtime: mtimeMs, data: YAML.parse(fs.readFileSync(CONFIG_FILE, 'utf8')) || {} };
      console.log('Config (her)geladen');
    }
  } catch (err) {
    console.error('Config fout:', err.message);
  }
  return configCache.data;
}

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '100kb' }));

/* ---------- Optionele basic auth ---------- */
if (AUTH_USER && AUTH_PASSWORD) {
  const safeEq = (a, b) => {
    const ha = crypto.createHash('sha256').update(a).digest();
    const hb = crypto.createHash('sha256').update(b).digest();
    return crypto.timingSafeEqual(ha, hb);
  };
  app.use((req, res, next) => {
    if (req.path === '/healthz') return next();
    const [scheme, encoded] = (req.headers.authorization || '').split(' ');
    if (scheme === 'Basic' && encoded) {
      const [user, ...rest] = Buffer.from(encoded, 'base64').toString().split(':');
      if (safeEq(user, AUTH_USER) && safeEq(rest.join(':'), AUTH_PASSWORD)) return next();
    }
    res.set('WWW-Authenticate', 'Basic realm="Home Dashboard"').status(401).send('Login vereist');
  });
}

app.get('/healthz', (req, res) => res.json({ ok: true }));

/* ---------- Config voor de frontend ---------- */
app.get('/api/config', (req, res) => {
  const c = getConfig();
  res.json({
    title: c.title || 'Home',
    name: c.name || '',
    language: c.language || 'nl',
    search: c.search || { engine: 'https://duckduckgo.com/?q=' },
    weather: c.weather ? { enabled: c.weather.enabled !== false, location: c.weather.name || '', lat: Number(c.weather.latitude) || 0, lng: Number(c.weather.longitude) || 0 } : { enabled: false },
    widgets: c.widgets || {},
    services: (c.services || []).map((g) => ({
      group: g.group,
      items: (g.items || []).map((s) => ({ name: s.name, url: s.url, icon: s.icon, description: s.description }))
    })),
    bookmarks: c.bookmarks || [],
    docker: { enabled: !!(c.docker && c.docker.enabled), allowActions: !!(c.docker && c.docker.allowActions) }
  });
});

/* ---------- Systeem info ---------- */
function readProc(file) {
  return fsp.readFile(path.join(HOST_PROC, file), 'utf8');
}

let cpuPrev = null;
let cpuUsage = 0;
async function sampleCpu() {
  try {
    const line = (await readProc('stat')).split('\n')[0];
    const nums = line.trim().split(/\s+/).slice(1).map(Number);
    const idle = nums[3] + (nums[4] || 0);
    const total = nums.reduce((a, b) => a + b, 0);
    if (cpuPrev) {
      const dt = total - cpuPrev.total;
      const di = idle - cpuPrev.idle;
      cpuUsage = dt > 0 ? Math.max(0, Math.min(100, (1 - di / dt) * 100)) : 0;
    }
    cpuPrev = { idle, total };
  } catch { /* geen /proc beschikbaar */ }
}

let netPrev = null;
let netRate = { rx: 0, tx: 0 };
async function sampleNet() {
  try {
    // /proc/1/net/dev van de host geeft het netwerk van de host, niet van de container
    let txt;
    try { txt = await readProc('1/net/dev'); } catch { txt = await readProc('net/dev'); }
    let rx = 0, tx = 0;
    for (const l of txt.split('\n').slice(2)) {
      const [iface, rest] = l.split(':');
      if (!rest) continue;
      const name = iface.trim();
      if (name === 'lo' || /^(veth|docker|br-|virbr)/.test(name)) continue;
      const f = rest.trim().split(/\s+/).map(Number);
      rx += f[0]; tx += f[8];
    }
    const now = Date.now();
    if (netPrev) {
      const s = (now - netPrev.t) / 1000;
      netRate = { rx: Math.max(0, (rx - netPrev.rx) / s), tx: Math.max(0, (tx - netPrev.tx) / s) };
    }
    netPrev = { rx, tx, t: now };
  } catch { /* negeren */ }
}
setInterval(() => { sampleCpu(); sampleNet(); }, 3000);
sampleCpu(); sampleNet();

async function getTemp() {
  try {
    const base = path.join(HOST_SYS, 'class/thermal');
    const zones = (await fsp.readdir(base)).filter((z) => z.startsWith('thermal_zone'));
    let max = null;
    for (const z of zones) {
      const v = Number(await fsp.readFile(path.join(base, z, 'temp'), 'utf8')) / 1000;
      if (v > 0 && v < 150 && (max === null || v > max)) max = v;
    }
    if (max !== null) return max;
  } catch { /* volgende optie */ }
  try {
    const base = path.join(HOST_SYS, 'class/hwmon');
    let max = null;
    for (const h of await fsp.readdir(base)) {
      const files = await fsp.readdir(path.join(base, h));
      for (const f of files.filter((f) => /^temp\d+_input$/.test(f))) {
        const v = Number(await fsp.readFile(path.join(base, h, f), 'utf8')) / 1000;
        if (v > 0 && v < 150 && (max === null || v > max)) max = v;
      }
    }
    return max;
  } catch { return null; }
}

app.get('/api/system', async (req, res) => {
  const c = getConfig();
  const out = { cpu: { usage: Math.round(cpuUsage), cores: os.cpus().length, model: (os.cpus()[0] || {}).model } };
  try {
    const mem = Object.fromEntries((await readProc('meminfo')).split('\n').filter(Boolean)
      .map((l) => { const [k, v] = l.split(':'); return [k, parseInt(v, 10) * 1024]; }));
    out.memory = { total: mem.MemTotal, used: mem.MemTotal - mem.MemAvailable };
  } catch {
    out.memory = { total: os.totalmem(), used: os.totalmem() - os.freemem() };
  }
  try {
    out.uptime = Math.floor(Number((await readProc('uptime')).split(' ')[0]));
    out.load = (await readProc('loadavg')).split(' ').slice(0, 3).map(Number);
  } catch {
    out.uptime = os.uptime(); out.load = os.loadavg();
  }
  out.temperature = await getTemp();
  out.network = netRate;
  out.hostname = process.env.HOST_NAME || os.hostname();

  const disks = (c.system && c.system.disks) || [{ name: 'Root', path: '/' }];
  out.disks = [];
  for (const d of disks) {
    try {
      const s = await fsp.statfs(d.path);
      out.disks.push({ name: d.name, total: s.blocks * s.bsize, used: (s.blocks - s.bfree) * s.bsize });
    } catch { /* pad niet gemount */ }
  }
  res.json(out);
});

/* ---------- Service status checks ---------- */
const statusCache = {};
function checkUrl(url, timeout = 5000) {
  return new Promise((resolve) => {
    const start = Date.now();
    let mod;
    try { mod = new URL(url).protocol === 'https:' ? https : http; } catch { return resolve({ up: false, error: 'ongeldige url' }); }
    const req = mod.request(url, { method: 'GET', timeout, rejectUnauthorized: false, headers: { 'User-Agent': 'home-dashboard' } }, (r) => {
      r.resume();
      resolve({ up: r.statusCode < 500, code: r.statusCode, ms: Date.now() - start });
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', (e) => resolve({ up: false, error: e.code || e.message, ms: Date.now() - start }));
    req.end();
  });
}

async function runChecks() {
  const c = getConfig();
  const items = (c.services || []).flatMap((g) => g.items || []).filter((s) => s.check !== false && (s.check || s.url));
  await Promise.all(items.map(async (s) => {
    const target = typeof s.check === 'string' ? s.check : s.url;
    const result = await checkUrl(target);
    const prev = statusCache[s.name];
    const history = prev ? prev.history.slice(-29) : [];
    history.push(result.up ? 1 : 0);
    statusCache[s.name] = { ...result, checked: Date.now(), history };
  }));
}
setInterval(runChecks, 30000);
runChecks();

app.get('/api/status', (req, res) => res.json(statusCache));

/* ---------- Weer (Open-Meteo, geen API key nodig) ---------- */
let weatherCache = { t: 0, key: '', data: null };
app.get('/api/weather', async (req, res) => {
  const w = getConfig().weather;
  if (!w || w.enabled === false) return res.status(404).json({ error: 'weer uitgeschakeld' });
  const key = `${w.latitude},${w.longitude}`;
  if (weatherCache.data && weatherCache.key === key && Date.now() - weatherCache.t < 10 * 60 * 1000) {
    return res.json(weatherCache.data);
  }
  const url = 'https://api.open-meteo.com/v1/forecast?' + new URLSearchParams({
    latitude: w.latitude, longitude: w.longitude, timezone: 'auto', forecast_days: '5',
    current: 'temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,is_day',
    hourly: 'precipitation_probability,precipitation',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset'
  });
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = await r.json();
    weatherCache = { t: Date.now(), key, data };
    res.json(data);
  } catch (err) {
    if (weatherCache.data) return res.json(weatherCache.data);
    res.status(502).json({ error: err.message });
  }
});

/* ---------- Docker ---------- */
function dockerApi(method, p) {
  return new Promise((resolve, reject) => {
    const req = http.request({ socketPath: DOCKER_SOCKET, path: p, method, timeout: 5000 }, (r) => {
      let body = '';
      r.on('data', (c) => (body += c));
      r.on('end', () => {
        if (r.statusCode >= 400) return reject(new Error(`Docker ${r.statusCode}: ${body}`));
        try { resolve(body ? JSON.parse(body) : {}); } catch { resolve({}); }
      });
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
    req.end();
  });
}

app.get('/api/docker', async (req, res) => {
  const d = getConfig().docker;
  if (!d || !d.enabled) return res.status(404).json({ error: 'docker uitgeschakeld' });
  try {
    const list = await dockerApi('GET', '/containers/json?all=true');
    res.json(list.map((c) => ({
      id: c.Id.slice(0, 12),
      name: (c.Names[0] || '').replace(/^\//, ''),
      image: c.Image,
      state: c.State,
      status: c.Status
    })).sort((a, b) => a.name.localeCompare(b.name)));
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

app.post('/api/docker/:id/:action', async (req, res) => {
  const d = getConfig().docker;
  if (!d || !d.enabled || !d.allowActions) return res.status(403).json({ error: 'acties niet toegestaan' });
  const { id, action } = req.params;
  if (!['start', 'stop', 'restart'].includes(action) || !/^[a-f0-9]{12,64}$/.test(id)) {
    return res.status(400).json({ error: 'ongeldig verzoek' });
  }
  try {
    await dockerApi('POST', `/containers/${id}/${action}`);
    res.json({ ok: true });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

/* ---------- Todo's (opgeslagen in /data) ---------- */
async function loadTodos() {
  try { return JSON.parse(await fsp.readFile(TODO_FILE, 'utf8')); } catch { return []; }
}
async function saveTodos(todos) {
  const tmp = TODO_FILE + '.tmp';
  await fsp.writeFile(tmp, JSON.stringify(todos, null, 2));
  await fsp.rename(tmp, TODO_FILE);
}

app.get('/api/todos', async (req, res) => res.json(await loadTodos()));
app.post('/api/todos', async (req, res) => {
  const text = String((req.body && req.body.text) || '').trim().slice(0, 500);
  if (!text) return res.status(400).json({ error: 'tekst ontbreekt' });
  const todos = await loadTodos();
  const todo = { id: crypto.randomUUID(), text, done: false, created: Date.now() };
  todos.push(todo);
  await saveTodos(todos);
  res.json(todo);
});
app.patch('/api/todos/:id', async (req, res) => {
  const todos = await loadTodos();
  const t = todos.find((x) => x.id === req.params.id);
  if (!t) return res.status(404).json({ error: 'niet gevonden' });
  if (typeof req.body.done === 'boolean') t.done = req.body.done;
  if (typeof req.body.text === 'string' && req.body.text.trim()) t.text = req.body.text.trim().slice(0, 500);
  await saveTodos(todos);
  res.json(t);
});
app.delete('/api/todos/:id', async (req, res) => {
  await saveTodos((await loadTodos()).filter((x) => x.id !== req.params.id));
  res.json({ ok: true });
});

/* ---------- Wereldkaart: plekken ---------- */
const PLACES_FILE = path.join(DATA_DIR, 'places.json');
const PLACE_TYPES = ['visited', 'wish', 'home'];
async function loadPlaces() {
  try { return JSON.parse(await fsp.readFile(PLACES_FILE, 'utf8')); } catch { return []; }
}
async function savePlaces(places) {
  const tmp = PLACES_FILE + '.tmp';
  await fsp.writeFile(tmp, JSON.stringify(places, null, 2));
  await fsp.rename(tmp, PLACES_FILE);
}
function cleanPlace(body, base = {}) {
  const p = { ...base };
  if (body.name !== undefined) p.name = String(body.name).trim().slice(0, 120);
  if (body.note !== undefined) p.note = String(body.note).trim().slice(0, 1000);
  if (body.date !== undefined) p.date = /^\d{4}(-\d{2}(-\d{2})?)?$/.test(body.date) ? body.date : '';
  if (body.type !== undefined) p.type = PLACE_TYPES.includes(body.type) ? body.type : 'visited';
  if (body.country !== undefined) p.country = String(body.country).slice(0, 80);
  if (body.countryCode !== undefined) p.countryCode = String(body.countryCode).replace(/[^A-Z]/g, '').slice(0, 3);
  if (body.lat !== undefined) p.lat = Math.max(-90, Math.min(90, Number(body.lat) || 0));
  if (body.lng !== undefined) p.lng = Math.max(-180, Math.min(180, Number(body.lng) || 0));
  return p;
}

app.get('/api/places', async (req, res) => res.json(await loadPlaces()));
app.post('/api/places', async (req, res) => {
  const p = cleanPlace(req.body || {}, { type: 'visited', note: '', date: '' });
  if (!p.name || typeof p.lat !== 'number' || typeof p.lng !== 'number') return res.status(400).json({ error: 'naam en locatie zijn verplicht' });
  p.id = crypto.randomUUID();
  p.created = Date.now();
  const places = await loadPlaces();
  if (p.type === 'home') places.forEach((x) => { if (x.type === 'home') x.type = 'visited'; });
  places.push(p);
  await savePlaces(places);
  res.json(p);
});
app.patch('/api/places/:id', async (req, res) => {
  const places = await loadPlaces();
  const i = places.findIndex((x) => x.id === req.params.id);
  if (i < 0) return res.status(404).json({ error: 'niet gevonden' });
  const p = cleanPlace(req.body || {}, places[i]);
  if (!p.name) return res.status(400).json({ error: 'naam is verplicht' });
  if (p.type === 'home') places.forEach((x) => { if (x.type === 'home' && x.id !== p.id) x.type = 'visited'; });
  places[i] = p;
  await savePlaces(places);
  res.json(p);
});
app.delete('/api/places/:id', async (req, res) => {
  await savePlaces((await loadPlaces()).filter((x) => x.id !== req.params.id));
  res.json({ ok: true });
});

// Plaatsnaam zoeken via OpenStreetMap Nominatim (max 1 verzoek per seconde, met cache)
const geoCache = new Map();
let geoLast = 0;
app.get('/api/geocode', async (req, res) => {
  const q = String(req.query.q || '').trim().slice(0, 200);
  if (q.length < 2) return res.json([]);
  if (geoCache.has(q.toLowerCase())) return res.json(geoCache.get(q.toLowerCase()));
  const wait = 1100 - (Date.now() - geoLast);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  geoLast = Date.now();
  try {
    const url = 'https://nominatim.openstreetmap.org/search?' + new URLSearchParams({ q, format: 'jsonv2', limit: '6', addressdetails: '1', 'accept-language': 'nl' });
    const r = await fetch(url, { headers: { 'User-Agent': 'home-dashboard (self-hosted)' }, signal: AbortSignal.timeout(8000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const out = (await r.json()).map((x) => ({
      name: x.name || x.display_name.split(',')[0],
      label: x.display_name,
      lat: Number(x.lat),
      lng: Number(x.lon),
      country: x.address && x.address.country,
      countryCode: x.address && x.address.country_code ? x.address.country_code.toUpperCase() : ''
    }));
    if (geoCache.size > 500) geoCache.clear();
    geoCache.set(q.toLowerCase(), out);
    res.json(out);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

/* ---------- Wereldbol bestanden (lokaal, werkt ook zonder internet) ---------- */
function pkgDir(name) {
  for (const p of [path.join(__dirname, 'node_modules', name), path.join(__dirname, 'node_modules/globe.gl/node_modules', name)]) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}
const globeDir = pkgDir('globe.gl');
const threeGlobeDir = pkgDir('three-globe');
if (globeDir) {
  app.get('/vendor/globe.gl.min.js', (req, res) => res.sendFile(path.join(globeDir, 'dist/globe.gl.min.js'), { maxAge: '7d' }));
  app.get('/vendor/countries.geojson', (req, res) => res.sendFile(path.join(globeDir, 'example/datasets/ne_110m_admin_0_countries.geojson'), { maxAge: '7d' }));
}
if (threeGlobeDir) app.use('/vendor/img', express.static(path.join(threeGlobeDir, 'example/img'), { maxAge: '7d' }));

// Lettertypes (lokaal meegeleverd)
const FONTS = {
  'hanken.woff2': '@fontsource-variable/hanken-grotesk/files/hanken-grotesk-latin-wght-normal.woff2'
};
app.get('/fonts/:file', (req, res) => {
  const rel = FONTS[req.params.file];
  if (!rel) return res.status(404).end();
  res.sendFile(path.join(__dirname, 'node_modules', rel), { maxAge: '30d' });
});

/* ---------- Eigen iconen uit config/icons ---------- */
app.use('/icons', express.static(path.join(CONFIG_DIR, 'icons'), { maxAge: '1d' }));
app.use(express.static(path.join(__dirname, 'public')));

app.listen(PORT, () => console.log(`Home Dashboard draait op http://0.0.0.0:${PORT}`));
