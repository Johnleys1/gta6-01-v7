// Aurora Falls — wanted system: AFPD dispatch, NORTHERN-1 helicopter, roadblocks,
// spike strips, RAM/PIT units. Escalates with the wanted level (1–5).
import * as THREE from 'three';
import { makeCarMesh, collideCircle } from './vehicles.js';

export class Police {
  constructor(scene) {
    this.scene = scene;
    this.wanted = 0;
    this.heat = 0;              // 0..100, drives wanted up/down
    this.units = [];            // pursuit cars
    this.roadblocks = [];
    this.spikes = [];
    this.heli = null;           // {group, light, cone, angle}
    this.heliHeight = 46;
    this.lastSpawn = 0; this.lastHeli = 0; this.lastBlock = 0; this.lastSpike = 0;
    this.sirenT = 0;
  }
  addHeat(n) { this.heat = Math.min(100, this.heat + n); }
  get level() { return this.wanted; }
  update(dt, t, player, colliders, onBusted) {
    // wanted follows heat, decays when the player is out of sight of every unit
    const seen = this.units.some(u => u.mesh.position.distanceTo(player.pos) < 90) || (this.heli && this.heli.group.position.distanceTo(player.pos) < 130);
    this.heat += (seen ? 0 : -4.5) * dt;
    this.heat = Math.max(0, Math.min(100, this.heat));
    const target = this.heat < 8 ? 0 : this.heat < 25 ? 1 : this.heat < 45 ? 2 : this.heat < 65 ? 3 : this.heat < 85 ? 4 : 5;
    if (target !== this.wanted) {
      this.wanted = target;
      if (this.wanted > 0) this.spawnWave(player, colliders);
    }
    // spawn pursuit cars up to wanted count
    const want = Math.min(4, this.wanted);
    this.lastSpawn -= dt;
    if (this.units.length < want && this.lastSpawn <= 0) {
      this.lastSpawn = 3;
      this.spawnUnit(player, colliders);
    }
    // pursuit steering: chase, ram, and PIT at 4–5 stars
    for (const u of this.units) {
      const toP = player.pos.clone().sub(u.pos);
      const dist = toP.length();
      const desired = Math.atan2(toP.x, toP.z);
      let dh = desired - u.heading;
      while (dh > Math.PI) dh -= Math.PI * 2; while (dh < -Math.PI) dh += Math.PI * 2;
      u.heading += Math.max(-2.4 * dt, Math.min(2.4 * dt, dh));
      const spd = this.wanted >= 4 ? 30 : 21;
      u.speed += ((dist > 8 ? spd : spd * 0.4) - u.speed) * Math.min(1, dt * 1.5);
      // PIT: at 4+ stars, swing beside the player and shove
      if (this.wanted >= 4 && dist < 14 && dist > 5) {
        const side = new THREE.Vector3(Math.cos(u.heading), 0, -Math.sin(u.heading));
        u.pos.addScaledVector(side, 6 * dt);
      }
      u.pos.addScaledVector(new THREE.Vector3(Math.sin(u.heading), 0, Math.cos(u.heading)), u.speed * dt);
      if (collideCircle(u.pos, 2.2, colliders)) u.speed *= 0.5;
      u.mesh.position.copy(u.pos);
      u.mesh.rotation.y = u.heading;
      // ram the player (per-unit cooldown so a chase stays survivable);
      // the ram knocks the unit back too, so it must re-approach to ram again
      u.ramT = (u.ramT || 0) - dt;
      if (dist < 4.2 && u.ramT <= 0) {
        u.ramT = 1.2;
        player.vel.addScaledVector(toP.normalize(), 6);
        player.speed *= 0.92;
        player.health -= 3;
        u.pos.addScaledVector(toP.normalize(), -4);
        u.speed *= 0.5;
      }
    }
    // helicopter NORTHERN-1 at 3+ stars
    if (this.wanted >= 3 && !this.heli) this.spawnHeli();
    if (this.wanted < 3 && this.heli) {
      this.scene.remove(this.heli.group); this.heli = null;
    }
    if (this.heli) {
      const h = this.heli;
      h.angle += dt * 0.25;
      const r = 26;
      h.group.position.set(player.pos.x + Math.cos(h.angle) * r, this.heliHeight + Math.sin(t * 0.7) * 3, player.pos.z + Math.sin(h.angle) * r);
      h.group.rotation.y = Math.atan2(player.pos.x - h.group.position.x, player.pos.z - h.group.position.z);
      h.rotor.rotation.y += dt * 22;
      // searchlight tracks the player
      h.light.position.copy(h.group.position);
      h.light.target.position.copy(player.pos);
      h.light.target.updateMatrixWorld();
      h.cone.position.copy(h.group.position).lerp(player.pos, 0.5);
      h.cone.lookAt(player.pos);
      h.cone.material.opacity = 0.10 + 0.05 * Math.sin(t * 3);
    }
    // roadblocks at 3+ stars, spike strips at 4+ stars — placed ahead of the player
    this.lastBlock -= dt; this.lastSpike -= dt;
    if (this.wanted >= 3 && this.lastBlock <= 0 && this.roadblocks.length < 2) {
      this.lastBlock = 14;
      this.spawnRoadblock(player);
    }
    if (this.wanted >= 4 && this.lastSpike <= 0 && this.spikes.length < 2) {
      this.lastSpike = 18;
      this.spawnSpikes(player);
    }
    // spike strips pop tires
    for (const s of this.spikes) {
      if (s.mesh.position.distanceTo(player.pos) < 3.4 && !player.tirePopped) {
        player.tirePopped = true;
        player.health -= 4;
        s.used = true;
      }
    }
    // roadblock collision: hard stop + damage (per-block cooldown, no re-hit loop)
    for (const b of this.roadblocks) {
      b.hitT = (b.hitT || 0) - dt;
      if (b.mesh.position.distanceTo(player.pos) < 4 && Math.abs(player.speed) > 6 && b.hitT <= 0) {
        b.hitT = 1.5;
        player.speed *= -0.5; player.health -= 8;
        player.vel.multiplyScalar(-0.4);
        player.pos.addScaledVector(new THREE.Vector3(Math.sin(player.heading), 0, Math.cos(player.heading)), -3);
      }
    }
    // busted: surrounded at low speed
    if (this.wanted >= 2 && Math.abs(player.speed) < 1.5 && this.units.length >= 2) {
      const close = this.units.filter(u => u.mesh.position.distanceTo(player.pos) < 7).length;
      if (close >= 2) onBusted && onBusted();
    }
    // siren blips
    this.sirenT -= dt;
    if (this.wanted > 0 && this.sirenT <= 0) { this.sirenT = 2.2; return 'siren'; }
    return null;
  }
  spawnUnit(player, colliders) {
    const { group } = makeCarMesh(0x1a2a44, { emissive: 0x2233ff });
    // light bar
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.18, 0.4),
      new THREE.MeshBasicMaterial({ color: 0xff2244 }));
    bar.position.set(0, 1.55, -0.2); group.add(bar);
    this.scene.add(group);
    const a = Math.random() * Math.PI * 2;
    const pos = new THREE.Vector3(player.pos.x + Math.cos(a) * 70, 0, player.pos.z + Math.sin(a) * 70);
    this.units.push({ mesh: group, pos, heading: 0, speed: 0 });
  }
  spawnWave(player) { /* fresh wave replaces stale units */ }
  spawnHeli() {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(4.4, 1.6, 9),
      new THREE.MeshLambertMaterial({ color: 0x1a2a44, emissive: 0x0a1444, emissiveIntensity: 0.6 }));
    body.position.y = 0; g.add(body);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 6), body.material);
    tail.position.set(0, 0.3, -6.5); g.add(tail);
    const rotor = new THREE.Group();
    const blade = new THREE.Mesh(new THREE.BoxGeometry(11, 0.12, 0.5),
      new THREE.MeshLambertMaterial({ color: 0x111111 }));
    rotor.add(blade); rotor.position.y = 1.2; g.add(rotor);
    const label = new THREE.Mesh(new THREE.BoxGeometry(4.5, 0.7, 0.1),
      new THREE.MeshBasicMaterial({ color: 0xffc46b }));
    label.position.set(0, 0.2, 4.55); g.add(label);
    const light = new THREE.SpotLight(0xfff6d8, 900, 160, 0.32, 0.45, 1.2);
    this.scene.add(light); this.scene.add(light.target);
    const cone = new THREE.Mesh(new THREE.ConeGeometry(9, 48, 16, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xfff6d8, transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false }));
    cone.rotation.x = Math.PI; // apex up toward the heli
    this.scene.add(cone);
    this.scene.add(g);
    this.heli = { group: g, light, cone, rotor, angle: Math.random() * Math.PI * 2 };
  }
  spawnRoadblock(player, dist = 55) {
    const g = new THREE.Group();
    const barMat = new THREE.MeshLambertMaterial({ color: 0xff3b30 });
    for (let i = -1; i <= 1; i++) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1, 0.6), barMat);
      b.position.set(i * 2.4, 0.5, 0); g.add(b);
    }
    const car = makeCarMesh(0x1a2a44, { emissive: 0x2233ff });
    car.group.position.set(-5, 0, 0); g.add(car.group);
    const car2 = makeCarMesh(0x1a2a44, { emissive: 0x2233ff });
    car2.group.position.set(5, 0, 0); g.add(car2.group);
    const ahead = new THREE.Vector3(Math.sin(player.heading), 0, Math.cos(player.heading));
    g.position.copy(player.pos).addScaledVector(ahead, dist);
    g.rotation.y = player.heading + Math.PI / 2;
    this.scene.add(g);
    this.roadblocks.push({ mesh: g });
  }
  spawnSpikes(player, dist = 48) {
    const g = new THREE.Group();
    const base = new THREE.Mesh(
      new THREE.BoxGeometry(8.4, 0.08, 1.1),
      new THREE.MeshLambertMaterial({ color: 0xffc300 })
    );
    base.position.y = 0.04; g.add(base);
    const mat = new THREE.MeshLambertMaterial({ color: 0x222222 });
    for (let i = 0; i < 9; i++) {
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.7, 5), mat);
      spike.position.set(-3.6 + i * 0.9, 0.35, 0); g.add(spike);
    }
    const ahead = new THREE.Vector3(Math.sin(player.heading), 0, Math.cos(player.heading));
    g.position.copy(player.pos).addScaledVector(ahead, dist);
    g.rotation.y = player.heading + Math.PI / 2;
    this.scene.add(g);
    this.spikes.push({ mesh: g, used: false });
  }
  clear() {
    for (const u of this.units) this.scene.remove(u.mesh);
    for (const b of this.roadblocks) this.scene.remove(b.mesh);
    for (const s of this.spikes) this.scene.remove(s.mesh);
    if (this.heli) { this.scene.remove(this.heli.group); this.scene.remove(this.heli.light); this.scene.remove(this.heli.cone); }
    this.units = []; this.roadblocks = []; this.spikes = []; this.heli = null;
    this.wanted = 0; this.heat = 0;
  }
}
