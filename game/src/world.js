// Aurora Falls — the city: snowbound districts, aurora sky, snow, blizzard weather.
import * as THREE from 'three';
import { DISTRICTS, GARAGE } from './config.js';

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function windowTexture(rand, litColor) {
  const c = document.createElement('canvas'); c.width = 64; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#0c1220'; g.fillRect(0, 0, 64, 128);
  for (let y = 6; y < 122; y += 12) for (let x = 6; x < 58; x += 10) {
    const lit = rand() < 0.55;
    g.fillStyle = lit ? litColor : '#1a2436';
    g.fillRect(x, y, 6, 8);
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function neonSign(text, color) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#05070d'; g.fillRect(0, 0, 256, 64);
  g.font = 'bold 34px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.shadowColor = color; g.shadowBlur = 18; g.fillStyle = color;
  g.fillText(text, 128, 34);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(10, 2.5),
    new THREE.MeshBasicMaterial({ map: t, transparent: true, side: THREE.DoubleSide }));
  return m;
}

export function buildWorld(scene) {
  const rand = mulberry32(20261122);
  const colliders = [];   // {x,z,hx,hz}
  const markers = { garage: new THREE.Vector3(GARAGE.x, 0, GARAGE.z), safehouses: [] };
  const animated = { plows: [], skiers: [], gondolas: [], peds: [], aurora: null, snow: null, snowVel: null, heliLight: null };

  // ---- sky: stars, aurora ribbon, moon
  const starGeo = new THREE.BufferGeometry();
  const starPos = new Float32Array(900 * 3);
  for (let i = 0; i < 900; i++) {
    const a = rand() * Math.PI * 2, e = 0.15 + rand() * 1.2, r = 900;
    starPos[i * 3] = Math.cos(a) * Math.cos(e) * r;
    starPos[i * 3 + 1] = Math.sin(e) * r;
    starPos[i * 3 + 2] = Math.sin(a) * Math.cos(e) * r;
  }
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xcfe4ff, size: 1.6, sizeAttenuation: false })));

  // Aurora: a pre-rendered band texture on a plane (cheap in software renderers;
  // a per-pixel shader here cost ~1s/frame under SwiftShader). It drifts slowly.
  function auroraTexture() {
    const c = document.createElement('canvas'); c.width = 512; c.height = 256;
    const g = c.getContext('2d');
    g.clearRect(0, 0, 512, 256);
    const bands = [
      { y: 40, h: 70, color: 'rgba(46,242,120,0.85)' },
      { y: 90, h: 90, color: 'rgba(120,90,255,0.7)' },
      { y: 150, h: 60, color: 'rgba(46,242,180,0.6)' },
    ];
    for (const b of bands) {
      for (let x = 0; x < 512; x += 4) {
        const wob = Math.sin(x * 0.045) * 22 + Math.sin(x * 0.013) * 30;
        const grad = g.createLinearGradient(0, b.y + wob - b.h / 2, 0, b.y + wob + b.h / 2);
        grad.addColorStop(0, 'rgba(0,0,0,0)');
        grad.addColorStop(0.5, b.color);
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = grad;
        g.fillRect(x, 0, 4, 256);
      }
    }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = THREE.RepeatWrapping;
    return t;
  }
  const auroraTex = auroraTexture();
  const auroraMat = new THREE.MeshBasicMaterial({
    map: auroraTex, transparent: true, side: THREE.DoubleSide, depthWrite: false, fog: false, opacity: 0.8,
  });
  const aurora = new THREE.Mesh(new THREE.PlaneGeometry(1600, 260, 1, 1), auroraMat);
  aurora.position.set(0, 90, -420); aurora.rotation.x = 0.12;
  scene.add(aurora); animated.aurora = auroraMat;

  const moon = new THREE.Mesh(new THREE.CircleGeometry(26, 32),
    new THREE.MeshBasicMaterial({ color: 0xe8f0ff, fog: false }));
  moon.position.set(-320, 330, -600); moon.lookAt(0, 0, 0); scene.add(moon);

  // ---- ground: snow field, roads, frozen lake, ski slope, mountains
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(1100, 1100),
    new THREE.MeshLambertMaterial({ color: 0xdfe8f2 }));
  ground.rotation.x = -Math.PI / 2; scene.add(ground);

  const roadMat = new THREE.MeshLambertMaterial({ color: 0x232a38 });
  const roadGeoH = new THREE.PlaneGeometry(560, 11);
  const roadGeoV = new THREE.PlaneGeometry(11, 560);
  for (let i = -4; i <= 4; i++) {
    const x = i * 64, z = i * 64;
    const h = new THREE.Mesh(roadGeoH, roadMat); h.rotation.x = -Math.PI / 2; h.position.set(0, 0.06, z); scene.add(h);
    const v = new THREE.Mesh(roadGeoV, roadMat); v.rotation.x = -Math.PI / 2; v.position.set(x, 0.06, 0); scene.add(v);
  }
  // ring road around the frozen lake
  const ring = new THREE.Mesh(new THREE.RingGeometry(120, 132, 48),
    new THREE.MeshLambertMaterial({ color: 0x2a3342 }));
  ring.rotation.x = -Math.PI / 2; ring.position.set(10, 0.06, 225); scene.add(ring);
  // the Pass: a winding road of segments
  const passPts = [[-120, -90], [-170, -140], [-215, -195], [-260, -230], [-300, -260]];
  for (let i = 0; i < passPts.length - 1; i++) {
    const [x1, z1] = passPts[i], [x2, z2] = passPts[i + 1];
    const len = Math.hypot(x2 - x1, z2 - z1);
    const seg = new THREE.Mesh(new THREE.PlaneGeometry(len, 10), roadMat);
    seg.rotation.x = -Math.PI / 2; seg.rotation.z = -Math.atan2(z2 - z1, x2 - x1);
    seg.position.set((x1 + x2) / 2, 0.07, (z1 + z2) / 2); scene.add(seg);
  }

  const lake = new THREE.Mesh(new THREE.CircleGeometry(118, 48),
    new THREE.MeshLambertMaterial({ color: 0xa8d8ee }));
  lake.rotation.x = -Math.PI / 2; lake.position.set(10, 0.12, 225); scene.add(lake);
  // festival tents + lights on the lake
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    const tent = new THREE.Mesh(new THREE.ConeGeometry(6, 7, 6),
      new THREE.MeshLambertMaterial({ color: [0xff5a5a, 0xffc46b, 0x7fd4ff, 0xc9a7ff][i % 4] }));
    tent.position.set(10 + Math.cos(a) * 70, 3.5, 225 + Math.sin(a) * 70); scene.add(tent);
  }

  // ski slope: inclined white plane on the resort mountain
  const slope = new THREE.Mesh(new THREE.PlaneGeometry(120, 190),
    new THREE.MeshLambertMaterial({ color: 0xeef4fb }));
  slope.position.set(235, 26, -215); slope.rotation.set(-Math.PI / 2 + 0.42, 0, 0.35); scene.add(slope);
  // lift pylons + gondolas
  for (let i = 0; i < 4; i++) {
    const pylon = new THREE.Mesh(new THREE.BoxGeometry(1.5, 26, 1.5),
      new THREE.MeshLambertMaterial({ color: 0x3a4356 }));
    pylon.position.set(205 + i * 14, 13, -185 - i * 12); scene.add(pylon);
    const gondola = new THREE.Mesh(new THREE.BoxGeometry(4, 3.4, 3),
      new THREE.MeshLambertMaterial({ color: 0xff5a5a, emissive: 0x330000 }));
    gondola.position.set(205 + i * 14, 24, -185 - i * 12); scene.add(gondola);
    animated.gondolas.push({ mesh: gondola, x0: 205 + i * 14, z0: -185 - i * 12, phase: i * 1.7 });
  }
  // mountains around the valley
  const mtnMat = new THREE.MeshLambertMaterial({ color: 0x5a6b84, flatShading: true });
  const snowCapMat = new THREE.MeshLambertMaterial({ color: 0xf2f7fc, flatShading: true });
  const mtns = [[-420, -420, 220, 260], [420, -380, 260, 300], [380, 420, 240, 280], [-380, 430, 200, 240], [0, -520, 280, 320], [-520, 0, 230, 260], [520, 60, 250, 290]];
  for (const [x, z, h, r] of mtns) {
    const m = new THREE.Mesh(new THREE.ConeGeometry(r, h, 7), mtnMat);
    m.position.set(x, h / 2 - 4, z); scene.add(m);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(r * 0.42, h * 0.36, 7), snowCapMat);
    cap.position.set(x, h * 0.82 - 4, z); scene.add(cap);
  }

  // ---- buildings
  const downtownTex = windowTexture(rand, '#ffd27f');
  const downtownMat = new THREE.MeshBasicMaterial({ map: downtownTex });
  const woodMat = new THREE.MeshLambertMaterial({ color: 0x6b4a2f });
  const chaletMat = new THREE.MeshLambertMaterial({ color: 0x7a5c38 });
  const roofMat = new THREE.MeshLambertMaterial({ color: 0xe8f0f8 });
  const neonColors = ['#ff7a1a', '#ff2e88', '#33e0ff', '#ffe14d', '#7dff5e'];
  const signs = ['AURORA', 'HOTEL', 'CLUB', 'BAR', 'SKI', 'CASINO', 'MOTEL', 'DANCE'];

  function addBuilding(x, z, w, d, h, mat, signText) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    b.position.set(x, h / 2, z); scene.add(b);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(w + 1, 1.2, d + 1), roofMat);
    roof.position.set(x, h + 0.6, z); scene.add(roof);
    if (signText) {
      const s = neonSign(signText, neonColors[Math.floor(rand() * neonColors.length)]);
      s.position.set(x, h * 0.72, z + d / 2 + 0.4); scene.add(s);
    }
    colliders.push({ x, z, hx: w / 2 + 0.5, hz: d / 2 + 0.5 });
    return b;
  }
  // Neon Downtown: towers in the BLOCK INTERIORS between roads (roads run on
  // x = i*64 and z = i*64-20, so block centres are offset by half a block)
  for (let gx = -2; gx <= 2; gx++) for (let gz = -2; gz <= 2; gz++) {
    if (gx === 0 && gz === 0) continue;
    const cx = gx * 64 + 32 + (rand() - 0.5) * 14, cz = gz * 64 + 12 + (rand() - 0.5) * 14;
    const h = 26 + rand() * 42;
    addBuilding(cx, cz, 16 + rand() * 8, 16 + rand() * 8, h, downtownMat, rand() < 0.6 ? signs[Math.floor(rand() * signs.length)] : null);
  }
  // Old Mine Town: wooden houses + mine shaft headframe
  for (let i = 0; i < 14; i++) {
    const a = rand() * Math.PI * 2, r = 20 + rand() * 70;
    addBuilding(-200 + Math.cos(a) * r, 70 + Math.sin(a) * r, 9 + rand() * 5, 8 + rand() * 5, 6 + rand() * 4, woodMat, null);
  }
  const headframe = new THREE.Mesh(new THREE.BoxGeometry(8, 22, 8),
    new THREE.MeshLambertMaterial({ color: 0x4a3a28 }));
  headframe.position.set(-225, 11, 45); scene.add(headframe);
  colliders.push({ x: -225, z: 45, hx: 5, hz: 5 });
  // Ski Resort chalets
  for (let i = 0; i < 10; i++) {
    const a = rand() * Math.PI * 2, r = 25 + rand() * 55;
    addBuilding(205 + Math.cos(a) * r, -185 + Math.sin(a) * r, 10 + rand() * 4, 9 + rand() * 4, 7 + rand() * 3, chaletMat, null);
  }
  // garage (player base) — distinct building with sign
  const garage = addBuilding(GARAGE.x, GARAGE.z, 22, 16, 9,
    new THREE.MeshLambertMaterial({ color: 0x39415c, emissive: 0x223344, emissiveIntensity: 0.5 }), 'GARAGE');
  markers.safehouses.push(new THREE.Vector3(-200, 0, 70), new THREE.Vector3(205, 0, -185), new THREE.Vector3(10, 0, 225));

  // ---- streetlights (emissive poles, cheap: no real lights)
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x222a38 });
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });
  for (let gx = -3; gx <= 3; gx++) for (let gz = -3; gz <= 3; gz++) {
    if ((gx + gz) % 2) continue;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 7, 6), poleMat);
    pole.position.set(gx * 64 + 7, 3.5, gz * 64 - 20 + 7); scene.add(pole);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.55, 8, 6), lampMat);
    lamp.position.set(gx * 64 + 7, 7.1, gz * 64 - 20 + 7); scene.add(lamp);
  }

  // ---- snowplows (animated slowly along downtown roads)
  const plowMat = new THREE.MeshLambertMaterial({ color: 0xff8c1a });
  for (let i = 0; i < 2; i++) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(3.2, 2, 5.4), plowMat); body.position.y = 1.4; g.add(body);
    const blade = new THREE.Mesh(new THREE.BoxGeometry(4.2, 1.1, 0.5),
      new THREE.MeshLambertMaterial({ color: 0x9aa8bc }));
    blade.position.set(0, 0.7, 3); g.add(blade);
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffc46b }));
    beacon.position.set(0, 2.8, 0); g.add(beacon);
    g.position.set(-128 + i * 256, 0, -84 + i * 64);
    scene.add(g);
    animated.plows.push({ group: g, lane: -84 + i * 64, dir: i ? -1 : 1, speed: 4 + i * 2 });
  }

  // ---- skiers on the slope
  const skiMat = new THREE.MeshLambertMaterial({ color: 0xff2e88 });
  for (let i = 0; i < 8; i++) {
    const s = new THREE.Mesh(new THREE.CapsuleGeometry(0.5, 1.1, 3, 6), skiMat);
    s.position.set(200 + rand() * 70, 30 + rand() * 20, -260 + rand() * 60);
    scene.add(s);
    animated.skiers.push({ mesh: s, speed: 6 + rand() * 5, x0: s.position.x, z0: s.position.z });
  }

  // ---- pedestrians on sidewalks (simple two-tone figures)
  const pedColors = [0xd94f4f, 0x4f7dd9, 0x54c96b, 0xe0a83c, 0x9a6fd0];
  for (let i = 0; i < 22; i++) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.45, 0.9, 3, 6),
      new THREE.MeshLambertMaterial({ color: pedColors[i % pedColors.length] }));
    body.position.y = 1.1; g.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.32, 8, 6),
      new THREE.MeshLambertMaterial({ color: 0xe8c39a }));
    head.position.y = 2.1; g.add(head);
    const hat = new THREE.Mesh(new THREE.ConeGeometry(0.36, 0.5, 8),
      new THREE.MeshLambertMaterial({ color: 0xffffff }));
    hat.position.y = 2.45; g.add(hat);
    g.position.set((rand() - 0.5) * 300, 0, (rand() - 0.5) * 300);
    scene.add(g);
    animated.peds.push({ group: g, angle: rand() * Math.PI * 2, speed: 1.2 + rand() * 1.2, r: 40 + rand() * 160, cx: (rand() - 0.5) * 100, cz: (rand() - 0.5) * 100 });
  }

  // ---- snowfall (Points, recycled in update)
  const SNOW_N = 2600;
  const snowPos = new Float32Array(SNOW_N * 3);
  const snowVel = new Float32Array(SNOW_N);
  for (let i = 0; i < SNOW_N; i++) {
    snowPos[i * 3] = (rand() - 0.5) * 500;
    snowPos[i * 3 + 1] = rand() * 90;
    snowPos[i * 3 + 2] = (rand() - 0.5) * 500;
    snowVel[i] = 6 + rand() * 8;
  }
  const snowGeo = new THREE.BufferGeometry();
  snowGeo.setAttribute('position', new THREE.BufferAttribute(snowPos, 3));
  const snow = new THREE.Points(snowGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.55, transparent: true, opacity: 0.9 }));
  scene.add(snow);
  animated.snow = snow; animated.snowVel = snowVel;

  // ---- lighting: cold moonlight + warm downtown glow
  scene.add(new THREE.AmbientLight(0x8fa8cc, 0.85));
  const moonLight = new THREE.DirectionalLight(0xbcd2ff, 1.1);
  moonLight.position.set(-200, 300, -150); scene.add(moonLight);
  const downtownGlow = new THREE.PointLight(0xff7a1a, 900, 320, 1.6);
  downtownGlow.position.set(0, 40, -20); scene.add(downtownGlow);
  scene.fog = new THREE.FogExp2(0x0a1424, 0.0022);

  function update(dt, t, wx) {
    // aurora drifts slowly across the sky
    auroraTex.offset.x = (t * 0.004) % 1;
    animated.aurora.opacity = 0.8 + 0.1 * Math.sin(t * 0.25);
    // snowfall falls and drifts with the wind
    const pos = animated.snow.geometry.attributes.position;
    const arr = pos.array;
    const fall = wx.blizzard ? 2.6 : 1.0;
    for (let i = 0; i < SNOW_N; i++) {
      arr[i * 3 + 1] -= animated.snowVel[i] * fall * dt;
      arr[i * 3] += wx.wind * dt * 3;
      if (arr[i * 3 + 1] < 0) { arr[i * 3 + 1] = 80 + Math.random() * 10; arr[i * 3] = (Math.random() - 0.5) * 500; arr[i * 3 + 2] = (Math.random() - 0.5) * 500; }
      if (arr[i * 3] > 250) arr[i * 3] = -250; if (arr[i * 3] < -250) arr[i * 3] = 250;
    }
    pos.needsUpdate = true;
    // fog + visibility by weather
    scene.fog.density = wx.blizzard ? 0.0075 : 0.0022;
    // plows crawl their lanes
    for (const p of animated.plows) {
      p.group.position.x += p.dir * p.speed * dt;
      if (p.group.position.x > 260) p.dir = -1; if (p.group.position.x < -260) p.dir = 1;
      p.group.rotation.y = p.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    }
    // gondolas glide
    for (const g of animated.gondolas) {
      const ph = t * 0.12 + g.phase;
      g.mesh.position.x = g.x0 + Math.sin(ph) * 20;
      g.mesh.position.z = g.z0 - Math.cos(ph) * 10;
      g.mesh.position.y = 24 + Math.sin(ph * 2) * 1.5;
    }
    // skiers carve down the slope
    for (const s of animated.skiers) {
      s.mesh.position.z += s.speed * dt;
      s.mesh.position.y -= s.speed * 0.35 * dt;
      s.mesh.position.x += Math.sin(t * 2 + s.x0) * 0.06;
      if (s.mesh.position.z > -160) { s.mesh.position.set(s.x0, 30 + Math.random() * 20, -260 + Math.random() * 40); }
    }
    // pedestrians wander in circles
    for (const p of animated.peds) {
      p.angle += dt * p.speed / p.r;
      p.group.position.set(p.cx + Math.cos(p.angle) * p.r, 0, p.cz + Math.sin(p.angle) * p.r);
      p.group.rotation.y = -p.angle;
    }
  }

  return { colliders, markers, update };
}
