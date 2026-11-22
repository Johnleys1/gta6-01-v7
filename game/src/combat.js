// Aurora Falls — combat: 4-weapon wheel, shooting, exploding cars, persistent burning wrecks.
import * as THREE from 'three';
import { WEAPONS } from './config.js';

export class Combat {
  constructor(scene) {
    this.scene = scene;
    this.weaponIndex = 0;
    this.cooldown = 0;
    this.tracers = [];
    this.wrecks = [];   // {mesh, fireLight, smokeT, pos}
    this.explosions = [];
    this.raycaster = new THREE.Raycaster();
  }
  get weapon() { return WEAPONS[this.weaponIndex]; }
  select(i) { this.weaponIndex = Math.max(0, Math.min(WEAPONS.length - 1, i)); }
  cycle() { this.weaponIndex = (this.weaponIndex + 1) % WEAPONS.length; }
  update(dt) {
    this.cooldown = Math.max(0, this.cooldown - dt);
    // fade tracers
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const tr = this.tracers[i];
      tr.life -= dt * 4;
      tr.line.material.opacity = Math.max(0, tr.life);
      if (tr.life <= 0) { this.scene.remove(tr.line); this.tracers.splice(i, 1); }
    }
    // explosions expand then fade
    for (let i = this.explosions.length - 1; i >= 0; i--) {
      const e = this.explosions[i];
      e.t += dt;
      const k = e.t / 0.7;
      e.mesh.scale.setScalar(1 + k * 9);
      e.mesh.material.opacity = Math.max(0, 0.85 - k);
      e.light.intensity = Math.max(0, 900 * (1 - k));
      if (k >= 1) { this.scene.remove(e.mesh); this.scene.remove(e.light); this.explosions.splice(i, 1); }
    }
    // burning wrecks smoke + flicker
    for (const w of this.wrecks) {
      w.smokeT += dt;
      w.fireLight.intensity = 120 + Math.sin(w.smokeT * 13) * 50 + Math.random() * 30;
      w.mesh.rotation.y += 0; // wrecks stay put
    }
  }
  // Shoot from `origin` along `dir`. Returns {hit, car, dist} — damages cars, explodes them.
  shoot(origin, dir, traffic, police, player) {
    if (this.cooldown > 0) return null;
    const w = this.weapon;
    this.cooldown = w.rate;
    const pellets = w.pellets || 1;
    let best = null;
    for (let p = 0; p < pellets; p++) {
      const d = dir.clone();
      d.x += (Math.random() - 0.5) * w.spread * 2;
      d.y += (Math.random() - 0.5) * w.spread * 2;
      d.z += (Math.random() - 0.5) * w.spread * 2;
      d.normalize();
      this.raycaster.set(origin, d);
      this.raycaster.far = 90;
      const targets = [];
      for (const c of traffic.cars) if (!c.dead) targets.push(c.mesh);
      for (const u of police.units) targets.push(u.mesh);
      const hits = this.raycaster.intersectObjects(targets, true);
      if (hits.length) {
        const h = hits[0];
        let obj = h.object;
        while (obj.parent && obj.parent !== this.scene) obj = obj.parent;
        const car = traffic.cars.find(c => c.mesh === obj) || police.units.find(u => u.mesh === obj);
        const res = { hit: true, dist: h.distance, point: h.point, car: car || null };
        if (car) {
          car.health -= w.damage;
          if (car.health <= 0) this.explodeCar(car, traffic, police, player);
          else if (car.health < 40 && !car.burning) { car.burning = true; }
        }
        if (!best || h.distance < best.dist) best = res;
        this.addTracer(origin, h.point);
      } else {
        this.addTracer(origin, origin.clone().addScaledVector(d, 90));
      }
    }
    return best;
  }
  addTracer(a, b) {
    const geo = new THREE.BufferGeometry().setFromPoints([a, b]);
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.9 }));
    this.scene.add(line);
    this.tracers.push({ line, life: 1 });
  }
  explodeCar(car, traffic, police, player) {
    const pos = car.mesh.position.clone();
    // explosion flash
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 10),
      new THREE.MeshBasicMaterial({ color: 0xffa63d, transparent: true, opacity: 0.85 }));
    mesh.position.copy(pos).y = 1.2;
    this.scene.add(mesh);
    const light = new THREE.PointLight(0xff8c1a, 900, 60, 1.5);
    light.position.copy(pos).y = 2; this.scene.add(light);
    this.explosions.push({ mesh, light, t: 0 });
    // mark the car dead and turn it into a persistent burning wreck
    car.dead = true; car.burning = false;
    car.mesh.traverse(o => {
      if (o.isMesh) {
        o.material = new THREE.MeshLambertMaterial({ color: 0x14100c });
      }
    });
    const fireLight = new THREE.PointLight(0xff6a1a, 150, 22, 1.6);
    fireLight.position.copy(pos).y = 2.5; this.scene.add(fireLight);
    this.wrecks.push({ mesh: car.mesh, fireLight, smokeT: 0, pos });
    // splash damage: nearby cars and the player take damage
    const dmg = (other, amount) => {
      if (!other || other === car) return;
      other.health = (other.health ?? 100) - amount;
      if (other.health <= 0 && other.mesh && !other.dead && other !== player) this.explodeCar(other, traffic, police, player);
    };
    for (const c of traffic.cars) if (c.mesh.position.distanceTo(pos) < 9) dmg(c, 55);
    for (const u of police.units) if (u.mesh.position.distanceTo(pos) < 9) dmg(u, 55);
    if (player && player.pos.distanceTo(pos) < 9) player.health -= 25;
  }
}
