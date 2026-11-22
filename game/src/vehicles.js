// Aurora Falls — driving: ice/snow arcade physics, traffic, carjacking.
import * as THREE from 'three';

export function makeCarMesh(color, opts = {}) {
  const g = new THREE.Group();
  const paint = new THREE.MeshLambertMaterial({ color, emissive: opts.emissive || 0x000000, emissiveIntensity: 0.4 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2, 0.62, 4.4), paint);
  body.position.y = 0.62; g.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.55, 2.2),
    new THREE.MeshLambertMaterial({ color: 0x10151f }));
  cabin.position.set(0, 1.18, -0.25); g.add(cabin);
  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.3, 10);
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x0c0e12 });
  const wheels = [];
  for (const [x, z] of [[-0.95, 1.45], [0.95, 1.45], [-0.95, -1.45], [0.95, -1.45]]) {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.rotation.z = Math.PI / 2; w.position.set(x, 0.36, z); g.add(w); wheels.push(w);
  }
  // headlights: emissive lenses + one real spotlight for the player car only
  const lensMat = new THREE.MeshBasicMaterial({ color: 0xfff2c8 });
  for (const x of [-0.6, 0.6]) {
    const lens = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.16, 0.08), lensMat);
    lens.position.set(x, 0.72, 2.22); g.add(lens);
  }
  const tailMat = new THREE.MeshBasicMaterial({ color: 0xff2a2a });
  for (const x of [-0.6, 0.6]) {
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.14, 0.08), tailMat);
    tail.position.set(x, 0.72, -2.22); g.add(tail);
  }
  let headlight = null;
  if (opts.headlight) {
    headlight = new THREE.SpotLight(0xffe9b0, 130, 55, 0.5, 0.5, 1.4);
    headlight.position.set(0, 1, 2.2);
    const tgt = new THREE.Object3D(); tgt.position.set(0, -0.5, 24);
    g.add(tgt); headlight.target = tgt; g.add(headlight);
  }
  g.userData.wheels = wheels;
  return { group: g, headlight };
}

// Simple circle-vs-AABB collision resolve. Returns true if a hit happened.
export function collideCircle(pos, radius, colliders) {
  let hit = false;
  for (const c of colliders) {
    const cx = Math.max(c.x - c.hx, Math.min(pos.x, c.x + c.hx));
    const cz = Math.max(c.z - c.hz, Math.min(pos.z, c.z + c.hz));
    const dx = pos.x - cx, dz = pos.z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 < radius * radius) {
      const d = Math.sqrt(d2) || 0.001;
      const push = (radius - d) / d;
      pos.x += dx * push; pos.z += dz * push;
      hit = true;
    }
  }
  // world bounds
  const B = 315;
  if (pos.x > B) pos.x = B; if (pos.x < -B) pos.x = -B;
  if (pos.z > B) pos.z = B; if (pos.z < -B) pos.z = -B;
  return hit;
}

export class PlayerCar {
  constructor(scene, color = 0xff5a1a) {
    const { group, headlight } = makeCarMesh(color, { headlight: true });
    this.mesh = group; this.headlight = headlight;
    scene.add(group);
    this.pos = new THREE.Vector3(64, 0, 110);
    this.heading = Math.PI;      // facing north (-z is north on the map)
    this.speed = 0;              // signed forward speed (m/s)
    this.steer = 0;
    this.health = 100;
    this.tirePopped = false;     // spike strip damage
    this.upgrades = { engine: 0, tires: false, armor: false, paint: false };
    this.vel = new THREE.Vector3(); // world velocity for slide feel
    this.drifting = false;
  }
  get topSpeed() { return 34 + this.upgrades.engine * 6; }
  get accel() { return 15 + this.upgrades.engine * 3; }
  get grip() { return this.upgrades.tires ? 0.86 : 0.72; }
  update(dt, input, colliders) {
    const forward = new THREE.Vector3(Math.sin(this.heading), 0, Math.cos(this.heading));
    const target = (input.up ? this.accel : 0) - (input.down ? 12 : 0);
    this.speed += target * dt;
    // drag + rolling resistance
    this.speed -= this.speed * 0.55 * dt;
    if (!input.up && !input.down) this.speed -= this.speed * 1.4 * dt;
    this.speed = Math.max(-12, Math.min(this.topSpeed, this.speed));
    // steering: less bite at speed, more slide on ice
    const steerTarget = (input.left ? 1 : 0) - (input.right ? 1 : 0);
    this.steer += (steerTarget - this.steer) * Math.min(1, dt * 9);
    const gripNow = this.grip * (this.tirePopped ? 0.55 : 1);
    const turnRate = this.steer * 1.7 * Math.min(1, Math.abs(this.speed) / 8) * (this.speed >= 0 ? 1 : -1);
    this.heading += turnRate * dt * (input.handbrake ? 1.6 : 1);
    // velocity: blend forward motion with slide (ice feel)
    const fwd = new THREE.Vector3(Math.sin(this.heading), 0, Math.cos(this.heading));
    const desired = fwd.clone().multiplyScalar(this.speed);
    const blend = 1 - Math.pow(1 - gripNow, dt * 60 * 0.12);
    this.vel.lerp(desired, Math.min(1, gripNow * dt * 8 + 0.02));
    if (input.handbrake && Math.abs(this.speed) > 6) {
      this.vel.multiplyScalar(1 - 0.35 * dt);
      this.drifting = true;
    } else this.drifting = false;
    this.pos.addScaledVector(this.vel, dt);
    if (collideCircle(this.pos, 2.2, colliders)) {
      // scrape: lose some speed, small damage on hard hits (cooldown: no
      // grinding a wall down to zero health in a second)
      const impact = this.vel.length();
      this.vel.multiplyScalar(0.55);
      this.speed *= 0.6;
      this.scrapeT = (this.scrapeT || 0) - dt;
      if (impact > 16 && this.scrapeT <= 0) {
        this.scrapeT = 0.5;
        this.health -= Math.min(6, (impact - 16) * 0.9);
      }
    }
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = this.heading;
    // lean + wheel spin
    this.mesh.rotation.z = -this.steer * 0.05 * Math.min(1, Math.abs(this.speed) / 20);
    const spin = this.speed * dt * 2.4;
    for (const w of this.mesh.userData.wheels) w.rotation.x += spin;
    return this.speed;
  }
  reset(x, z, heading) {
    this.pos.set(x, 0, z); this.heading = heading; this.speed = 0; this.vel.set(0, 0, 0);
    this.health = this.upgrades.armor ? 140 : 100; this.tirePopped = false;
  }
}

export class Traffic {
  constructor(scene) {
    this.scene = scene;
    this.cars = [];
    const colors = [0x3a6fd9, 0xd9b23a, 0x54c96b, 0xd94f4f, 0x9a6fd0, 0xe8e8e8, 0x222a38];
    // drive the downtown grid: loops around blocks
    const loops = [];
    for (let i = -2; i <= 2; i++) {
      loops.push({ pts: [[i * 64 - 32, -160], [i * 64 - 32, 160]], speed: 9 });
      loops.push({ pts: [[-160, i * 64 - 52], [160, i * 64 - 52]], speed: 9 });
    }
    for (let i = 0; i < 14; i++) {
      const loop = loops[i % loops.length];
      const { group } = makeCarMesh(colors[i % colors.length]);
      scene.add(group);
      const [a, b] = loop.pts;
      const t0 = Math.random();
      this.cars.push({
        mesh: group, loop, t: t0, speed: loop.speed * (0.8 + Math.random() * 0.4),
        a: new THREE.Vector3(a[0], 0, a[1]), b: new THREE.Vector3(b[0], 0, b[1]),
        dir: Math.random() < 0.5 ? 1 : -1, health: 100, burning: false, dead: false, fireT: 0,
      });
    }
  }
  update(dt, playerPos, colliders) {
    for (const c of this.cars) {
      if (c.dead) continue;
      c.t += (c.dir * c.speed * dt) / c.a.distanceTo(c.b);
      if (c.t > 1) { c.t = 0; const tmp = c.a; c.a = c.b; c.b = tmp; }
      if (c.t < 0) { c.t = 1; const tmp = c.a; c.a = c.b; c.b = tmp; }
      const p = c.a.clone().lerp(c.b, c.t);
      c.mesh.position.copy(p);
      const d = c.b.clone().sub(c.a).normalize();
      c.mesh.rotation.y = Math.atan2(d.x, d.z);
    }
  }
  nearest(pos, maxDist) {
    let best = null, bestD = maxDist;
    for (const c of this.cars) {
      if (c.dead) continue;
      const d = c.mesh.position.distanceTo(pos);
      if (d < bestD) { bestD = d; best = c; }
    }
    return best;
  }
  damage(car, amount) {
    car.health -= amount;
    return car.health;
  }
}
