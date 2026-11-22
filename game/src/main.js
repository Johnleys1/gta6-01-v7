// Aurora Falls — main loop: state machine, input, camera, weather, test hooks.
import * as THREE from 'three';
import { DISTRICTS, MISSIONS, WEAPONS, GARAGE } from './config.js';
import { buildWorld } from './world.js';
import { PlayerCar, Traffic, makeCarMesh, collideCircle } from './vehicles.js';
import { Police } from './police.js';
import { Combat } from './combat.js';
import { Progress, MissionEngine } from './missions.js';
import { AudioEngine } from './audio.js';
import { UI } from './ui.js';

const params = new URLSearchParams(location.search);
const errors = [];
window.addEventListener('error', e => errors.push(String(e.message || e.error)));
const origConsoleError = console.error.bind(console);
console.error = (...a) => { errors.push(a.map(String).join(' ')); origConsoleError(...a); };

const AA = params.get('aa') !== '0';
const renderer = new THREE.WebGLRenderer({ antialias: AA });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
document.getElementById('app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a1424);
const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 1500);

const world = buildWorld(scene);
const audio = new AudioEngine();
const progress = new Progress();
const playerCar = new PlayerCar(scene, 0xff5a1a);
const traffic = new Traffic(scene);
const police = new Police(scene);
const combat = new Combat(scene);
const ui = new UI(document.getElementById('ui'));

// apply owned upgrades to the car
for (const id of progress.owned) {
  if (id === 'engine') playerCar.upgrades.engine = 1;
  if (id === 'engine2') playerCar.upgrades.engine = 2;
  if (id === 'tires') playerCar.upgrades.tires = true;
  if (id === 'armor') playerCar.upgrades.armor = true;
}
if (progress.owned.includes('paint')) {
  playerCar.mesh.traverse(o => { if (o.isMesh && o.material && o.material.color) o.material.emissive = new THREE.Color(0x33e0ff); });
}

const events = {
  onObjective: t => ui.setObjective(t),
  onComplete: m => { ui.toast(`Mission complete: ${m.name} — $${m.reward} · +respect`, 4); audio.pickup(); },
  onFail: r => gameOver('MISSION FAILED', r),
  onToast: t => ui.toast(t),
};
const missions = new MissionEngine(progress, events);

// ---- on-foot player
const onFoot = {
  active: false,
  pos: new THREE.Vector3(48, 0, 126),
  heading: 0,
  mesh: null,
};
{
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.42, 0.85, 3, 8),
    new THREE.MeshLambertMaterial({ color: 0x1a5c8a }));
  body.position.y = 1.05; g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6),
    new THREE.MeshLambertMaterial({ color: 0xe8c39a }));
  head.position.y = 2.0; g.add(head);
  const beanie = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.45, 8),
    new THREE.MeshLambertMaterial({ color: 0xff5a1a }));
  beanie.position.y = 2.32; g.add(beanie);
  g.visible = false;
  scene.add(g);
  onFoot.mesh = g;
}

// ---- input
const input = { up: false, down: false, left: false, right: false, handbrake: false, shoot: false, interact: false };
const keys = {};
let mouseDown = false;
addEventListener('keydown', e => {
  if (e.repeat) return;
  keys[e.code] = true;
  if (e.code === 'KeyE') input.interact = true;
  if (e.code === 'KeyR') ui.toast('Radio: ' + audio.cycleStation());
  if (e.code === 'KeyM') { audio.setMuted(!audio.muted); ui.toast(audio.muted ? 'Muted' : 'Sound on'); }
  if (e.code === 'KeyQ') { ui.showWheel(combat.weaponIndex); }
  if (['Digit1', 'Digit2', 'Digit3', 'Digit4'].includes(e.code)) {
    combat.select(Number(e.code.slice(-1)) - 1);
    ui.toast('Weapon: ' + combat.weapon);
  }
  if (e.code === 'KeyG') toggleGarage();
  if (e.code === 'Escape') togglePause();
  if (e.code === 'KeyJ') missions.startSideJob(['taxi', 'delivery', 'race'][Math.floor(Math.random() * 3)], liveState());
});
addEventListener('keyup', e => { keys[e.code] = false; if (e.code === 'KeyQ') ui.hideWheel(); });
addEventListener('mousedown', e => { if (e.button === 0) mouseDown = true; });
addEventListener('mouseup', e => { if (e.button === 0) mouseDown = false; });
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// ---- game state
let state = 'title'; // title | playing | paused | garage | gameover
let timeOfDay = 0.78; // 0..1, night at ~0.75-0.95 (aurora strongest)
let blizzard = false, blizzardT = 40, weatherT = 0;
let camPos = new THREE.Vector3(48, 8, 140);
let camLook = new THREE.Vector3(48, 1, 120);
let missionMarkerMesh = null;
let playT = 0;

function liveState() {
  return {
    playerPos: onFoot.active ? onFoot.pos : playerCar.pos,
    police, playerHealth: onFoot.active ? playerHealth : playerCar.health,
    interactPressed: input.interact,
    consumeInteract: () => { input.interact = false; },
  };
}
let playerHealth = 100;

function togglePause() {
  if (state === 'playing') {
    state = 'paused';
    ui.showPause(`Cash $${progress.money} · ${progress.rank} · Mission ${progress.missionIndex + 1}/8 · Jobs done ${progress.jobsDone}`);
  } else if (state === 'paused') { state = 'playing'; ui.hidePause(); }
}
function toggleGarage() {
  const near = playerCar.pos.distanceTo(new THREE.Vector3(GARAGE.x, 0, GARAGE.z)) < 22;
  if (state === 'playing' && near && !onFoot.active) {
    state = 'garage'; ui.showGarage(progress);
  } else if (state === 'garage') { state = 'playing'; ui.hideGarage(); }
}
function gameOver(title, text) {
  if (state === 'gameover') return;
  state = 'gameover';
  ui.showGameOver(title, text);
  police.clear();
}
function respawn() {
  playerCar.reset(64, 110, Math.PI);
  onFoot.active = false; onFoot.mesh.visible = false;
  playerHealth = 100;
  police.clear();
  ui.hideGameOver(); ui.hidePause();
  state = 'playing';
  ui.setObjective(missions.active ? `Mission ${missions.active.mission.id}: ${missions.active.mission.name}` : `Press J for a job, or start Mission ${progress.missionIndex + 1}: ${missions.currentMission ? missions.currentMission.name : 'all done'}`);
}

document.getElementById('play').addEventListener('click', () => {
  audio.ensure();
  state = 'playing';
  ui.showHud();
  if (!missions.active && missions.currentMission) missions.startMission();
  else ui.setObjective(`Mission ${progress.missionIndex + 1}: ${missions.currentMission ? missions.currentMission.name : 'all done'} — drive to the marker`);
});
document.getElementById('resume').addEventListener('click', togglePause);
document.getElementById('restart').addEventListener('click', () => { location.reload(); });
document.getElementById('go-retry').addEventListener('click', respawn);
document.getElementById('garage-close').addEventListener('click', toggleGarage);
ui.el.upgrades.addEventListener('click', e => {
  const id = e.target.dataset && e.target.dataset.upg;
  if (!id) return;
  if (progress.buyUpgrade(id)) {
    if (id === 'engine') playerCar.upgrades.engine = 1;
    if (id === 'engine2') playerCar.upgrades.engine = 2;
    if (id === 'tires') playerCar.upgrades.tires = true;
    if (id === 'armor') playerCar.upgrades.armor = true;
    audio.pickup();
    ui.showGarage(progress);
    ui.toast('Upgrade installed: ' + id);
  }
});

// ---- mission marker beacon in the world
function updateMarker() {
  const m = missions.marker;
  if (!m) { if (missionMarkerMesh) missionMarkerMesh.visible = false; return; }
  if (!missionMarkerMesh) {
    missionMarkerMesh = new THREE.Group();
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 60, 12, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xffd27f, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false }));
    beam.position.y = 30; missionMarkerMesh.add(beam);
    const ring = new THREE.Mesh(new THREE.RingGeometry(3, 4.4, 24),
      new THREE.MeshBasicMaterial({ color: 0xffd27f, transparent: true, opacity: 0.8, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.15; missionMarkerMesh.add(ring);
    scene.add(missionMarkerMesh);
  }
  missionMarkerMesh.visible = true;
  missionMarkerMesh.position.set(m.x, 0, m.z);
  missionMarkerMesh.rotation.y += 0.02;
}

// ---- shooting
function tryShoot() {
  const origin = camera.position.clone();
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  const res = combat.shoot(origin, dir, traffic, police, playerCar);
  if (res && res.hit) {
    audio.gunshot();
    if (res.car) police.addHeat(8);
  } else if (res) audio.gunshot();
}

// ---- per-frame update
const clock = new THREE.Clock();
let heliLight = null;
let frame = 0;
let renderMs = 0;
let renderMax = 0;
let lastFrameWall = 0;

function renderTimed() {
  // Time the draw call itself so a slow frame can be blamed on the renderer
  // (software WebGL in headless Chrome) rather than on game logic.
  const t0 = performance.now();
  renderer.render(scene, camera);
  renderMs = performance.now() - t0;
  if (renderMs > renderMax) renderMax = renderMs;
  lastFrameWall = performance.now();
}

let simT = 0;

// One simulation step at a fixed 60 Hz, split out of the rAF loop so the
// headless test hook can advance the game without waiting for frames.
function update(dt, t) {
  playT += dt;
  // weather: blizzard fronts roll in and clear
  weatherT += dt;
  if (!blizzard && weatherT > 75) { blizzard = true; weatherT = 0; ui.toast('Blizzard rolling in — visibility dropping'); }
  if (blizzard && weatherT > 28) { blizzard = false; weatherT = 0; ui.toast('Blizzard clearing'); }
  const wx = { blizzard, wind: blizzard ? 4 : 1 };
  world.update(dt, t, wx);

  // input mapping
  input.up = keys.KeyW || keys.ArrowUp;
  input.down = keys.KeyS || keys.ArrowDown;
  input.left = keys.KeyA || keys.ArrowLeft;
  input.right = keys.KeyD || keys.ArrowRight;
  input.handbrake = keys.Space || keys.ShiftLeft;

  const pPos = onFoot.active ? onFoot.pos : playerCar.pos;

  // on-foot movement / driving
  if (onFoot.active) {
    const mv = new THREE.Vector3(
      (input.right ? 1 : 0) - (input.left ? 1 : 0), 0,
      (input.down ? 1 : 0) - (input.up ? 1 : 0));
    if (mv.lengthSq() > 0) {
      mv.normalize();
      onFoot.heading = Math.atan2(mv.x, mv.z);
      onFoot.pos.addScaledVector(mv, 6.5 * dt);
      collideCircle(onFoot.pos, 0.8, world.colliders);
    }
    onFoot.mesh.position.copy(onFoot.pos);
    onFoot.mesh.rotation.y = onFoot.heading;
    // camera behind the walker
    const back = new THREE.Vector3(Math.sin(onFoot.heading), 0, Math.cos(onFoot.heading)).multiplyScalar(-7);
    camPos.lerp(onFoot.pos.clone().add(back).add(new THREE.Vector3(0, 4.2, 0)), Math.min(1, dt * 6));
    camLook.lerp(onFoot.pos.clone().add(new THREE.Vector3(0, 1.6, 0)), Math.min(1, dt * 8));
  } else {
    playerCar.update(dt, input, world.colliders);
    const back = new THREE.Vector3(Math.sin(playerCar.heading), 0, Math.cos(playerCar.heading)).multiplyScalar(-13.5);
    const want = playerCar.pos.clone().add(back).add(new THREE.Vector3(0, 6.5, 0));
    camPos.lerp(want, Math.min(1, dt * 5));
    camLook.lerp(playerCar.pos.clone().add(new THREE.Vector3(0, 2.4, 0)).addScaledVector(new THREE.Vector3(Math.sin(playerCar.heading), 0, Math.cos(playerCar.heading)), 8), Math.min(1, dt * 7));
    if (playerCar.drifting && Math.random() < 0.3) audio.skid();
  }
  camera.position.copy(camPos);
  camera.lookAt(camLook);

  // interact: enter/exit car, carjack, steal. A mission steal takes priority
  // over exiting the car: the press belongs to the mission, not to the door.
  if (input.interact) {
    const st = missions.active ? missions.active.mission.stages[missions.active.stageIdx] : null;
    const iPos = onFoot.active ? onFoot.pos : playerCar.pos;
    const stealReady = st && st.kind === 'steal' &&
      Math.hypot(iPos.x - st.target[0], iPos.z - st.target[1]) < st.radius;
    if (stealReady) {
      // leave input.interact set: the mission engine consumes it below
    } else {
      input.interact = false;
    if (onFoot.active) {
      const near = traffic.nearest(onFoot.pos, 7);
      const carDist = onFoot.pos.distanceTo(playerCar.pos);
      if (near) {
        // carjack: take the traffic car, park the old one
        const oldPos = playerCar.pos.clone(), oldHeading = playerCar.heading;
        playerCar.pos.copy(near.mesh.position);
        playerCar.heading = near.mesh.rotation.y;
        playerCar.speed = 0; playerCar.vel.set(0, 0, 0);
        traffic.cars.splice(traffic.cars.indexOf(near), 1);
        scene.remove(near.mesh);
        // park the previous car where it was
        const parked = makeCarMesh(0x8a8f98);
        parked.group.position.copy(oldPos); parked.group.rotation.y = oldHeading;
        scene.add(parked.group);
        onFoot.active = false; onFoot.mesh.visible = false;
        police.addHeat(12);
        ui.toast('Carjacked — AFPD notified');
        audio.crash();
      } else if (carDist < 6) {
        onFoot.active = false; onFoot.mesh.visible = false;
        ui.toast('Back in the car');
      }
    } else {
      // exit the car on foot
      onFoot.active = true;
      onFoot.pos.copy(playerCar.pos).add(new THREE.Vector3(3, 0, 0));
      onFoot.mesh.visible = true;
      ui.toast('On foot — E near a car to carjack, click to shoot');
    }
    }
  }

  // shooting (mouse held)
  if (mouseDown) tryShoot();
  combat.update(dt);

  // traffic + police
  traffic.update(dt, pPos, world.colliders);
  const siren = police.update(dt, t, playerCar, world.colliders, () => gameOver('BUSTED', 'AFPD boxed you in. Kai does 5-to-10 in the Mine Town lockup.'));
  if (siren === 'siren') audio.siren();

  // missions + side jobs
  missions.update(dt, liveState());
  updateMarker();

  // health / game over
  if (playerCar.health <= 0 && !onFoot.active) gameOver('WASTED', 'The getaway car is a burning wreck. Kai crawls out — barely.');
  if (playerHealth <= 0 && onFoot.active) gameOver('WASTED', 'Kai is down on the ice.');

  // audio: engine hum by speed
  audio.setEngine(Math.abs(playerCar.speed) / playerCar.topSpeed, !onFoot.active && state === 'playing');

  // HUD
  ui.update({
    wanted: police.wanted, health: onFoot.active ? playerHealth : playerCar.health,
    money: progress.money, rank: progress.rank,
    district: progress.districtName(pPos.x, pPos.z),
    speedKmh: playerCar.speed * 3.6, drifting: playerCar.drifting, inCar: !onFoot.active,
    weaponIndex: combat.weaponIndex, station: audio.stationName(),
    canInteract: onFoot.active,
    districts: DISTRICTS, safehouses: world.markers.safehouses,
    marker: missions.marker, t, dt,
    policeUnits: police.units.map(u => ({ x: u.pos.x, z: u.pos.z })),
    heli: police.heli ? { x: police.heli.group.position.x, z: police.heli.group.position.z } : null,
    playerX: pPos.x, playerZ: pPos.z, heading: onFoot.active ? onFoot.heading : playerCar.heading,
  });
}

function step() {
  requestAnimationFrame(step);
  frame++;
  const dt = Math.min(0.05, clock.getDelta());
  const t = clock.elapsedTime;
  if (state === 'title') {
    // slow orbit around downtown for the title backdrop
    const a = t * 0.05;
    camera.position.set(Math.sin(a) * 120, 55, -20 + Math.cos(a) * 120);
    camera.lookAt(0, 8, -20);
    world.update(dt, t, { blizzard: false, wind: 1 });
    renderTimed();
    return;
  }
  if (state === 'paused' || state === 'garage') { renderTimed(); return; }
  if (state === 'gameover') { renderTimed(); return; }
  update(dt, t);
  renderTimed();
}

// ---- test hooks (headless play-test + screenshot staging; not part of gameplay)
window.__AF = {
  get ready() { return true; },
  get errors() { return errors; },
  state() {
    return {
      state, wanted: police.wanted, health: playerCar.health, money: progress.money,
      speed: playerCar.speed, mission: missions.currentMission ? missions.currentMission.id : null,
      objective: document.getElementById('objective').textContent,
      pos: [Math.round(playerCar.pos.x), Math.round(playerCar.pos.z)],
      inCar: !onFoot.active, blizzard, wrecks: combat.wrecks.length,
      t: Math.round(clock.elapsedTime * 10) / 10, frame, vel: Math.round(playerCar.vel.length() * 10) / 10,
      heading: Math.round(playerCar.heading * 100) / 100, keyW: !!keys.KeyW,
      renderMs: Math.round(renderMs), gapMs: Math.round(performance.now() - lastFrameWall),
      errors: errors.slice(0, 5),
    };
  },
  start() { document.getElementById('play').click(); },
  drive(seconds) {
    keys.KeyW = true;
    return new Promise(res => setTimeout(() => { keys.KeyW = false; res(this.state()); }, seconds * 1000));
  },
  holdDrive(on) { keys.KeyW = !!on; },
  // Advance the simulation by N seconds of game time at fixed 60 Hz steps,
  // without waiting for animation frames (headless Chrome throttles rAF).
  advance(seconds) {
    const n = Math.max(1, Math.round(seconds * 60));
    for (let i = 0; i < n; i++) { simT += 1 / 60; update(1 / 60, simT); }
    renderTimed();
    return this.state();
  },
  shootAt(car) {
    // aim the camera at a traffic car and fire once
    const target = car || traffic.cars[0];
    if (!target) return null;
    const aimAt = target.mesh.position.clone(); aimAt.y = 1;
    const dir = aimAt.sub(camera.position).normalize();
    const res = combat.shoot(camera.position.clone(), dir, traffic, police, playerCar);
    audio.gunshot();
    return res ? { hit: res.hit, dist: Math.round(res.dist || 0) } : null;
  },
  shootNearest() {
    // pull up 25m behind the nearest traffic car, aim from the car, fire once
    let best = null, bestD = 1e9;
    for (const c of traffic.cars) {
      if (c.dead) continue;
      const d = c.mesh.position.distanceTo(playerCar.pos);
      if (d < bestD) { bestD = d; best = c; }
    }
    if (!best) return { error: 'no traffic car' };
    const dir = best.b.clone().sub(best.a).normalize();
    const behind = best.mesh.position.clone().addScaledVector(dir, -25);
    playerCar.pos.copy(behind);
    playerCar.heading = Math.atan2(dir.x, dir.z);
    playerCar.speed = 0; playerCar.vel.set(0, 0, 0);
    const origin = playerCar.pos.clone(); origin.y = 2;
    const aimAt = best.mesh.position.clone(); aimAt.y = 1;
    const aim = aimAt.sub(origin).normalize();
    const res = combat.shoot(origin, aim, traffic, police, playerCar);
    audio.gunshot();
    return { hit: !!res?.hit, dist: res ? Math.round(res.dist) : null, carHealth: Math.round(best.health), wrecks: combat.wrecks.length };
  },
  setWanted(n) { police.heat = n <= 0 ? 0 : [0, 12, 32, 52, 72, 92][n] || 50; },
  teleport(x, z, heading) {
    playerCar.pos.set(x, 0, z); playerCar.heading = heading ?? Math.PI; playerCar.speed = 0; playerCar.vel.set(0, 0, 0);
    camPos.set(x, 8, z + 14);
  },
  setBlizzard(b) { blizzard = b; weatherT = 0; },
  startMission(i) {
    if (i !== undefined) progress.missionIndex = i - 1;
    missions.startMission();
  },
  stage(name) {
    // set up a scene for screenshots
    if (name === 'cover') {
      // long straight northbound road: neon towers flanking, aurora ahead
      this.teleport(64, 60, Math.PI);
      playerCar.health = 100;
      this.setWanted(3);
      police.heliHeight = 14; // low pass: NORTHERN-1 + searchlight stay in frame
      police.spawnHeli();
      if (police.heli) police.heli.angle = -Math.PI / 2; // NORTHERN-1 ahead of the car
      police.spawnRoadblock(playerCar, 38);
      police.spawnSpikes(playerCar, 30);
      playerCar.speed = 18;
      keys.KeyW = true;
    } else if (name === 'race') {
      // ice-road race across the frozen lake, driving north through the first gate
      this.teleport(-60, 230, Math.PI);
      this.setWanted(0);
      missions.startSideJob('race', liveState(), 'lake');
      keys.KeyW = true;
    } else if (name === 'heist') {
      // resort from the southwest with a clear sightline: chalets, slope, gondolas
      this.teleport(120, -140, 2.06);
      this.setWanted(2);
    } else if (name === 'downtown') {
      // on the x=64 road, towers flanking, aurora ahead
      this.teleport(64, -60, Math.PI);
      this.setWanted(0);
    }
  },
};

// autostart / shot staging from URL params
if (params.get('autostart') === '1') {
  setTimeout(() => {
    document.getElementById('play').click();
    const shot = params.get('shot');
    if (shot) setTimeout(() => window.__AF.stage(shot), 800);
  }, 400);
}

step();
