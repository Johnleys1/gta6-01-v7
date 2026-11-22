// Aurora Falls — missions, side jobs, progression, garage, saves.
import { MISSIONS, RACES, UPGRADES, SAVE_KEY, DISTRICTS } from './config.js';

export class Progress {
  constructor() {
    this.money = 400;
    this.respect = 0;            // 0..100
    this.standing = {};          // district id -> 0..100
    for (const d of DISTRICTS) this.standing[d.id] = 10;
    this.missionIndex = 0;       // next mission to play
    this.completed = [];
    this.owned = [];             // upgrade ids
    this.jobsDone = 0;
    this.load();
  }
  get rank() {
    if (this.respect >= 80) return 'Aurora Legend';
    if (this.respect >= 55) return 'Mountain King';
    if (this.respect >= 35) return 'Ice-Road Pro';
    if (this.respect >= 15) return 'Wheelman';
    return 'Rookie';
  }
  districtName(x, z) {
    let best = null, bestD = 1e9;
    for (const d of DISTRICTS) {
      const dd = Math.hypot(x - d.cx, z - d.cz) - d.r;
      if (dd < bestD) { bestD = dd; best = d; }
    }
    return best ? best.name : 'Aurora Falls';
  }
  awardMoney(n) { this.money += n; this.save(); }
  awardRespect(n) { this.respect = Math.min(100, this.respect + n); this.save(); }
  awardStanding(map) {
    for (const [k, v] of Object.entries(map)) this.standing[k] = Math.min(100, (this.standing[k] || 0) + v);
    this.save();
  }
  buyUpgrade(id) {
    const u = UPGRADES.find(x => x.id === id);
    if (!u || this.owned.includes(id)) return false;
    if (u.needs && !this.owned.includes(u.needs)) return false;
    if (this.money < u.cost) return false;
    this.money -= u.cost; this.owned.push(id); this.save();
    return true;
  }
  save() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        money: this.money, respect: this.respect, standing: this.standing,
        missionIndex: this.missionIndex, completed: this.completed, owned: this.owned, jobsDone: this.jobsDone,
      }));
    } catch { /* storage unavailable (file://, private mode) — play on without saves */ }
  }
  load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return;
      const s = JSON.parse(raw);
      this.money = s.money ?? 400; this.respect = s.respect ?? 0;
      this.standing = { ...this.standing, ...(s.standing || {}) };
      this.missionIndex = s.missionIndex ?? 0; this.completed = s.completed || [];
      this.owned = s.owned || []; this.jobsDone = s.jobsDone || 0;
    } catch { /* corrupted save — start fresh */ }
  }
}

export class MissionEngine {
  constructor(progress, events) {
    this.p = progress;
    this.events = events; // {onObjective(text), onComplete(mission), onFail(reason), onToast(text)}
    this.active = null;   // {mission, stageIdx, t, raceIdx, collected}
    this.marker = null;   // {x, z, radius} current target for HUD/minimap
    this.sideJob = null;  // {kind, checkpoints, idx, reward}
  }
  get currentMission() { return MISSIONS[this.p.missionIndex] || null; }
  startMission() {
    const m = this.currentMission;
    if (!m) { this.events.onToast('All 8 missions complete — you own Aurora Falls.'); return false; }
    this.active = { mission: m, stageIdx: 0, t: 0, raceIdx: 0 };
    this.setStageMarker();
    this.events.onObjective(`Mission ${m.id}: ${m.name} — ${m.stages[0].text}`);
    this.events.onToast(`${m.name}: ${m.brief}`);
    return true;
  }
  setStageMarker() {
    if (!this.active) { this.marker = null; return; }
    const st = this.active.mission.stages[this.active.stageIdx];
    if (!st) { this.marker = null; return; }
    if (st.kind === 'race') {
      const cp = st.checkpoints[this.active.raceIdx];
      this.marker = cp ? { x: cp[0], z: cp[1], radius: st.radius } : null;
    } else if (st.target) {
      this.marker = { x: st.target[0], z: st.target[1], radius: st.radius };
    } else this.marker = null;
  }
  // Called every frame with live game state. Returns event strings for the main loop.
  update(dt, g) {
    const out = [];
    if (this.sideJob) this.updateSideJob(dt, g, out);
    if (!this.active) return out;
    const m = this.active.mission;
    const st = m.stages[this.active.stageIdx];
    if (!st) return out;
    const px = g.playerPos.x, pz = g.playerPos.z;
    if (st.kind === 'driveTo' || st.kind === 'collect') {
      const d = Math.hypot(px - st.target[0], pz - st.target[1]);
      if (d < st.radius) {
        if (st.kind === 'collect') this.events.onToast('Picked up.');
        this.advance(g);
      }
    } else if (st.kind === 'steal') {
      const d = Math.hypot(px - st.target[0], pz - st.target[1]);
      if (d < st.radius && g.interactPressed) {
        g.consumeInteract && g.consumeInteract();
        this.events.onToast('Snowplow stolen — AFPD is on you!');
        g.police.addHeat(30);
        this.advance(g);
      }
    } else if (st.kind === 'survive') {
      if (g.police.level < st.wanted) g.police.addHeat(12 * dt);
      this.active.t += dt;
      const left = Math.max(0, Math.ceil(st.seconds - this.active.t));
      this.events.onObjective(`Mission ${m.id}: ${m.name} — survive ${left}s at ${st.wanted} stars`);
      if (this.active.t >= st.seconds) this.advance(g);
      if (g.playerHealth <= 0) this.fail(g, 'Wasted in the chase.');
    } else if (st.kind === 'race') {
      const cp = st.checkpoints[this.active.raceIdx];
      if (cp) {
        const d = Math.hypot(px - cp[0], pz - cp[1]);
        if (d < st.radius) {
          this.active.raceIdx++;
          this.events.onToast(`Gate ${this.active.raceIdx}/${st.checkpoints.length}`);
          this.setStageMarker();
          if (this.active.raceIdx >= st.checkpoints.length) this.advance(g);
        }
      }
    }
    return out;
  }
  advance(g) {
    const m = this.active.mission;
    this.active.stageIdx++;
    this.active.t = 0;
    if (this.active.stageIdx >= m.stages.length) {
      this.complete(g);
    } else {
      this.setStageMarker();
      const st = m.stages[this.active.stageIdx];
      this.events.onObjective(`Mission ${m.id}: ${m.name} — ${st.text}`);
    }
  }
  complete(g) {
    const m = this.active.mission;
    this.p.completed.push(m.id);
    this.p.missionIndex++;
    this.p.awardMoney(m.reward);
    this.p.awardRespect(12);
    this.p.awardStanding(m.standing);
    this.active = null; this.marker = null;
    this.events.onComplete(m);
    this.events.onObjective(`Mission complete: ${m.name} — $${m.reward}. Next: ${this.currentMission ? this.currentMission.name : 'all done'}`);
  }
  fail(g, reason) {
    this.active = null; this.marker = null;
    this.events.onFail(reason);
  }
  startSideJob(kind, g, raceId) {
    if (this.sideJob) return false;
    if (kind === 'taxi') {
      const px = g.playerPos.x + (Math.random() - 0.5) * 120;
      const pz = g.playerPos.z + (Math.random() - 0.5) * 120;
      this.sideJob = { kind: 'taxi', phase: 'pickup', checkpoints: [[px, pz], [px + 90, pz - 60]], idx: 0, reward: 350 };
      this.events.onObjective('Taxi job — pick up the fare (drive to the marker)');
    } else if (kind === 'delivery') {
      this.sideJob = { kind: 'delivery', checkpoints: [[-120, 120], [160, -40], [0, 200]], idx: 0, reward: 500 };
      this.events.onObjective('Delivery job — drop the package at 3 stops');
    } else if (kind === 'race') {
      const r = (raceId && RACES.find(x => x.id === raceId)) || RACES[Math.floor(Math.random() * RACES.length)];
      this.sideJob = { kind: 'race', checkpoints: r.checkpoints, idx: 0, reward: r.reward, name: r.name };
      this.events.onObjective(`${r.name} — hit every gate`);
    }
    return true;
  }
  updateSideJob(dt, g, out) {
    const j = this.sideJob;
    const cp = j.checkpoints[j.idx];
    if (!cp) return;
    const d = Math.hypot(g.playerPos.x - cp[0], g.playerPos.z - cp[1]);
    this.marker = { x: cp[0], z: cp[1], radius: 14 };
    if (d < 14) {
      j.idx++;
      if (j.kind === 'taxi' && j.phase === 'pickup') { j.phase = 'drop'; this.events.onToast('Fare picked up — drive to the drop-off.'); }
      else if (j.idx >= j.checkpoints.length) {
        this.p.awardMoney(j.reward); this.p.jobsDone++;
        this.events.onToast(`Job done — $${j.reward}.`);
        this.sideJob = null; this.marker = this.active ? this.marker : null;
        if (this.active) this.setStageMarker(); else this.marker = null;
      }
    }
  }
}
