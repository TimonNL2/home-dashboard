'use strict';

/*
 * Realistische aarde voor globe.gl:
 *  - zon op de echte positie van dit moment (dag/nacht-grens klopt)
 *  - stadslichten op de nachtzijde
 *  - glans op het water
 */
window.Earth = (function () {
  const IMG = '/vendor/img/';

  // Punt op aarde waar de zon nu loodrecht boven staat
  function subsolar(date = new Date()) {
    const rad = Math.PI / 180;
    const d = (date.getTime() - Date.UTC(2000, 0, 1, 12)) / 86400000;
    const g = (357.529 + 0.98560028 * d) * rad;
    const q = 280.459 + 0.98564736 * d;
    const L = (q + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * rad;
    const e = (23.439 - 0.00000036 * d) * rad;
    const ra = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L)) / rad;
    const dec = Math.asin(Math.sin(e) * Math.sin(L)) / rad;
    const gmst = ((18.697374558 + 24.06570982441908 * d) % 24 + 24) % 24;
    let lng = ra - gmst * 15;
    lng = ((lng + 540) % 360) - 180;
    return { lat: dec, lng };
  }

  function loadTexture(Texture, url) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => { const t = new Texture(img); t.colorSpace = 'srgb'; t.needsUpdate = true; resolve(t); };
      img.onerror = () => resolve(null);
      img.src = url;
    });
  }

  function setup(globe, opts = {}) {
    globe
      .globeImageUrl(IMG + 'earth-blue-marble.jpg')
      .bumpImageUrl(IMG + 'earth-topology.png')
      .showAtmosphere(true)
      .atmosphereColor('#7fb4ff')
      .atmosphereAltitude(opts.atmosphere ?? 0.18);

    globe.onGlobeReady(async () => {
      const mat = globe.globeMaterial();
      const scene = globe.scene();
      const camera = globe.camera();
      if (!mat.map) return;
      const Texture = mat.map.constructor;

      // Licht: weinig omgevingslicht, één "zon"
      const lights = globe.lights();
      const sun = lights.find((l) => l.isDirectionalLight);
      const amb = lights.find((l) => l.isAmbientLight);
      if (amb) { amb.intensity = (opts.ambient ?? 0.045) * Math.PI; if (amb.color) amb.color.set('#8fb0ff'); }
      if (!sun) return;
      if (sun.parent && sun.parent !== scene) { sun.parent.remove(sun); scene.add(sun); }
      sun.intensity = 1.5 * Math.PI;
      const Vec3 = sun.position.constructor;
      const sunWorld = new Vec3();
      const sunView = { value: new Vec3() };

      function placeSun() {
        const s = subsolar();
        const c = globe.getCoords(s.lat, s.lng, 0);
        sunWorld.set(c.x, c.y, c.z).normalize();
        sun.position.copy(sunWorld).multiplyScalar(1000);
      }
      placeSun();
      setInterval(placeSun, 60000);

      // Water glans
      const [water, night] = await Promise.all([loadTexture(Texture, IMG + 'earth-water.png'), loadTexture(Texture, IMG + 'earth-night.jpg')]);
      if (water) {
        mat.specularMap = water;
        if (mat.specular) mat.specular.set('#2c3a4c');
        mat.shininess = 32;
      }

      // Stadslichten alleen aan de nachtkant
      if (night) {
        mat.emissiveMap = night;
        if (mat.emissive) mat.emissive.set('#ffcf8a');
        mat.emissiveIntensity = opts.cityLights ?? 1.8;
        mat.onBeforeCompile = (shader) => {
          shader.uniforms.sunView = sunView;
          shader.fragmentShader = 'uniform vec3 sunView;\n' + shader.fragmentShader.replace(
            '#include <emissivemap_fragment>',
            `#ifdef USE_EMISSIVEMAP
              vec4 emissiveColor = texture2D( emissiveMap, vEmissiveMapUv );
              float sunDot = dot( normalize( normal ), normalize( sunView ) );
              float glow = emissiveColor.r - emissiveColor.b * 0.7; // lichten zijn warm, het landschap is blauwgroen
              // alleen echte lichtpunten, niet het donkere landschap van de nachtfoto
              totalEmissiveRadiance *= emissiveColor.rgb * smoothstep( 0.004, 0.05, glow ) * 2.4 * smoothstep( 0.12, -0.22, sunDot );
            #endif`
          );
        };
      }
      mat.needsUpdate = true;

      (function frame() {
        sunView.value.copy(sunWorld).transformDirection(camera.matrixWorldInverse);
        requestAnimationFrame(frame);
      })();
    });
    return globe;
  }

  return { setup, subsolar };
})();
