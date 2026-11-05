'use strict';

/* Tabblad "Wereld": 3D wereldbol met eigen plekken */
(function () {
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const api = async (url, opts = {}) => {
    const r = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...opts });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || r.statusText);
    return r.json();
  };

  const TYPES = {
    visited: { emoji: '📍', label: 'Bezocht', color: '#3ccf8e' },
    wish: { emoji: '⭐', label: 'Wil heen', color: '#f2b84b' },
    home: { emoji: '🏠', label: 'Thuis', color: '#7b93ff' }
  };
  const CONTINENTS_NL = {
    Africa: 'Afrika', Antarctica: 'Antarctica', Asia: 'Azië', Europe: 'Europa',
    'North America': 'Noord-Amerika', Oceania: 'Oceanië', 'South America': 'Zuid-Amerika'
  };
  const A2_FIX = { FRA: 'FR', NOR: 'NO' };
  const regionNames = (() => { try { return new Intl.DisplayNames(['nl'], { type: 'region' }); } catch { return null; } })();

  let globe = null;
  let countries = [];
  let places = [];
  let filter = 'all';
  let showArcs = true;
  let autoRotate = true;
  let hoverCountry = null;
  let editing = null; // plek die bewerkt wordt, of {lat,lng} voor een nieuwe
  let rotateTimer;

  try { showArcs = localStorage.getItem('world.arcs') !== '0'; autoRotate = localStorage.getItem('world.rotate') !== '0'; } catch { /* geen opslag */ }

  /* ---------- Tabbladen ---------- */
  function route() {
    const world = location.hash.startsWith('#/wereld');
    $('#view-dashboard').hidden = world;
    $('#view-world').hidden = !world;
    document.querySelectorAll('.tabs a').forEach((a) => a.classList.toggle('active', a.dataset.view === (world ? 'world' : 'dashboard')));
    if (world) initWorld();
  }
  window.addEventListener('hashchange', route);

  /* ---------- Landen ---------- */
  function countryName(f) {
    const p = f.properties;
    const a2 = A2_FIX[p.ADM0_A3] || p.ISO_A2;
    if (regionNames && /^[A-Z]{2}$/.test(a2)) { try { return regionNames.of(a2); } catch { /* val terug */ } }
    return p.NAME;
  }
  function inRing(lng, lat, ring) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i], [xj, yj] = ring[j];
      if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }
  function inPolygon(lng, lat, poly) {
    return inRing(lng, lat, poly[0]) && !poly.slice(1).some((hole) => inRing(lng, lat, hole));
  }
  function countryAt(lat, lng) {
    return countries.find((f) => {
      const g = f.geometry;
      return g.type === 'Polygon' ? inPolygon(lng, lat, g.coordinates) : g.coordinates.some((p) => inPolygon(lng, lat, p));
    }) || null;
  }
  const visitedCodes = () => new Set(places.filter((p) => p.type !== 'wish' && p.countryCode).map((p) => p.countryCode));

  /* ---------- Afstand ---------- */
  function km(a, b) {
    const R = 6371, rad = Math.PI / 180;
    const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }

  /* ---------- Wereldbol ---------- */
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src; s.onload = resolve; s.onerror = () => reject(new Error('kon ' + src + ' niet laden'));
      document.head.appendChild(s);
    });
  }

  let initPromise = null;
  function initWorld() {
    if (initPromise) { resize(); return initPromise; }
    initPromise = (async () => {
      try {
        const [, geo, pl] = await Promise.all([loadScript('/vendor/globe.gl.min.js'), api('/vendor/countries.geojson'), api('/api/places')]);
        countries = geo.features;
        places = pl;
        buildGlobe();
        renderAll();
        $('#globe-loading').remove();
      } catch (err) {
        $('#globe-loading').textContent = 'Wereldbol laden mislukt: ' + err.message;
        initPromise = null;
      }
    })();
    return initPromise;
  }

  function buildGlobe() {
    const el = $('#globe');
    globe = Globe({ animateIn: true })(el)
      .globeImageUrl('/vendor/img/earth-blue-marble.jpg')
      .bumpImageUrl('/vendor/img/earth-topology.png')
      .backgroundImageUrl('/vendor/img/night-sky.png')
      .showAtmosphere(true)
      .atmosphereColor('#7fb2ff')
      .atmosphereAltitude(0.2)
      // Landen
      .polygonsData(countries)
      .polygonCapColor((f) => (visitedCodes().has(f.properties.ADM0_A3)
        ? (f === hoverCountry ? 'rgba(60,207,142,.55)' : 'rgba(60,207,142,.35)')
        : (f === hoverCountry ? 'rgba(255,255,255,.12)' : 'rgba(0,0,0,0)')))
      .polygonSideColor(() => 'rgba(0,0,0,0)')
      .polygonStrokeColor((f) => (visitedCodes().has(f.properties.ADM0_A3) ? 'rgba(60,207,142,.9)' : 'rgba(255,255,255,.22)'))
      .polygonAltitude((f) => (f === hoverCountry ? 0.012 : 0.005))
      .polygonsTransitionDuration(200)
      .polygonLabel((f) => {
        const n = places.filter((p) => p.countryCode === f.properties.ADM0_A3 && p.type !== 'wish').length;
        return `<div class="globe-tip"><b>${esc(countryName(f))}</b>${n ? `<br>✓ ${n} ${n === 1 ? 'plek' : 'plekken'} bezocht` : ''}</div>`;
      })
      .onPolygonHover((f) => { hoverCountry = f; globe.polygonCapColor(globe.polygonCapColor()).polygonAltitude(globe.polygonAltitude()); el.style.cursor = f ? 'crosshair' : 'grab'; })
      .onPolygonClick((f, ev, c) => openDialog({ lat: c.lat, lng: c.lng }))
      .onGlobeClick((c) => openDialog({ lat: c.lat, lng: c.lng }))
      // Markers
      .htmlElementsData([])
      .htmlLat('lat').htmlLng('lng').htmlAltitude(0.012)
      .htmlElement(pinElement)
      .htmlElementVisibilityModifier((elm, visible) => { elm.style.opacity = visible ? 1 : 0; elm.style.pointerEvents = visible ? 'auto' : 'none'; })
      .htmlTransitionDuration(0)
      // Reislijnen vanaf thuis
      .arcColor((a) => [TYPES.home.color, TYPES[a.type].color])
      .arcStroke(0.45)
      .arcDashLength(0.5).arcDashGap(0.15).arcDashInitialGap(() => Math.random()).arcDashAnimateTime(3500)
      .arcAltitudeAutoScale(0.4)
      // Pulserende ring om thuis
      .ringColor(() => (t) => `rgba(123,147,255,${1 - t})`)
      .ringMaxRadius(4).ringPropagationSpeed(2).ringRepeatPeriod(1400);

    // Realistische glans op het water
    globe.onGlobeReady(() => {
      const mat = globe.globeMaterial();
      const img = new Image();
      img.onload = () => {
        if (!mat.map) return;
        const tex = new mat.map.constructor(img);
        tex.needsUpdate = true;
        mat.specularMap = tex;
        if (mat.specular) mat.specular.set('#4a5a70');
        mat.shininess = 14;
        mat.needsUpdate = true;
      };
      img.src = '/vendor/img/earth-water.png';
    });

    const controls = globe.controls();
    controls.autoRotateSpeed = 0.35;
    controls.autoRotate = autoRotate;
    controls.enableDamping = true;
    el.addEventListener('pointerdown', pauseRotate);
    el.addEventListener('wheel', pauseRotate, { passive: true });

    const home = places.find((p) => p.type === 'home');
    globe.pointOfView(home ? { lat: home.lat, lng: home.lng, altitude: 2.2 } : { lat: 30, lng: 10, altitude: 2.4 });

    new ResizeObserver(resize).observe($('.globe-wrap'));
    resize();
    setButtons();
  }

  function resize() {
    if (!globe) return;
    const wrap = $('.globe-wrap');
    globe.width(wrap.clientWidth).height(wrap.clientHeight);
  }

  function pauseRotate() {
    if (!globe || !autoRotate) return;
    globe.controls().autoRotate = false;
    clearTimeout(rotateTimer);
    rotateTimer = setTimeout(() => { if (autoRotate && !$('#place-dialog').open) globe.controls().autoRotate = true; }, 12000);
  }

  function pinElement(p) {
    const t = TYPES[p.type] || TYPES.visited;
    const el = document.createElement('div');
    el.className = 'pin';
    el.dataset.id = p.id;
    el.style.setProperty('--c', t.color);
    el.innerHTML = `<div class="head"><span>${t.emoji}</span></div><div class="lbl">${esc(p.name)}</div>`;
    el.title = [p.name, p.country, p.date ? fmtDate(p.date) : '', p.note].filter(Boolean).join(' · ');
    el.addEventListener('pointerdown', (e) => e.stopPropagation());
    el.addEventListener('click', (e) => { e.stopPropagation(); openDialog(p); });
    return el;
  }

  function setButtons() {
    $('#globe-rotate').classList.toggle('on', autoRotate);
    $('#globe-arcs').classList.toggle('on', showArcs);
  }
  $('#globe-rotate').addEventListener('click', () => {
    autoRotate = !autoRotate;
    try { localStorage.setItem('world.rotate', autoRotate ? '1' : '0'); } catch { /* */ }
    if (globe) globe.controls().autoRotate = autoRotate;
    setButtons();
  });
  $('#globe-arcs').addEventListener('click', () => {
    showArcs = !showArcs;
    try { localStorage.setItem('world.arcs', showArcs ? '1' : '0'); } catch { /* */ }
    renderGlobeData();
    setButtons();
  });
  $('#globe-home').addEventListener('click', () => {
    const home = places.find((p) => p.type === 'home');
    if (home) flyTo(home, 1.6);
    else toast('Nog geen thuis ingesteld: klik op de bol en kies 🏠 Thuis');
  });

  function flyTo(p, altitude = 1.1) {
    if (!globe) return;
    pauseRotate();
    globe.pointOfView({ lat: p.lat, lng: p.lng, altitude }, 1400);
    if (p.id) {
      setTimeout(() => {
        const el = document.querySelector(`.pin[data-id="${CSS.escape(p.id)}"]`);
        if (el) { el.classList.add('show-lbl'); setTimeout(() => el.classList.remove('show-lbl'), 3500); }
      }, 1400);
    }
  }

  /* ---------- Weergave ---------- */
  function renderGlobeData() {
    if (!globe) return;
    const shown = places.filter((p) => filter === 'all' || p.type === filter || p.type === 'home');
    globe.htmlElementsData(shown);
    const home = places.find((p) => p.type === 'home');
    globe.ringsData(home ? [home] : []);
    globe.arcsData(home && showArcs
      ? shown.filter((p) => p.type !== 'home').map((p) => ({ startLat: home.lat, startLng: home.lng, endLat: p.lat, endLng: p.lng, type: p.type }))
      : []);
    globe.polygonCapColor(globe.polygonCapColor()).polygonStrokeColor(globe.polygonStrokeColor());
  }

  function fmtDate(d) {
    if (!d) return '';
    const [y, m] = d.split('-');
    return m ? new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('nl-NL', { month: 'short', year: 'numeric' }) : y;
  }

  function renderStats() {
    const visited = places.filter((p) => p.type !== 'wish');
    const codes = visitedCodes();
    const conts = new Set(countries.filter((f) => codes.has(f.properties.ADM0_A3)).map((f) => f.properties.CONTINENT).filter((c) => CONTINENTS_NL[c]));
    const pct = Math.round((codes.size / 195) * 100);
    const home = places.find((p) => p.type === 'home');
    let far = '';
    if (home) {
      const best = visited.filter((p) => p !== home).map((p) => ({ p, d: km(home, p) })).sort((a, b) => b.d - a.d)[0];
      if (best) far = `<div class="prog muted">Verste plek vanaf thuis: <b style="display:inline;font-size:13px;color:var(--text)">${esc(best.p.name)}</b> · ${Math.round(best.d).toLocaleString('nl-NL')} km</div>`;
    }
    $('#world-stats').innerHTML = `
      <div><b>${visited.filter((p) => p.type === 'visited').length}</b><span>plekken</span></div>
      <div><b>${codes.size}</b><span>landen</span></div>
      <div><b>${conts.size}</b><span>continenten</span></div>
      <div class="prog">
        <div class="stat-row"><span>Wereld ontdekt</span><span>${pct}% van 195 landen</span></div>
        <div class="bar"><div style="width:${Math.max(pct, codes.size ? 1 : 0)}%;background:var(--ok)"></div></div>
      </div>
      ${conts.size ? `<div class="prog muted">${[...conts].map((c) => CONTINENTS_NL[c]).sort().join(' · ')}</div>` : ''}
      ${far}`;
  }

  function renderList() {
    const list = places
      .filter((p) => filter === 'all' || p.type === filter)
      .sort((a, b) => (a.type === 'home' ? -1 : b.type === 'home' ? 1 : 0) || (b.date || '').localeCompare(a.date || '') || b.created - a.created);
    $('#places-count').textContent = `${places.length}`;
    $('#places').innerHTML = list.length ? list.map((p) => `
      <li data-id="${esc(p.id)}">
        <span class="em">${TYPES[p.type].emoji}</span>
        <div class="pi">
          <div class="pn">${esc(p.name)}</div>
          <div class="pm">${esc([p.country, fmtDate(p.date)].filter(Boolean).join(' · ') || TYPES[p.type].label)}</div>
          ${p.note ? `<div class="pnote">${esc(p.note)}</div>` : ''}
        </div>
        <button class="edit" title="Bewerken" aria-label="Bewerken">✎</button>
      </li>`).join('') : `<li class="empty" style="cursor:default">${places.length ? 'Niets in deze categorie' : 'Nog geen plekken. Klik op de wereldbol of zoek een stad om te beginnen ✈️'}</li>`;
  }

  function renderAll() { renderGlobeData(); renderStats(); renderList(); }

  $('#places').addEventListener('click', (e) => {
    const li = e.target.closest('li[data-id]');
    if (!li) return;
    const p = places.find((x) => x.id === li.dataset.id);
    if (!p) return;
    if (e.target.closest('.edit')) openDialog(p);
    else flyTo(p);
  });
  $('#place-filter').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-f]');
    if (!b) return;
    filter = b.dataset.f;
    document.querySelectorAll('#place-filter button').forEach((x) => x.classList.toggle('active', x === b));
    renderAll();
  });

  /* ---------- Toevoegen / bewerken ---------- */
  const dlg = $('#place-dialog');
  const form = $('#place-form');

  function openDialog(p) {
    editing = p;
    const isNew = !p.id;
    if (globe) globe.controls().autoRotate = false;
    const c = isNew ? countryAt(p.lat, p.lng) : null;
    const countryLabel = isNew ? (c ? countryName(c) : p.country || '') : p.country;
    $('#place-title').textContent = isNew ? 'Plek toevoegen' : 'Plek bewerken';
    $('#place-coords').textContent = [countryLabel, `${p.lat.toFixed(3)}, ${p.lng.toFixed(3)}`].filter(Boolean).join(' · ');
    form.name.value = p.name || '';
    form.date.value = p.date && p.date.length === 7 ? p.date : (p.date ? p.date.slice(0, 7) : '');
    form.note.value = p.note || '';
    form.querySelector(`input[name=type][value="${p.type || 'visited'}"]`).checked = true;
    $('#place-delete').hidden = isNew;
    dlg.showModal();
    setTimeout(() => form.name.focus(), 50);
  }
  function closeDialog() {
    dlg.close();
    editing = null;
    if (globe && autoRotate) pauseRotate();
  }
  $('#place-cancel').addEventListener('click', closeDialog);
  dlg.addEventListener('click', (e) => { if (e.target === dlg) closeDialog(); });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const p = editing;
    const body = {
      name: form.name.value.trim(),
      type: form.querySelector('input[name=type]:checked').value,
      date: form.date.value,
      note: form.note.value.trim()
    };
    if (!body.name) return;
    try {
      if (p.id) {
        await api(`/api/places/${p.id}`, { method: 'PATCH', body: JSON.stringify(body) });
      } else {
        const c = countryAt(p.lat, p.lng);
        Object.assign(body, {
          lat: p.lat, lng: p.lng,
          country: c ? countryName(c) : (p.country || ''),
          countryCode: c ? c.properties.ADM0_A3 : ''
        });
        await api('/api/places', { method: 'POST', body: JSON.stringify(body) });
      }
      places = await api('/api/places');
      closeDialog();
      renderAll();
      toast(p.id ? 'Plek bijgewerkt' : `${body.name} toegevoegd ${TYPES[body.type].emoji}`);
    } catch (err) { toast('Opslaan mislukt: ' + err.message); }
  });

  $('#place-delete').addEventListener('click', async () => {
    const p = editing;
    if (!p || !p.id || !confirm(`${p.name} verwijderen?`)) return;
    try {
      await api(`/api/places/${p.id}`, { method: 'DELETE' });
      places = places.filter((x) => x.id !== p.id);
      closeDialog();
      renderAll();
      toast('Plek verwijderd');
    } catch (err) { toast('Verwijderen mislukt: ' + err.message); }
  });

  /* ---------- Plek zoeken ---------- */
  const geoInput = $('#geo-input');
  const geoResults = $('#geo-results');
  let geoTimer, geoItems = [], geoSel = 0, geoSeq = 0;

  function showResults(items) {
    geoItems = items;
    geoSel = 0;
    geoResults.hidden = !items.length && !geoInput.value.trim();
    geoResults.innerHTML = items.length
      ? items.map((r, i) => `<li data-i="${i}" class="${i === 0 ? 'sel' : ''}">${esc(r.name)}<small>${esc(r.label)}</small></li>`).join('')
      : (geoInput.value.trim().length > 1 ? '<li style="cursor:default">Niets gevonden</li>' : '');
  }
  async function search(q) {
    const coord = q.match(/^\s*(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)\s*$/);
    if (coord) return showResults([{ name: 'Coördinaten', label: `${coord[1]}, ${coord[2]}`, lat: Number(coord[1]), lng: Number(coord[2]) }]);
    const seq = ++geoSeq;
    try {
      const res = await api('/api/geocode?q=' + encodeURIComponent(q));
      if (seq === geoSeq) showResults(res);
    } catch (err) {
      if (seq === geoSeq) { geoResults.hidden = false; geoResults.innerHTML = `<li style="cursor:default">Zoeken mislukt (${esc(err.message)})</li>`; }
    }
  }
  function pick(r) {
    geoResults.hidden = true;
    geoInput.value = '';
    geoInput.blur();
    flyTo(r, 0.9);
    setTimeout(() => openDialog({ lat: r.lat, lng: r.lng, name: r.name === 'Coördinaten' ? '' : r.name, country: r.country }), 1450);
  }
  geoInput.addEventListener('input', () => {
    clearTimeout(geoTimer);
    const q = geoInput.value.trim();
    if (q.length < 2) return showResults([]);
    geoTimer = setTimeout(() => search(q), 450);
  });
  geoInput.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!geoItems.length) return;
      geoSel = (geoSel + (e.key === 'ArrowDown' ? 1 : -1) + geoItems.length) % geoItems.length;
      geoResults.querySelectorAll('li').forEach((li, i) => li.classList.toggle('sel', i === geoSel));
    } else if (e.key === 'Escape') {
      geoInput.value = ''; showResults([]); geoInput.blur();
    }
  });
  $('#geo-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const q = geoInput.value.trim();
    if (!q) return;
    if (!geoItems.length) { clearTimeout(geoTimer); await search(q); }
    if (geoItems[geoSel]) pick(geoItems[geoSel]);
  });
  geoResults.addEventListener('mousedown', (e) => {
    const li = e.target.closest('li[data-i]');
    if (li) { e.preventDefault(); pick(geoItems[Number(li.dataset.i)]); }
  });
  geoInput.addEventListener('blur', () => setTimeout(() => { geoResults.hidden = true; }, 150));
  geoInput.addEventListener('focus', () => { if (geoItems.length) geoResults.hidden = false; });
  route();
})();
