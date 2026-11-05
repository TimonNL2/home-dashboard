'use strict';

/* Eigen lijn-iconen (24px grid, 1.6 lijndikte) */
window.Icons = (function () {
  const svg = (body, cls = '') => `<svg class="ic ${cls}" viewBox="0 0 24 24" aria-hidden="true">${body}</svg>`;
  const P = {
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4"/>',
    moon: '<path d="M19.5 14.2A7.5 7.5 0 0 1 9.8 4.5a7.5 7.5 0 1 0 9.7 9.7z"/>',
    cloud: '<path d="M7 18.5h10a4 4 0 0 0 .6-7.96A5.5 5.5 0 0 0 7 9.5a4.5 4.5 0 0 0 0 9z"/>',
    partly: '<path d="M8.5 5.2a3.6 3.6 0 0 1 5.6 2.2M4 9.5h1M6.2 4.7l.7.7M10.4 2.6v1"/><path d="M8.5 19.5h8.5a3.5 3.5 0 0 0 .5-6.96 4.8 4.8 0 0 0-9.2-.54 3.75 3.75 0 0 0 .2 7.5z"/>',
    partlyNight: '<path d="M11.8 7.3A4 4 0 0 1 7.2 2.9 4 4 0 1 0 4 9.7"/><path d="M8.5 19.5h8.5a3.5 3.5 0 0 0 .5-6.96 4.8 4.8 0 0 0-9.2-.54 3.75 3.75 0 0 0 .2 7.5z"/>',
    fog: '<path d="M4 9h16M3 13h14M6 17h14M8 21h8"/><path d="M7 5.5h9" opacity=".5"/>',
    drizzle: '<path d="M7 14.5h10a4 4 0 0 0 .6-7.96A5.5 5.5 0 0 0 7 5.5a4.5 4.5 0 0 0 0 9z"/><path d="M9 18v1M13 18v1M17 18v1"/>',
    rain: '<path d="M7 14.5h10a4 4 0 0 0 .6-7.96A5.5 5.5 0 0 0 7 5.5a4.5 4.5 0 0 0 0 9z"/><path d="m9 17.5-1 3M13 17.5l-1 3M17 17.5l-1 3"/>',
    snow: '<path d="M7 14.5h10a4 4 0 0 0 .6-7.96A5.5 5.5 0 0 0 7 5.5a4.5 4.5 0 0 0 0 9z"/><path d="M8.5 18.5h.01M12 20h.01M15.5 18.5h.01" stroke-width="2.6"/>',
    storm: '<path d="M7 14.5h10a4 4 0 0 0 .6-7.96A5.5 5.5 0 0 0 7 5.5a4.5 4.5 0 0 0 0 9z"/><path d="m12.5 13-2 4h3l-2 4"/>',
    // overig
    app: '<rect x="3.5" y="4.5" width="17" height="15" rx="3"/><path d="M3.5 9h17M7 6.8h.01M9.5 6.8h.01" />',
    pin: '<path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/>',
    star: '<path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/>',
    home: '<path d="M4 10.5 12 4l8 6.5V20h-5.5v-5.5h-5V20H4z"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>'
  };

  function weatherKey(code, isDay = 1) {
    if (code === 0 || code === 1) return isDay ? 'sun' : 'moon';
    if (code === 2) return isDay ? 'partly' : 'partlyNight';
    if (code === 3) return 'cloud';
    if (code === 45 || code === 48) return 'fog';
    if (code >= 51 && code <= 57) return 'drizzle';
    if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return 'rain';
    if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow';
    if (code >= 95) return 'storm';
    return 'cloud';
  }

  return {
    get: (name, cls) => svg(P[name] || P.app, cls),
    weather: (code, isDay, cls) => svg(P[weatherKey(code, isDay)], 'wx ' + (cls || ''))
  };
})();
