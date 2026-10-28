/* data.js — Static design data for Redline Legends 3D.
   Ported from the 2D game (cars, parts, perks, tracks, leagues, bosses,
   quests, dialogue, achievements) plus 3D-only events and achievements.
   No simulation lives here. */

export const RL = {};

/* data.js - Static game data for Redline Legends: cars, parts, perks, tracks,
   leagues, side events, quests, NPC dialogue and achievements. No logic beyond
   small helpers lives here. */

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
  quarter: { name: 'Quarter Mile', theme: 'city', width: 200, grass: 40, open: true, weather: ['clear'], times: ['day', 'night'],
    pts: [[100, 500], [600, 500], [1100, 500], [1600, 500], [2100, 500]] },
  half: { name: 'Half Mile', theme: 'city', width: 200, grass: 40, open: true, weather: ['clear'], times: ['day', 'night'],
    pts: [[100, 500], [600, 500], [1100, 500], [1600, 500], [2100, 500], [2600, 500], [3100, 500], [3600, 500], [4100, 500]] }
};

/* ---------- AI rival roster & personalities ---------- */
RL.PERSONALITIES = {
  clean:      { name: 'Clean',         lane: 0.15, bump: 0,   nitroUse: 0.35 },
  aggressive: { name: 'Aggressive',    lane: 0.3,  bump: 1,   nitroUse: 0.5 },
  nitro:      { name: 'Nitro-Spammer', lane: 0.25, bump: 0.3, nitroUse: 1 }
};
RL.RIVAL_NAMES = ['Jinx', 'Rook', 'Turbo Tia', 'Mack', 'Neko', 'Blaze', 'Dex', 'Sparky', 'Lola', 'Vince', 'Kai', 'Roxy', 'Zed', 'Pike', 'Nova'];

/* ---------- Leagues: 3 races + a boss each. ai = AI skill multiplier ---------- */
RL.LEAGUES = [
  { id: 1, name: 'Street Rookies', color: '#7dff5a', ai: 0.80, aiBonus: 0,  cars: ['pip', 'kei', 'coupe'], prize: 300,
    races: [{ track: 'docklands', name: 'Harbor Sprint' }, { track: 'downtown', name: 'Rush Hour' }, { track: 'docklands', name: 'Container Run', reverse: true }],
    boss: { name: 'Brick Malone', car: 'coupe', track: 'downtown', gimmick: 'blocker', color: '#ff8a2e', desc: 'Brick blocks the racing line when you get behind him.' } },
  { id: 2, name: 'Desert Outlaws', color: '#ff8a2e', ai: 0.9, aiBonus: 8, cars: ['brute', 'dragon', 'raptor', 'coupe'], prize: 800,
    races: [{ track: 'mesa', name: 'Mesa Mirage' }, { track: 'dunes', name: 'Sandblaster' }, { track: 'mesa', name: 'Canyon Echo' }],
    boss: { name: 'Sidewinder Sal', car: 'raptor', track: 'dunes', gimmick: 'magnet', color: '#ffe03b', desc: 'Sal gets faster the closer you get to her.' } },
  { id: 3, name: 'Mountain Kings', color: '#3fa9ff', ai: 0.98, aiBonus: 16, cars: ['euro', 'fox', 'neongt', 'raptor'], prize: 2000,
    races: [{ track: 'frostbite', name: 'Frostbite' }, { track: 'glacier', name: 'Icebreaker' }, { track: 'frostbite', name: 'Avalanche' }],
    boss: { name: 'Vex (Vipers Crew)', car: 'neongt', track: 'glacier', gimmick: 'nitro', color: '#7dff5a', desc: 'Vex fires a fresh nitro burst every few seconds.' } },
  { id: 4, name: 'Neon Legends', color: '#ff2ef0', ai: 1.06, aiBonus: 26, cars: ['thunder', 'apex', 'neongt', 'vortex'], prize: 5000,
    races: [{ track: 'highway', name: 'Lightspeed' }, { track: 'spiral', name: 'Midnight Coil' }, { track: 'highway', name: 'Afterglow' }],
    boss: { name: 'The Phantom', car: 'vortex', track: 'spiral', gimmick: 'phantom', color: '#ffffff', desc: 'The Phantom blocks your line AND speeds up when you are close. Final showdown.' } }
];

/* ---------- Side events (Race Office) ---------- */
RL.SIDE_EVENTS = [
  { id: 'tt',    type: 'timetrial',   name: 'Time Trial',      desc: 'Solo run. Beat the par time over 3 laps.', icon: '⏱' },
  { id: 'drift', type: 'drift',       name: 'Drift Challenge', desc: 'Solo run. Score drift points over 3 laps.', icon: '〰' },
  { id: 'elim',  type: 'elimination', name: 'Elimination',     desc: 'Last place is knocked out each time the leader completes a lap.', icon: '✖' },
  { id: 'ghost', type: 'ghost',       name: 'Beat the Ghost',  desc: 'Race your best recorded run (or a pro ghost).', icon: '👻' }
];

/* ---------- Quests: main story + side quests ---------- */
RL.QUESTS = {
  m1: { main: true, title: 'A Nobody With Wheels', desc: 'Finish in the top 3 of any League 1 race.', type: 'podium', league: 1, reward: { money: 300, xp: 80 }, next: 'm2' },
  m2: { main: true, title: 'Through the Brick Wall', desc: 'Win all League 1 races and beat Brick Malone.', type: 'boss', league: 1, reward: { money: 800, xp: 200 }, next: 'm3' },
  m3: { main: true, title: 'Viper\'s Nest', desc: 'Visit the Bar and talk to Vex of the Vipers crew.', type: 'talk', npc: 'vex', reward: { xp: 100 }, next: 'm4' },
  m4: { main: true, title: 'Desert Storm', desc: 'Beat Sidewinder Sal in the Desert Outlaws league.', type: 'boss', league: 2, reward: { money: 2000, xp: 500 }, next: 'm5' },
  m5: { main: true, title: 'Cold Blood', desc: 'Take down Vex on the Glacier Hairpins.', type: 'boss', league: 3, reward: { money: 5000, xp: 1000 }, next: 'm6' },
  m6: { main: true, title: 'The Phantom', desc: 'Final showdown: beat The Phantom and become a legend.', type: 'boss', league: 4, reward: { money: 20000, xp: 3000 } },
  s1: { title: 'Smoke Show', desc: 'Score 4000+ in a Drift Challenge.', type: 'driftScore', target: 4000, reward: { money: 600, xp: 150, part: 'rare' } },
  s2: { title: 'Clean Hands', desc: 'Podium a race taking less than 10% damage.', type: 'cleanPodium', reward: { money: 500, xp: 120 } },
  s3: { title: 'Ghost Story', desc: 'Win a Beat the Ghost event.', type: 'ghostWin', reward: { money: 700, xp: 150 } },
  s4: { title: 'Last One Standing', desc: 'Win an Elimination race.', type: 'elimWin', reward: { money: 900, xp: 200, part: 'rare' } },
  s5: { title: 'Practice Makes Perfect', desc: 'Complete 3 Training Track sessions.', type: 'training', target: 3, reward: { money: 400, xp: 150 } },
  s6: { title: 'Speed Demon', desc: 'Hit 300 km/h in any race.', type: 'speed', target: 300, reward: { money: 1500, xp: 300, part: 'epic' } }
};

/* ---------- Bar NPCs and their dialogue trees ----------
   Each node: text, choices [{t, effects:{money,respect,quest,xp,flag}, next}] */
RL.NPCS = {
  mags: { name: 'Mags (Mechanic)', color: '#ffe03b', start: 'm0', nodes: {
    m0: { text: 'Kid, every legend starts in a junk hatchback. Want some advice or some cash for parts?', choices: [
      { t: 'Advice, please. (+Respect)', effects: { respect: 5 }, next: 'm1' },
      { t: 'Cash. I need parts. (+$150)', effects: { money: 150, flag: 'magsCash' }, next: 'm2' },
      { t: 'Got any work for me?', effects: { quest: 's4' }, next: 'm3' }] },
    m1: { text: 'Drift through corners to fill nitro, then fire it on straights. And stay out of the walls - repairs are NOT free.', choices: [{ t: 'Got it.', next: null }] },
    m2: { text: 'Here. Don\'t blow it all on paint.', choices: [{ t: 'Thanks, Mags.', next: null }] },
    m3: { text: 'Elimination races separate the brave from the broke. Win one and I\'ll make it worth your while.', choices: [{ t: 'You\'re on.', next: null }] } } },
  dana: { name: 'Drift Dana', color: '#ff3b6b', start: 'd0', nodes: {
    d0: { text: 'You call that sliding? I\'ve seen shopping carts with more angle.', choices: [
      { t: 'Teach me then.', effects: { quest: 's1', respect: 2 }, next: 'd1' },
      { t: 'Bet you $100 I can out-drift you someday.', effects: { quest: 's1', flag: 'danaBet' }, next: 'd2' }] },
    d1: { text: 'Hold the drift button into the turn, counter-steer out. Score 4000 in a Drift Challenge and I\'ll hook you up.', choices: [{ t: 'Deal.', next: null }] },
    d2: { text: 'Ha! Score 4000 in a Drift Challenge first, rookie.', choices: [{ t: 'Watch me.', next: null }] } } },
  tom: { name: 'Old Tom', color: '#c9d1d9', start: 't0', nodes: {
    t0: { text: 'Back in my day we raced clean. No smashing, no cheap shots. Rumor is the Phantom has never been touched in a race.', choices: [
      { t: 'Tell me about the Phantom.', next: 't1' },
      { t: 'Clean racing? I can do that.', effects: { quest: 's2', respect: 3 }, next: 't2' },
      { t: 'Any rumors worth money?', effects: { quest: 's6' }, next: 't3' }] },
    t1: { text: 'Nobody knows who they are. They only show up for the Neon Legends final. Some say it\'s a ghost. Some say it\'s a washed-up champ.', choices: [{ t: 'Spooky.', effects: { quest: 's3' }, next: null }] },
    t2: { text: 'Podium a race with barely a scratch and I\'ll believe it.', choices: [{ t: 'Count on it.', next: null }] },
    t3: { text: 'A rich collector pays big for anyone who clocks 300 km/h. You\'ll need a serious car and nitro.', choices: [{ t: 'Noted.', next: null }] } } },
  kim: { name: 'Coach Kim', color: '#7dff5a', start: 'k0', nodes: {
    k0: { text: 'The Training Track is free. Laps = XP. Three sessions and you\'ll feel the difference.', choices: [
      { t: 'I\'ll put in the work.', effects: { quest: 's5', respect: 2 }, next: null },
      { t: 'Can\'t you just pay me to show up?', effects: { quest: 's5', money: 50 }, next: 'k1' }] },
    k1: { text: '...Fine. Fifty bucks. Now go practice.', choices: [{ t: 'Pleasure doing business.', next: null }] } } },
  vex: { name: 'Vex (Vipers Crew)', color: '#7dff5a', requires: 'leagueBoss1', start: 'v0', nodes: {
    v0: { text: 'So you\'re the nobody who embarrassed Brick. The Vipers run this city. Join us - throw a race now and then, I\'ll pay you $1500 right now.', choices: [
      { t: 'Take the money. (+$1500, -Respect)', effects: { money: 1500, respect: -10, flag: 'vexDeal', talk: 'vex' }, next: 'v1' },
      { t: 'I don\'t throw races. (+Respect)', effects: { respect: 15, flag: 'vexRefused', talk: 'vex' }, next: 'v2' }] },
    v1: { text: 'Smart. But don\'t think that buys you a win against me in the mountains.', choices: [{ t: '...', next: null }] },
    v2: { text: 'Bold. Then I\'ll see you on the ice, and I won\'t be holding back.', choices: [{ t: 'Neither will I.', next: null }] } } },
  rita: { name: 'Rumor Rita', color: '#c86bff', start: 'r0', nodes: {
    r0: { text: 'Psst. The ghost on the Race Office board? It\'s YOUR best run. Beat yourself and you\'ll beat anyone.', choices: [
      { t: 'Interesting... (+Ghost quest)', effects: { quest: 's3' }, next: null },
      { t: 'What else have you heard?', next: 'r1' }] },
    r1: { text: 'Rain cuts your grip hard. Snow even worse. Tires with good Grip make all the difference.', choices: [{ t: 'Thanks, Rita.', effects: { respect: 1 }, next: null }] } } }
};

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

/* ---------- 3D extras: street challenges, drag, added achievements ---------- */
RL.DRAG = {
  distance: 402.336,          // quarter mile, meters
  gears: 5,
  /* fraction of top speed at which each gear hits redline */
  redlineAt: [0.18, 0.34, 0.52, 0.72, 0.9, 1.0]
};
RL.STREET_CHALLENGES = [
  { id: 'harbor', name: 'Harbor Dash', blurb: 'A dockside blast. First to the cranes.', league: 1, reward: 1 },
  { id: 'grid', name: 'Gridiron', blurb: 'Cut through downtown. Don\'t miss a gate.', league: 2, reward: 1.4 },
  { id: 'neonrun', name: 'Neon Run', blurb: 'Night-favored loop around the bar district.', league: 3, reward: 1.8 },
  { id: 'outer', name: 'Outer Belt', blurb: 'Long and fast. One mistake and they are gone.', league: 4, reward: 2.4 }
];
RL.ACHIEVEMENTS = RL.ACHIEVEMENTS.concat([
  { id: 'quarter_king', name: 'Quarter King', desc: 'Win a quarter-mile drag.' },
  { id: 'perfect_shift', name: 'Wrist of a Watchmaker', desc: 'Land 3 perfect shifts in one drag race.' },
  { id: 'escape', name: 'Lost Them', desc: 'Escape a police chase.' },
  { id: 'shutter', name: 'Lights, Camera', desc: 'Take a photo in photo mode.' },
  { id: 'street_king', name: 'Street King', desc: 'Win a street challenge discovered in the city.' },
  { id: 'night_owl', name: 'After Hours', desc: 'Drive the city between midnight and 4 AM.' },
  { id: 'heat_5', name: 'Five Stars', desc: 'Reach a 5-star wanted level.' },
  { id: 'clean_getaway', name: 'Clean Getaway', desc: 'Lose a 4-star chase or worse.' },
  { id: 'impounded', name: 'Impound Lot', desc: 'Get the car impounded.' },
  { id: 'heist_done', name: 'Till Tap', desc: 'Finish a criminal heist.' },
  { id: 'mule', name: 'Mule', desc: 'Finish a smuggling delivery.' },
  { id: 'badge', name: 'On the Job', desc: 'Bust 3 suspects as police.' },
  { id: 'turncoat', name: 'New Badge', desc: 'Switch roles at HQ.' },
  { id: 'kingpin', name: 'Kingpin', desc: 'Reach Kingpin rank as a criminal.' },
  { id: 'sergeant', name: 'Sergeant', desc: 'Reach Sergeant as police.' },
  { id: 'custom_win', name: 'House Rules', desc: 'Win a custom race.' },
  { id: 'track_builder', name: 'Surveyor', desc: 'Save a track from the editor.' },
  { id: 'writeoff', name: 'Write-Off', desc: 'Total a car. The fireball is free. The clock and the tow are not.' }
]);
