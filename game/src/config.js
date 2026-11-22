// Aurora Falls — shared constants, districts, missions, crew (fresh from the prose brief).
export const WORLD = {
  size: 640,           // playable square half-extent is +-320
  roadSpacing: 64,
  groundY: 0,
};

export const DISTRICTS = [
  { id: 'downtown', name: 'Neon Downtown', cx: 0, cz: -20, r: 150, color: 0xff7a1a },
  { id: 'minetown', name: 'Old Mine Town', cx: -200, cz: 70, r: 110, color: 0xffc46b },
  { id: 'resort', name: 'Ski Resort', cx: 205, cz: -185, r: 110, color: 0x7fd4ff },
  { id: 'lake', name: 'Frozen Lake', cx: 10, cz: 225, r: 120, color: 0x9fe8ff },
  { id: 'pass', name: 'The Pass', cx: -215, cz: -195, r: 110, color: 0xb9c4d6 },
];

export const CREW = [
  { id: 'maya', name: 'MAYA', role: 'Ice-road driver', perk: 'getaway cars grip better on snow and drift through roadblocks' },
  { id: 'dario', name: 'DARIO', role: 'Hacker', perk: 'disables cameras and opens shutters remotely' },
  { id: 'june', name: 'JUNE', role: 'Lookout', perk: 'marks patrol routes and safe houses on the minimap' },
];

export const GARAGE = { x: 48, z: 96, name: 'Aurora Garage' };

// Missions: each stage is one of driveTo | steal | collect | survive | race | deliver.
// targets are world [x, z]. The engine interprets stages; text is shown in the HUD.
export const MISSIONS = [
  {
    id: 1, name: 'First Snow', boss: 'THE WARDEN',
    brief: 'Steal a snowplow, clear a path, escape through the Pass in a blizzard.',
    stages: [
      { kind: 'steal', target: [-150, -20], radius: 14, text: 'Steal the snowplow on the Mine Town road (press E beside it)' },
      { kind: 'driveTo', target: [-215, -195], radius: 18, text: 'Drive the plow to the Pass entrance' },
      { kind: 'survive', seconds: 30, wanted: 2, text: 'Escape through the Pass — lose the AFPD (survive 30s at 2 stars)' },
    ],
    reward: 1200, standing: { pass: 25, minetown: 15 },
  },
  {
    id: 2, name: 'Lift Ticket', boss: 'THE WARDEN',
    brief: 'Ride the cable car up, rob the resort safe house, ski-chase down the piste.',
    stages: [
      { kind: 'driveTo', target: [205, -185], radius: 16, text: 'Reach the Ski Resort base station' },
      { kind: 'collect', target: [235, -215], radius: 12, text: 'Crack the resort safe house (drive through the vault)' },
      { kind: 'driveTo', target: [150, -120], radius: 18, text: 'Ski-chase down the piste — reach the lodge' },
    ],
    reward: 1600, standing: { resort: 30 },
  },
  {
    id: 3, name: 'Frozen Assets', boss: 'THE WARDEN',
    brief: 'Crack the frozen-lake vault during the ice festival while the crowd watches.',
    stages: [
      { kind: 'driveTo', target: [10, 225], radius: 16, text: 'Reach the ice festival on the Frozen Lake' },
      { kind: 'collect', target: [40, 250], radius: 12, text: 'Crack the lake vault' },
      { kind: 'collect', target: [-30, 200], radius: 12, text: 'Grab the festival takings' },
      { kind: 'survive', seconds: 25, wanted: 3, text: 'Break away across the ice — survive 25s at 3 stars' },
    ],
    reward: 2100, standing: { lake: 30 },
  },
  {
    id: 4, name: 'Whiteout', boss: 'THE WARDEN',
    brief: 'Lose a 5-star chase inside a whiteout, using Maya’s drift to slip roadblocks.',
    stages: [
      { kind: 'driveTo', target: [0, -20], radius: 16, text: 'Hit the downtown drop in Neon Downtown' },
      { kind: 'survive', seconds: 40, wanted: 5, text: 'Whiteout chase — survive 40s at 5 stars' },
    ],
    reward: 2600, standing: { downtown: 30 },
  },
  {
    id: 5, name: 'Avalanche', boss: 'THE WARDEN',
    brief: 'Trigger a controlled avalanche to bury a convoy, then loot it before the plows arrive.',
    stages: [
      { kind: 'driveTo', target: [-215, -195], radius: 16, text: 'Reach the avalanche gallery in the Pass' },
      { kind: 'collect', target: [-180, -150], radius: 12, text: 'Trigger the avalanche charge' },
      { kind: 'collect', target: [-160, -170], radius: 12, text: 'Loot the buried convoy' },
      { kind: 'driveTo', target: [-120, -90], radius: 18, text: 'Clear out before the plows arrive' },
    ],
    reward: 3000, standing: { pass: 30 },
  },
  {
    id: 6, name: 'Neon Debt', boss: 'THE WARDEN',
    brief: 'Collect from three downtown clubs before the Warden’s men torch them.',
    stages: [
      { kind: 'collect', target: [60, -60], radius: 12, text: 'Collect from Club Aurora' },
      { kind: 'collect', target: [-60, -80], radius: 12, text: 'Collect from the Ice Bar' },
      { kind: 'collect', target: [30, 30], radius: 12, text: 'Collect from the Neon Den' },
      { kind: 'driveTo', target: [48, 96], radius: 16, text: 'Bank the takings at the Garage' },
    ],
    reward: 3400, standing: { downtown: 30 },
  },
  {
    id: 7, name: 'The Long Night', boss: 'THE WARDEN',
    brief: 'An ice-road race across the frozen lake at midnight against the Warden’s champion.',
    stages: [
      { kind: 'race', checkpoints: [[-60, 200], [80, 200], [80, 260], [-60, 260], [10, 225]], radius: 14, text: 'Ice-road race — hit every gate before the champion' },
    ],
    reward: 4200, standing: { lake: 35 },
  },
  {
    id: 8, name: 'Aurora Heist', boss: 'THE WARDEN',
    brief: 'Rob the Warden’s aurora-view penthouse during the festival fireworks, then escape by frozen lake as the whole city chases you.',
    stages: [
      { kind: 'driveTo', target: [0, -60], radius: 14, text: 'Reach the Warden’s tower in Neon Downtown' },
      { kind: 'collect', target: [0, -60], radius: 12, text: 'Crack the penthouse vault' },
      { kind: 'driveTo', target: [10, 225], radius: 18, text: 'Escape across the Frozen Lake' },
      { kind: 'survive', seconds: 45, wanted: 5, text: 'The whole city is chasing you — survive 45s at 5 stars' },
    ],
    reward: 8000, standing: { downtown: 40, lake: 40 },
  },
];

export const WEAPONS = [
  { id: 'pistol', name: 'Pistol', damage: 34, rate: 0.22, spread: 0.012, auto: false, color: 0xffd27f },
  { id: 'shotgun', name: 'Shotgun', damage: 16, pellets: 7, rate: 0.8, spread: 0.06, auto: false, color: 0xff9a4d },
  { id: 'rifle', name: 'Rifle', damage: 62, rate: 0.14, spread: 0.004, auto: true, color: 0x9fe8ff },
  { id: 'smg', name: 'SMG', damage: 20, rate: 0.07, spread: 0.03, auto: true, color: 0xc9a7ff },
];

export const UPGRADES = [
  { id: 'engine', name: 'Engine Mk II', cost: 1500, desc: '+top speed, +acceleration' },
  { id: 'engine2', name: 'Engine Mk III', cost: 3200, desc: '++top speed, ++acceleration', needs: 'engine' },
  { id: 'tires', name: 'Snow Tires', cost: 1200, desc: '+grip on ice, shorter slides' },
  { id: 'armor', name: 'Armor Plating', cost: 1800, desc: '+car health, wrecks slower' },
  { id: 'paint', name: 'Aurora Paint', cost: 900, desc: 'shimmering aurora paint job' },
];

export const RACES = [
  { id: 'lake', name: 'Ice-Road Sprint', checkpoints: [[-60, 200], [80, 200], [80, 260], [-60, 260], [10, 225]], reward: 900 },
  { id: 'downtown', name: 'Neon Loop', checkpoints: [[-80, -80], [80, -80], [80, 40], [-80, 40], [0, -20]], reward: 900 },
];

export const SAVE_KEY = 'aurora-falls-save-v1';
