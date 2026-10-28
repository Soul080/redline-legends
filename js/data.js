/* data.js - Static game data for Redline Legends: cars, parts, perks, tracks,
   leagues, side events, quests, NPC dialogue and achievements. No logic beyond
   small helpers lives here. */
window.RL = window.RL || {};

/* ---------- Rarity tiers for parts ---------- */
RL.RARITIES = {
  common:    { name: 'Common',    color: '#c9d1d9', mult: 1,   price: 1 },
  rare:      { name: 'Rare',      color: '#3fa9ff', mult: 2,   price: 3 },
  epic:      { name: 'Epic',      color: '#c86bff', mult: 3.2, price: 8 },
  legendary: { name: 'Legendary', color: '#ffb02e', mult: 5,   price: 20 }
};
RL.RARITY_ORDER = ['common', 'rare', 'epic', 'legendary'];

/* ---------- Part slots: base stat bonus at Common rarity ---------- */
RL.SLOTS = {
  engine:     { name: 'Engine',     icon: '⚙', base: { topSpeed: 3, accel: 2 }, price: 400 },
  tires:      { name: 'Tires',      icon: '◎', base: { grip: 4, handling: 1 },  price: 300 },
  turbo:      { name: 'Turbo',      icon: '✺', base: { accel: 3, nitro: 2 },    price: 450 },
  suspension: { name: 'Suspension', icon: '⇕', base: { handling: 4, grip: 1 },  price: 350 },
  body:       { name: 'Body Kit',   icon: '▣', base: { durability: 4, topSpeed: 1 }, price: 300 },
  paint:      { name: 'Paint',      icon: '✎', base: { nitro: 2, durability: 1 }, price: 200 }
};
RL.SLOT_ORDER = ['engine', 'tires', 'turbo', 'suspension', 'body', 'paint'];
RL.PAINT_COLORS = ['#ff3b6b', '#2ee6ff', '#ffe03b', '#7dff5a', '#c86bff', '#ff8a2e', '#ffffff', '#ff2ef0'];
RL.PART_NAMES = {
  engine: ['Street', 'Tuned', 'Race', 'Mythic'], tires: ['Road', 'Sport', 'Slick', 'Hyper'],
  turbo: ['Basic', 'Twin', 'Quad', 'Ion'], suspension: ['Soft', 'Coilover', 'Active', 'Mag-Lev'],
  body: ['Lip', 'Widebody', 'Carbon', 'Aero-X'], paint: ['Gloss', 'Metallic', 'Chrome', 'Prism']
};

/* ---------- Cars (12): stats on a 0-100 scale ---------- */
RL.CARS = [
  { id: 'pip',     name: 'Pip Hatch',      cls: 'Hatchback', price: 0,      league: 1, color: '#7dff5a', s: { topSpeed: 30, accel: 35, handling: 45, grip: 42, nitro: 30, durability: 50 } },
  { id: 'kei',     name: 'Street Kei',     cls: 'Kei',       price: 2500,   league: 1, color: '#ffe03b', s: { topSpeed: 34, accel: 48, handling: 60, grip: 50, nitro: 34, durability: 35 } },
  { id: 'coupe',   name: 'Rookie Coupe',   cls: 'Coupe',     price: 3500,   league: 1, color: '#2ee6ff', s: { topSpeed: 42, accel: 42, handling: 48, grip: 48, nitro: 38, durability: 48 } },
  { id: 'brute',   name: 'Muscle Brute',   cls: 'Muscle',    price: 8000,   league: 2, color: '#ff8a2e', s: { topSpeed: 56, accel: 52, handling: 32, grip: 38, nitro: 42, durability: 72 } },
  { id: 'dragon',  name: 'Drift Dragon',   cls: 'Drift',     price: 11000,  league: 2, color: '#ff3b6b', s: { topSpeed: 50, accel: 52, handling: 72, grip: 44, nitro: 58, durability: 45 } },
  { id: 'raptor',  name: 'Desert Raptor',  cls: 'Rally',     price: 16000,  league: 2, color: '#d9a35b', s: { topSpeed: 57, accel: 56, handling: 52, grip: 62, nitro: 45, durability: 76 } },
  { id: 'euro',    name: 'Euro Sport',     cls: 'Sports',    price: 24000,  league: 3, color: '#ffffff', s: { topSpeed: 66, accel: 62, handling: 63, grip: 60, nitro: 50, durability: 52 } },
  { id: 'fox',     name: 'Rally Fox',      cls: 'Rally',     price: 32000,  league: 3, color: '#ff6a00', s: { topSpeed: 63, accel: 66, handling: 68, grip: 76, nitro: 55, durability: 62 } },
  { id: 'neongt',  name: 'Neon GT',        cls: 'GT',        price: 46000,  league: 3, color: '#ff2ef0', s: { topSpeed: 75, accel: 68, handling: 66, grip: 66, nitro: 66, durability: 56 } },
  { id: 'thunder', name: 'Thunder V12',    cls: 'Super',     price: 66000,  league: 4, color: '#3fa9ff', s: { topSpeed: 83, accel: 73, handling: 58, grip: 63, nitro: 70, durability: 66 } },
  { id: 'apex',    name: 'Apex RS',        cls: 'Super',     price: 90000,  league: 4, color: '#c86bff', s: { topSpeed: 86, accel: 80, handling: 78, grip: 76, nitro: 72, durability: 60 } },
  { id: 'vortex',  name: 'Vortex Hyper',   cls: 'Hypercar',  price: 150000, league: 4, color: '#00ffc8', s: { topSpeed: 96, accel: 90, handling: 82, grip: 80, nitro: 86, durability: 66 } }
];
RL.STAT_NAMES = { topSpeed: 'Top Speed', accel: 'Acceleration', handling: 'Handling', grip: 'Grip', nitro: 'Nitro', durability: 'Durability' };
RL.STAT_ORDER = ['topSpeed', 'accel', 'handling', 'grip', 'nitro', 'durability'];

/* ---------- Driver stats ---------- */
RL.DRIVER_STATS = {
  reflexes: { name: 'Reflexes', desc: 'Faster steering response and a wider perfect-start window.' },
  control:  { name: 'Control',  desc: 'Drifts are easier to hold and charge more nitro.' },
  nerve:    { name: 'Nerve',    desc: 'Less speed lost and less damage when crashing.' },
  tactics:  { name: 'Tactics',  desc: 'Nitro burns slower and slipstream is stronger.' }
};

/* ---------- Perk skill tree: 4 branches x 5 + capstone = 21 perks ---------- */
RL.PERKS = [
  { id: 'perfect_start', branch: 'reflexes', tier: 1, name: 'Perfect Start', desc: 'Hold gas as the light turns green for a launch boost.' },
  { id: 'quick_hands',   branch: 'reflexes', tier: 2, req: 'perfect_start', name: 'Quick Hands', desc: '+12% steering speed.' },
  { id: 'late_braker',   branch: 'reflexes', tier: 3, req: 'quick_hands', name: 'Late Braker', desc: '+35% braking power.' },
  { id: 'gear_master',   branch: 'reflexes', tier: 4, req: 'late_braker', name: 'Gear Master', desc: '+4% top speed.' },
  { id: 'reflex_god',    branch: 'reflexes', tier: 5, req: 'gear_master', name: 'Reflex God', desc: '+6% acceleration and quicker crash recovery.' },
  { id: 'drift_king',    branch: 'control', tier: 1, name: 'Drift King', desc: 'Drifting charges nitro 30% faster.' },
  { id: 'smooth_operator', branch: 'control', tier: 2, req: 'drift_king', name: 'Smooth Operator', desc: 'Off-road slowdown reduced by 40%.' },
  { id: 'grip_lord',     branch: 'control', tier: 3, req: 'smooth_operator', name: 'Grip Lord', desc: 'Rain and snow grip penalty halved.' },
  { id: 'counter_steer', branch: 'control', tier: 4, req: 'grip_lord', name: 'Counter Steer', desc: 'Exiting a long drift gives a speed burst.' },
  { id: 'zen_drift',     branch: 'control', tier: 5, req: 'counter_steer', name: 'Zen Drift', desc: '+50% drift score and XP.' },
  { id: 'iron_will',     branch: 'nerve', tier: 1, name: 'Iron Will', desc: 'Wall hits cost half as much speed.' },
  { id: 'bumper_cars',   branch: 'nerve', tier: 2, req: 'iron_will', name: 'Bumper Cars', desc: 'Your bumps push rivals 50% harder.' },
  { id: 'thick_skin',    branch: 'nerve', tier: 3, req: 'bumper_cars', name: 'Thick Skin', desc: '-30% damage taken.' },
  { id: 'comeback_king', branch: 'nerve', tier: 4, req: 'thick_skin', name: 'Comeback King', desc: '+7% speed while in the bottom half.' },
  { id: 'adrenaline',    branch: 'nerve', tier: 5, req: 'comeback_king', name: 'Adrenaline', desc: 'Racing close to rivals charges nitro.' },
  { id: 'draft_master',  branch: 'tactics', tier: 1, name: 'Draft Master', desc: 'Slipstream boost +60%.' },
  { id: 'nitro_saver',   branch: 'tactics', tier: 2, req: 'draft_master', name: 'Nitro Saver', desc: 'Nitro burns 20% slower.' },
  { id: 'double_tank',   branch: 'tactics', tier: 3, req: 'nitro_saver', name: 'Double Tank', desc: 'Start every race with a full nitro tank.' },
  { id: 'mechanic',      branch: 'tactics', tier: 4, req: 'double_tank', name: 'Mechanic', desc: 'Repairs cost 35% less.' },
  { id: 'haggler',       branch: 'tactics', tier: 5, req: 'mechanic', name: 'Haggler', desc: 'Shop prices -15%, sell prices +25%.' },
  { id: 'legend',        branch: 'capstone', tier: 6, reqAll: ['reflex_god', 'zen_drift', 'adrenaline', 'haggler'], reqLevel: 0, name: 'Living Legend', desc: '+5% to every car stat. Requires all 4 branch finales.' }
];

/* ---------- Track themes ---------- */
RL.THEMES = {
  city:   { name: 'City Streets',  bg: '#1d2430', off: '#2f6b3a', road: '#3a3f4b', line: '#ffe03b', wall: '#555c6b', deco: 'building', accent: '#2ee6ff' },
  desert: { name: 'Desert',        bg: '#a8743f', off: '#d9a35b', road: '#6b5a48', line: '#ffffff', wall: '#7a4f2a', deco: 'cactus', accent: '#ff8a2e' },
  snow:   { name: 'Snowy Mountain', bg: '#c8d6e5', off: '#eef4fb', road: '#5d6878', line: '#3fa9ff', wall: '#8597ad', deco: 'pine', accent: '#3fa9ff' },
  neon:   { name: 'Neon Night Highway', bg: '#0b0618', off: '#1a0f33', road: '#22223a', line: '#ff2ef0', wall: '#ff2ef0', deco: 'neon', accent: '#ff2ef0' }
};
RL.WEATHER = {
  clear: { name: 'Clear',  grip: 1.0,  icon: '☀' },
  rain:  { name: 'Rain',   grip: 0.72, icon: '☂' },
  snow:  { name: 'Snow',   grip: 0.62, icon: '❄' },
  dust:  { name: 'Dust Storm', grip: 0.85, icon: '≋' }
};
RL.TIMES = { day: { name: 'Day', dark: 0 }, dusk: { name: 'Dusk', dark: 0.3 }, night: { name: 'Night', dark: 0.6 } };

/* ---------- Tracks: closed loops of control points, smoothed with Catmull-Rom ---------- */
RL.TRACKS = {
  docklands: { name: 'Docklands Loop', theme: 'city', width: 150, grass: 55, weather: ['clear', 'rain'], times: ['day', 'dusk'],
    pts: [[300, 300], [1500, 300], [1900, 450], [2000, 900], [1700, 1300], [1100, 1300], [900, 1000], [500, 1100], [250, 800]] },
  downtown: { name: 'Downtown Dash', theme: 'city', width: 140, grass: 50, weather: ['clear', 'rain'], times: ['day', 'night'],
    pts: [[300, 300], [1000, 250], [1200, 600], [1700, 500], [2100, 700], [2000, 1300], [1400, 1500], [800, 1300], [400, 1400], [200, 900]] },
  mesa: { name: 'Mesa Run', theme: 'desert', width: 140, grass: 60, weather: ['clear', 'dust'], times: ['day', 'dusk'],
    pts: [[300, 500], [900, 250], [1600, 300], [2200, 600], [2300, 1200], [1800, 1600], [1200, 1300], [700, 1700], [250, 1300]] },
  dunes: { name: 'Dune Sweep', theme: 'desert', width: 135, grass: 60, weather: ['clear', 'dust'], times: ['day', 'dusk', 'night'],
    pts: [[400, 300], [2000, 300], [2400, 800], [2000, 1200], [1400, 900], [900, 1300], [1300, 1700], [600, 1800], [200, 1100]] },
  frostbite: { name: 'Frostbite Pass', theme: 'snow', width: 130, grass: 45, weather: ['snow', 'clear'], times: ['day', 'dusk'],
    pts: [[300, 300], [1200, 200], [1500, 700], [1100, 1000], [1600, 1300], [2200, 1100], [2300, 1800], [1300, 2000], [400, 1800], [600, 1100], [200, 800]] },
  glacier: { name: 'Glacier Hairpins', theme: 'snow', width: 125, grass: 40, weather: ['snow', 'clear'], times: ['day', 'night'],
    pts: [[300, 300], [2000, 300], [2150, 650], [700, 720], [600, 1050], [2100, 1080], [2250, 1500], [800, 1650], [250, 1300]] },
  highway: { name: 'Neon Highway', theme: 'neon', width: 150, grass: 45, weather: ['clear', 'rain'], times: ['night'],
    pts: [[300, 600], [1400, 300], [2600, 400], [3000, 900], [2600, 1400], [1500, 1200], [800, 1600], [300, 1300]] },
  spiral: { name: 'Midnight Spiral', theme: 'neon', width: 130, grass: 40, weather: ['rain', 'clear'], times: ['night'],
    pts: [[400, 400], [1500, 250], [2400, 500], [2500, 1300], [1800, 1800], [900, 1700], [1300, 1200], [1900, 1100], [1700, 700], [800, 800], [300, 1100]] },
  oval: { name: 'Training Oval', theme: 'city', width: 160, grass: 70, weather: ['clear'], times: ['day'],
    pts: [[400, 400], [1600, 400], [1900, 700], [1600, 1000], [400, 1000], [100, 700]] },
  /* Open straights. The finish line is the far end. 1 design pixel is 0.2 m in 3D. */
  quarter: { name: 'Quarter Mile', theme: 'city', width: 200, grass: 40, open: true, weather: ['clear'], times: ['day', 'night'],
    pts: [[100, 500], [600, 500], [1100, 500], [1600, 500], [2100, 500]] },
  half: { name: 'Half Mile', theme: 'city', width: 200, grass: 40, open: true, weather: ['clear'], times: ['day', 'night'],
    pts: [[100, 500], [600, 500], [1100, 500], [1600, 500], [2100, 500], [2600, 500], [3100, 500], [3600, 500], [4100, 500]] }
};

/* ---------- Difficulty (Settings, default Normal). Applied when a race starts. ---------- */
RL.DIFFICULTY_ORDER = ['easy', 'normal', 'hard', 'legend'];
RL.DIFFICULTIES = {
  easy:   { id: 'easy', name: 'Easy', pace: 0.90, skill: 0.80, mistake: 1.65, rubber: 1.25 },
  normal: { id: 'normal', name: 'Normal', pace: 1, skill: 1, mistake: 1, rubber: 1 },
  hard:   { id: 'hard', name: 'Hard', pace: 1.07, skill: 1.10, mistake: 0.55, rubber: 0.72 },
  legend: { id: 'legend', name: 'Legend', pace: 1.13, skill: 1.18, mistake: 0.25, rubber: 0.4 }
};
RL.difficulty = function () {
  const id = (RL.settings && RL.settings.difficulty) || 'normal';
  return RL.DIFFICULTIES[id] || RL.DIFFICULTIES.normal;
};

/* ---------- AI personalities (archetypes) and named rivals ----------
   Each rival has their own skill offset, aggression, risk, line bias, nitro
   timing, drift style and how hard they take being passed. A race jitters
   those numbers so the same name is never a copy of last time.
   skill is added to the league driving skill. line < 0 prefers the inside. */
RL.PERSONALITIES = {
  clean:      { name: 'Clean',         lane: 0.1,  bump: 0.05, nitroUse: 0.4,  aggression: 0.16, risk: 0.28, drift: 0.22, nitro: 0.4,  pride: 0.32, mistake: 0.16, line: 0,    nitroSave: 0.62 },
  aggressive: { name: 'Aggressive',    lane: 0.28, bump: 0.9,  nitroUse: 0.55, aggression: 0.88, risk: 0.74, drift: 0.58, nitro: 0.52, pride: 0.88, mistake: 0.34, line: 0.22, nitroSave: 0.28 },
  nitro:      { name: 'Nitro-Spammer', lane: 0.18, bump: 0.35, nitroUse: 0.95, aggression: 0.46, risk: 0.66, drift: 0.86, nitro: 0.95, pride: 0.55, mistake: 0.3,  line: 0,    nitroSave: 0.12 }
};
RL.RIVALS = [
  { name: 'Rook', pers: 'clean', league: 1, skill: -0.06, aggression: 0.08, risk: 0.14, drift: 0.1, nitro: 0.28, pride: 0.18, mistake: 0.28, line: 0, nitroSave: 0.7,
    taunts: { start: ['Nice and tidy, yeah?', 'I\'ll just hold my line.'], overtake: ['Excuse me.', 'Room on the inside.'], overtaken: ['Clean pass. Fair.'], block: ['This is my line.', 'Holding steady.'], final: ['Bring it home clean.'] } },
  { name: 'Sparky', pers: 'nitro', league: 1, skill: -0.02, aggression: 0.38, risk: 0.62, drift: 0.84, nitro: 0.96, pride: 0.45, mistake: 0.42, line: 0.12, nitroSave: 0.05,
    taunts: { start: ['Nitro\'s already cooking!', 'Watch the blue flames!'], overtake: ['BOOSTED!', 'Smell that? That\'s me.'], overtaken: ['Hey! Save me some!'], block: ['Can\'t pass a firework.'], final: ['Tank\'s full. Bye!'] } },
  { name: 'Neko', pers: 'clean', league: 1, skill: 0.0, aggression: 0.14, risk: 0.32, drift: 0.48, nitro: 0.4, pride: 0.3, mistake: 0.22, line: -0.28, nitroSave: 0.5,
    taunts: { start: ['Inside line\'s mine.', 'Quiet feet, fast hands.'], overtake: ['Slipped through.', 'You left the apex open.'], overtaken: ['...Noted.'], block: ['I was here first.'], final: ['One tidy lap left.'] } },
  { name: 'Mack', pers: 'aggressive', league: 1, skill: -0.04, aggression: 0.78, risk: 0.48, drift: 0.34, nitro: 0.4, pride: 0.72, mistake: 0.36, line: 0.3, nitroSave: 0.3,
    taunts: { start: ['Bumpers are for bumping.', 'Move or get moved.'], overtake: ['Outta the way!', 'That\'s a Mack special.'], overtaken: ['Oh you wanna play?'], block: ['Lane\'s closed, pal.', 'Nowhere to go.'], final: ['Last lap. I don\'t brake.'] } },
  { name: 'Lola', pers: 'clean', league: 1, skill: 0.05, aggression: 0.2, risk: 0.36, drift: 0.26, nitro: 0.48, pride: 0.42, mistake: 0.14, line: 0.04, nitroSave: 0.58,
    taunts: { start: ['Try to keep up, rookie.', 'I\'ll make it look easy.'], overtake: ['See you at the flag.', 'Too slow.'], overtaken: ['Alright. That was good.'], block: ['You can look, not pass.'], final: ['Final lap. No gifts.'] } },
  { name: 'Jinx', pers: 'aggressive', league: 2, skill: 0.03, aggression: 0.95, risk: 0.9, drift: 0.78, nitro: 0.55, pride: 0.96, mistake: 0.4, line: 0.4, nitroSave: 0.15,
    taunts: { start: ['I don\'t do brakes.', 'Try not to blink.'], overtake: ['Eat dust!', 'Dive-bomb!'], overtaken: ['That was luck. I\'m coming back.'], block: ['This lane is mine.', 'Touch me and spin.'], final: ['Last lap, no mercy.'] } },
  { name: 'Blaze', pers: 'nitro', league: 2, skill: 0.0, aggression: 0.5, risk: 0.72, drift: 0.92, nitro: 0.98, pride: 0.58, mistake: 0.36, line: 0.02, nitroSave: 0.08,
    taunts: { start: ['Flame on.', 'I live on the limiter.'], overtake: ['Whoosh!', 'Nitro says no.'], overtaken: ['Rude! Boosting back.'], block: ['Hot metal, don\'t touch.'], final: ['Empty the tank!'] } },
  { name: 'Dex', pers: 'aggressive', league: 2, skill: 0.02, aggression: 0.72, risk: 0.4, drift: 0.3, nitro: 0.46, pride: 0.8, mistake: 0.16, line: 0.16, nitroSave: 0.4,
    taunts: { start: ['I race dirty, but I race smart.', 'Pick a side. I\'ll be there.'], overtake: ['Calculated.', 'You telegraphed that.'], overtaken: ['Hmm. Adjusting.'], block: ['Door\'s shut.', 'I saw you move.'], final: ['Time to defend.'] } },
  { name: 'Turbo Tia', pers: 'nitro', league: 2, skill: 0.05, aggression: 0.36, risk: 0.58, drift: 0.7, nitro: 0.86, pride: 0.5, mistake: 0.18, line: -0.12, nitroSave: 0.48,
    taunts: { start: ['Saving a sip for the straight.', 'Draft me and you\'ll regret it.'], overtake: ['Slingshot!', 'Thanks for the tow.'], overtaken: ['Enjoy it. I\'ve got a tank.'], block: ['Not while I\'m charging.'], final: ['Final lap. Uncorking it.'] } },
  { name: 'Kai', pers: 'clean', league: 2, skill: 0.07, aggression: 0.12, risk: 0.24, drift: 0.18, nitro: 0.34, pride: 0.36, mistake: 0.1, line: 0, nitroSave: 0.66,
    taunts: { start: ['Smooth is fast.', 'I\'ll be gone before you notice.'], overtake: ['Apex, exit, done.', 'No drama.'], overtaken: ['Fair. I\'ll take it back clean.'], block: ['My line. Drive your own.'], final: ['Last lap. Precision.'] } },
  { name: 'Vince', pers: 'aggressive', league: 3, skill: 0.04, aggression: 0.86, risk: 0.64, drift: 0.52, nitro: 0.5, pride: 0.9, mistake: 0.24, line: 0.28, nitroSave: 0.32,
    taunts: { start: ['Mountain rules: elbows out.', 'I trained for this ice.'], overtake: ['Move.', 'That\'s my corner now.'], overtaken: ['You\'ll see me in the mirror.'], block: ['Wall of Vince.', 'Pick another lane.'], final: ['Last lap. I get mean.'] } },
  { name: 'Roxy', pers: 'nitro', league: 3, skill: 0.03, aggression: 0.55, risk: 0.76, drift: 0.88, nitro: 0.92, pride: 0.68, mistake: 0.26, line: -0.16, nitroSave: 0.18,
    taunts: { start: ['Slides fill the tank. Watch.', 'Pink smoke, blue fire.'], overtake: ['Angle AND speed.', 'Nitro out of the hairpin!'], overtaken: ['Cute. My turn.'], block: ['Don\'t interrupt a drift.'], final: ['Last lap. I\'m glowing.'] } },
  { name: 'Zed', pers: 'clean', league: 3, skill: 0.08, aggression: 0.22, risk: 0.42, drift: 0.36, nitro: 0.6, pride: 0.5, mistake: 0.08, line: 0.06, nitroSave: 0.84,
    taunts: { start: ['I brake late and once.', 'Nitro stays corked till the end.'], overtake: ['You braked. I didn\'t.', 'Gap closed.'], overtaken: ['Interesting.', 'I still have a full tank.'], block: ['Late apex. You can\'t fit.'], final: ['Now I use the nitro.'] } },
  { name: 'Pike', pers: 'aggressive', league: 4, skill: 0.05, aggression: 0.8, risk: 0.52, drift: 0.4, nitro: 0.5, pride: 0.84, mistake: 0.14, line: 0.2, nitroSave: 0.36,
    taunts: { start: ['Veterans don\'t lift.', 'I\'ve defended this highway for years.'], overtake: ['Experience.', 'Sit down.'], overtaken: ['Bold. I\'m still ahead on the next one.'], block: ['Door closed.', 'Not on my highway.'], final: ['Final lap. I know every curb.'] } },
  { name: 'Nova', pers: 'clean', league: 4, skill: 0.1, aggression: 0.28, risk: 0.46, drift: 0.32, nitro: 0.7, pride: 0.6, mistake: 0.06, line: 0, nitroSave: 0.55,
    taunts: { start: ['I\'ll make the rest of you look parked.', 'Perfect lap, or close enough.'], overtake: ['Clinical.', 'You were in the way of a fast lap.'], overtaken: ['...That doesn\'t happen often.'], block: ['There\'s no gap. I measured.'], final: ['Last lap. This is the one I practiced.'] } }
];
RL.RIVAL_NAMES = RL.RIVALS.map((r) => r.name);
/* Shuffle a league-appropriate roster. Occasionally one driver from the next league shows up. */
RL.pickRivals = function (league, n) {
  const all = RL.RIVALS;
  let pool = all.filter((r) => r.league <= league);
  if (pool.length < n) pool = all.slice();
  const bag = pool.slice();
  for (let i = bag.length - 1; i > 0; i--) {
    const j = Math.floor(RL.rand(0, i + 1));
    const tmp = bag[i]; bag[i] = bag[j]; bag[j] = tmp;
  }
  if (league < 4 && RL.rand(0, 1) < 0.4) {
    const up = all.filter((r) => r.league === league + 1);
    if (up.length) bag[Math.min(n, bag.length) - 1] = up[Math.floor(RL.rand(0, up.length))];
  }
  const out = [], used = {};
  const take = (r) => { if (!r || used[r.name]) return; used[r.name] = 1; out.push(r); };
  for (let i = 0; i < bag.length && out.length < n; i++) take(bag[i]);
  for (let i = 0; out.length < n && i < all.length; i++) take(all[i]);
  return out;
};

/* ---------- Leagues: 3 races + a boss each.
   ai = driving skill (0..1): later brakes, better lines, fewer mistakes.
   pace = straight-line speed multiplier on top of the car.
   aiBonus = flat stats added to every rival car.
   Boss `ai` replaces those so a boss can outrun a starter and still race a built car. */
RL.LEAGUES = [
  { id: 1, name: 'Street Rookies', color: '#7dff5a', ai: 0.66, pace: 0.97, aiBonus: 0, cars: ['pip', 'kei', 'coupe'], prize: 300,
    races: [{ track: 'docklands', name: 'Harbor Sprint' }, { track: 'downtown', name: 'Rush Hour' }, { track: 'docklands', name: 'Container Run', reverse: true }],
    boss: { name: 'Brick Malone', car: 'coupe', track: 'downtown', gimmick: 'blocker', color: '#ff8a2e', desc: 'Brick blocks the racing line when you get behind him. The Vipers\' dock enforcer. He does not move, and the kids on the harbor watch whoever tries.',
      ai: { pers: 'aggressive', skill: 0.9, pace: 1.08, bonus: 16, aggression: 0.94, risk: 0.3, drift: 0.16, nitro: 0.45, pride: 0.85, mistake: 0.08, line: 0.02, nitroSave: 0.3 },
      taunts: { start: ['This lane is closed, rookie.', 'Hope you like my bumper.'], overtake: ['Not today.', 'Back where you belong.'], overtaken: ['Hey! Off my line!'], block: ['Nowhere to go.', 'I AM the racing line.'], final: ['Last lap. I\'m a wall.'] } } },
  { id: 2, name: 'Desert Outlaws', color: '#ff8a2e', ai: 0.78, pace: 1.0, aiBonus: 4, cars: ['brute', 'dragon', 'raptor', 'coupe'], prize: 800,
    races: [{ track: 'mesa', name: 'Mesa Mirage' }, { track: 'dunes', name: 'Sandblaster' }, { track: 'mesa', name: 'Canyon Echo' }],
    boss: { name: 'Sidewinder Sal', car: 'raptor', track: 'dunes', gimmick: 'magnet', color: '#ffe03b', desc: 'Sal gets faster the closer you get to her. The Dustline answers to no crew. Pride is her turbo.',
      ai: { pers: 'clean', skill: 0.93, pace: 1.07, bonus: 14, aggression: 0.58, risk: 0.7, drift: 0.5, nitro: 0.62, pride: 0.64, mistake: 0.1, line: -0.08, nitroSave: 0.28 },
      taunts: { start: ['Get close. I dare you.', 'The desert pulls, kid.'], overtake: ['Feel that tug?', 'Too close. I\'m faster.'], overtaken: ['Brave. It won\'t last.'], block: ['I can race you from here.'], final: ['Last lap. Stay in my draft and lose.'] } } },
  { id: 3, name: 'Mountain Kings', color: '#3fa9ff', ai: 0.86, pace: 1.03, aiBonus: 8, cars: ['euro', 'fox', 'neongt', 'raptor'], prize: 2000,
    races: [{ track: 'frostbite', name: 'Frostbite' }, { track: 'glacier', name: 'Icebreaker' }, { track: 'frostbite', name: 'Avalanche' }],
    boss: { name: 'Vex (Vipers Crew)', car: 'neongt', track: 'glacier', gimmick: 'nitro', color: '#7dff5a', desc: 'Vex fires a fresh nitro burst every few seconds. The Vipers\' boss treats the city like a house bet, and the ice is the table.',
      ai: { pers: 'nitro', skill: 0.96, pace: 1.06, bonus: 12, aggression: 0.5, risk: 0.64, drift: 0.82, nitro: 0.98, pride: 0.72, mistake: 0.07, line: -0.04, nitroSave: 0.05 },
      taunts: { start: ['I don\'t run out of nitro.', 'Ice and boost. My favorite.'], overtake: ['Bursts. Plural.', 'Blue fire, green flag.'], overtaken: ['Enjoy the lead. Tank\'s refilling.'], block: ['Boosting on your door.'], final: ['Final lap. I saved the big one.'] } } },
  { id: 4, name: 'Neon Legends', color: '#ff2ef0', ai: 0.93, pace: 1.05, aiBonus: 12, cars: ['thunder', 'apex', 'neongt', 'vortex'], prize: 5000,
    races: [{ track: 'highway', name: 'Lightspeed' }, { track: 'spiral', name: 'Midnight Coil' }, { track: 'highway', name: 'Afterglow' }],
    boss: { name: 'The Phantom', car: 'vortex', track: 'spiral', gimmick: 'phantom', color: '#ffffff', desc: 'The Phantom blocks your line AND speeds up when you are close. No face, no crew. Final showdown on the Midnight Spiral.',
      ai: { pers: 'aggressive', skill: 0.99, pace: 1.08, bonus: 16, aggression: 0.78, risk: 0.48, drift: 0.4, nitro: 0.74, pride: 0.9, mistake: 0.04, line: 0, nitroSave: 0.5 },
      taunts: { start: ['You shouldn\'t have climbed this far.', 'I have never been passed.'], overtake: ['And you won\'t be the first.', 'Predictable.'], overtaken: ['...Impossible.', 'That will not happen twice.'], block: ['There is no way past.', 'I know which way you\'ll go.'], final: ['Last lap. Become a legend, or don\'t.'] } } }
];

/* ---------- Side events (Race Office) ---------- */
RL.SIDE_EVENTS = [
  { id: 'tt',    type: 'timetrial',   name: 'Time Trial',      desc: 'Solo run. Beat the par time over 3 laps.', icon: '⏱' },
  { id: 'drift', type: 'drift',       name: 'Drift Challenge', desc: 'Solo run. Score drift points over 3 laps.', icon: '〰' },
  { id: 'elim',  type: 'elimination', name: 'Elimination',     desc: 'Last place is knocked out each time the leader completes a lap.', icon: '✖' },
  { id: 'ghost', type: 'ghost',       name: 'Beat the Ghost',  desc: 'Race your best recorded run (or a pro ghost).', icon: '👻' }
];

/* ---------- Quests: main story + rival chains + side quests ----------
   m1-m6 stay the league spine so old saves keep their active ids.
   q* chains are started from the bar as leagues open. m7 is the epilogue. */
RL.QUESTS = {
  m1: { main: true, title: 'A Nobody With Wheels', desc: 'The docks are watching. Finish top 3 in any Street Rookies race.', type: 'podium', league: 1, reward: { money: 300, xp: 80 }, next: 'm2' },
  m2: { main: true, title: 'Through the Brick Wall', desc: 'Beat Brick Malone. He is the Vipers\' door on the docks, and he does not move.', type: 'boss', league: 1, reward: { money: 800, xp: 200 }, next: 'm3' },
  m3: { main: true, title: 'Viper\'s Nest', desc: 'Vex is at the Neon Bar. Hear the offer. Money and respect will not agree.', type: 'talk', npc: 'vex', reward: { xp: 100 }, next: 'm4' },
  m4: { main: true, title: 'Desert Storm', desc: 'Beat Sidewinder Sal. She gets faster when you crowd her mirrors.', type: 'boss', league: 2, reward: { money: 2000, xp: 500 }, next: 'm5' },
  m5: { main: true, title: 'Cold Blood', desc: 'Take Vex down on the Glacier Hairpins. The house bet ends where the ice says it ends.', type: 'boss', league: 3, reward: { money: 5000, xp: 1000 }, next: 'm6' },
  m6: { main: true, title: 'The Phantom', desc: 'Final showdown on the Midnight Spiral. Beat the Phantom and make the mask come off.', type: 'boss', league: 4, reward: { money: 20000, xp: 3000 }, next: 'm7' },
  m7: { main: true, title: 'After the Lights', desc: 'The city has a last word. Stay for the epilogue after the Phantom falls.', type: 'story', key: 'epilogue', reward: { xp: 800, respect: 5 } },
  q1: { main: true, title: 'Names in the Neon', desc: 'Rook is at the Neon Bar with a stopwatch and no crew. Learn the kid\'s name.', type: 'talk', npc: 'rook', reward: { xp: 60, respect: 2 }, next: 'q2' },
  q2: { main: true, title: 'Tia\'s Noise', desc: 'Turbo Tia is loud about Rook. Answer her at the bar. Standing up, or walking past, both stick.', type: 'talk', npc: 'tia', reward: { xp: 80 }, next: 'q3' },
  q3: { main: true, title: 'Jinx\'s Marker', desc: 'Jinx wants a yes or a no on a marker for Brick\'s race. Take the bet, or race it clean.', type: 'flagAny', flags: ['jinxBet', 'jinxClean'], reward: { xp: 70 } },
  q4: { main: true, title: 'Dust on the Boots', desc: 'Sidewinder Sal came into the city after Brick fell. Talk to her at the bar.', type: 'talk', npc: 'sal', reward: { xp: 100, respect: 2 }, next: 'q5' },
  q5: { main: true, title: 'Pike\'s Read', desc: 'Pike speaks rarely. Ask Sal\'s navigator how she actually races.', type: 'talk', npc: 'pike', reward: { xp: 80 }, next: 'q6' },
  q6: { main: true, title: 'Blaze\'s Price', desc: 'Blaze is selling Sal\'s canyon line. Buy the cheat, or warn the Dustline. The dunes will remember which.', type: 'flagAny', flags: ['blazeCheat', 'blazeTold'], reward: { xp: 120, respect: 2 } },
  q7: { main: true, title: 'Exit Ramp', desc: 'Kai, Vex\'s sibling, wants out of the Vipers. Hear them at the bar.', type: 'talk', npc: 'kai', reward: { xp: 100 }, next: 'q8' },
  q8: { main: true, title: 'Roxy\'s Word', desc: 'Roxy keeps the Vipers pointed straight. Ask whether Kai can leave clean.', type: 'flag', flag: 'roxyHeard', reward: { xp: 100, respect: 2 }, next: 'q9' },
  q9: { main: true, title: 'Kai\'s Road', desc: 'Help Kai open a shop, or sell the plan to Vex. You only get this choice once.', type: 'flagAny', flags: ['kaiFree', 'kaiSold'], reward: { xp: 150 } },
  q10: { main: true, title: 'The Weld', desc: 'Lola archives the night circuit. Ask her what is wrong with the Phantom\'s car.', type: 'talk', npc: 'lola', reward: { xp: 120 }, next: 'q11' },
  q11: { main: true, title: 'A Retired Name', desc: 'Old Tom knew a champion named Maggie Voss. Ask him before the highway does.', type: 'flag', flag: 'tomClue', reward: { xp: 120, respect: 2 }, next: 'q12' },
  q12: { main: true, title: 'Ask the Garage', desc: 'Take the name Maggie Voss back to Mags. She may not answer. Ask anyway.', type: 'flag', flag: 'magsAsked', reward: { xp: 150, respect: 3 } },
  s1: { title: 'Smoke Show', desc: 'Score 4000+ in a Drift Challenge.', type: 'driftScore', target: 4000, reward: { money: 600, xp: 150, part: 'rare' } },
  s2: { title: 'Clean Hands', desc: 'Podium a race taking less than 10% damage.', type: 'cleanPodium', reward: { money: 500, xp: 120 } },
  s3: { title: 'Ghost Story', desc: 'Win a Beat the Ghost event.', type: 'ghostWin', reward: { money: 700, xp: 150 } },
  s4: { title: 'Last One Standing', desc: 'Win an Elimination race.', type: 'elimWin', reward: { money: 900, xp: 200, part: 'rare' } },
  s5: { title: 'Practice Makes Perfect', desc: 'Complete 3 Training Track sessions.', type: 'training', target: 3, reward: { money: 400, xp: 150 } },
  s6: { title: 'Speed Demon', desc: 'Hit 300 km/h in any race.', type: 'speed', target: 300, reward: { money: 1500, xp: 300, part: 'epic' } }
};

/* Bar NPCs, rival arcs, and story scenes are built in story.js so this file
   stays the rules and catalogs. story.js assigns RL.NPCS. */
RL.NPCS = RL.NPCS || {};

/* ---------- Achievements ---------- */
RL.ACHIEVEMENTS = [
  { id: 'first_race', name: 'Green Light', desc: 'Finish your first race.' },
  { id: 'first_win', name: 'Taste of Victory', desc: 'Win a race.' },
  { id: 'drift_2000', name: 'Sideways', desc: 'Score 2000 drift points in one race.' },
  { id: 'nitro_60', name: 'Nitro Junkie', desc: 'Use 60 seconds of nitro in total.' },
  { id: 'draft_30', name: 'In the Pocket', desc: 'Slipstream for 30 seconds in total.' },
  { id: 'crash_50', name: 'Crash Test Dummy', desc: 'Crash 50 times.' },
  { id: 'clean_win', name: 'Spotless', desc: 'Win a race without hitting a wall.' },
  { id: 'comeback', name: 'Comeback Kid', desc: 'Win after being in last place.' },
  { id: 'cars_4', name: 'Collector', desc: 'Own 4 cars.' },
  { id: 'legendary', name: 'Shiny!', desc: 'Obtain a Legendary part.' },
  { id: 'level_10', name: 'Seasoned', desc: 'Reach driver level 10.' },
  { id: 'perks_5', name: 'Specialist', desc: 'Unlock 5 perks.' },
  { id: 'rich', name: 'Big Money', desc: 'Hold $50,000 at once.' },
  { id: 'league_2', name: 'Out of the Streets', desc: 'Reach League 2.' },
  { id: 'league_3', name: 'Mountain Bound', desc: 'Reach League 3.' },
  { id: 'league_4', name: 'Neon Dreams', desc: 'Reach League 4.' },
  { id: 'ghostbuster', name: 'Ghostbuster', desc: 'Beat a ghost.' },
  { id: 'survivor', name: 'Survivor', desc: 'Win an Elimination race.' },
  { id: 'legend', name: 'Redline Legend', desc: 'Defeat The Phantom.' }
];

/* XP needed to go from level L to L+1 */
RL.xpForLevel = function (l) { return Math.round(120 * Math.pow(l, 1.35)); };
