/* city-data.js - Hub map: districts, roads, landmarks, tags, NPCs, and the
   built city (blocks, parks, sidewalks). Paint is static scenery. Driving and
   wanted live in drive.js / wanted.js. Downtown's original doors stay put.
   Scenic blocks are solids only. Named buildings in `buildings` are enterable. */
(function () {
  const T = 40, COLS = 96, ROWS = 68;
  const roads = [
    { x: 1, y: 8, w: 32, h: 3, limit: 70, axis: 'h' },
    { x: 33, y: 8, w: 31, h: 3, limit: 90, axis: 'h' },
    { x: 64, y: 8, w: 31, h: 3, limit: 90, axis: 'h' },
    { x: 1, y: 20, w: 94, h: 2, limit: 70, axis: 'h' },
    { x: 1, y: 34, w: 94, h: 3, limit: 100, axis: 'h' },
    { x: 4, y: 48, w: 88, h: 2, limit: 80, axis: 'h' },
    { x: 2, y: 60, w: 92, h: 3, limit: 160, axis: 'h' },
    { x: 10, y: 1, w: 2, h: 66, limit: 70, axis: 'v' },
    { x: 20, y: 8, w: 2, h: 58, limit: 70, axis: 'v' },
    { x: 40, y: 6, w: 2, h: 60, limit: 80, axis: 'v' },
    { x: 58, y: 6, w: 2, h: 58, limit: 80, axis: 'v' },
    { x: 74, y: 6, w: 2, h: 58, limit: 80, axis: 'v' }
  ];
  /* Mirrors hub.js footprints so fill does not pave over the original doors. */
  const HUB_BLOCKS = [
    { id: 'garage', x: 2, y: 2, w: 7, h: 5 },
    { id: 'office', x: 12, y: 2, w: 8, h: 5 },
    { id: 'shop', x: 23, y: 2, w: 7, h: 5 },
    { id: 'bar', x: 2, y: 14, w: 7, h: 5 },
    { id: 'training', x: 21, y: 13, w: 9, h: 7 },
    { id: 'plaza-fountain', x: 14, y: 14, w: 3, h: 3 }
  ];
  const buildings = [
    { id: 'warehouse', name: 'HARBOR CO', x: 33, y: 2, w: 6, h: 5, color: '#3fa9ff', roof: '#1c3348', legend: 'crime', purpose: 'Smuggle cargo' },
    { id: 'bank', name: 'NEON BANK', x: 46, y: 2, w: 8, h: 5, color: '#ffb02e', roof: '#3a3420', legend: 'crime', purpose: 'Bank heist' },
    { id: 'customs', name: 'CUSTOMS', x: 64, y: 2, w: 8, h: 5, color: '#ff2ef0', roof: '#3a1848', legend: 'shop', purpose: 'Paint and style' },
    { id: 'hq', name: 'ROLE HQ', x: 1, y: 28, w: 8, h: 6, color: '#7aa2ff', roof: '#1a2744', legend: 'police', purpose: 'Switch lives' },
    { id: 'mart', name: 'QUICK MART', x: 22, y: 28, w: 6, h: 5, color: '#7dff5a', roof: '#1d3324', legend: 'crime', purpose: 'Corner heist' },
    { id: 'hospital', name: 'HOSPITAL', x: 48, y: 28, w: 7, h: 6, color: '#ff5a7a', roof: '#3a1824', legend: 'heal', purpose: 'Patch HP' },
    { id: 'gas', name: 'NITRO FUEL', x: 66, y: 28, w: 7, h: 5, color: '#ff8a2e', roof: '#3a2818', legend: 'heal', purpose: 'Patch damage' },
    { id: 'dragway', name: 'DRAGWAY', x: 44, y: 54, w: 12, h: 5, color: '#ff3b6b', roof: '#3a1824', legend: 'race', purpose: 'Quarter-mile drags' },
    { id: 'vista', name: 'VISTA', x: 80, y: 42, w: 6, h: 5, color: '#ffe03b', roof: '#33301c', legend: 'story', purpose: 'Photo overlook' }
  ];
  const services = [
    { id: 'dealer', name: 'DEALER', x: 54, y: 2, w: 4, h: 6, color: '#7dff5a', roof: '#16301c', legend: 'shop', purpose: 'Buy cars' },
    { id: 'chandler', name: 'PARTS', x: 49, y: 15, w: 8, h: 5, color: '#3fa9ff', roof: '#14283a', legend: 'shop', purpose: 'Buy parts' },
    { id: 'precinct', name: 'PRECINCT', x: 32, y: 43, w: 7, h: 5, color: '#7aa2ff', roof: '#1a2744', legend: 'police', purpose: 'Police dispatch' },
    { id: 'chop', name: 'CHOP SHOP', x: 30, y: 29, w: 8, h: 5, color: '#ff3b6b', roof: '#3a1824', legend: 'crime', purpose: 'Chop heist' },
    { id: 'scrap', name: 'SCRAP', x: 2, y: 43, w: 7, h: 5, color: '#ff8a2e', roof: '#3a2818', legend: 'shop', purpose: 'Sell parts' },
    { id: 'impound', name: 'IMPOUND', x: 12, y: 43, w: 7, h: 5, color: '#9bb6ff', roof: '#1a2744', legend: 'police', purpose: 'Clear cold heat' },
    { id: 'lockup', name: 'LOCKUP', x: 42, y: 29, w: 6, h: 5, color: '#c86bff', roof: '#2a1840', legend: 'crime', purpose: 'Phantom stash' },
    { id: 'hall', name: 'CITY HALL', x: 60, y: 28, w: 6, h: 6, color: '#ffe03b', roof: '#3a3420', legend: 'story', purpose: 'District guide' },
    { id: 'diner', name: 'DINER', x: 76, y: 3, w: 4, h: 5, color: '#ffb02e', roof: '#3a2818', legend: 'heal', purpose: 'Small repair' },
    { id: 'meetup', name: 'MEETUP', x: 66, y: 15, w: 7, h: 5, color: '#ff2ef0', roof: '#3a1848', legend: 'race', purpose: 'Street race' },
    { id: 'club', name: 'VOLTAGE', x: 78, y: 15, w: 6, h: 5, color: '#ff2ef0', roof: '#301030', legend: 'race', purpose: 'Street race' },
    { id: 'clinic', name: 'HOSPITAL', x: 78, y: 29, w: 8, h: 5, color: '#ff8ad0', roof: '#3a1824', legend: 'heal', purpose: 'Full repair' },
    { id: 'pitmeet', name: 'PIT LANE', x: 12, y: 50, w: 8, h: 4, color: '#ff3b6b', roof: '#3a1824', legend: 'race', purpose: 'Drag meetup' },
    { id: 'safehouse', name: 'SAFEHOUSE', x: 62, y: 43, w: 6, h: 5, color: '#c86bff', roof: '#241428', legend: 'crime', purpose: 'Hideout heist' }
  ];
  services.forEach((b) => buildings.push(b));
  const solids = [
    { x: 80, y: 0, w: 6, h: 6, kind: 'water' }, { x: 90, y: 0, w: 6, h: 6, kind: 'water' },
    { x: 4, y: 57, w: 6, h: 2, kind: 'stand' }, { x: 12, y: 57, w: 6, h: 2, kind: 'stand' }, { x: 22, y: 57, w: 16, h: 2, kind: 'stand' }, { x: 42, y: 57, w: 14, h: 2, kind: 'stand' }, { x: 60, y: 57, w: 12, h: 2, kind: 'stand' }, { x: 76, y: 57, w: 14, h: 2, kind: 'stand' },
    { x: 4, y: 64, w: 6, h: 3, kind: 'stand' }, { x: 12, y: 64, w: 8, h: 3, kind: 'stand' }, { x: 24, y: 64, w: 14, h: 3, kind: 'stand' }, { x: 42, y: 64, w: 14, h: 3, kind: 'stand' }, { x: 60, y: 64, w: 12, h: 3, kind: 'stand' }, { x: 78, y: 64, w: 14, h: 3, kind: 'stand' },
    { x: 50, y: 38, w: 3, h: 3, kind: 'clock' }, { x: 86, y: 40, w: 2, h: 2, kind: 'statue' },
    { x: 36, y: 15, w: 2, h: 2, kind: 'cargo' }, { x: 37, y: 17, w: 2, h: 2, kind: 'cargo' },
    { x: 33, y: 12, w: 2, h: 2, kind: 'cargo' }, { x: 34, y: 16, w: 2, h: 2, kind: 'cargo' }
  ];
  const districts = [
    { id: 'downtown', name: 'Downtown', x: 0, y: 0, w: 32, h: 24, color: '#2ee6ff', blurb: 'Where every nobody starts.', purpose: 'Garage, shop, race office, bar, training' },
    { id: 'harbor', name: 'Harbor', x: 32, y: 0, w: 32, h: 24, color: '#3fa9ff', blurb: 'Cranes, salt air, and quiet money.', purpose: 'Dealership, parts, smuggling, bank' },
    { id: 'neon', name: 'Neon Mile', x: 64, y: 0, w: 32, h: 24, color: '#ff2ef0', blurb: 'The lights never go out.', purpose: 'Street meets, customs, diner' },
    { id: 'industrial', name: 'Industrial', x: 0, y: 24, w: 40, h: 24, color: '#ff8a2e', blurb: 'Warehouses, warrants, and side bets.', purpose: 'Precinct, chop shop, scrap, impound' },
    { id: 'oldtown', name: 'Old Town', x: 40, y: 24, w: 28, h: 24, color: '#ffe03b', blurb: 'Clock tower, crooked alleys, hidden tags.', purpose: 'City hall, hideouts, the stopped clock' },
    { id: 'heights', name: 'The Heights', x: 68, y: 24, w: 28, h: 24, color: '#7dff5a', blurb: 'Best view in Redline City.', purpose: 'Hospital, vista, fuel' },
    { id: 'dragway', name: 'Redline Dragway', x: 0, y: 52, w: 96, h: 16, color: '#ff3b6b', blurb: 'Thirteen hundred and twenty feet of truth.', purpose: 'Drag strip and pit meetup' }
  ];
  const landmarks = [
    { id: 'light', name: 'Harbor Lighthouse', x: 88 * T, y: 3 * T, r: 70, text: 'The lamp still sweeps the inlet. Racers use it as a marker when the fog rolls in.' },
    { id: 'arch', name: 'Neon Arch', x: 70 * T, y: 9.5 * T, r: 80, text: 'The arch marks the Neon Mile. Photos taken under it at night are a city tradition. The Phantom\'s first public win was shot from this curb.' },
    { id: 'clock', name: 'Old Town Clock', x: 51.5 * T, y: 39.5 * T, r: 70, text: 'Stopped at 11:07 the night the Phantom first won the spiral. Nobody reset it. City Hall still calls that minute the real founding.' },
    { id: 'statue', name: 'Founders Statue', x: 87 * T, y: 41 * T, r: 64, text: 'A bronze driver with no face. The plaque just says "EARN IT". The Heights hospital is the door if the plaque wins.' },
    { id: 'tower', name: 'Dragway Tower', x: 8 * T, y: 61.5 * T, r: 70, text: 'The tower opens the same straight as the dragway. Quarter mile or half mile, finish line at the far end. Pit Lane posts the street meets.' },
    { id: 'fountain', name: 'Plaza Fountain', x: 15.5 * T, y: 15.5 * T, r: 70, text: 'Downtown\'s meeting spot. Coins in the water are bad luck. Respect is the real currency.' },
    { id: 'cranes', name: 'Container Cranes', x: 37 * T, y: 16 * T, r: 74, text: 'Harbor Co. moves more than cargo after midnight. The chandlery next door sells parts. The dealer up the quay sells the car to put them on.' },
    { id: 'plaza', name: 'Bank Plaza', x: 50 * T, y: 6 * T, r: 60, text: 'Marble, cameras, and a vault that has never been politely opened.' }
  ];
  const collectibles = [
    { id: 't1', x: 220, y: 70 }, { id: 't2', x: 64, y: 680 }, { id: 't3', x: 1240, y: 160 },
    { id: 't4', x: 1280, y: 940 }, { id: 't5', x: 1500, y: 560 }, { id: 't6', x: 2480, y: 560 },
    { id: 't7', x: 3520, y: 150 }, { id: 't8', x: 600, y: 1240 }, { id: 't9', x: 1960, y: 1680 },
    { id: 't10', x: 3480, y: 1760 }, { id: 't11', x: 280, y: 2480 }, { id: 't12', x: 2700, y: 70 }
  ];
  const npcs = [
    { id: 'rex', name: 'Rex', color: '#ff8a2e', x: 1520, y: 300, title: 'Strip regular', lines: ['Quarter mile is east, then south to the dragway. Rev, release on green, shift when the tach kisses red.', 'Gear ratios live in the booth. Short gears launch. Long gears trap.'] },
    { id: 'kane', name: 'Officer Kane', color: '#7aa2ff', x: 480, y: 1280, title: 'Patrol', lines: ['Stars don\'t cool while we can see you. Break line of sight, then hide.', 'Role HQ is the blue building. The precinct south of King Blvd starts police calls. Neutral, criminal, or a badge. A wanted star pulls the badge and locks the next role change for 5 minutes.', 'Big offenses light you up: reds, wrecks, street races. Mild speeding we let slide unless you\'re already dirty.'] },
    { id: 'mira', name: 'Mira', color: '#ff2ef0', x: 2860, y: 300, title: 'Street racer', lines: ['Night or not, I\'ll run you to the arch and back. Cops will notice.', 'Meetup and Voltage post the same run. Pink slips are a story. The bounty for escaping is real.'] },
    { id: 'patch', name: 'Patch', color: '#c86bff', x: 2100, y: 940, title: 'Tagger', lines: ['Neon tags in the alleys and the parks. Some you can nose the car up to. Some you walk.', 'Old Town clock hides one. The pier hides another.'] },
    { id: 'jo', name: 'Jo', color: '#ffe03b', x: 3280, y: 1888, title: 'Photographer', lines: ['Press F for photo mode. Arrows pan, C cycles filters, Enter snaps.', 'The arch at night is the shot everyone wants. Vista, behind me, is the overlook.'] },
    { id: 'slim', name: 'Slim', color: '#7dff5a', x: 1400, y: 2460, title: 'Tuner', lines: ['Final drive is the whole ET. Higher number launches harder and dies on the top end.', 'Perfect shift is the last sliver before the limiter. Early and you bog. Pit Lane has the street meets if the strip is booked.'] },
    { id: 'vick', name: 'Vick', color: '#ff3b6b', x: 1700, y: 300, title: 'Fixer', lines: ['Bank and Quick Mart pay if you\'re criminal. Then you run.', 'Harbor Co. loads smugglers. Deliver to the Neon Mile drop before the clock dies.', 'Chop Shop and the Old Town lockup are for people who already picked a side. Come back wearing the wrong life and I sell you nothing but weather.'] }
  ];

  const parks = [
    { id: 'plaza', name: 'Plaza Park', district: 'downtown', x: 13, y: 12, w: 7, h: 8 },
    { id: 'harbor', name: 'Harbor Green', district: 'harbor', x: 43, y: 12, w: 5, h: 7 },
    { id: 'neon', name: 'Neon Court', district: 'neon', x: 86, y: 12, w: 8, h: 7 },
    { id: 'rust', name: 'Rust Park', district: 'industrial', x: 23, y: 38, w: 8, h: 8 },
    { id: 'square', name: 'Old Town Square', district: 'oldtown', x: 48, y: 40, w: 10, h: 7 },
    { id: 'vista', name: 'Heights Park', district: 'heights', x: 77, y: 37, w: 12, h: 9 },
    { id: 'paddock', name: 'Paddock Lawn', district: 'dragway', x: 22, y: 50, w: 10, h: 4 }
  ];

  const LOT = {
    downtown: '#1a222c', harbor: '#162430', neon: '#1c1224', industrial: '#241e18',
    oldtown: '#262218', heights: '#15241c', dragway: '#24161c'
  };
  const ROOFS = {
    downtown: ['#24304a', '#1c2838', '#2c3548'],
    harbor: ['#1c3348', '#163044', '#243848'],
    neon: ['#3a1848', '#2a1038', '#401848'],
    industrial: ['#3a2818', '#2a2418', '#3a3020'],
    oldtown: ['#3a3420', '#2e2818', '#403828'],
    heights: ['#1d3324', '#16301c', '#243828'],
    dragway: ['#3a1824', '#2a1820', '#401820']
  };
  const TRIMS = {
    downtown: '#2ee6ff', harbor: '#3fa9ff', neon: '#ff2ef0', industrial: '#ff8a2e',
    oldtown: '#ffe03b', heights: '#7dff5a', dragway: '#ff3b6b'
  };
  const SIGNS = ['LOFTS', 'FLATS', 'HOTEL', 'ANNEX', 'ROW', 'DEPOT', 'YARD', 'WORKS', 'LOUNGE', 'ARCADE', 'MARKET', 'BLOCK', 'COURT', 'RADIO', 'PRINT', 'DELI', 'INN', 'SUITES', 'MILL', 'PLANT', 'BAY', 'DOCKS', 'LOTS', 'OFFICE', 'STORAGE', 'BAKERY'];
  const SIZES = [[7, 4], [6, 4], [5, 4], [6, 3], [5, 3], [4, 4], [4, 3], [8, 3], [3, 4], [3, 3], [5, 5], [6, 5]];

  const scenery = [];
  const trees = [];
  const benches = [];
  const fountains = [];
  const lamps = [];
  const sidewalks = [];
  let placeErrors = [];

  function buildMask() {
    const mask = new Uint8Array(COLS * ROWS);
    roads.forEach((r) => {
      for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) {
        if (x >= 0 && y >= 0 && x < COLS && y < ROWS) mask[y * COLS + x] = r.limit;
      }
    });
    return mask;
  }
  function buildLights() {
    const lights = [];
    for (let i = 0; i < roads.length; i++) for (let j = i + 1; j < roads.length; j++) {
      const a = roads[i], b = roads[j];
      if (a.axis === b.axis) continue;
      const x1 = Math.max(a.x, b.x), y1 = Math.max(a.y, b.y);
      const x2 = Math.min(a.x + a.w, b.x + b.w), y2 = Math.min(a.y + a.h, b.y + b.h);
      if (x2 - x1 >= 2 && y2 - y1 >= 2) lights.push({ x: x1, y: y1, w: x2 - x1, h: y2 - y1, offset: lights.length * 1.37 });
    }
    return lights;
  }
  function buildLanes() {
    const lanes = [];
    roads.forEach((r) => {
      if (r.axis === 'h') {
        const yA = (r.y + 0.5) * T, yB = (r.y + r.h - 0.5) * T;
        const x1 = (r.x + 0.4) * T, x2 = (r.x + r.w - 0.4) * T;
        lanes.push({ x1, y1: yA, x2, y2: yA, limit: r.limit, axis: 'h' });
        lanes.push({ x1: x2, y1: yB, x2: x1, y2: yB, limit: r.limit, axis: 'h' });
      } else {
        const xA = (r.x + 0.5) * T, xB = (r.x + r.w - 0.5) * T;
        const y1 = (r.y + 0.4) * T, y2 = (r.y + r.h - 0.4) * T;
        lanes.push({ x1: xA, y1, x2: xA, y2, limit: r.limit, axis: 'v' });
        lanes.push({ x1: xB, y1: y2, x2: xB, y2: y1, limit: r.limit, axis: 'v' });
      }
    });
    return lanes;
  }

  /* Light cycle: 0-4.2 EW green, 4.2-5 yellow, 5-9.2 NS green, 9.2-10 yellow. */
  function lightPhase(light, time) {
    const c = ((time + light.offset) % 10 + 10) % 10;
    if (c < 4.2) return { ew: 'green', ns: 'red' };
    if (c < 5) return { ew: 'yellow', ns: 'red' };
    if (c < 9.2) return { ew: 'red', ns: 'green' };
    return { ew: 'red', ns: 'yellow' };
  }

  const mask = buildMask();
  const lights = buildLights();
  const lanes = buildLanes();
  const use = new Uint8Array(COLS * ROWS);
  const clear = new Uint8Array(COLS * ROWS);

  function at(x, y) { return y * COLS + x; }
  function inside(x, y) { return x >= 0 && y >= 0 && x < COLS && y < ROWS; }
  function districtAtTile(x, y) {
    for (let i = 0; i < districts.length; i++) {
      const d = districts[i];
      if (x >= d.x && y >= d.y && x < d.x + d.w && y < d.y + d.h) return d;
    }
    return null;
  }
  function markRect(x, y, w, h, val) {
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) if (inside(xx, yy)) use[at(xx, yy)] = val;
  }
  function stamp(px, py, rad) {
    const x0 = Math.floor((px - rad) / T), y0 = Math.floor((py - rad) / T);
    const x1 = Math.floor((px + rad) / T), y1 = Math.floor((py + rad) / T);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (inside(x, y)) clear[at(x, y)] = 1;
  }
  function canBuild(x, y, w, h) {
    if (x < 1 || y < 1 || x + w > COLS - 1 || y + h > ROWS - 1) return false;
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) {
      if (use[at(xx, yy)] !== 0 || clear[at(xx, yy)]) return false;
    }
    return true;
  }
  function apron(b) {
    const cx = Math.floor(b.x + b.w / 2);
    const y0 = b.y + b.h;
    for (let dx = -1; dx <= 1; dx++) for (let dy = 0; dy <= 1; dy++) {
      const x = cx + dx, y = y0 + dy;
      if (!inside(x, y)) continue;
      clear[at(x, y)] = 1;
      if (use[at(x, y)] === 0) use[at(x, y)] = 3;
    }
  }

  (function fillCity() {
    for (let i = 0; i < mask.length; i++) if (mask[i]) use[i] = 1;
    HUB_BLOCKS.forEach((b) => markRect(b.x, b.y, b.w, b.h, 2));
    buildings.forEach((b) => { if (services.indexOf(b) < 0) markRect(b.x, b.y, b.w, b.h, 2); });
    solids.forEach((s) => markRect(s.x, s.y, s.w, s.h, 2));
    markRect(86, 0, 4, 8, 3);
    npcs.forEach((n) => stamp(n.x, n.y, 42));
    collectibles.forEach((c) => stamp(c.x, c.y, 36));
    landmarks.forEach((n) => stamp(n.x, n.y, 56));
    stamp(15.5 * T, 9.5 * T, 36);

    services.forEach((b) => {
      if (!canBuild(b.x, b.y, b.w, b.h)) placeErrors.push(b.id);
      else markRect(b.x, b.y, b.w, b.h, 2);
    });
    /* Services that failed stay in `buildings` for the audit. Collision is skipped
       so a bad footprint cannot seal a road. Successful ones already occupy `use`. */
    if (placeErrors.length) {
      for (let i = buildings.length - 1; i >= 0; i--) {
        if (placeErrors.indexOf(buildings[i].id) >= 0) buildings.splice(i, 1);
      }
    }
    buildings.forEach((b) => { b.door = { x: (b.x + b.w / 2) * T, y: (b.y + b.h) * T + 4 }; });
    buildings.forEach(apron);
    HUB_BLOCKS.forEach(apron);

    parks.forEach((p) => {
      for (let y = p.y; y < p.y + p.h; y++) for (let x = p.x; x < p.x + p.w; x++) {
        if (inside(x, y) && use[at(x, y)] === 0) use[at(x, y)] = 4;
      }
    });
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
      if (use[at(x, y)] !== 1) continue;
      [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach((d) => {
        const xx = x + d[0], yy = y + d[1];
        if (!inside(xx, yy)) return;
        const u = use[at(xx, yy)];
        if (u === 0 || u === 4) use[at(xx, yy)] = 3;
      });
    }
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) if (use[at(x, y)] === 3) sidewalks.push({ x: x, y: y });

    /* Keep a one-tile promenade inside the border so edge tags and the
       north alley stay connected to the road grid. */
    for (let x = 1; x < COLS - 1; x++) {
      if (use[at(x, 1)] === 0) use[at(x, 1)] = 3;
      if (use[at(x, ROWS - 2)] === 0) use[at(x, ROWS - 2)] = 3;
    }
    for (let y = 1; y < ROWS - 1; y++) {
      if (use[at(1, y)] === 0) use[at(1, y)] = 3;
      if (use[at(COLS - 2, y)] === 0) use[at(COLS - 2, y)] = 3;
    }

    for (let y = 1; y < ROWS - 2; y++) {
      let x = 1;
      while (x < COLS - 2) {
        if (use[at(x, y)] !== 0 || clear[at(x, y)]) { x++; continue; }
        let placed = false;
        const start = (x * 3 + y * 5) % SIZES.length;
        for (let s = 0; s < SIZES.length; s++) {
          const sz = SIZES[(start + s) % SIZES.length];
          const w = sz[0], h = sz[1];
          if (!canBuild(x, y, w, h)) continue;
          const d = districtAtTile(x, y) || districts[0];
          const roofs = ROOFS[d.id] || ROOFS.downtown;
          const block = {
            kind: 'block', x: x, y: y, w: w, h: h,
            roof: roofs[(x + y) % roofs.length],
            color: TRIMS[d.id] || '#9fb3c8',
            name: SIGNS[(x * 7 + y * 3) % SIGNS.length],
            roofStyle: (x * 3 + y) % 6,
            district: d.id
          };
          scenery.push(block);
          solids.push(block);
          markRect(x, y, w, h, 2);
          for (let xx = x; xx < x + w; xx++) if (inside(xx, y + h) && use[at(xx, y + h)] === 0) use[at(xx, y + h)] = 3;
          x += w + 1;
          placed = true;
          break;
        }
        if (!placed) x++;
      }
    }

    parks.forEach((p) => {
      const midX = p.x + (p.w >> 1), midY = p.y + (p.h >> 1);
      for (let y = p.y; y < p.y + p.h; y++) for (let x = p.x; x < p.x + p.w; x++) {
        if (!inside(x, y) || use[at(x, y)] !== 4) continue;
        if (x === midX || y === midY || x === p.x + 1 || y === p.y + p.h - 2) use[at(x, y)] = 5;
      }
    });

    const tagSpots = [
      ['t13', 'harbor'], ['t14', 'neon'], ['t15', 'rust'], ['t16', 'square']
    ];
    tagSpots.forEach((pair) => {
      const p = parks.find((k) => k.id === pair[1]);
      if (!p) return;
      let spot = null;
      for (let y = p.y; y < p.y + p.h && !spot; y++) for (let x = p.x; x < p.x + p.w; x++) {
        if (use[at(x, y)] === 5 && !clear[at(x, y)]) { spot = { x: x, y: y }; break; }
      }
      if (!spot) return;
      clear[at(spot.x, spot.y)] = 1;
      collectibles.push({ id: pair[0], x: spot.x * T + T / 2, y: spot.y * T + T / 2 });
    });

    parks.forEach((p) => {
      if (p.id !== 'plaza') {
        const fx = p.x + (p.w >> 1) - 1, fy = p.y + (p.h >> 1) - 1;
        let ok = fx >= p.x && fy >= p.y;
        for (let y = fy; ok && y < fy + 2; y++) for (let x = fx; x < fx + 2; x++) {
          if (!inside(x, y) || clear[at(x, y)] || (use[at(x, y)] !== 4 && use[at(x, y)] !== 5)) ok = false;
        }
        if (ok) {
          const f = { kind: 'fountain', x: fx, y: fy, w: 2, h: 2, park: p.id };
          fountains.push(f);
          solids.push(f);
          markRect(fx, fy, 2, 2, 2);
        }
      }
      let benchesLeft = 4;
      for (let y = p.y; y < p.y + p.h; y++) for (let x = p.x; x < p.x + p.w; x++) {
        if (use[at(x, y)] !== 4 || clear[at(x, y)]) continue;
        const pathN = [[1, 0], [-1, 0], [0, 1], [0, -1]].some((d) => inside(x + d[0], y + d[1]) && use[at(x + d[0], y + d[1])] === 5);
        if (pathN && benchesLeft > 0 && ((x + y) % 5 === 0)) {
          const bench = { kind: 'bench', x: x, y: y, w: 1, h: 1 };
          benches.push(bench);
          solids.push(bench);
          markRect(x, y, 1, 1, 2);
          benchesLeft--;
        } else if ((x * 2 + y) % 3 === 0) {
          const tree = { kind: 'tree', x: x, y: y, w: 1, h: 1, leaf: (x + y) % 2 ? '#1e6a3d' : '#2f8f52' };
          trees.push(tree);
          solids.push(tree);
          markRect(x, y, 1, 1, 2);
        }
      }
    });

    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
      if (use[at(x, y)] !== 3 || clear[at(x, y)]) continue;
      if ((x * 5 + y * 3) % 7 !== 0) continue;
      lamps.push({ x: x, y: y });
    }
    /* Fresh sidewalk tiles from the alley reserve were not listed yet. */
    sidewalks.length = 0;
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) if (use[at(x, y)] === 3) sidewalks.push({ x: x, y: y });
  })();

  function fitFont(g, text, maxW, size) {
    let s = size;
    g.font = 'bold ' + s + 'px Trebuchet MS, sans-serif';
    while (s > 9 && g.measureText(text).width > maxW) {
      s--;
      g.font = 'bold ' + s + 'px Trebuchet MS, sans-serif';
    }
    return s;
  }
  function drawBlock(g, b, withDoor) {
    const x = b.x * T, y = b.y * T, w = b.w * T, h = b.h * T;
    g.fillStyle = 'rgba(0,0,0,0.4)';
    g.fillRect(x + 8, y + 10, w, h);
    g.fillStyle = b.roof || '#24304a';
    g.fillRect(x, y, w, h);
    const style = b.roofStyle != null ? b.roofStyle : (b.x * 3 + b.y) % 6;
    if (style === 0) {
      g.fillStyle = 'rgba(255,255,255,0.06)';
      for (let i = 0; i < w; i += 18) g.fillRect(x + i, y, 8, h);
    } else if (style === 1) {
      g.fillStyle = 'rgba(255,255,255,0.07)';
      g.fillRect(x + 8, y + 8, Math.max(4, w - 16), Math.max(4, h - 16));
    } else if (style === 2) {
      g.strokeStyle = 'rgba(255,255,255,0.18)';
      g.lineWidth = 4;
      g.strokeRect(x + 4, y + 4, w - 8, h - 8);
    } else if (style === 3) {
      g.fillStyle = 'rgba(0,0,0,0.28)';
      for (let i = 0; i < w; i += 22) g.fillRect(x + i, y, 9, h);
    } else if (style === 4) {
      g.fillStyle = 'rgba(255,255,255,0.05)';
      for (let iy = 0; iy < h; iy += 16) for (let ix = 0; ix < w; ix += 16) {
        if (((ix + iy) / 16) % 2 < 1) g.fillRect(x + ix, y + iy, 16, 16);
      }
    } else {
      g.fillStyle = b.color || '#9fb3c8';
      g.globalAlpha = 0.45;
      g.fillRect(x, y, w, 6);
      g.globalAlpha = 1;
    }
    const lip = Math.min(16, Math.max(8, h * 0.2));
    g.fillStyle = '#12151c';
    g.fillRect(x, y + h - lip, w, lip);
    for (let i = 8; i < w - 10; i += 16) {
      const lit = ((b.x + i + b.y) % 5) !== 0;
      g.fillStyle = lit ? 'rgba(190,225,255,0.72)' : 'rgba(40,50,70,0.9)';
      g.fillRect(x + i, y + h - lip + 3, 8, Math.max(4, lip - 6));
    }
    g.strokeStyle = b.color || '#9fb3c8';
    g.lineWidth = withDoor ? 3 : 2;
    g.strokeRect(x + 1.5, y + 1.5, w - 3, h - 3);
    if (b.name && !withDoor) {
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      fitFont(g, b.name, w - 14, w < 170 ? 12 : 15);
      const tw = Math.min(w - 12, g.measureText(b.name).width + 12);
      const sx = x + (w - tw) / 2, sy = y + 8;
      g.fillStyle = 'rgba(8,6,16,0.88)';
      g.fillRect(sx, sy, tw, 16);
      g.fillStyle = b.color || '#fff';
      g.fillText(b.name, x + w / 2, sy + 8);
    }
    if (withDoor && b.door) {
      g.fillStyle = '#0c0c10';
      g.fillRect(b.door.x - 12, y + h - 14, 24, 14);
      g.fillStyle = b.color || '#2ee6ff';
      g.fillRect(b.door.x - 12, y + h - 4, 24, 4);
      g.beginPath();
      g.moveTo(b.door.x, y + h + 6);
      g.lineTo(b.door.x - 6, y + h + 14);
      g.lineTo(b.door.x + 6, y + h + 14);
      g.fill();
    }
  }
  function drawFountain(g, x, y, w, h) {
    const cx = (x + w / 2) * T, cy = (y + h / 2) * T;
    const r = Math.min(w, h) * T * 0.42;
    g.fillStyle = 'rgba(0,0,0,0.35)';
    g.beginPath(); g.ellipse(cx + 6, cy + 8, r, r * 0.35, 0, 0, 7); g.fill();
    g.fillStyle = '#9aa3ad';
    g.beginPath(); g.arc(cx, cy, r, 0, 7); g.fill();
    g.fillStyle = '#1f6f8a';
    g.beginPath(); g.arc(cx, cy, r * 0.68, 0, 7); g.fill();
    g.fillStyle = 'rgba(190,235,255,0.85)';
    g.beginPath(); g.arc(cx, cy, r * 0.22, 0, 7); g.fill();
  }
  function drawTree(g, t) {
    const cx = (t.x + 0.5) * T, cy = (t.y + 0.5) * T;
    g.fillStyle = 'rgba(0,0,0,0.35)';
    g.beginPath(); g.ellipse(cx + 5, cy + 8, 16, 6, 0, 0, 7); g.fill();
    g.fillStyle = '#3a2a1a';
    g.fillRect(cx - 3, cy - 2, 6, 16);
    g.fillStyle = t.leaf || '#1e6a3d';
    g.beginPath(); g.arc(cx, cy - 4, 18, 0, 7); g.fill();
    g.fillStyle = '#3fa86a';
    g.beginPath(); g.arc(cx - 6, cy - 8, 8, 0, 7); g.fill();
  }
  function drawBench(g, b) {
    const x = b.x * T, y = b.y * T;
    g.fillStyle = 'rgba(0,0,0,0.3)';
    g.fillRect(x + 8, y + 22, 26, 6);
    g.fillStyle = '#6b4428';
    g.fillRect(x + 6, y + 16, 28, 7);
    g.fillStyle = '#8d5a34';
    g.fillRect(x + 6, y + 10, 28, 7);
    g.fillStyle = '#3a2818';
    g.fillRect(x + 6, y + 22, 4, 8);
    g.fillRect(x + 30, y + 22, 4, 8);
  }

  function paint(g) {
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
      const u = use[at(x, y)];
      if (u === 2 || u === 1) continue;
      const d = districtAtTile(x, y);
      g.fillStyle = (d && LOT[d.id]) || '#1b2a22';
      g.fillRect(x * T, y * T, T, T);
    }
    parks.forEach((p) => {
      for (let y = p.y; y < p.y + p.h; y++) for (let x = p.x; x < p.x + p.w; x++) {
        const u = inside(x, y) ? use[at(x, y)] : 0;
        if (u !== 4 && u !== 5) continue;
        g.fillStyle = (x + y) % 2 ? '#14381f' : '#184626';
        g.fillRect(x * T, y * T, T, T);
        if (u === 5) {
          g.fillStyle = '#c2b49a';
          g.fillRect(x * T + 6, y * T + 6, T - 12, T - 12);
        }
      }
    });
    sidewalks.forEach((s) => {
      const x = s.x * T, y = s.y * T;
      g.fillStyle = (s.x + s.y) % 2 ? '#6e6558' : '#7a7164';
      g.fillRect(x, y, T, T);
      g.fillStyle = 'rgba(0,0,0,0.18)';
      g.fillRect(x, y + T - 4, T, 4);
    });
    const road = (r) => {
      g.fillStyle = '#5a6070';
      g.fillRect(r.x * T - 6, r.y * T - 6, r.w * T + 12, r.h * T + 12);
      g.fillStyle = '#2c303b';
      g.fillRect(r.x * T, r.y * T, r.w * T, r.h * T);
    };
    roads.forEach(road);
    g.strokeStyle = '#ffe03b';
    g.globalAlpha = 0.55;
    g.setLineDash([18, 16]);
    g.lineWidth = 2;
    roads.forEach((r) => {
      g.beginPath();
      if (r.axis === 'h') {
        const cy = (r.y + r.h / 2) * T;
        g.moveTo(r.x * T, cy); g.lineTo((r.x + r.w) * T, cy);
      } else {
        const cx = (r.x + r.w / 2) * T;
        g.moveTo(cx, r.y * T); g.lineTo(cx, (r.y + r.h) * T);
      }
      g.stroke();
    });
    g.setLineDash([]);
    g.globalAlpha = 1;
    lights.forEach((L) => {
      g.fillStyle = '#d7deea';
      const x = L.x * T, y = L.y * T, w = L.w * T, h = L.h * T;
      for (let i = 0; i < 4; i++) {
        g.fillRect(x + 8 + i * (w / 4), y + h / 2 - 2, w / 8, 4);
        g.fillRect(x + w / 2 - 2, y + 8 + i * (h / 4), 4, h / 8);
      }
    });
    /* Water, pier, lighthouse. Collision matches the two water rects. */
    solids.forEach((s) => {
      if (s.kind !== 'water') return;
      g.fillStyle = '#14324a';
      g.fillRect(s.x * T, s.y * T, s.w * T, s.h * T);
      g.fillStyle = '#1d4e68';
      for (let i = 0; i < s.h * 2; i++) g.fillRect(s.x * T, s.y * T + 8 + i * 18, s.w * T, 3);
    });
    g.fillStyle = '#6b5a48';
    g.fillRect(86 * T, 0, 4 * T, 8 * T);
    g.fillStyle = '#8a7058';
    for (let i = 0; i < 8; i++) g.fillRect(86 * T, i * T + 18, 4 * T, 4);
    g.fillStyle = '#ffe03b';
    g.fillRect(87.2 * T, 2.2 * T, 10, 46);
    g.fillStyle = '#fff4c8';
    g.beginPath(); g.arc(87.7 * T, 2 * T, 14, 0, 7); g.fill();

    scenery.forEach((b) => drawBlock(g, b, false));
    buildings.forEach((b) => drawBlock(g, b, true));

    solids.forEach((s) => {
      if (s.kind === 'cargo') {
        const cols = ['#ff3b6b', '#2ee6ff', '#ffe03b', '#7dff5a'];
        g.fillStyle = cols[(s.x + s.y) % cols.length];
        g.fillRect(s.x * T + 4, s.y * T + 4, s.w * T - 8, s.h * T - 8);
        g.strokeStyle = 'rgba(0,0,0,0.35)';
        g.lineWidth = 2;
        g.strokeRect(s.x * T + 4, s.y * T + 4, s.w * T - 8, s.h * T - 8);
      } else if (s.kind === 'stand') {
        g.fillStyle = '#241c22';
        g.fillRect(s.x * T, s.y * T, s.w * T, s.h * T);
        g.fillStyle = '#ff3b6b';
        for (let i = 4; i < s.h * T; i += 10) g.fillRect(s.x * T, s.y * T + i, s.w * T, 4);
        g.fillStyle = '#e7edf5';
        g.fillRect(s.x * T, s.y * T, s.w * T, 3);
      } else if (s.kind === 'clock') {
        drawBlock(g, { x: s.x, y: s.y, w: s.w, h: s.h, roof: '#2a2418', color: '#ffe03b', name: '11:07', roofStyle: 2 }, false);
        g.fillStyle = '#ffe03b';
        g.beginPath(); g.arc((s.x + s.w / 2) * T, (s.y + s.h / 2) * T, 22, 0, 7); g.fill();
        g.fillStyle = '#1a1408';
        g.font = 'bold 12px sans-serif';
        g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText('11:07', (s.x + s.w / 2) * T, (s.y + s.h / 2) * T);
      } else if (s.kind === 'statue') {
        const cx = (s.x + s.w / 2) * T, cy = (s.y + s.h / 2) * T;
        g.fillStyle = '#8a8478';
        g.fillRect(s.x * T + 6, s.y * T + s.h * T - 16, s.w * T - 12, 12);
        g.fillStyle = '#c8c2b4';
        g.beginPath(); g.arc(cx, cy - 6, 16, 0, 7); g.fill();
        g.fillStyle = '#1a1408';
        g.font = 'bold 9px sans-serif';
        g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText('EARN IT', cx, s.y * T + s.h * T - 10);
      }
    });
    drawFountain(g, 14, 14, 3, 3);
    fountains.forEach((f) => drawFountain(g, f.x, f.y, f.w, f.h));
    trees.forEach((t) => drawTree(g, t));
    benches.forEach((b) => drawBench(g, b));
    lamps.forEach((l) => {
      const x = l.x * T, y = l.y * T;
      g.fillStyle = '#232833';
      g.fillRect(x + 18, y + 8, 4, 26);
      g.fillStyle = '#ffe9a8';
      g.beginPath(); g.arc(x + 20, y + 8, 5, 0, 7); g.fill();
    });

    g.strokeStyle = '#ff2ef0';
    g.lineWidth = 8;
    g.beginPath();
    g.moveTo(67 * T, 8 * T);
    g.quadraticCurveTo(70 * T, 4.2 * T, 73 * T, 8 * T);
    g.stroke();
    g.fillStyle = '#2ee6ff';
    g.font = 'bold 18px Trebuchet MS, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('NEON MILE', 70 * T, 6.2 * T);

    g.strokeStyle = '#8aa0b4';
    g.lineWidth = 4;
    [34.2, 38.4].forEach((cx) => {
      g.beginPath();
      g.moveTo(cx * T, 18 * T);
      g.lineTo(cx * T, 12 * T);
      g.lineTo((cx + 2.2) * T, 12 * T);
      g.stroke();
    });

    g.fillStyle = '#1a1e28';
    g.fillRect(2 * T, 60 * T, 92 * T, 3 * T);
    g.fillStyle = '#fff';
    for (let i = 0; i < 8; i++) g.fillRect((6 + i * 11) * T, 60 * T, 8, 3 * T);
    g.fillStyle = '#ff3b6b';
    g.fillRect(4 * T, 61.2 * T, 36, 10);
    g.fillStyle = '#ffe03b';
    g.font = 'bold 16px sans-serif';
    g.textAlign = 'center';
    g.fillText('1320', 10 * T, 61.6 * T);

    g.strokeStyle = '#d7deea';
    g.lineWidth = 2;
    buildings.forEach((b) => {
      g.strokeRect(b.door.x - 26, b.door.y + 18, 52, 36);
    });

    g.font = 'bold 11px Trebuchet MS, sans-serif';
    g.textAlign = 'left';
    g.textBaseline = 'middle';
    districts.forEach((d) => {
      let spot = null;
      for (let y = d.y; y < d.y + d.h && !spot; y++) for (let x = d.x; x < d.x + d.w; x++) {
        if (inside(x, y) && use[at(x, y)] === 3 && !clear[at(x, y)]) { spot = { x: x, y: y }; break; }
      }
      if (!spot) return;
      const label = d.name.toUpperCase();
      g.font = 'bold 11px Trebuchet MS, sans-serif';
      const tw = g.measureText(label).width + 8;
      const x = spot.x * T + 4, y = spot.y * T + 10;
      g.fillStyle = 'rgba(8,6,16,0.8)';
      g.fillRect(x, y, tw, 14);
      g.fillStyle = d.color;
      g.fillText(label, x + 4, y + 7);
    });
    g.textAlign = 'left';
    g.textBaseline = 'alphabetic';
  }

  function rectHitsRoad(b) {
    for (let y = b.y; y < b.y + b.h; y++) for (let x = b.x; x < b.x + b.w; x++) {
      if (inside(x, y) && mask[at(x, y)]) return true;
    }
    return false;
  }
  function pointInSolid(px, py, rad) {
    const list = solids.concat(HUB_BLOCKS);
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      if (px + rad > b.x * T && px - rad < (b.x + b.w) * T && py + rad > b.y * T && py - rad < (b.y + b.h) * T) return b;
    }
    return null;
  }
  function audit() {
    const notes = [];
    if (placeErrors.length) notes.push('unplaced ' + placeErrors.join(','));
    solids.forEach((s) => { if (rectHitsRoad(s)) notes.push('solid-road ' + (s.kind || '') + ' ' + s.x + ',' + s.y); });
    buildings.forEach((b) => { if (rectHitsRoad(b)) notes.push('bldg-road ' + b.id); });
    const spawn = pointInSolid(15.5 * T, 9.5 * T, 15);
    if (spawn) notes.push('spawn blocked');
    npcs.forEach((n) => { if (pointInSolid(n.x, n.y, 10)) notes.push('npc ' + n.id); });
    collectibles.forEach((c) => { if (pointInSolid(c.x, c.y, 8)) notes.push('tag ' + c.id); });
    buildings.forEach((b) => {
      const hit = pointInSolid(b.door.x, b.door.y + 36, 12);
      if (hit) notes.push('stall ' + b.id);
    });
    const need = ['dealer', 'chandler', 'precinct', 'chop', 'scrap', 'impound', 'lockup', 'hall', 'diner', 'meetup', 'club', 'clinic', 'pitmeet', 'safehouse', 'hq', 'garage'];
    need.forEach((id) => {
      if (id === 'garage') return;
      if (!buildings.some((b) => b.id === id)) notes.push('missing ' + id);
    });
    districts.forEach((d) => {
      const park = parks.some((p) => p.district === d.id);
      if (!park) notes.push('no park ' + d.id);
    });
    if (scenery.length < 40) notes.push('scenery ' + scenery.length);
    if (trees.length < 12) notes.push('trees ' + trees.length);
    return notes;
  }

  RL.CityMap = {
    cols: COLS, rows: ROWS, T, roads, buildings, solids, districts, landmarks, collectibles, npcs,
    parks, scenery, trees, benches, fountains, lamps, sidewalks, mask, lights, lanes, lightPhase, paint,
    legend: {
      shop: '#7dff5a', police: '#7aa2ff', crime: '#ff3b6b', race: '#ff2ef0', heal: '#ff8ad0', story: '#ffe03b'
    },
    audit: audit
  };
})();
