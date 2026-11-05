'use strict';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const api = async (url, opts = {}) => {
  const r = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...opts });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || r.statusText);
  return r.json();
};
const LOCALE = 'nl-NL';
let config = {};

/* ---------- Toast ---------- */
let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2500);
}

/* ---------- Thema ---------- */
const THEMES = ['auto', 'light', 'dark'];
const THEME_ICONS = {
  auto: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><path d="M12 4v16" /><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor"/></svg>',
  light: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
  dark: '<svg viewBox="0 0 24 24"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>'
};
function getTheme() { try { return localStorage.getItem('theme') || 'auto'; } catch { return 'auto'; } }
function applyTheme(t) {
  if (t === 'auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', t);
  $('#theme-btn').innerHTML = THEME_ICONS[t];
  $('#theme-btn').title = `Thema: ${{ auto: 'automatisch', light: 'licht', dark: 'donker' }[t]}`;
}
$('#theme-btn').addEventListener('click', () => {
  const next = THEMES[(THEMES.indexOf(getTheme()) + 1) % THEMES.length];
  try { localStorage.setItem('theme', next); } catch { /* geen opslag */ }
  applyTheme(next);
});
applyTheme(getTheme());

/* ---------- Klok & begroeting ---------- */
function tick() {
  const now = new Date();
  $('#clock').textContent = now.toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit' });
  const ds = now.toLocaleDateString(LOCALE, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  $('#date').textContent = ds[0].toUpperCase() + ds.slice(1);
  const h = now.getHours();
  const part = h < 6 ? 'Goedenacht' : h < 12 ? 'Goedemorgen' : h < 18 ? 'Goedemiddag' : 'Goedenavond';
  $('#greeting').textContent = config.name ? `${part}, ${config.name}` : part;
}

/* ---------- Iconen ---------- */
function iconHtml(icon, name) {
  if (icon) {
    if (/^(https?:)?\/\//.test(icon) || icon.startsWith('/')) return `<img src="${esc(icon)}" alt="" loading="lazy">`;
    if (/^[a-z0-9-]+$/i.test(icon)) {
      const src = `https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/${icon.toLowerCase()}.png`;
      return `<img src="${src}" alt="" loading="lazy" onerror="this.replaceWith(document.createTextNode('${esc(name[0] || '?')}'))">`;
    }
    return esc(icon); // emoji
  }
  return esc((name || '?')[0].toUpperCase());
}

/* ---------- Services ---------- */
function renderServices() {
  const el = $('#services');
  el.innerHTML = (config.services || []).map((g) => `
    <div class="group">
      <h2 class="section-title">${esc(g.group)}</h2>
      <div class="services">
        ${g.items.map((s) => `
          <a class="service" href="${esc(s.url)}" target="_blank" rel="noopener" data-name="${esc(s.name)}" data-search="${esc((s.name + ' ' + (s.description || '') + ' ' + g.group).toLowerCase())}">
            <div class="ico">${iconHtml(s.icon, s.name)}</div>
            <div class="info">
              <div class="name">${esc(s.name)}</div>
              <div class="desc">${esc(s.description || hostOf(s.url))}</div>
              <div class="uptime"></div>
            </div>
            <span class="dot" title="Controleren…"></span>
          </a>`).join('')}
      </div>
    </div>`).join('');
}
function hostOf(url) { try { return new URL(url).host; } catch { return url; } }

async function refreshStatus() {
  let data;
  try { data = await api('/api/status'); } catch { return; }
  document.querySelectorAll('.service').forEach((a) => {
    const s = data[a.dataset.name];
    const dot = a.querySelector('.dot');
    if (!s) return;
    dot.className = 'dot ' + (s.up ? 'up' : 'down');
    dot.title = s.up ? `Online · ${s.ms} ms · HTTP ${s.code}` : `Offline · ${s.error || 'HTTP ' + s.code}`;
    const up = s.history.filter(Boolean).length;
    a.querySelector('.uptime').innerHTML = s.history.map((h) => `<i class="${h ? '' : 'd'}"></i>`).join('');
    a.querySelector('.uptime').title = `Uptime laatste ${s.history.length} checks: ${Math.round((up / s.history.length) * 100)}%`;
  });
}

/* ---------- Bladwijzers ---------- */
function renderBookmarks() {
  const groups = config.bookmarks || [];
  if (!groups.length || config.widgets.bookmarks === false) return;
  $('#bookmarks-wrap').hidden = false;
  $('#bookmarks').innerHTML = groups.map((g) => `
    <div class="bm-group">
      <h4>${esc(g.group)}</h4>
      ${(g.links || []).map((l) => `
        <a href="${esc(l.url)}" target="_blank" rel="noopener" data-search="${esc(l.name.toLowerCase())}">
          <img src="https://icons.duckduckgo.com/ip3/${esc(hostOf(l.url))}.ico" alt="" loading="lazy" onerror="this.style.visibility='hidden'">
          ${esc(l.name)}
        </a>`).join('')}
    </div>`).join('');
}

/* ---------- Zoeken & filteren ---------- */
const searchInput = $('#search');
function visibleServices() { return [...document.querySelectorAll('.service')].filter((a) => a.style.display !== 'none'); }
searchInput.addEventListener('input', () => {
  const q = searchInput.value.trim().toLowerCase();
  document.querySelectorAll('.service').forEach((a) => { a.style.display = !q || a.dataset.search.includes(q) ? '' : 'none'; a.classList.remove('active'); });
  document.querySelectorAll('.group').forEach((g) => { g.style.display = g.querySelector('.service:not([style*="none"])') ? '' : 'none'; });
  const first = q && visibleServices()[0];
  if (first) first.classList.add('active');
});
$('#search-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const q = searchInput.value.trim();
  if (!q) return;
  const active = document.querySelector('.service.active');
  if (active) window.open(active.href, '_blank', 'noopener');
  else if (/^(https?:\/\/)?[\w-]+(\.[\w-]+)+(:\d+)?(\/\S*)?$/.test(q) && !q.includes(' ')) window.open(q.startsWith('http') ? q : 'https://' + q, '_blank', 'noopener');
  else window.open((config.search.engine || 'https://duckduckgo.com/?q=') + encodeURIComponent(q), '_blank', 'noopener');
  searchInput.value = '';
  searchInput.dispatchEvent(new Event('input'));
});
document.addEventListener('keydown', (e) => {
  const typing = ['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName);
  if (e.key === '/' && !typing && !document.querySelector('dialog[open]')) { e.preventDefault(); ($('#view-world').hidden ? searchInput : $('#geo-input')).focus(); }
  if (e.key === 'Escape' && document.activeElement === searchInput) { searchInput.value = ''; searchInput.dispatchEvent(new Event('input')); searchInput.blur(); }
});

/* ---------- Weer ---------- */
const WMO = {
  0: ['☀️', 'Helder'], 1: ['🌤️', 'Overwegend helder'], 2: ['⛅', 'Half bewolkt'], 3: ['☁️', 'Bewolkt'],
  45: ['🌫️', 'Mist'], 48: ['🌫️', 'Rijpmist'], 51: ['🌦️', 'Lichte motregen'], 53: ['🌦️', 'Motregen'], 55: ['🌧️', 'Zware motregen'],
  56: ['🌧️', 'IJzel'], 57: ['🌧️', 'IJzel'], 61: ['🌦️', 'Lichte regen'], 63: ['🌧️', 'Regen'], 65: ['🌧️', 'Zware regen'],
  66: ['🌧️', 'IJzel'], 67: ['🌧️', 'IJzel'], 71: ['🌨️', 'Lichte sneeuw'], 73: ['🌨️', 'Sneeuw'], 75: ['❄️', 'Zware sneeuw'],
  77: ['🌨️', 'Sneeuwkorrels'], 80: ['🌦️', 'Buien'], 81: ['🌧️', 'Buien'], 82: ['⛈️', 'Zware buien'],
  85: ['🌨️', 'Sneeuwbuien'], 86: ['❄️', 'Sneeuwbuien'], 95: ['⛈️', 'Onweer'], 96: ['⛈️', 'Onweer met hagel'], 99: ['⛈️', 'Onweer met hagel']
};
const wmo = (c, day = 1) => { const w = WMO[c] || ['🌡️', 'Onbekend']; return [!day && c <= 1 ? '🌙' : w[0], w[1]]; };
const hhmm = (iso) => iso.slice(11, 16);

async function refreshWeather() {
  let d;
  try { d = await api('/api/weather'); } catch (e) { $('#weather').innerHTML = `<div class="empty">Weer niet beschikbaar (${esc(e.message)})</div>`; return; }
  const c = d.current;
  const [icon, desc] = wmo(c.weather_code, c.is_day);
  // Regenwaarschuwing voor de komende 3 uur
  const idx = d.hourly.time.findIndex((t) => t >= c.time.slice(0, 13));
  let rain = '';
  for (let i = Math.max(idx, 0); i < idx + 3 && i < d.hourly.time.length; i++) {
    if (d.hourly.precipitation_probability[i] >= 50) { rain = `☔ Kans op regen rond ${hhmm(d.hourly.time[i])} (${d.hourly.precipitation_probability[i]}%) — neem een paraplu mee`; break; }
  }
  $('#weather').innerHTML = `
    <div class="w-now">
      <div class="w-icon">${icon}</div>
      <div><div class="w-temp">${Math.round(c.temperature_2m)}°</div><div class="w-desc">${desc} · voelt als ${Math.round(c.apparent_temperature)}°</div></div>
    </div>
    <div class="w-meta">
      <span>💧 ${c.relative_humidity_2m}%</span><span>💨 ${Math.round(c.wind_speed_10m)} km/u</span>
      <span>🌅 ${hhmm(d.daily.sunrise[0])}</span><span>🌇 ${hhmm(d.daily.sunset[0])}</span>
    </div>
    ${rain ? `<div class="w-rain">${rain}</div>` : ''}
    <div class="w-days">
      ${d.daily.time.map((t, i) => `
        <div>
          <div class="d">${i === 0 ? 'vandaag' : new Date(t + 'T12:00').toLocaleDateString(LOCALE, { weekday: 'short' })}</div>
          <div class="e" title="${wmo(d.daily.weather_code[i])[1]} · ${d.daily.precipitation_probability_max[i] ?? 0}% regen">${wmo(d.daily.weather_code[i])[0]}</div>
          <div>${Math.round(d.daily.temperature_2m_max[i])}° <span class="lo">${Math.round(d.daily.temperature_2m_min[i])}°</span></div>
        </div>`).join('')}
    </div>`;
}

/* ---------- Systeem ---------- */
const fmtBytes = (b) => { if (!b) return '0 B'; const u = ['B', 'KB', 'MB', 'GB', 'TB']; const i = Math.min(Math.floor(Math.log(b) / Math.log(1024)), 4); return (b / 1024 ** i).toFixed(i > 2 ? 1 : 0) + ' ' + u[i]; };
const fmtUptime = (s) => { const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60); return d ? `${d}d ${h}u` : h ? `${h}u ${m}m` : `${m}m`; };
const level = (p) => (p >= 90 ? 'bad' : p >= 75 ? 'warn' : '');
const statBar = (label, pct, right) => `
  <div class="stat"><div class="stat-row"><span>${esc(label)}</span><span>${right}</span></div>
  <div class="bar"><div class="${level(pct)}" style="width:${Math.min(100, pct).toFixed(1)}%"></div></div></div>`;
const cpuHistory = [];
function spark(vals) {
  if (vals.length < 2) return '';
  const w = 300, h = 36, step = w / 39;
  const pts = vals.map((v, i) => [(i + 40 - vals.length) * step, h - (v / 100) * (h - 2) - 1]);
  const line = 'M' + pts.map((p) => p.map((n) => n.toFixed(1)).join(',')).join('L');
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><path class="area" d="${line}L${pts.at(-1)[0]},${h}L${pts[0][0]},${h}Z"/><path d="${line}"/></svg>`;
}

async function refreshSystem() {
  let s;
  try { s = await api('/api/system'); } catch { return; }
  cpuHistory.push(s.cpu.usage); if (cpuHistory.length > 40) cpuHistory.shift();
  $('#sys-host').textContent = s.hostname;
  const memPct = (s.memory.used / s.memory.total) * 100;
  $('#system').innerHTML = `
    ${statBar('CPU', s.cpu.usage, `${s.cpu.usage}% · ${s.cpu.cores} cores`)}
    ${spark(cpuHistory)}
    ${statBar('Geheugen', memPct, `${fmtBytes(s.memory.used)} / ${fmtBytes(s.memory.total)}`)}
    ${s.disks.map((d) => statBar(d.name, (d.used / d.total) * 100, `${fmtBytes(d.used)} / ${fmtBytes(d.total)}`)).join('')}
    <div class="sys-grid">
      <div>Uptime<b>${fmtUptime(s.uptime)}</b></div>
      <div>Temperatuur<b>${s.temperature != null ? Math.round(s.temperature) + '°C' : '—'}</b></div>
      <div>Download<b>${fmtBytes(s.network.rx)}/s</b></div>
      <div>Upload<b>${fmtBytes(s.network.tx)}/s</b></div>
      <div class="wide">Load (1/5/15)<b>${s.load.map((l) => l.toFixed(2)).join(' ')}</b></div>
    </div>`;
}

/* ---------- Taken ---------- */
async function refreshTodos() {
  const todos = await api('/api/todos').catch(() => []);
  todos.sort((a, b) => a.done - b.done || a.created - b.created);
  $('#todos').innerHTML = todos.length ? todos.map((t) => `
    <li class="${t.done ? 'done' : ''}" data-id="${esc(t.id)}">
      <input type="checkbox" ${t.done ? 'checked' : ''} aria-label="Afgerond">
      <span class="t">${esc(t.text)}</span>
      <button class="del" title="Verwijderen" aria-label="Verwijderen">×</button>
    </li>`).join('') : '<li class="empty">Niets te doen 🎉</li>';
}
$('#todo-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const text = $('#todo-input').value.trim();
  if (!text) return;
  $('#todo-input').value = '';
  await api('/api/todos', { method: 'POST', body: JSON.stringify({ text }) }).catch((err) => toast(err.message));
  refreshTodos();
});
$('#todos').addEventListener('click', async (e) => {
  const li = e.target.closest('li[data-id]');
  if (!li) return;
  const id = li.dataset.id;
  if (e.target.matches('input[type=checkbox]')) await api(`/api/todos/${id}`, { method: 'PATCH', body: JSON.stringify({ done: e.target.checked }) });
  else if (e.target.matches('.del')) await api(`/api/todos/${id}`, { method: 'DELETE' });
  else return;
  refreshTodos();
});
$('#todo-clear').addEventListener('click', async () => {
  const todos = await api('/api/todos');
  await Promise.all(todos.filter((t) => t.done).map((t) => api(`/api/todos/${t.id}`, { method: 'DELETE' })));
  refreshTodos();
});

/* ---------- Docker ---------- */
async function refreshDocker() {
  let list;
  try { list = await api('/api/docker'); } catch (e) { $('#docker').innerHTML = `<li class="empty">Docker niet bereikbaar (${esc(e.message)})</li>`; return; }
  const running = list.filter((c) => c.state === 'running').length;
  $('#docker-count').textContent = `${running}/${list.length} actief`;
  $('#docker').innerHTML = list.map((c) => `
    <li data-id="${esc(c.id)}">
      <span class="dot ${c.state === 'running' ? 'up' : 'down'}"></span>
      <div class="n"><div>${esc(c.name)}</div><div>${esc(c.status)}</div></div>
      ${config.docker.allowActions ? `<div class="acts">
        ${c.state === 'running'
          ? `<button data-a="restart" title="Herstarten">↻</button><button data-a="stop" title="Stoppen">■</button>`
          : `<button data-a="start" title="Starten">▶</button>`}
      </div>` : ''}
    </li>`).join('') || '<li class="empty">Geen containers</li>';
}
$('#docker').addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-a]');
  if (!btn) return;
  const li = btn.closest('li');
  const name = li.querySelector('.n div').textContent;
  if (btn.dataset.a !== 'start' && !confirm(`${name} ${btn.dataset.a === 'stop' ? 'stoppen' : 'herstarten'}?`)) return;
  btn.disabled = true;
  try { await api(`/api/docker/${li.dataset.id}/${btn.dataset.a}`, { method: 'POST' }); toast(`${name}: ${btn.dataset.a} gelukt`); }
  catch (err) { toast(`Mislukt: ${err.message}`); }
  refreshDocker();
});

/* ---------- Start ---------- */
(async function init() {
  try { config = await api('/api/config'); } catch { config = {}; }
  config.widgets = config.widgets || {};
  config.search = config.search || {};
  config.docker = config.docker || {};
  document.title = config.title || 'Home';
  tick(); setInterval(tick, 1000);
  renderServices(); renderBookmarks();
  refreshStatus(); setInterval(refreshStatus, 15000);

  const w = config.widgets;
  if (w.world === false) document.querySelector('.tabs').hidden = true;
  if (w.weather !== false && config.weather && config.weather.enabled) {
    $('#weather-card').hidden = false; $('#weather-loc').textContent = config.weather.location;
    refreshWeather(); setInterval(refreshWeather, 10 * 60 * 1000);
  }
  if (w.system !== false) { $('#system-card').hidden = false; refreshSystem(); setInterval(refreshSystem, 3000); }
  if (w.todos !== false) { $('#todo-card').hidden = false; refreshTodos(); }
  if (w.docker !== false && config.docker.enabled) { $('#docker-card').hidden = false; refreshDocker(); setInterval(refreshDocker, 15000); }
})();
