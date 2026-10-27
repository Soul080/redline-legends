/* Shared interior layouts for the 2D city and the 3D city.
   Classic script: sets window.RLInteriorData. Rooms are meters, y grows south.
   The exit door is always the gap in the south wall. */
(function (root) {
  const ALIAS = { police: 'hq', drag: 'dragway' };

  function prop(x, y, w, h, color, label) {
    return { x: x, y: y, w: w, h: h, color: color, label: label };
  }
  function npc(name, title, x, y, color, service, verb, line, extra) {
    const n = { name: name, title: title, x: x, y: y, color: color, service: service, verb: verb, line: line };
    if (extra && extra.alt) n.alt = extra.alt;
    if (extra && extra.altService) n.altService = extra.altService;
    return n;
  }
  function layout(kind) {
    const sets = {
      garage: [prop(1.1, 1.2, 4.4, 2.6, '#4a5c6e', 'LIFT'), prop(11.4, 1.2, 1.5, 2.2, '#e07020', 'TOOLS'), prop(10.2, 4.2, 4.4, 1.1, '#6a7b8c', 'BENCH'), prop(1.2, 4.6, 2.2, 1.5, '#243038', 'TIRES')],
      office: [prop(1.2, 1.2, 5.4, 1.5, '#d4b45a', 'DESK'), prop(10.4, 1.2, 4.0, 2.8, '#1a2433', 'BOARD'), prop(1.4, 3.4, 1.4, 1.3, '#8a7040', 'CHAIR'), prop(11.0, 4.8, 3.2, 1.0, '#334455', 'FILES')],
      shop: [prop(1.1, 1.2, 13.6, 1.15, '#3d6b48', 'COUNTER'), prop(1.3, 3.0, 2.3, 1.7, '#245c38', 'SHELF'), prop(4.2, 3.0, 2.3, 1.7, '#245c38', 'SHELF'), prop(7.1, 3.0, 2.3, 1.7, '#1e4a30', 'SHELF'), prop(12.2, 3.0, 2.4, 2.2, '#163828', 'CRATE')],
      bar: [prop(1.1, 1.2, 9.4, 1.25, '#6a2048', 'BAR'), prop(12.0, 1.3, 2.6, 2.3, '#3a1830', 'BOOTH'), prop(12.0, 4.2, 2.6, 2.0, '#3a1830', 'BOOTH'), prop(1.3, 3.6, 2.2, 2.0, '#4a1840', 'TABLE')],
      track: [prop(1.1, 1.3, 6.2, 2.0, '#ff8a2e', 'TIMING'), prop(9.2, 1.4, 5.2, 1.15, '#2a2418', 'TIRES'), prop(9.4, 3.4, 4.8, 1.5, '#3a3020', 'LOCKER')],
      drag: [prop(1.1, 1.15, 5.8, 1.35, '#ff3b6b', 'TREE'), prop(8.2, 1.15, 6.4, 1.25, '#1a1218', 'TIMES'), prop(1.2, 3.2, 2.6, 1.5, '#3a1824', 'GEARS'), prop(12.2, 3.1, 2.4, 2.0, '#2a1218', 'SLICKS')],
      hq: [prop(1.1, 1.2, 6.2, 1.35, '#3a5080', 'DESK'), prop(10.0, 1.2, 4.4, 3.0, '#1a2744', 'MAP'), prop(1.3, 3.6, 2.4, 1.2, '#243656', 'RADIO')],
      crime: [prop(1.1, 1.2, 5.6, 1.4, '#4a2030', 'CRATE'), prop(9.4, 1.3, 5.0, 1.3, '#2a1820', 'TABLE'), prop(12.4, 3.4, 2.1, 2.2, '#3a1828', 'SAFE')],
      heal: [prop(1.1, 1.2, 8.6, 1.25, '#f4f7fb', 'COUNTER'), prop(11.2, 1.3, 3.3, 2.1, '#ff5a7a', 'BED'), prop(11.2, 4.0, 3.3, 1.9, '#d5dbe6', 'BED')],
      gas: [prop(1.2, 1.3, 3.3, 2.3, '#ff8a2e', 'PUMP'), prop(5.6, 1.3, 3.3, 2.3, '#e07020', 'PUMP'), prop(11.0, 1.5, 3.5, 1.15, '#3a2818', 'REGISTER')],
      bank: [prop(1.1, 1.3, 13.6, 1.15, '#e6dcc0', 'TELLER'), prop(1.3, 3.4, 2.4, 1.5, '#8a8060', 'ROPE'), prop(12.0, 3.2, 2.5, 2.3, '#c4b060', 'VAULT')],
      diner: [prop(1.1, 1.3, 6.4, 1.15, '#f0d8a8', 'COUNTER'), prop(9.2, 1.4, 2.4, 2.1, '#c45c2a', 'BOOTH'), prop(12.2, 1.4, 2.4, 2.1, '#c45c2a', 'BOOTH'), prop(9.2, 4.2, 5.4, 1.5, '#a84820', 'BOOTH')],
      vista: [prop(1.2, 1.3, 4.6, 1.1, '#ffe03b', 'RAIL'), prop(7.0, 1.3, 3.4, 1.5, '#3a3420', 'SCOPE'), prop(11.4, 1.4, 3.0, 1.9, '#2a2818', 'PRINTS')],
      hall: [prop(4.0, 1.2, 7.8, 1.35, '#e6d48a', 'DAIS'), prop(1.2, 3.2, 2.0, 2.3, '#3a3420', 'FLAG'), prop(12.6, 3.2, 2.0, 2.3, '#3a3420', 'FLAG')],
      meet: [prop(1.1, 1.2, 5.2, 1.25, '#ff2ef0', 'BOARD'), prop(7.8, 1.3, 6.6, 1.15, '#2a1838', 'COUCH'), prop(1.3, 3.4, 2.5, 1.5, '#3a1848', 'AMPS')]
    };
    return sets[kind] || sets.shop;
  }
  function room(spec) {
    return {
      name: spec.name,
      w: 16,
      h: 11,
      floor: spec.floor,
      alt: spec.alt,
      wall: spec.wall,
      trim: spec.trim,
      kind: spec.kind,
      props: layout(spec.kind),
      npcs: spec.npcs
    };
  }

  const DEFS = [
    { id: 'garage', name: 'Garage', kind: 'garage', floor: '#1a242c', alt: '#243038', wall: '#10161c', trim: '#2ee6ff', npcs: [
      npc('Rico', 'Mechanic', 5.0, 6.5, '#ff8a2e', 'garage', 'Open the bays', 'Bays are open. I repair, paint, and tune the car you own.')
    ] },
    { id: 'office', name: 'Race Office', kind: 'office', floor: '#2a2618', alt: '#332e1c', wall: '#16140e', trim: '#ffe03b', npcs: [
      npc('Lena', 'Clerk', 5.2, 6.3, '#ffe03b', 'office', 'Open the desk', 'League nights, side events, and free play are on this board.')
    ] },
    { id: 'shop', name: 'Parts Shop', kind: 'shop', floor: '#16241c', alt: '#1c2e24', wall: '#0e1612', trim: '#7dff5a', npcs: [
      npc('Ned', 'Counter', 4.6, 6.2, '#7dff5a', 'shop', 'Buy parts', 'Shelves are stocked. Tell me what the car is missing.'),
      npc('Ivy', 'Buyer', 11.2, 6.4, '#3fa9ff', 'sell', 'Sell parts', 'I buy parts you are not using. Cash on the counter.')
    ] },
    { id: 'bar', name: 'Neon Bar', kind: 'bar', floor: '#24101c', alt: '#301428', wall: '#140810', trim: '#ff2ef0', npcs: [
      npc('Vex', 'Bartender', 5.4, 6.2, '#ff2ef0', 'bar', 'Talk', 'Pull up a stool. The city talks louder after dark.')
    ] },
    { id: 'training', name: 'Training Track', kind: 'track', floor: '#2a2218', alt: '#332818', wall: '#16110c', trim: '#ff8a2e', npcs: [
      npc('Coach', 'Starter', 5.0, 6.4, '#ff8a2e', 'training', 'Open the oval', 'Solo laps. No purse, no cops, just the oval out back.')
    ] },
    { id: 'warehouse', name: 'Harbor Co', kind: 'crime', floor: '#141c24', alt: '#1a2630', wall: '#0c1218', trim: '#3fa9ff', npcs: [
      npc('Dock', 'Loader', 5.6, 6.3, '#3fa9ff', 'warehouse', 'Ask about the load', 'Containers move after midnight. Criminals get the manifest.')
    ] },
    { id: 'bank', name: 'Neon Bank', kind: 'bank', floor: '#2a281c', alt: '#343022', wall: '#16140e', trim: '#ffb02e', npcs: [
      npc('Mara', 'Teller', 6.0, 6.2, '#ffb02e', 'bank', 'Approach the vault', 'Marble, cameras, and a vault that has never been politely opened.')
    ] },
    { id: 'customs', name: 'Customs', kind: 'shop', floor: '#241428', alt: '#301834', wall: '#140818', trim: '#ff2ef0', npcs: [
      npc('Pax', 'Painter', 5.2, 6.3, '#ff2ef0', 'customs', 'Open the booth', 'Paint and decals. The color hits the car the moment you pick it.')
    ] },
    { id: 'hq', name: 'Role HQ', kind: 'hq', floor: '#141a28', alt: '#1a2234', wall: '#0c1018', trim: '#7aa2ff', npcs: [
      npc('Sgt. Hale', 'Desk', 5.4, 6.3, '#7aa2ff', 'hq', 'See the desk', 'Neutral, criminal, or a badge. There is a cooldown between lives.')
    ] },
    { id: 'mart', name: 'Quick Mart', kind: 'shop', floor: '#142418', alt: '#1a2e20', wall: '#0c160e', trim: '#7dff5a', npcs: [
      npc('June', 'Cashier', 5.4, 6.2, '#7dff5a', 'mart', 'Talk to the cashier', 'Aisles, a counter, and a back door the city pretends not to see.')
    ] },
    { id: 'hospital', name: 'City Hospital', kind: 'heal', floor: '#2a1820', alt: '#341e28', wall: '#160e12', trim: '#ff5a7a', npcs: [
      npc('Nurse Kim', 'Clinic', 5.2, 6.2, '#ff8ad0', 'hospital', 'Get patched', 'Bandages and a lollipop. Forty dollars puts your HP back.')
    ] },
    { id: 'gas', name: 'Nitro Fuel', kind: 'gas', floor: '#2a2016', alt: '#342818', wall: '#16110c', trim: '#ff8a2e', npcs: [
      npc('Hal', 'Attendant', 5.8, 6.4, '#ff8a2e', 'gas', 'Ask for a patch', 'High-test and a hose. I can knock a little damage off the car.')
    ] },
    { id: 'dragway', name: 'Redline Dragway', kind: 'drag', floor: '#2a1218', alt: '#341820', wall: '#14080c', trim: '#ff3b6b', npcs: [
      npc('Nash', 'Starter', 4.8, 6.2, '#ff3b6b', 'drag', 'Stage a drag', 'Hold gas and brake, release the brake on the light, then shift. I can stage you now.', { alt: 'Full booth', altService: 'booth' }),
      npc('Rex', 'Gear tech', 11.4, 6.4, '#ff8a2e', 'gears', 'Set the gears', 'Short gears launch. Long gears trap. Final drive is the whole ET.')
    ] },
    { id: 'vista', name: 'Vista', kind: 'vista', floor: '#2a2818', alt: '#34321c', wall: '#16150e', trim: '#ffe03b', npcs: [
      npc('Jo', 'Photographer', 5.6, 6.3, '#ffe03b', 'vista', 'Take the shot', 'Best view in the city. Arrows pan, C cycles filters, Enter snaps.')
    ] },
    { id: 'dealer', name: 'Dealership', kind: 'shop', floor: '#142418', alt: '#1c3020', wall: '#0c160e', trim: '#7dff5a', npcs: [
      npc('Cole', 'Sales', 5.4, 6.2, '#7dff5a', 'cars', 'See the cars', 'New metal on the floor. League locks still apply.')
    ] },
    { id: 'chandler', name: 'Chandlery', kind: 'shop', floor: '#121c28', alt: '#182432', wall: '#0c1218', trim: '#3fa9ff', npcs: [
      npc('Bess', 'Chandlery', 5.2, 6.3, '#3fa9ff', 'shop', 'Buy parts', 'Harbor parts, same shelves as downtown. Salt air is free.')
    ] },
    { id: 'precinct', name: '4th Precinct', kind: 'hq', floor: '#141a28', alt: '#1c2436', wall: '#0c1018', trim: '#7aa2ff', npcs: [
      npc('Dispatch', 'Sergeant', 5.4, 6.3, '#7aa2ff', 'precinct', 'Take the desk', 'Badges get the eastbound call. Everyone else can file a report.')
    ] },
    { id: 'chop', name: 'Chop Shop', kind: 'crime', floor: '#241018', alt: '#301420', wall: '#14080e', trim: '#ff3b6b', npcs: [
      npc('Razor', 'Cutter', 5.6, 6.3, '#ff3b6b', 'chop', 'Ask for work', 'A quiet bay and a car that will not be missed. Criminals only.')
    ] },
    { id: 'scrap', name: 'Scrap', kind: 'shop', floor: '#241c14', alt: '#2e2418', wall: '#140e0c', trim: '#ff8a2e', npcs: [
      npc('Bram', 'Scrapper', 5.2, 6.3, '#ff8a2e', 'sell', 'Sell parts', 'I pay cash for parts you pull off. The bin is behind me.')
    ] },
    { id: 'impound', name: 'Impound', kind: 'hq', floor: '#161c28', alt: '#1c2432', wall: '#0e1218', trim: '#9bb6ff', npcs: [
      npc('Warden', 'Lot', 5.4, 6.3, '#9bb6ff', 'impound', 'Ask about the car', 'Cold heat parks the car here. Pay it down and the gate opens.')
    ] },
    { id: 'lockup', name: 'Old Lockup', kind: 'crime', floor: '#1c1424', alt: '#261830', wall: '#100818', trim: '#c86bff', npcs: [
      npc('Keeper', 'Night watch', 5.6, 6.3, '#c86bff', 'lockup', 'Check the boards', 'The floor cache is a one-time box. The note mentions the clock.')
    ] },
    { id: 'hall', name: 'City Hall', kind: 'hall', floor: '#2a2618', alt: '#34301c', wall: '#16140e', trim: '#ffe03b', npcs: [
      npc('Clerk', 'Guide', 6.2, 6.2, '#ffe03b', 'hall', 'Ask the districts', 'Every district has a job. I can read you the list.')
    ] },
    { id: 'diner', name: 'Mile Diner', kind: 'diner', floor: '#2a2016', alt: '#342818', wall: '#16110c', trim: '#ffb02e', npcs: [
      npc('Dot', 'Waitress', 4.8, 6.3, '#ffb02e', 'diner', 'Order a patch', 'Coffee and a wrench. Cheaper than the garage, and it does less.')
    ] },
    { id: 'meetup', name: 'Neon Meetup', kind: 'meet', floor: '#241428', alt: '#301834', wall: '#140818', trim: '#ff2ef0', npcs: [
      npc('Mira', 'Street racer', 5.4, 6.3, '#ff2ef0', 'meetup', 'Line up', 'Under the arch and back. Cops listen. The purse is real.')
    ] },
    { id: 'club', name: 'Club Voltage', kind: 'meet', floor: '#201028', alt: '#2a1434', wall: '#120818', trim: '#ff2ef0', npcs: [
      npc('Lux', 'Promoter', 5.4, 6.3, '#ff2ef0', 'club', 'Line up', 'Same run as the meetup. The lights are just louder.')
    ] },
    { id: 'clinic', name: 'Redline General', kind: 'heal', floor: '#2a1822', alt: '#341c28', wall: '#160e14', trim: '#ff8ad0', npcs: [
      npc('Dr. Sol', 'Surgeon', 5.2, 6.2, '#ff8ad0', 'clinic', 'Full repair', 'Uptown wrecks land here. Same bill as the garage.')
    ] },
    { id: 'pitmeet', name: 'Pit Lane', kind: 'drag', floor: '#241018', alt: '#30141e', wall: '#14080e', trim: '#ff3b6b', npcs: [
      npc('Slim', 'Starter', 4.6, 6.2, '#ff3b6b', 'drag', 'Stage a drag', 'The tree is south, but I can stage you from this booth. Gas and brake together, then release.', { alt: 'Full booth', altService: 'booth' }),
      npc('Dee', 'Meet captain', 11.2, 6.4, '#ff2ef0', 'pitmeet', 'Street meet', 'When the tree is booked, this lot runs the street gates.')
    ] },
    { id: 'safehouse', name: 'Safehouse', kind: 'crime', floor: '#1a1020', alt: '#241428', wall: '#100814', trim: '#c86bff', npcs: [
      npc('Vick', 'Fixer', 5.6, 6.3, '#c86bff', 'safehouse', 'Ask for the job', 'Curtains and a back door. Criminals take the score and run.')
    ] }
  ];

  const ROOMS = {};
  DEFS.forEach((d) => { ROOMS[d.id] = room(d); });

  function generic(id) {
    return room({
      id: id, name: 'Counter', kind: 'shop', floor: '#1a2030', alt: '#222838', wall: '#10141c', trim: '#2ee6ff',
      npcs: [npc('Clerk', 'Counter', 5.4, 6.3, '#ffffff', 'city', 'Talk', 'The counter is staffed. Ask what this place does.')]
    });
  }
  function resolve(id) {
    const key = ALIAS[id] || id;
    const src = ROOMS[key] || generic(id);
    const copy = JSON.parse(JSON.stringify(src));
    copy.id = id;
    return copy;
  }
  root.RLInteriorData = { rooms: ROOMS, resolve: resolve, alias: ALIAS };
})(typeof window !== 'undefined' ? window : globalThis);
