/* help.js - How to Play. Text is white on a solid dark panel.
   Other modules may export helpText() and this page will use it. */
RL.Help = (function () {
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function fromModule(name, fallback) {
    const mod = RL[name];
    try {
      if (mod && typeof mod.helpText === 'function') {
        const text = mod.helpText();
        if (text) return String(text);
      } else if (mod && typeof mod.helpText === 'string' && mod.helpText) return mod.helpText;
    } catch (e) { /* keep the fallback */ }
    return fallback;
  }

  function districts() {
    const list = (RL.CityMap && RL.CityMap.districts) || [];
    if (!list.length) return '<p>The city is split into districts. Each one has a job.</p>';
    return '<ul class="help-list">' + list.map((d) => '<li><b>' + esc(d.name) + '.</b> ' + esc(d.purpose || d.blurb || '') + '</li>').join('') + '</ul>';
  }

  function sections() {
    const keys = (RL.settings && RL.settings.keys) || RL.DEFAULT_KEYS || {};
    const key = (action, fallback) => {
      const list = keys[action] || [];
      if (!list.length) return fallback;
      return list.map((c) => '<kbd>' + esc(RL.Input && RL.Input.keyName ? RL.Input.keyName(c) : c) + '</kbd>').join(' ');
    };
    return [
      { id: 'drive', name: 'Driving', html:
        '<p>Gas is ' + key('up', '<kbd>↑</kbd> <kbd>W</kbd>') + '. Brake and reverse are ' + key('down', '<kbd>↓</kbd> <kbd>S</kbd>') + '. Steer with ' + key('left', '<kbd>←</kbd> <kbd>A</kbd>') + ' and ' + key('right', '<kbd>→</kbd> <kbd>D</kbd>') + '.</p>' +
        '<p>In a race, ' + key('drift', '<kbd>Space</kbd>') + ' is the handbrake. Hold it while you turn to drift. A drift fills the nitro bar. ' + key('nitro', '<kbd>Shift</kbd> <kbd>N</kbd>') + ' fires nitro. Use it on the straight.</p>' +
        '<p>Tuck behind a rival for a slipstream. Grass is slow. Walls cost speed and add damage. Damage lowers your top speed until you repair.</p>' +
        '<p>On a phone or with touch controls on, the pad is steer and gas. DRIFT and NITRO sit on the right during a race. The big ENTER button is the same as ' + key('enter', '<kbd>F</kbd>') + '.</p>' +
        '<p><b>Two cities.</b> F3, the title button, Settings, or the corner button switches the flat city and the 3D city. In 3D, V cycles cockpit, the camera ahead (with the road in the corner), chase, and a top-down view. The label reads Camera: Chase [V]. In 2D, V calls your garage car. <b>Escape</b> is a separate run from the title screen or the city menu. You start wanted. Escape coins buy Escape cars only, and the daily cash bonus is capped.</p>' },
      { id: 'city', name: 'City', html:
        '<p>' + key('action', '<kbd>E</kbd>') + ' talks to someone on the street and walks you through a marked door. Inside, walk up to the counter and press E again. The exit is the south door. ' + key('pause', '<kbd>Esc</kbd>') + ' opens the menu.</p>' +
        '<p><b>Getting in.</b> Walk up to your own car, a car you called, or any car left at a curb, lot, or driveway. ' + key('enter', '<kbd>F</kbd>') + ' and ' + key('action', '<kbd>E</kbd>') + ' both get you in. ' + key('steal', '<kbd>C</kbd>') + ' still does it. Reach is about one and a half car lengths. The nearest car shows <b>[F] Enter</b> for yours and <b>[F] Steal</b> for someone else, and it lights up. On touch, the big ENTER button does the same thing. A moving traffic car slows and stops when you walk up beside it.</p>' +
        '<p><b>Map.</b> ' + (RL.Input ? '' : '') + '<kbd>M</kbd>, the map button, or a click on the minimap opens the city map. The legend is you, roads, parks, shops, police, crime, race, hospital, story, and tags. Click a district to read what it is for. <kbd>M</kbd> or <kbd>Esc</kbd> closes the map before the pause menu.</p>' +
        districts() +
        '<p>Every building is a room. Walk through the door, then talk to the person at the counter. The exit is the south door. The shop, dealership, garage, race office, bar, training oval, precinct, hideout, hospital, and diner all work this way. At a shop door, or at the counter inside, ' + key('steal', '<kbd>C</kbd>') + ' robs the till. Rob the register does the same. Away from a shop, ' + key('steal', '<kbd>C</kbd>') + ' still steals a car. The dragway starter stages a quarter mile. Pit Lane stages that same drag, and a second person posts the street meet. The dragway tower outside is the same room.</p>' },
      { id: 'heat', name: 'Heat', html:
        '<p>One star is a real offense, not a nudge. Clipping a sign or a slow bump adds nothing. Wrecking cars, hitting a cruiser, running a light, and holding a high speed add heat. Four and five stars take a long spree.</p>' +
        '<p>Stars do not stop at five. The board shows up to five stars, then a count such as ★ x12. Stars stay up while anyone can see you. Break line of sight and stay hidden. The HUD shows a white cooldown: ' +
        RL.Heat.formatCooldown(RL.Heat.hideSeconds(1)) + ' at one star, ' +
        RL.Heat.formatCooldown(RL.Heat.hideSeconds(5)) + ' at five, and ' +
        RL.Heat.formatCooldown(RL.Heat.hideSeconds(8)) + ' at eight. Past five, every extra star waits longer. If they spot you, that clock resets. When it hits zero, one star drops.</p>' +
        '<p>Each new star adds bounty, and a higher star adds more than the one before it. Running someone over, ramming a car, or wrecking one adds bounty too. Losing the police pays nothing and does not wipe it. The bounty stays until a cop busts you.</p>' +
        '<p>One star is one cruiser, slower than a decent car. More stars add cars, then a roadblock, spikes, and a helicopter, up to a squad you can still dodge. Cruisers start off the screen, on a road, and drive in. A stuck cruiser reverses and looks for another street. It does not pop in beside you. A hard turn opens a gap. A bust is a fine and a tow, not a payout.</p>' +
        '<p>' + fromModule('Foot', fromModule('Health', 'Leaving the car does not end a chase. Officers can follow on foot. You and those officers have health. Hits spend health. At empty health you go down and wake up patched, not paid. The hospital repairs the car. The diner patches a little damage for less money. Health is not cash and it is not heat.')) + '</p>' },
      { id: 'crime', name: 'Crime', html:
        '<p><b>Stealing.</b> Walk up and press ' + key('enter', '<kbd>F</kbd>') + ', ' + key('action', '<kbd>E</kbd>') + ', or ' + key('steal', '<kbd>C</kbd>') + '. The prompt says <b>[F] Steal</b>. Traffic cars stop for you. Parked cars sit on curbs, in lots, and in driveways: beaters in the industrial district, sports and exotics downtown and in the rich districts, and rarer cars tucked in alleys. A carjack adds heat. Breaking into a parked car adds less, and only if a person, a driver, or the police can see you. It pays nothing and it is not added to your garage. You can shove a parked car and wreck it. It comes back later. Races and the drag strip still use the car you own. At 100% damage a stolen car explodes and you are back in your own car, or on foot if it is parked nearby.</p>' +
        '<p><b>Shops.</b> Walk into the room and up to the counter, or stop at the door. In the 3D city the lot is the door. The parts shop, Quick Mart, the dealership, Chandler, scrap, customs, the diner, and Nitro Fuel all have a register. ' + key('action', '<kbd>E</kbd>') + ' talks to the clerk. ' + key('steal', '<kbd>C</kbd>') + ' at that counter, or at the door outside, takes the cash. The Rob button does the same. Away from a till, ' + key('steal', '<kbd>C</kbd>') + ' still steals a car. Wanted stars go up, and the bounty beside them goes up with those stars. Each till stays empty for about a minute. A badge stays on the right side of the counter. The bank and the hideouts still run the longer heist.</p>' +
        '<p><b>Your car.</b> The prompt says <b>[F] Enter</b>. ' + key('summon', '<kbd>V</kbd>') + ', the CAR button, or Call car on the phone parks the garage car beside you. It does not copy a car into the garage. It waits a few seconds between calls, and it will not come at 3 stars or while you are busted.</p>' +
        '<p><b>Roles.</b> You start neutral. Role HQ switches you to police or criminal on a cooldown, and only with a clean record. Neutrals are ignored for small speeding. Criminals heat up faster. Police use the siren (<kbd>L</kbd> or SIR) on a call and start dispatch at the precinct. If a cop picks up a wanted star, they become Neutral immediately and cannot change roles for 5 minutes. The timer shows on screen and is stored in the save. Criminals start jobs at the chop shop and the safehouse.</p>' +
        '<p><b>Known face.</b> ' + ((RL.Roles && RL.Roles.drawbackText) ? RL.Roles.drawbackText() : 'Police shoot criminals on sight even with no wanted stars. The shot is telegraphed and easy to dodge. Shops cost more and heat falls slower.') + '</p>' +
        '<p><b>Escape.</b> ' + fromModule('Escape', 'Open it from the title screen or the city menu. You start wanted on Glassline, Salt Span, Whiteout, or Pine Mile. The run ends when health hits zero. Score is time, near misses, takedowns, and cash. Escape coins buy Escape cars only. Career cash from a run is a small bonus capped per day. R restarts. Space is the handbrake. Shift or N is boost.') + '</p>' },
      { id: 'race', name: 'Races', html:
        '<p>League nights are in the Race Office. Finish top 3 in all three races to unlock the boss. Beat the boss to move up. Story scenes play between races. Dialogue choices stick.</p>' +
        '<p>Side events include time trial, drift, elimination, and ghost. A blown engine in a race puts you back at the last checkpoint with a time penalty.</p>' +
        '<p><b>Drag.</b> Walk into the dragway or Pit Lane and talk to the starter. A drag is a normal race on a flat straight, with the same car, the same physics, the same HUD, and the same opponent. Quarter mile is about 400 m. Half mile is about 800 m. The finish line is the far end, so acceleration and top speed decide it. The booth changes the length and the stake. Enter on that booth stages the first race you can afford. The drag uses your own car, not a stolen one.</p>' +
        '<p><b>Free Play</b> is any circuit, laps, AI count, weather, time of day, damage, nitro, catch-up, class, reverse, and collisions. Saved tracks show up there.</p>' +
        '<p><b>AI difficulty</b> in Settings is Easy, Normal, Hard, or Legend. It scales league races, bosses, and Free Play.</p>' },
      { id: 'online', name: 'Online', html:
        '<p><b>Phone.</b> ' + key('phone', '<kbd>B</kbd>') + ' or TXT. Threads stay in the save. UNKNOWN texts at story beats. The reply uses the in-browser model, or a scripted fallback when WebGPU is off. Chat does not pay. Call car is on the phone too. ' + fromModule('Phone', '') + '</p>' +
        '<p>' + fromModule('Servers', fromModule('Net', 'Multiplayer is a room. Host from the title screen, the city menu, or the Race Office, and share the 4-character code. Friends join on that code. A city server, when the list is there, is the same streets with other drivers already on them. You bring your career car and your name. AI fills empty seats. A room race does not change league progress.')) + '</p>' +
        '<p><b>City servers.</b> Downtown rooms are on the title screen and in the city menu. Other drivers show their names, wanted stars, and the bounty on them. A cop can stop a criminal or anyone who is wanted and take that bounty. The database decides the amount. Google sign-in posts the bust to the all-time board. Guests can ride, and they stay off that board. A 4-character race room is separate and does not change league progress.</p>' +
        '<p>The bar still has scripted talk with no connection. Chat freely, in Settings, runs a small model in this browser. Nothing is sent to a chat server.</p>' },
      { id: 'editor', name: 'Editor', html:
        '<p>The track editor places waypoints. Drag them with the mouse or a finger. Scroll or pinch to zoom. The status line says whether the circuit is closed and drivable. Test drive it before you trust it.</p>' +
        '<p>Save on this device, or share a short code or a JSON file. Publish to Community Tracks for newest, top rated, and most played. Share codes still work if that list is offline.</p>' },
      { id: 'saves', name: 'Saves', html:
        '<p>The career is stored on this device under <b>' + esc(RL.SAVE_KEY || 'redline_legends_save_v1') + '</b>. Updates keep that career. A backup slot is kept if the main save cannot be read.</p>' +
        '<p>Settings can export a file or a code, and import one. Importing replaces the career here and keeps the previous one in the backup. The street tutorial can be replayed from How to Play or Settings. Replaying it does not pay the first-run reward again.</p>' +
        '<p><button class="primary" data-act="replay">Replay the street tutorial</button></p>' },
      { id: 'view', name: '2D / 3D', html:
        '<p><b>One career, two cities.</b> F3, the Switch to 3D button on the title screen, the corner button, and Settings switch between the flat city and the 3D city. The last choice is remembered. Money, cars, story, roles, and wanted heat stay on the same save. If WebGL is missing, the game stays in 2D and says so.</p>' +
        '<p><b>3D cameras.</b> In the 3D city, <kbd>V</kbd>, the Cam button, the touch CAM button, or Settings cycles four views. Cockpit sits inside the cabin. The camera ahead looks back at the car, with the road in front shown in the corner so you can still drive. Chase is the view behind the car, and it is the default. Top-down is overhead and stays above the roofs. Settings keeps it north-up or turns it with the car. Switching shows a label such as Camera: Chase [V]. On foot the same cycle is first person, a view ahead, a chase view, and top-down. Left and right steer the car, not the picture: the camera ahead looks back at you, so a left turn can move the other way on the screen. Walls stop the chase and front cameras.</p>' +
        '<p>In the 2D city, <kbd>V</kbd> calls your garage car. It does not change the camera.</p>' },
      { id: 'controls', name: 'Controls', html:
        '<p><b>Keyboard.</b> Gas ' + key('up', '<kbd>W</kbd>') + ', brake ' + key('down', '<kbd>S</kbd>') + ', steer ' + key('left', '<kbd>A</kbd>') + ' ' + key('right', '<kbd>D</kbd>') + ', drift ' + key('drift', '<kbd>Space</kbd>') + ', nitro ' + key('nitro', '<kbd>Shift</kbd>') + ', enter a car ' + key('enter', '<kbd>F</kbd>') + ' or ' + key('action', '<kbd>E</kbd>') + ', steal ' + key('steal', '<kbd>C</kbd>') + ', phone ' + key('phone', '<kbd>B</kbd>') + ', call car in 2D ' + key('summon', '<kbd>V</kbd>') + ', 3D camera <kbd>V</kbd>, switch city <kbd>F3</kbd>, map <kbd>M</kbd>, pause ' + key('pause', '<kbd>Esc</kbd>') + '. Also <kbd>I</kbd> inventory, <kbd>K</kbd> skills, <kbd>J</kbd> quests, <kbd>G</kbd> garage, <kbd>H</kbd> dailies, <kbd>L</kbd> siren when you are police. <kbd>F</kbd> is photo mode when no car is in reach.</p>' +
        '<p><b>Touch.</b> Turn touch controls on in Settings, or use a touch screen. The left pad is gas, brake, and steer. The big ENTER button gets into your car or a nearby one. ACT talks and uses doors. TXT is the phone. CAR calls your car. SIR is the police siren. In a race, DRIFT and NITRO replace those. The small button pauses.</p>' }
    ];
  }

  function show(tab) {
    const list = sections();
    const view = {
      title: 'How to Play',
      cls: 'wide help-panel',
      tab: list.some((s) => s.id === tab) ? tab : list[0].id,
      render: () => {
        const current = view.tab;
        const body = list.find((s) => s.id === current) || list[0];
        return '<div class="tabs help-tabs">' + list.map((s) => '<button data-act="tab" data-arg="' + s.id + '" class="' + (s.id === current ? 'on' : '') + '">' + esc(s.name) + '</button>').join('') + '</div><div class="help-body">' + body.html + '</div>';
      },
      acts: {
        tab: (id) => { if (list.some((s) => s.id === id)) view.tab = id; },
        replay: () => {
          RL.UI.closeAll();
          if (RL.Tutorial) RL.Tutorial.startFresh();
          else RL.UI.toast('Tutorial is not loaded');
        }
      }
    };
    RL.UI.open(view);
  }

  return { show, sections };
})();
