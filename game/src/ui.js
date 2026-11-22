// Aurora Falls — HUD, minimap, menus, weapon wheel, garage shop (DOM + 2D canvas).
import { WEAPONS, UPGRADES, CREW, MISSIONS } from './config.js';

export class UI {
  constructor(root) {
    this.root = root;
    root.innerHTML = `
    <div id="hud" class="hidden">
      <div id="top-left">
        <div id="stars"></div>
        <div id="healthbar"><div id="healthfill"></div></div>
        <div id="money">$0</div>
        <div id="rank"></div>
      </div>
      <div id="objective"></div>
      <div id="top-right">
        <canvas id="minimap" width="180" height="180"></canvas>
        <div id="district"></div>
      </div>
      <div id="bottom-right"><div id="speed">0</div><div id="speedunit">km/h</div><div id="gear">DRIVE</div></div>
      <div id="bottom-left"><div id="weapon"></div><div id="radio"></div></div>
      <div id="crosshair">+</div>
      <div id="toast"></div>
      <div id="wheel" class="hidden"></div>
      <div id="interact" class="hidden">E — interact</div>
    </div>
    <div id="title" class="screen">
      <h1>AURORA FALLS</h1>
      <p class="sub">A snowbound open-world crime story — Kai vs THE WARDEN</p>
      <p class="crew">Crew: <b>MAYA</b> driver · <b>DARIO</b> hacker · <b>JUNE</b> lookout</p>
      <p class="missions">8 missions · 5 districts · AFPD + NORTHERN-1 · garage · radio</p>
      <button id="play">▶ PLAY</button>
      <p class="controls">WASD drive · Shift drift · E enter / steal · Mouse click shoot · 1–4 weapons · Q wheel · R radio · M mute · G garage · Esc pause</p>
      <p class="hint">Best played at night, under the aurora.</p>
    </div>
    <div id="pause" class="screen hidden">
      <h1>PAUSED</h1>
      <p id="pause-stats"></p>
      <button id="resume">RESUME</button>
      <button id="restart">RESTART RUN</button>
    </div>
    <div id="garage" class="screen hidden">
      <h1>AURORA GARAGE</h1>
      <p id="garage-money"></p>
      <div id="upgrades"></div>
      <button id="garage-close">CLOSE (G)</button>
    </div>
    <div id="gameover" class="screen hidden">
      <h1 id="go-title">BUSTED</h1>
      <p id="go-text"></p>
      <button id="go-retry">TRY AGAIN</button>
    </div>`;
    this.el = {};
    for (const id of ['hud', 'stars', 'healthfill', 'money', 'rank', 'objective', 'minimap', 'district', 'speed', 'gear', 'weapon', 'radio', 'toast', 'wheel', 'interact', 'title', 'pause', 'garage', 'gameover', 'go-title', 'go-text', 'pause-stats', 'garage-money', 'upgrades']) {
      this.el[id] = root.querySelector('#' + id);
    }
    this.toastT = 0;
    this.mm = this.el.minimap.getContext('2d');
  }
  showHud() { this.el.hud.classList.remove('hidden'); this.el.title.classList.add('hidden'); }
  showTitle() { this.el.title.classList.remove('hidden'); this.el.hud.classList.add('hidden'); }
  showPause(stats) {
    this.el['pause-stats'].textContent = stats;
    this.el.pause.classList.remove('hidden');
  }
  hidePause() { this.el.pause.classList.add('hidden'); }
  showGarage(progress) {
    this.el['garage-money'].textContent = `Cash: $${progress.money} · Respect: ${progress.respect} (${progress.rank})`;
    this.el.upgrades.innerHTML = UPGRADES.map(u => {
      const owned = progress.owned.includes(u.id);
      const locked = u.needs && !progress.owned.includes(u.needs);
      return `<div class="upg"><b>${u.name}</b> — ${u.desc} — ${owned ? 'OWNED' : locked ? 'NEEDS ' + u.needs.toUpperCase() : '$' + u.cost}
        <button data-upg="${u.id}" ${owned || locked || progress.money < u.cost ? 'disabled' : ''}>BUY</button></div>`;
    }).join('');
    this.el.garage.classList.remove('hidden');
  }
  hideGarage() { this.el.garage.classList.add('hidden'); }
  showGameOver(title, text) {
    this.el['go-title'].textContent = title;
    this.el['go-text'].textContent = text;
    this.el.gameover.classList.remove('hidden');
  }
  hideGameOver() { this.el.gameover.classList.add('hidden'); }
  toast(text, secs = 3) {
    this.el.toast.textContent = text;
    this.toastT = secs;
  }
  setObjective(text) { this.el.objective.textContent = text; }
  showWheel(weaponIndex) {
    this.el.wheel.classList.remove('hidden');
    this.el.wheel.innerHTML = WEAPONS.map((w, i) =>
      `<div class="wslot ${i === weaponIndex ? 'sel' : ''}"><b>${i + 1}</b> ${w.name}</div>`).join('');
  }
  hideWheel() { this.el.wheel.classList.add('hidden'); }
  update(g) {
    // stars
    let stars = '';
    for (let i = 0; i < 5; i++) stars += i < g.wanted ? '★' : '☆';
    this.el.stars.textContent = stars;
    this.el.stars.style.color = g.wanted >= 3 ? '#ff4444' : '#ffd27f';
    this.el.healthfill.style.width = Math.max(0, g.health) + '%';
    this.el.healthfill.style.background = g.health > 50 ? '#54c96b' : g.health > 25 ? '#e0a83c' : '#ff4444';
    this.el.money.textContent = '$' + g.money;
    this.el.rank.textContent = g.rank + ' · ' + g.district;
    this.el.district.textContent = g.district;
    this.el.speed.textContent = Math.round(Math.abs(g.speedKmh));
    this.el.gear.textContent = g.inCar ? (g.drifting ? 'DRIFT!' : 'DRIVE') : 'ON FOOT';
    const w = WEAPONS[g.weaponIndex];
    this.el.weapon.textContent = `⌖ ${w.name}  [${g.weaponIndex + 1}]`;
    this.el.radio.textContent = '♪ ' + g.station;
    this.el.interact.classList.toggle('hidden', !g.canInteract);
    if (this.toastT > 0) { this.toastT -= g.dt; if (this.toastT <= 0) this.el.toast.textContent = ''; }
    this.drawMinimap(g);
  }
  drawMinimap(g) {
    const c = this.mm, S = 180, W = 640;
    c.clearRect(0, 0, S, S);
    c.fillStyle = 'rgba(8,16,30,0.85)'; c.fillRect(0, 0, S, S);
    const toMap = (x, z) => [(x / W + 0.5) * S, (z / W + 0.5) * S];
    // districts
    c.strokeStyle = 'rgba(140,180,255,0.25)';
    for (const d of g.districts) {
      const [x, y] = toMap(d.cx, d.cz);
      c.beginPath(); c.arc(x, y, d.r / W * S, 0, Math.PI * 2); c.stroke();
    }
    // frozen lake
    c.fillStyle = 'rgba(140,220,255,0.5)';
    const [lx, ly] = toMap(10, 225);
    c.beginPath(); c.arc(lx, ly, 118 / W * S, 0, Math.PI * 2); c.fill();
    // roads
    c.strokeStyle = 'rgba(200,210,230,0.35)';
    for (let i = -4; i <= 4; i++) {
      c.beginPath(); c.moveTo(0, toMap(0, i * 64 - 20)[1]); c.lineTo(S, toMap(0, i * 64 - 20)[1]); c.stroke();
      c.beginPath(); c.moveTo(toMap(i * 64, 0)[0], 0); c.lineTo(toMap(i * 64, 0)[0], S); c.stroke();
    }
    // safe houses
    c.fillStyle = '#54c96b';
    for (const s of g.safehouses) { const [x, y] = toMap(s.x, s.z); c.fillRect(x - 2, y - 2, 4, 4); }
    // marker
    if (g.marker) {
      const [x, y] = toMap(g.marker.x, g.marker.z);
      c.fillStyle = '#ffd27f';
      c.beginPath(); c.arc(x, y, 5, 0, Math.PI * 2); c.fill();
      c.strokeStyle = '#ffd27f'; c.beginPath(); c.arc(x, y, 8 + Math.sin(g.t * 4) * 3, 0, Math.PI * 2); c.stroke();
    }
    // police
    c.fillStyle = '#ff4444';
    for (const u of g.policeUnits) { const [x, y] = toMap(u.x, u.z); c.fillRect(x - 2, y - 2, 4, 4); }
    if (g.heli) { const [x, y] = toMap(g.heli.x, g.heli.z); c.fillStyle = '#ff8844'; c.beginPath(); c.arc(x, y, 4, 0, Math.PI * 2); c.fill(); }
    // player arrow
    const [px, py] = toMap(g.playerX, g.playerZ);
    c.save(); c.translate(px, py); c.rotate(g.heading);
    c.fillStyle = '#ffffff';
    c.beginPath(); c.moveTo(0, -7); c.lineTo(5, 5); c.lineTo(-5, 5); c.closePath(); c.fill();
    c.restore();
  }
}
