/* story.js - Narrative content for Redline Legends.
   Scenes, rival arcs, and bar talk. Saves stay compatible: progress is just
   flags, quest ids, and an optional storyQueue array. Missing fields are filled
   in by Game.normalize. Quest ids m1-m6 and s1-s6 are unchanged.

   Money-versus-respect choices set flags once. Later scenes and the epilogue
   read those flags. Repeat visits do not pay twice. */
(function () {
  const COL = {
    mags: '#ffe03b', dana: '#ff3b6b', tom: '#c9d1d9', kim: '#7dff5a', rita: '#c86bff',
    vex: '#7dff5a', rook: '#b6ff9a', tia: '#ff6a00', jinx: '#e08cff', brick: '#ff8a2e',
    sal: '#d9a35b', pike: '#d5dde6', blaze: '#ff5a7a', neko: '#3fa9ff', roxy: '#ff2ef0',
    kai: '#2ee6ff', nova: '#8eb4ff', vince: '#ffb02e', lola: '#9ad8ff', city: '#9fb3c8',
    phantom: '#ffffff'
  };

  function has(flag) { return function (s) { return !!(s.flags && s.flags[flag]); }; }
  function lacks(flag) { return function (s) { return !(s.flags && s.flags[flag]); }; }
  function lacksAll(flags) {
    return function (s) {
      for (let i = 0; i < flags.length; i++) if (s.flags && s.flags[flags[i]]) return false;
      return true;
    };
  }
  function doneQuest(s, id) { return !!(s.quests && s.quests.done && s.quests.done.indexOf(id) >= 0); }
  function activeQuest(s, id) { return !!(s.quests && s.quests.active && s.quests.active.indexOf(id) >= 0); }
  function notStarted(id) {
    return function (s) { return !doneQuest(s, id) && !activeQuest(s, id); };
  }
  function talked(s, id) { return !!(s.talked && s.talked[id]); }
  function lv(s) { return s.league || 1; }

  function C(t, effects, next, when) {
    const c = { t: t, next: next || null };
    if (effects) c.effects = effects;
    if (when) c.when = when;
    return c;
  }
  function N(text, choices) { return { text: text, choices: choices }; }
  function say(who, color, text, when, els) {
    const line = { who: who, color: color, text: text };
    if (when) line.when = when;
    if (els) line.else = els;
    return line;
  }

  RL.DIRTY_FLAGS = ['vexDeal', 'vexDouble', 'brickShakedown', 'salSold', 'blazeCheat', 'kaiSold', 'vinceFix', 'rookCold'];
  RL.HONOR_FLAGS = ['vexRefused', 'vexSorry', 'vexHandshake', 'brickMentor', 'salAlly', 'blazeTold', 'kaiFree', 'vinceReal', 'rookStood', 'jinxClean', 'hungMask'];
  RL.moralScore = function (s) {
    const flags = (s && s.flags) || {};
    let honor = 0, dirty = 0, i;
    for (i = 0; i < RL.HONOR_FLAGS.length; i++) if (flags[RL.HONOR_FLAGS[i]]) honor++;
    for (i = 0; i < RL.DIRTY_FLAGS.length; i++) if (flags[RL.DIRTY_FLAGS[i]]) dirty++;
    return { honor: honor, dirty: dirty };
  };
  function dirtyAtLeast(n) { return function (s) { return RL.moralScore(s).dirty >= n; }; }
  function cleanSheet(s) { return RL.moralScore(s).dirty < 3; }

  /* Crewmates who actually show up on the grid, in story order. */
  RL.CREW = {
    1: ['Rook', 'Turbo Tia', 'Jinx', 'Neko', 'Mack'],
    2: ['Pike', 'Blaze', 'Turbo Tia', 'Dex', 'Jinx'],
    3: ['Roxy', 'Neko', 'Kai', 'Blaze', 'Pike'],
    4: ['Nova', 'Roxy', 'Turbo Tia', 'Pike', 'Lola']
  };
  RL.CREW_AI = {
    Rook: 'clean', 'Turbo Tia': 'nitro', Jinx: 'aggressive', Neko: 'clean', Mack: 'aggressive',
    Pike: 'clean', Blaze: 'aggressive', Dex: 'nitro', Roxy: 'clean', Kai: 'clean',
    Nova: 'clean', Lola: 'clean'
  };

  RL.NPC_ORDER = ['rook', 'tia', 'jinx', 'mags', 'dana', 'tom', 'kim', 'rita', 'brick', 'sal', 'pike', 'blaze', 'vex', 'neko', 'roxy', 'kai', 'nova', 'vince', 'lola'];

  RL.NPCS = {
    rook: { name: 'Rook', color: COL.rook, bio: 'Dock kid. Memorizes lap times because nobody else remembers him.', start: 'rk0',
      route: function (s) {
        const f = s.flags || {};
        if (f.champion) return 'rkEnd';
        if (lv(s) >= 4 || f.leagueBoss3) return 'rkL4';
        if (lv(s) >= 2 || f.leagueBoss1) return 'rkL2';
        if (f.rookStood) return 'rkStood';
        if (f.rookCold) return 'rkCold';
        if (talked(s, 'rook')) return 'rkBack';
        return 'rk0';
      },
      nodes: {
        rk0: N('I am Rook. I time everybody off the harbor wall. You were fast. Not lucky-fast. Fast-fast. Tia says I should stop saying that out loud.', [
          C('Keep saying it. What is your name again?', { respect: 2 }, 'rkBack'),
          C('Stay off the wall when we race. It is not safe.', null, 'rkBack')
        ]),
        rkBack: N('I wrote your name on the pylon in chalk. Brick will wash it off. I will write it smaller.', [
          C('Leave room for the rest of the season.', null, null)
        ]),
        rkStood: N('You stepped in front of Tia. I have never seen her blink before. I am going to time your races until the chalk runs out.', [
          C('Time the clean laps. Ignore the crashes.', null, null)
        ]),
        rkCold: N('You told me to handle Tia myself. I am handling it. I just do not stand where she can see the stopwatch anymore.', [
          C('That is still standing.', null, null)
        ]),
        rkL2: N('The dunes ate my radio for a day. I still have your harbor splits. Sal\'s navigator, Pike, asked who taught you not to lift. I said nobody. You just do not.', [
          C('Tell Pike the car is still a hatch.', null, null)
        ]),
        rkL4: N('I came up the highway on a bus. I am not racing. I am witnessing. If the mask comes off, I want the name spelled right.', [
          C('Spell it the way the chalk had it.', null, null)
        ]),
        rkEnd: N('I told the harbor. Half of them believed me before the lights went out, and all of them believe me now. Your name is on the pylon in paint. Brick said the paint can stay.', [
          C('Leave a blank line under it.', null, null)
        ])
      } },

    tia: { name: 'Turbo Tia', color: COL.tia, bio: 'Brick\'s prospect. Loud nitro, louder mouth, secretly keeping score.', start: 'ti0',
      route: function (s) {
        const f = s.flags || {};
        if (f.champion) return 'tiEnd';
        if (lv(s) >= 4 || f.leagueBoss3) return 'tiL4';
        if (lv(s) >= 2 || f.leagueBoss1) return 'tiL2';
        if (f.rookStood || f.rookCold) return 'tiAfter';
        return 'ti0';
      },
      nodes: {
        ti0: N('Shopping cart with a license. That is you. And Rook is over there timing you like you are already somebody. Cute. Embarrassing. Mostly for him.', [
          C('Leave Rook alone.', { respect: 4, flag: 'rookStood' }, 'tiStood', lacksAll(['rookStood', 'rookCold'])),
          C('Not my problem. Here is your win.', { money: 100, flag: 'rookCold' }, 'tiCold', lacksAll(['rookStood', 'rookCold'])),
          C('Race me when the mouth gets tired.', null, null)
        ]),
        tiStood: N('You stepped in. Fine. The kid can keep his little clock. It will not make your hatch quicker, and it will not make me nicer.', [
          C('I did not ask you to be nicer.', null, null)
        ]),
        tiCold: N('Smart. Dock politics are a tax. You just paid the cheap rate. Rook will learn. Everybody learns.', [
          C('Keep the bill. Drive.', null, null)
        ]),
        tiAfter: N('You are still here. Annoying. Brick is going to try to become a wall. When he does, do not lift just because he is big. Big is not fast.', [
          C('Advice from you?', null, null),
          C('You racing for him, or for you?', null, 'tiSelf')
        ]),
        tiSelf: N('For the lap. The crew is just who holds the light. Do not tell Brick I said that. He thinks loyalty is a kind of horsepower.', [
          C('Your secret is safe. Your trash talk is not.', null, null)
        ]),
        tiL2: N('Desert is worse than you. I spun twice and blamed the sand, which is coward talk and I know it. Sal does not even trash you. She just drives. I hate that I respect it.', [
          C('Come back when you want a clean rematch.', { respect: 1, flag: 'tiaDesert' }, null, lacks('tiaDesert')),
          C('The sand did not make you lift. You did.', null, null)
        ]),
        tiL4: N('I am not Brick\'s prospect up here. I entered myself. If you beat the mask, I want the rematch with no crew and no favor. Just the line.', [
          C('You will get it.', { respect: 2, flag: 'tiaRematch' }, null, lacks('tiaRematch')),
          C('Get in line behind the Phantom.', null, null, has('tiaRematch'))
        ]),
        tiEnd: N('Do not get sentimental, hatchback. That was the best race this city has had. Rematch someday. No crew. No mask. I will even let Rook hold the watch.', [
          C('He already started.', null, null)
        ])
      } },

    jinx: { name: 'Jinx', color: COL.jinx, bio: 'Harbor bookie. Bets against you until the math gets embarrassing.', start: 'j0',
      route: function (s) {
        const f = s.flags || {};
        if (f.jinxBet && f.leagueBoss1 && !f.jinxPaid) return 'jPay';
        if (f.champion) return 'jEnd';
        if (!f.jinxBet && !f.jinxClean) return 'j0';
        if (lv(s) >= 3) return 'jLate';
        return 'jLater';
      },
      nodes: {
        j0: N('I like customers who smile after Rush Hour. Marker on Brick: if you beat him, I pay eight hundred. If you do not, I keep the story and you keep the bruises.', [
          C('Take the marker.', { flag: 'jinxBet' }, 'jBet', lacksAll(['jinxBet', 'jinxClean'])),
          C('I race clean. Keep your marker.', { respect: 3, flag: 'jinxClean' }, 'jClean', lacksAll(['jinxBet', 'jinxClean']))
        ]),
        jBet: N('Beautiful. I will be poor and delighted, or rich and unsurprised. Both are business.', [
          C('Do not spend it early.', null, null)
        ]),
        jClean: N('Clean. Disgusting. I had a whole side book ready. Now I have principles in my teeth.', [
          C('Floss.', null, null)
        ]),
        jLater: N('The book is quiet when you will not bite. People keep asking what you are worth. I tell them the truth: more than the marker, and worse for me.', [
          C('Keep the truth expensive.', null, null)
        ]),
        jLate: N('Vipers wanted a piece of my book. I said the house does not get the harbor. That may have been you rubbing off, which I resent and will bill you for later.', [
          C('Send the bill to the Phantom.', null, null)
        ]),
        jPay: N('I am ruined and delighted. Eight hundred. Count it somewhere I can suffer.', [
          C('Pay up, Jinx.', { money: 800, flag: 'jinxPaid' }, null)
        ]),
        jEnd: N('You cost me a fortune in bets I did not get to place, or a fortune I paid with a smile. Either way the neon knows your price now, and it is rude.', [
          C('Then stop pricing me.', null, null)
        ])
      } },

    mags: { name: 'Mags (Mechanic)', color: COL.mags, bio: 'Keeps the garage lights on. Knows the racing line a little too well.', start: 'm0',
      route: function (s) {
        const f = s.flags || {};
        if (f.champion) return 'mEnd';
        if (lv(s) >= 4 || f.leagueBoss3) return 'mL4';
        if (lv(s) >= 3 || f.leagueBoss2) return 'mL3';
        if (lv(s) >= 2 || f.leagueBoss1) return 'mL2';
        if (talked(s, 'mags')) return 'mBack';
        return 'm0';
      },
      nodes: {
        m0: N('Kid, every legend starts in a junk hatchback. The Phantom still pays for their own tires. Remember that when somebody offers you easy money.', [
          C('Advice, please. (+Respect)', { respect: 5 }, 'm1'),
          C('Cash. I need parts. (+$150)', { money: 150, flag: 'magsCash' }, 'm2', lacks('magsCash')),
          C('Got any work for me?', { quest: 's4' }, 'm3', notStarted('s4'))
        ]),
        m1: N('Drift through corners to fill nitro, then fire it on the straights. Stay out of the walls. Repairs are not free, and neither is a second chance at a corner.', [
          C('Got it.', null, null)
        ]),
        m2: N('Here. Do not blow it all on paint. Paint does not hold a line. Tires do.', [
          C('Thanks, Mags.', null, null)
        ]),
        m3: N('Elimination races separate the brave from the broke. Win one and I will make it worth the dents.', [
          C('You are on.', null, null)
        ]),
        mBack: N('Hatch still in one piece? Good. The docks will try to tax you in pride. Pay in driving, not in favors. Whoever is under that Phantom helmet still buys their own bolts.', [
          C('You talk like you have seen the bolts.', null, 'mSlip'),
          C('I will bring it back in one piece.', null, null)
        ]),
        mSlip: N('I talk like a person who has swept a lot of garages. Do not start a religion about it. Go race.', [
          C('Yes, boss.', null, null)
        ]),
        mL2: N('The bowl at the end of the dunes: do not lift. I have... a driver told me that. In the shop. Obviously. Sal hates being crowded. Give her air and she stays honest.', [
          C('You have driven that bowl.', null, 'mL2b'),
          C('Air, not ego. Noted.', null, null)
        ]),
        mL2b: N('I have driven a lot of things that are none of your business yet. Hands hurt. Old habit. Go make Pike nod. That is the only review that matters out there.', [
          C('I will bring the car back dusty.', null, null)
        ]),
        mL3: N('I will miss some nights at the bar. The mountain feed is enough, and my hands ache when it snows. Old injury. Do not read into it. Grip is the whole religion up there.', [
          C('I will read into it a little.', null, 'mL3b'),
          C('Tires, not bravery. I remember.', null, null)
        ]),
        mL3b: N('Read the track, not me. Vex spends nitro like it is somebody else\'s money. It is. Do not become a person who spends people.', [
          C('I hear you.', null, null)
        ]),
        mL4: N('I am closing early. There is a race I should not watch, and I will. Whatever is under that helmet: do not hate the mask. Hate how many years it costs.', [
          C('Are you Maggie Voss?', { flag: 'magsAsked' }, 'mAsk', lacks('magsAsked')),
          C('I will be on the line.', null, null),
          C('Got any work for me?', { quest: 's4' }, null, notStarted('s4'))
        ]),
        mAsk: N('After the finish. Not before. I need to see the line honest, {name}. That is all you get tonight. Go make it true.', [
          C('After, then.', null, null)
        ]),
        mEnd: N('Neon stays on. That is the job. It was always the job. The mask is on the bench until you say otherwise.', [
          C('Hang the mask in the garage. (+Respect)', { respect: 10, flag: 'hungMask' }, 'mHung', lacksAll(['hungMask', 'woreMask'])),
          C('I will wear it. One season. (+$1000)', { money: 1000, respect: 2, flag: 'woreMask' }, 'mWore', lacksAll(['hungMask', 'woreMask'])),
          C('Close up with me.', null, 'mClose')
        ]),
        mHung: N('Right nail. Beside the torque wrench, not over the door. Legends that stay on the hook can still hand you a spanner.', [
          C('Keep the lights, Mags.', null, null)
        ]),
        mWore: N('One season. I will hold you to the number. If you are still wearing it when the next hungry hatch shows up, I will be disappointed in a very quiet way.', [
          C('One season. I heard you.', null, null)
        ]),
        mClose: N('Good. The city can shout. We have oil to change.', [
          C('Best job I have had.', null, null)
        ])
      } },

    dana: { name: 'Drift Dana', color: COL.dana, bio: 'Scores angles the way other people score wins.', start: 'd0',
      route: function (s) {
        const f = s.flags || {};
        if (f.champion) return 'dEnd';
        if (lv(s) >= 4 || f.leagueBoss3) return 'dL4';
        if (lv(s) >= 3 || f.leagueBoss2) return 'dL3';
        if (lv(s) >= 2 || f.leagueBoss1) return 'dL2';
        if (doneQuest(s, 's1') && f.danaBet && !f.danaPaid) return 'dPay';
        if (doneQuest(s, 's1')) return 'dWon';
        if (f.danaBet) return 'dBet';
        if (talked(s, 'dana')) return 'dCoach';
        return 'd0';
      },
      nodes: {
        d0: N('You call that sliding? I have seen shopping carts with more angle.', [
          C('Teach me then.', { quest: 's1', respect: 2 }, 'd1'),
          C('Bet you $100 I can out-drift you someday.', { quest: 's1', flag: 'danaBet' }, 'd2')
        ]),
        d1: N('Hold the drift button into the turn, counter-steer out. Score 4000 in a Drift Challenge and I will hook you up.', [
          C('Deal.', null, null)
        ]),
        d2: N('Ha! Score 4000 in a Drift Challenge first, rookie. Then we talk about your hundred.', [
          C('Watch me.', null, null)
        ]),
        dCoach: N('Again? The car will tell you when the angle is honest. If the tires shriek and the nose stays tame, you are posing. Pose less.', [
          C('Teach me then.', { quest: 's1', respect: 2 }, null, notStarted('s1')),
          C('I will go pose less.', null, null)
        ]),
        dBet: N('The hundred is still theoretical, which is my favorite kind of your money. Bring me the score.', [
          C('It is coming.', null, null)
        ]),
        dPay: N('Ugh. Fine. A hundred, and another hundred because you did it where I could see. Do not make a face. It ages you.', [
          C('Pay the bet.', { money: 200, flag: 'danaPaid' }, null)
        ]),
        dWon: N('You can slide. Do not let it make you poetic. Poetry is for the straights, after the nitro, when nobody is watching the rear tires.', [
          C('I will stay ugly in the corner.', null, null)
        ]),
        dL2: N('Sand punishes pretty drifts. Sal\'s line is ugly and correct. If you slide the bowl, do it because the corner asked, not because I am watching.', [
          C('The corner asks nicely?', null, null)
        ]),
        dL3: N('Ice is a liar. It feels like grip until it is a story you tell from a snowbank. Short angles. Long patience. Vex never learned the second one.', [
          C('Patience. Weird coming from you.', null, null)
        ]),
        dL4: N('I will be in the crowd, not the grid. The Phantom never slides for show. If you do, make it earn nitro. I did not teach you a parade.', [
          C('No parade.', null, null)
        ]),
        dEnd: N('The bet stands if one of us still owes a slide. We can argue at the bar, where the drinks are worse and the corners are theoretical.', [
          C('Theoretical corners. Your favorite.', null, null),
          C('Pay the bet.', { money: 200, flag: 'danaPaid' }, null, function (s) { return !!(s.flags && s.flags.danaBet) && doneQuest(s, 's1') && !(s.flags && s.flags.danaPaid); })
        ])
      } },

    tom: { name: 'Old Tom', color: COL.tom, bio: 'Remembers when the league still raced clean. Remembers a name he does not say yet.', start: 't0',
      route: function (s) {
        const f = s.flags || {};
        if (f.champion) return 'tEnd';
        if (lv(s) >= 4 || f.leagueBoss3) return 'tL4';
        if (lv(s) >= 3 || f.leagueBoss2) return 'tL3';
        if (lv(s) >= 2 || f.leagueBoss1) return 'tL2';
        if (talked(s, 'tom')) return 'tBack';
        return 't0';
      },
      nodes: {
        t0: N('Back in my day we raced clean. No smashing, no cheap shots. Rumor is the Phantom has never been touched in a race.', [
          C('Tell me about the Phantom.', null, 't1'),
          C('Clean racing? I can do that.', { quest: 's2', respect: 3 }, 't2', notStarted('s2')),
          C('Any rumors worth money?', { quest: 's6' }, 't3', notStarted('s6'))
        ]),
        t1: N('Nobody knows who they are. They only show up for the Neon Legends final. Some say it is a ghost. Some say it is a washed-up champ who could not stand a bought finish.', [
          C('Spooky.', { quest: 's3' }, null, notStarted('s3')),
          C('A washed-up champ sounds human.', null, null)
        ]),
        t2: N('Podium a race with barely a scratch and I will believe the old way still fits in a modern car.', [
          C('Count on it.', null, null)
        ]),
        t3: N('A rich collector pays big for anyone who clocks 300. You will need a serious car, and nitro you did not buy with a favor.', [
          C('Noted.', null, null)
        ]),
        tBack: N('The harbor used to cheer for doors that opened. Then it cheered for doors that stayed shut. You pick which noise you like.', [
          C('Clean racing? I can do that.', { quest: 's2', respect: 3 }, null, notStarted('s2')),
          C('I like the open kind.', null, null)
        ]),
        tL2: N('Sal races like the desert still has rules. The Vipers hate rules they did not write. If you sell her, do not come tell me about the old days after.', [
          C('I was not planning to sell anyone.', { respect: 1, flag: 'tomDesert' }, null, function (s) { return !(s.flags && (s.flags.salSold || s.flags.tomDesert)); }),
          C('Too late for that sermon.', null, null, has('salSold'))
        ]),
        tL3: N('I watched a champion hang the helmet up the night the Vipers started buying wins. I thought that was the end of the story. Lately the mountain feed has a driving style I know in my knees.', [
          C('What style?', null, 'tL3b')
        ]),
        tL3b: N('Late brake. Soft hands. Never spends the car to make a point. Mechanics drive like that, because they are the ones who pay for the point afterward.', [
          C('I will watch the hands, not the mask.', null, null)
        ]),
        tL4: N('You want a ghost story. I have a person story. It costs nothing and it will not sit quietly once you hear it.', [
          C('Who is Maggie Voss?', { flag: 'tomClue' }, 'tMaggie', lacks('tomClue')),
          C('Clean racing? I can do that.', { quest: 's2', respect: 3 }, null, notStarted('s2')),
          C('Keep it until the night is over.', null, null)
        ]),
        tMaggie: N('Maggie Voss. Last Legend before the mask. She quit the night the docks started selling the finish, or I thought she quit. Same hands. I would know them in the dark. I have dust in my eye. Leave it.', [
          C('I will ask the garage, not the ghost.', null, null)
        ]),
        tEnd: N('I said it was a washed-up champ. I did not say I was hoping. You drove it true. That is the old way, even with all this neon. Do not let them price it.', [
          C('I will not.', null, null)
        ])
      } },

    kim: { name: 'Coach Kim', color: COL.kim, bio: 'Believes laps are a moral position.', start: 'k0',
      route: function (s) {
        const f = s.flags || {};
        if (f.champion) return 'kEnd';
        if (lv(s) >= 3) return 'kLate';
        if (talked(s, 'kim')) return 'kBack';
        return 'k0';
      },
      nodes: {
        k0: N('The Training Track is free. Laps are XP. Three sessions and you will feel the difference in your hands, not your mouth.', [
          C('I will put in the work.', { quest: 's5', respect: 2 }, null, notStarted('s5')),
          C('Can\'t you just pay me to show up?', { quest: 's5', money: 50, flag: 'kimPaid' }, 'k1', function (s) { return notStarted('s5')(s) && !(s.flags && s.flags.kimPaid); })
        ]),
        k1: N('...Fine. Fifty bucks. Now go practice. If you only came for the fifty, the oval will know.', [
          C('Pleasure doing business.', null, null)
        ]),
        kBack: N('Sessions stack. Ego does not. Go put three more clean laps on the board before you invent a philosophy.', [
          C('I will put in the work.', { quest: 's5', respect: 2 }, null, notStarted('s5')),
          C('The oval and I have a meeting.', null, null)
        ]),
        kLate: N('Later leagues are practice with an audience. The Phantom\'s legend is a million laps nobody clapped for. Go be boring and fast.', [
          C('Boring and fast. My brand.', null, null)
        ]),
        kEnd: N('The oval still has your name on a lap. I do not paint names. You did, by repetition. That is the whole sport.', [
          C('I will come back and ruin the lap.', null, null)
        ])
      } },

    rita: { name: 'Rumor Rita', color: COL.rita, bio: 'Hears everything. Sells almost none of it. The rest she gives to you.', start: 'r0',
      route: function (s) {
        const f = s.flags || {};
        if (f.champion) return 'rEnd';
        if (lv(s) >= 4 || f.leagueBoss3) return 'rL4';
        if (lv(s) >= 3 || f.leagueBoss2) return 'rL3';
        if (lv(s) >= 2 || f.leagueBoss1) return 'rL2';
        if (talked(s, 'rita')) return 'rBack';
        return 'r0';
      },
      nodes: {
        r0: N('Psst. The ghost on the Race Office board? It is your best run. Beat yourself and you will beat anyone.', [
          C('Interesting... (+Ghost quest)', { quest: 's3' }, null, notStarted('s3')),
          C('What else have you heard?', null, 'r1')
        ]),
        r1: N('Rain cuts your grip hard. Snow cuts it worse. Tires with real grip are the difference between a rumor and a result.', [
          C('Thanks, Rita.', { respect: 1 }, null, lacks('ritaThanks')),
          C('I owe you a quieter secret someday.', { flag: 'ritaThanks' }, null, lacks('ritaThanks'))
        ]),
        rBack: N('New dock rumor: Brick tells the kids he is a wall, and the kids are starting to time the gaps in him. You are one of the gaps.', [
          C('Interesting... (+Ghost quest)', { quest: 's3' }, null, notStarted('s3')),
          C('Tell the kids to stand back from the wall.', null, null)
        ]),
        rL2: N('Somebody in a plain coat watched your dune line from the ridge and checked tire wear like a mechanic, not a fan. Mags was not at the bar that hour. I am only saying the hour.', [
          C('Keep the hour. I will keep the tires.', null, null)
        ]),
        rL3: N('Mags watches the mountain feed and does not blink. Vex blinks every time Kai walks in. One of those is a tell. I will let you do the math. I am generous.', [
          C('Your math is expensive.', null, null)
        ]),
        rL4: N('The Vortex came out of a closed garage at dusk. Hand weld on the rear subframe. This city has one person who still welds like that and pretends it is for collectors.', [
          C('Collectors. Sure.', null, null),
          C('Interesting... (+Ghost quest)', { quest: 's3' }, null, notStarted('s3'))
        ]),
        rEnd: N('Fresh rumor, still warm: the Legend has a face, the face has a wrench, and the neon answered anyway. I will not sell this one. Some stories should be free.', [
          C('Thanks for the free ones.', null, null)
        ])
      } },

    brick: { name: 'Brick Malone', color: COL.brick, bio: 'The dock door. Slow voice. He meant to stay shut.', start: 'brChoice',
      requires: 'leagueBoss1',
      route: function (s) {
        const f = s.flags || {};
        if (f.champion) return 'brEnd';
        if (!f.brickMentor && !f.brickShakedown) return 'brChoice';
        if (lv(s) >= 4 || f.leagueBoss3) return 'brL4';
        if (lv(s) >= 3 || f.leagueBoss2) return 'brL3';
        return 'brAfter';
      },
      nodes: {
        brChoice: N('Door opened. I am at a bar about it, which I hate. The kids on the harbor are going to ask me what happened. I can tell them a driver, or I can tell them a payday.', [
          C('Look after them. I will too. (+Respect)', { respect: 8, flag: 'brickMentor' }, 'brMentor', lacksAll(['brickMentor', 'brickShakedown'])),
          C('Your stash. Call it tuition. (+$600)', { money: 600, respect: -4, flag: 'brickShakedown' }, 'brShake', lacksAll(['brickMentor', 'brickShakedown'])),
          C('Tell them the truth either way.', null, null, hasAny(['brickMentor', 'brickShakedown']))
        ]),
        brMentor: N('Then I will say your name right. Do not make me a liar on the second half. The kids eat when the door is honest.', [
          C('I will not make you a liar.', null, null)
        ]),
        brShake: N('Count it. I will still tell them you were faster. I am not a total wall. I am just a disappointed one.', [
          C('Fair.', null, null)
        ]),
        brAfter: N('Vex will smile at you. That smile has a price tag on the back. I used to think the tag was strength. It is just a habit of taking.', [
          C('I saw the tag.', null, null)
        ]),
        brL3: N('Ice does not care that I lost. Vex cares. If you beat the house, come back and tell the kids the house can lose. They need that more than I need pride.', [
          C('I will bring the story back dirty or clean.', null, null)
        ]),
        brL4: N('The mask raced the docks before you were angry enough to matter. I never touched them. Nobody did. That felt like fear. Maybe it was just respect with bad manners.', [
          C('I will find out which.', null, null)
        ]),
        brEnd: N('I told them your name right. The paint on the pylon stays. If you turned the docks into a payday, spend some of it where they can see. If you did not, good. Stay that way.', [
          C('The door stays open.', null, null)
        ])
      } },

    sal: { name: 'Sidewinder Sal', color: COL.sal, bio: 'Dustline boss. Dry as the bowl she will not lift in.', start: 'sa0',
      requires: function (s) { return lv(s) >= 2; },
      route: function (s) {
        const f = s.flags || {};
        if (f.champion && f.salAlly) return 'saEndAlly';
        if (f.champion && f.salSold) return 'saEndSold';
        if (f.champion) return 'saEnd';
        if ((f.salAlly || f.salSold) && (f.unknownTold || f.unknownToldSal) && !f.salHeardNumber) return 'saNumber';
        if (f.salAlly) return 'saAlly';
        if (f.salSold) return 'saSold';
        if (f.leagueBoss2) return 'saChoice';
        return 'sa0';
      },
      nodes: {
        sa0: N('New paint. Old hunger. I am Sal. The dunes do not care who owns the docks. The Vipers burned a crew of mine for refusing a fixed finish. I do not fix finishes. I do not lift in the bowl.', [
          C('I am not here to fix anything.', { respect: 2, flag: 'salGreet' }, null, lacks('salGreet')),
          C('Then I will show you on the track.', null, null, has('salGreet')),
          C('Vex already made me an offer.', null, 'saWarn', has('vexDeal'))
        ]),
        saWarn: N('Then you already know the price of him. The dunes will show me whether you kept the receipt.', [
          C('You will see it in the race.', null, null)
        ]),
        saChoice: N('You drove that bowl like it owed you money. The Dustline does not hire. It rides with. Or you can take Vex\'s bounty on my name and we are done talking like people.', [
          C('I ride with the Dustline. (+Respect)', { respect: 10, flag: 'salAlly' }, 'saYes', lacksAll(['salAlly', 'salSold'])),
          C('I will take the bounty. (+$1500)', { money: 1500, respect: -8, flag: 'salSold' }, 'saNo', lacksAll(['salAlly', 'salSold']))
        ]),
        saYes: N('Radios stay open. I will not hold your mirror in the mountains. I will hold the Vipers to the story of how you drove.', [
          C('Hold them to it.', null, null)
        ]),
        saNo: N('Count it somewhere dusty. You got the bounty. You do not get the radio. Pike will still tell you the truth if you ask. He is bad at grudges. I am not.', [
          C('I heard you.', null, null)
        ]),
        saAlly: N('Vex smiles like a toll booth. Pay him nothing. The mountain is cruel, and he is worse, because the mountain does not send an invoice.', [
          C('No invoice.', null, null)
        ]),
        saSold: N('You still drive like a person I would have ridden with. That is the insult. Pick a side and stay on it.', [
          C('The side is already picked.', null, null)
        ]),
        saEndAlly: N('Dustline is with you, legend. Radios stay open. Do not let the city talk you into a fixed anything. We did not come this far to clap for a commercial.', [
          C('Radios stay open.', null, null)
        ]),
        saEndSold: N('You got your money. Drive like you still have to earn the rest of us. I will watch. I will not cheer. Pike might. He is a soft touch with a perfect read.', [
          C('I will earn the rest.', null, null)
        ]),
        saEnd: N('The desert felt that finish. You did not ask for a banner and I do not own one. Come drink water. It is the only honest thing in this bar.', [
          C('Water. Then another race.', null, null)
        ]),
        saNumber: N('That number texted you about my canyon. I do not know their face. I know they did not send an invoice. If you sold the number, do not tell me over water.', [
          C('I kept it.', { flag: 'salHeardNumber' }, null),
          C('I told them you do not sell finishes.', { respect: 1, flag: 'salHeardNumber' }, null, function (s) { return !(s.flags && s.flags.salHeardNumber); })
        ])
      } },

    pike: { name: 'Pike', color: COL.pike, bio: 'Sal\'s navigator. Speaks in lines, not sentences.', start: 'pk0',
      requires: function (s) { return lv(s) >= 2; },
      route: function (s) {
        const f = s.flags || {};
        if (f.champion) return 'pkEnd';
        if (talked(s, 'pike')) return 'pkBack';
        return 'pk0';
      },
      nodes: {
        pk0: N('Do not fill her mirrors. She goes faster when you make it personal. Bowl at the end. Do not lift.', [
          C('That is the whole speech?', null, 'pk1'),
          C('Blaze is selling that canyon.', { flag: 'blazeTold', respect: 2 }, 'pkTold', lacksAll(['blazeTold', 'blazeCheat']))
        ]),
        pk1: N('Yes.', [
          C('...Thanks.', null, null)
        ]),
        pkTold: N('I will tell her. She will race you anyway. She will just be disappointed in a straight line instead of a curve.', [
          C('Straight is fine.', null, null)
        ]),
        pkBack: N('You remembered. Good. Most people remember the speech. Few remember the not-lifting.', [
          C('Blaze is selling that canyon.', { flag: 'blazeTold', respect: 2 }, null, lacksAll(['blazeTold', 'blazeCheat'])),
          C('I will not lift.', null, null)
        ]),
        pkEnd: N('Did not lift. Knew you would not. That is all.', [
          C('That is enough.', null, null)
        ])
      } },

    blaze: { name: 'Blaze', color: COL.blaze, bio: 'Wants a Viper paycheck and will sell a canyon to get it.', start: 'bz0',
      requires: function (s) { return lv(s) >= 2; },
      route: function (s) {
        const f = s.flags || {};
        if (f.champion) return 'bzEnd';
        if (!f.blazeCheat && !f.blazeTold) return 'bz0';
        return 'bzAfter';
      },
      nodes: {
        bz0: N('Vex pays for Sal\'s canyon. I can sell it to you cheaper. Four hundred, and I miss a call. Or you can be noble and I can go find a poorer saint.', [
          C('Buy the canyon. (-$400)', { money: -400, flag: 'blazeCheat' }, 'bzBuy', function (s) { return (s.money || 0) >= 400 && !(s.flags && (s.flags.blazeCheat || s.flags.blazeTold)); }),
          C('Tell the Dustline. I am not buying a friend.', { respect: 6, flag: 'blazeTold' }, 'bzTell', lacksAll(['blazeCheat', 'blazeTold']))
        ]),
        bzBuy: N('Pleasure. She misses the left of the second bowl when she is angry. You did not hear it from a guy who likes getting paid twice.', [
          C('I heard it from the wind.', null, null)
        ]),
        bzTell: N('Wow. Actual spine. Vex will not love you for it, which is a sentence I am not used to saying with envy.', [
          C('Get used to it.', null, null)
        ]),
        bzAfter: N('The canyon paid somebody. Maybe you. Maybe not. I am still here because the mountain has buyers too. Do not look so finished.', [
          C('I am not your buyer.', null, null)
        ]),
        bzEnd: N('You won the night they said was not for sale. Irritating. If you need a rumor laundered, my rates went up out of respect.', [
          C('Keep the rates. Lose my number.', null, null)
        ])
      } },

    vex: { name: 'Vex (Vipers Crew)', color: COL.vex, bio: 'The house. Smiles like a toll booth.', start: 'v0',
      requires: 'leagueBoss1',
      route: function (s) {
        const f = s.flags || {};
        if ((f.champion || f.leagueBoss3) && !f.vexHandshake && !f.vexSlip) return 'vChoice';
        if (f.champion || f.leagueBoss3) return 'vEnd';
        if (!f.vexDeal && !f.vexRefused) return 'v0';
        if (f.unknownSold && !f.vexHeardNumber) return 'vNumber';
        if (lv(s) >= 3 || f.leagueBoss2) return 'vL3';
        if (f.vexDeal) return 'vDeal';
        return 'vRef';
      },
      nodes: {
        v0: N('So you are the nobody who embarrassed Brick. The Vipers run this city. Join us. Throw a race now and then, and I will pay you $1500 right now. The house looks after its own.', [
          C('Take the money. (+$1500, -Respect)', { money: 1500, respect: -10, flag: 'vexDeal', talk: 'vex' }, 'v1'),
          C('I don\'t throw races. (+Respect)', { respect: 15, flag: 'vexRefused', talk: 'vex' }, 'v2')
        ]),
        v1: N('Smart. Do not think that buys you a win against me in the mountains. It buys you a number in my phone and a habit you will call practical.', [
          C('...', null, null)
        ]),
        v2: N('Bold. Then I will see you on the ice, and I will not be holding back. Bold is just unpaid labor until it wins.', [
          C('Neither will I.', null, null)
        ]),
        vDeal: N('You took the money. Good. Spend it on tires, not a conscience. Consciences are heavy in the hairpins.', [
          C('I am not proud of it.', { respect: 5, flag: 'vexSorry' }, null, function (s) { return !(s.flags && (s.flags.vexSorry || s.flags.vexDouble)); }),
          C('Everything is for sale.', { money: 200, respect: -3, flag: 'vexDouble' }, null, function (s) { return !(s.flags && (s.flags.vexSorry || s.flags.vexDouble)); }),
          C('We will settle it on the ice.', null, null)
        ]),
        vRef: N('Still unbought. How theatrical. Bring that theater to the glacier and I will charge admission.', [
          C('Bring a real race.', null, null)
        ]),
        vL3: N('Sal cannot help you up there. The Dustline ends where the ice starts. Kai thinks there is a door out of my crew. There is a door. I own the hinge.', [
          C('Then race me for the hinge.', null, null),
          C('Kai is not your hinge.', { respect: 2, flag: 'kaiHinge' }, null, function (s) { return !(s.flags && (s.flags.kaiSold || s.flags.kaiHinge)); })
        ]),
        vChoice: N('You beat me on my own ice. Embarrassing, which is a feeling I usually invoice. The pink slip was the bet. The handshake is the other way this ends.', [
          C('Offer a handshake. (+10 Respect)', { respect: 10, flag: 'vexHandshake' }, 'vHand', lacksAll(['vexHandshake', 'vexSlip'])),
          C('Collect his pink-slip bet. (+$3000)', { money: 3000, flag: 'vexSlip' }, 'vSlip', lacksAll(['vexHandshake', 'vexSlip']))
        ]),
        vHand: N('Fine. The Vipers stop fixing races. Roxy can hold them to it. I have a long drive and no throne. Do not wave.', [
          C('I was not going to wave.', null, null)
        ]),
        vSlip: N('Count it. I am leaving the city before I become a story you tell kindly. Try not to become me with a nicer car.', [
          C('Drive far.', null, null)
        ]),
        vNumber: N('Someone sold me a number that had been counting my receipts. Cute. I pay for information once. I do not pay the same fact twice, and I do not need you to like the work.', [
          C('Keep the number. I am done translating it.', { flag: 'vexHeardNumber' }, null)
        ]),
        vEnd: N('The house lost. I can feel the room trying to decide if that makes you a new house. Do not. Houses get lonely and then they get cruel.', [
          C('I did not come here to be a house.', null, null)
        ])
      } },

    neko: { name: 'Neko', color: COL.neko, bio: 'Viper scout. Knew your harbor splits before you knew her name.', start: 'nk0',
      requires: function (s) { return lv(s) >= 3; },
      route: function (s) {
        const f = s.flags || {};
        if (f.champion) return 'nkEnd';
        if (f.nekoClue) return 'nkBack';
        return 'nk0';
      },
      nodes: {
        nk0: N('I timed you in the harbor. You did not see me. That was the job. Here is a freebie, which I will deny: the Phantom smells like engine grease and old coffee. Like a garage that refuses to close.', [
          C('How do you know the smell?', { flag: 'nekoClue' }, 'nk1'),
          C('Scouts should not give freebies.', { flag: 'nekoClue' }, 'nk1')
        ]),
        nk1: N('Because I stood downwind of a plain coat on the dune ridge. They checked your tire wear and left. Fans take photos. Mechanics take notes. Do not tell Vex I am poetic. He docks pay for poetry.', [
          C('Your secret is safe.', null, null)
        ]),
        nkBack: N('Kai is not a strategy. They are a person. I can scout a person without selling them. That is the new trick I am practicing.', [
          C('Practice it.', null, null, lacks('kaiSold')),
          C('You already let me sell them.', null, null, has('kaiSold'))
        ]),
        nkEnd: N('I watched the mask come off and did not sell the moment. Growth. Hideous, expensive growth. Buy me a coffee that is not a metaphor.', [
          C('Coffee. Not a metaphor.', null, null)
        ])
      } },

    roxy: { name: 'Roxy', color: COL.roxy, bio: 'Viper lieutenant. Hates a thrown race more than a lost one.', start: 'rx0',
      requires: function (s) { return lv(s) >= 3; },
      route: function (s) {
        const f = s.flags || {};
        if (f.champion) return 'rxEnd';
        if (f.kaiSold) return 'rxCold';
        if (f.kaiFree) return 'rxWarm';
        if (f.roxyHeard) return 'rxWait';
        return 'rx0';
      },
      nodes: {
        rx0: N('I am Roxy. I keep the Vipers pointed straight when Vex would rather point them at a wallet. Kai wants out. If you ask nicely, I can admit the crew is not a prison. If you ask for cash, we are done being polite.', [
          C('Can Kai leave clean?', { flag: 'roxyHeard', respect: 2 }, 'rxHeard'),
          C('Vex told you I can be bought.', { respect: 5, flag: 'vexSorry' }, 'rxSorry', function (s) { return !!(s.flags && s.flags.vexDeal) && !(s.flags && s.flags.vexSorry); }),
          C('I am just here to race.', null, null)
        ]),
        rxHeard: N('They can leave clean if you beat Vex fair. I will not bless a backstab. Win on the ice and I open the hinge myself.', [
          C('Fair. On the ice.', null, null)
        ]),
        rxSorry: N('Then say it on the glacier, not only in a bar. Sorry is a starter motor. It is not the race.', [
          C('I will say it with the car.', null, null)
        ]),
        rxWait: N('Kai is waiting on a finish, not a speech. Go give them one.', [
          C('I know the way to the ice.', null, null)
        ]),
        rxCold: N('You sold a sibling for a purse. I will still race you clean, because I do not become you just to punish you. Kai\'s absence is the punishment.', [
          C('I earned that.', null, null)
        ]),
        rxWarm: N('Kai has a shop to open. I have a crew to unteach. You have a mask to go look at. None of this works if you start fixing finishes. Do not start.', [
          C('I will not start.', null, null)
        ]),
        rxEnd: N('I will keep them honest. You keep the highway honest. That is the deal. It does not need a signature. It needs laps.', [
          C('Laps, then.', null, null)
        ])
      } },

    kai: { name: 'Kai', color: COL.kai, bio: 'Vex\'s sibling. Wants a shop that does not fix thrown races.', start: 'ka0',
      requires: function (s) { return lv(s) >= 3 && !(s.flags && s.flags.kaiSold); },
      route: function (s) {
        const f = s.flags || {};
        if (f.kaiFree) return 'kaFree';
        if (f.champion) return 'kaEnd';
        if (f.roxyHeard) return 'kaChoice';
        if (talked(s, 'kai')) return 'kaWait';
        return 'ka0';
      },
      nodes: {
        ka0: N('I am Kai. Vex\'s sibling, not Vex\'s plan. I want a shop that changes oil and refuses favors. If I run, he calls it betrayal. If you talk to Roxy first, there might be a door that is not a stunt.', [
          C('I will talk to Roxy.', null, 'kaWait'),
          C('Why should I care?', null, 'kaWhy')
        ]),
        kaWhy: N('Because he entered me in the mountain grid without asking. I am not a message. I am tired. That is the whole pitch. It is not a good pitch. It is a true one.', [
          C('True is enough. I will talk to Roxy.', null, null)
        ]),
        kaWait: N('Roxy listens to finishes more than speeches. If she has not heard you yet, she will. I can wait. I have waited through worse meetings than this.', [
          C('Wait a little longer.', null, null)
        ]),
        kaChoice: N('Roxy will allow it if the ice is fair. So. Do I open the shop, or does Vex get a report with my name on it?', [
          C('Open the shop. I will stand the story up. (+Respect)', { respect: 8, flag: 'kaiFree' }, 'kaYes', lacksAll(['kaiFree', 'kaiSold'])),
          C('Vex pays for this kind of news. (+$2000)', { money: 2000, respect: -10, flag: 'kaiSold' }, 'kaNo', lacksAll(['kaiFree', 'kaiSold']))
        ]),
        kaYes: N('Exit Ramp. That is the name. Oil, brakes, no favors. If you ever throw a race, do not bring the car to me. I would fix it and I would not forgive it.', [
          C('No favors. I heard.', null, null)
        ]),
        kaNo: N('Then at least you said it to my face. I will be gone before you spend it. Neko can tell you the note. I will not.', [
          C('...', null, null)
        ]),
        kaFree: N('The sign is up. Small. Honest. If you win the night, come by. I will pretend not to make a fuss and then I will make a fuss.', [
          C('I will come by.', null, null)
        ]),
        kaEnd: N('I watched from the service road. The mask came off and the city made a noise I want to hear again without being afraid of my own last name. Thank you for the shop. Thank you for the ice.', [
          C('Change my oil sometime.', null, null)
        ])
      } },

    nova: { name: 'Nova', color: COL.nova, bio: 'Lost to the Phantom. Never saw a face. Saw a habit.', start: 'nv0',
      requires: function (s) { return lv(s) >= 4; },
      route: function (s) {
        const f = s.flags || {};
        if (f.champion) return 'nvEnd';
        if (f.novaClue) return 'nvBack';
        return 'nv0';
      },
      nodes: {
        nv0: N('Nova. I lost to the Phantom and never saw a face. I saw a habit. They brake like a person who pays for their own repairs. Rule one: they are never touched. Rule two: they learned in a hatch, on these docks, a long time ago.', [
          C('A hatch. You are sure?', { flag: 'novaClue' }, 'nv1'),
          C('Never touched. I will try to be the first.', { flag: 'novaClue' }, 'nv1')
        ]),
        nv1: N('Sure as an old loss can be. They gave me the corner and took the straight, and they did it kindly, which was worse. Kindness from a mask means the person inside still thinks you can learn.', [
          C('Then I will learn in public.', null, null)
        ]),
        nvBack: N('Vince will offer you a theater. The Phantom hates theater. If you take the money, win anyway. Just do not expect the handshake to feel clean.', [
          C('I know what my hands are for.', null, null)
        ]),
        nvEnd: N('You did the thing I could not. You made the mask come off. I am going to sleep for a week and then I am going to time a lap for nobody. It will be the best lap I have had in years.', [
          C('Leave a light on the oval.', null, null)
        ])
      } },

    vince: { name: 'Vince', color: COL.vince, bio: 'Promoter. Sees a finish line and tries to put a logo on it.', start: 'vc0',
      requires: function (s) { return lv(s) >= 4; },
      route: function (s) {
        const f = s.flags || {};
        if (f.champion && f.vinceFix) return 'vcEndFix';
        if (f.champion) return 'vcEnd';
        if (!f.vinceFix && !f.vinceReal) return 'vc0';
        return 'vcAfter';
      },
      nodes: {
        vc0: N('Smile. You are about to be content. Four thousand if you make the final pretty: let the Phantom have a corner on camera, then take the win back. The purse pays even if the story is a little arranged.', [
          C('Take the theater money. (+$4000)', { money: 4000, respect: -6, flag: 'vinceFix' }, 'vcFix', lacksAll(['vinceFix', 'vinceReal'])),
          C('Race it real.', { respect: 8, flag: 'vinceReal' }, 'vcReal', lacksAll(['vinceFix', 'vinceReal']))
        ]),
        vcFix: N('Gorgeous. Cameras love a comeback that was gently encouraged. Try to look surprised. Surprise photographs better than honesty.', [
          C('I know how to look.', null, null)
        ]),
        vcReal: N('Artists. Fine. I will still point the cameras. I just will not promise the ending. Your funeral. Your poster. We will see which one prints.', [
          C('Print the real one.', null, null)
        ]),
        vcAfter: N('The grid is full of people who think they are above a purse. The grid is also full of my logos. Hold still when you win. Or don\'t. I have a long lens.', [
          C('Use the long lens. I am not posing.', null, null)
        ]),
        vcEnd: N('You gave me a finish I could not have storyboarded. Irritating and profitable. Come by if you want the poster. I will even spell the name right. Rook already threatened me.', [
          C('Spell it like the chalk.', null, null)
        ]),
        vcEndFix: N('The arranged version would have tested better with focus groups. The real one tested better with people. I hate that you were right. The check already cleared. Do not ask for a bonus for integrity.', [
          C('Integrity was the point. Keep the bonus.', null, null)
        ])
      } },

    lola: { name: 'Lola', color: COL.lola, bio: 'Night-circuit archivist. Falls in love with footnotes.', start: 'll0',
      requires: function (s) { return lv(s) >= 4; },
      route: function (s) {
        const f = s.flags || {};
        if (f.unknownTrust && !f.lolaOwnedIt) return 'llOwned';
        if (f.unknownSold && !f.lolaBurned) return 'llBurned';
        if ((f.unknownTold || f.unknownToldSal) && !f.lolaHeard) return 'llHeard';
        if (f.champion) return 'llEnd';
        if (f.lolaWeld) return 'llBack';
        return 'll0';
      },
      nodes: {
        ll0: N('Lola. I archive the night circuit, which is a polite way to say I obsess. The Vortex has a hand weld on the rear subframe that only one garage still does. Mags tells people it is for collectors. Collectors do not enter grudge finals.', [
          C('Mags. You are sure about the weld?', { flag: 'lolaWeld' }, 'll1'),
          C('Say the quiet part.', { flag: 'lolaWeld' }, 'll1')
        ]),
        ll1: N('Old Tom knows a retired name. Ask him about Maggie Voss before you ask the garage. If you ask the garage first, you will get a wrench and a subject change. Tom will get dust in his eye. Both are data.', [
          C('I will ask Tom.', null, null)
        ]),
        llBack: N('I entered a race so I would stop writing about lines I have not felt. I finished last and learned everything. Pike almost smiled. I have that in the archive under miracles.', [
          C('File it under Pike.', null, null)
        ]),
        llEnd: N('The record will say Maggie Voss, then {name}. No ghost. A person, then a person. I will not let Vince add a question mark. He tried. I bit him in the footnote.', [
          C('No question mark.', null, null)
        ]),
        llOwned: N('The number was me. I needed the ice to have a winner who was not on Vex\'s invoice before I could say that out loud. The archive stays a record, not a purse.', [
          C('Then keep the minutes honest.', { flag: 'lolaOwnedIt' }, null)
        ]),
        llBurned: N('You sold the number. I archived the sale next to his other receipts. Do not expect another hint. Sal would call that an invoice. She would be right.', [
          C('I heard you.', { flag: 'lolaBurned' }, null)
        ]),
        llHeard: N('Sal knows the number warned you. Good. I did not want her canyon in his ledger. If you still do not know my name, the night circuit will introduce us when you are done being fast.', [
          C('The minutes can say I listened.', { flag: 'lolaHeard' }, null)
        ])
      } }
  };

  function hasAny(flags) {
    return function (s) {
      for (let i = 0; i < flags.length; i++) if (s.flags && s.flags[flags[i]]) return true;
      return false;
    };
  }

  /* ---------- Story scenes ----------
     intro is exactly 3 lines, then the money/respect choice. Do not add a line. */
  RL.STORY = {
    intro: {
      who: 'Mags (Mechanic)', color: COL.mags, startQuest: 'q1',
      lines: [
        'Welcome to Redline City, {name}. The neon does not know your name. The Vipers decide who gets to keep one.',
        'Four leagues. Docks, desert, ice, then the night highway where the Phantom runs without a face. Your Pip Hatch is rust and stubbornness. That is enough to start.',
        'Race Office when you are ready. If a deal feels easy, it is because you are the part being sold.'
      ],
      choices: [
        { t: 'I race for the money. (+$200)', effects: { money: 200, flag: 'introMoney' } },
        { t: 'I race for respect. (+5 Respect)', effects: { respect: 5, flag: 'introRespect' } }
      ]
    },

    race_1_0: {
      who: 'Rook', color: COL.rook,
      lines: [
        say('Rook', COL.rook, 'You made the harbor look. I am Rook. I time everybody. You were fast. I said it out loud and Tia heard me, so now it is a problem.'),
        say('Turbo Tia', COL.tia, 'Fast for a shopping cart. I am Turbo Tia. Brick\'s real prospect. Do not get used to the front, and do not get used to the kid saying your name like it is already painted on.'),
        say('Mags', COL.mags, 'She talks like that to everybody she might lose to. Drink some water. Then go make Rush Hour regret the traffic.'),
        say('Rook', COL.rook, 'I will be on the wall. Not too close. Close enough that if you win I can say I saw it, and if you lose I can say I saw that too.')
      ]
    },

    race_1_1: {
      who: 'Jinx', color: COL.jinx,
      lines: [
        say('Jinx', COL.jinx, 'Downtown chewed on you and you are still smiling. I love a smiling customer. I am Jinx. I hold the harbor\'s bad ideas and I price them.'),
        say('Jinx', COL.jinx, 'Marker on Brick. You beat the wall, I pay eight hundred. You bounce off, I keep a story that drinks for free all month.'),
        say('Old Tom', COL.tom, 'Rush hour is where cheap shots pick up cheap trophies. You do not have to take every piece of paper somebody waves.'),
        say('Jinx', COL.jinx, 'Tom races in the past, where the purses were moral. We are in the present. Yes or no, {name}.')
      ],
      choices: [
        { t: 'Take Jinx\'s marker.', when: lacksAll(['jinxBet', 'jinxClean']), effects: { flag: 'jinxBet' } },
        { t: 'Keep it clean. No marker.', when: lacksAll(['jinxBet', 'jinxClean']), effects: { respect: 3, flag: 'jinxClean' } }
      ]
    },

    race_1_2: {
      who: 'Turbo Tia', color: COL.tia,
      lines: [
        say('Turbo Tia', COL.tia, 'Brick says the third race was a courtesy. The boss race is the door. Doors do not apologize.'),
        say('Rook', COL.rook, 'They told me to stop timing your laps. Tia said it twice. The second time she stood on my chalk.'),
        say('Turbo Tia', COL.tia, 'The kid makes you look like a cause. Causes are slow. Step aside or buy him a helmet with your name on it. Your choice, hero.')
      ],
      choices: [
        { t: 'Step in front of Rook. (+Respect)', when: lacksAll(['rookStood', 'rookCold']), effects: { respect: 4, flag: 'rookStood' } },
        { t: 'Tell Rook to handle it. (+$100)', when: lacksAll(['rookStood', 'rookCold']), effects: { money: 100, flag: 'rookCold' } }
      ]
    },

    preboss1: {
      who: 'Brick Malone', color: COL.brick, goLabel: 'Roll up',
      lines: [
        say('Brick Malone', COL.brick, 'I am the door. The Vipers like a door that does not open. The kids like a door that tells the truth. Tonight those are different jobs.'),
        say('Brick Malone', COL.brick, 'You get through me, the desert hears. The ice hears. The mask hears. I have never been touched on the inside of Downtown and I plan to keep the streak.'),
        say('Rook', COL.rook, 'I will be on the wall. I will not blink. Try not to either.'),
        say('Brick Malone', COL.brick, 'Harbor is watching, {name}. Drive like the name they are learning is one you want.')
      ]
    },

    boss1: {
      who: 'Brick Malone', color: COL.brick,
      lines: [
        say('Brick Malone', COL.brick, 'Huh. Door is open. I will not cheer. I will tell the kids the truth: you were better.'),
        say('Brick Malone', COL.brick, 'Vex saw it. He will be at the bar with a smile and a number. The number is a leash that pays well.'),
        say('Rook', COL.rook, 'You have a spine now. That is on you. Do not waste it.', has('rookStood'), 'I watched from further back. You were still faster than you were brave.'),
        say('Brick Malone', COL.brick, 'So. What do I tell them I lost? A driver, or a stash?')
      ],
      choices: [
        { t: 'Look after the dock kids. I will too. (+Respect)', when: lacksAll(['brickMentor', 'brickShakedown']), effects: { respect: 8, flag: 'brickMentor' } },
        { t: 'Your stash. Call it tuition. (+$600)', when: lacksAll(['brickMentor', 'brickShakedown']), effects: { money: 600, respect: -4, flag: 'brickShakedown' } }
      ]
    },

    race_2_0: {
      who: 'Sidewinder Sal', color: COL.sal,
      lines: [
        say('Sidewinder Sal', COL.sal, 'New paint in an old desert. I am Sidewinder Sal. The dunes do not care that the docks know your name.'),
        say('Pike', COL.pike, 'Bowl at the end. Do not lift.'),
        say('Turbo Tia', COL.tia, 'I am here too, before you write me out of the chapter. The sand is worse than you. I already spun and I already lied about why.'),
        say('Mags', COL.mags, 'The bowl... you do not lift. A driver told me that. In the shop. Go make Pike nod. That is the only trophy out here.')
      ]
    },

    race_2_1: {
      who: 'Pike', color: COL.pike,
      lines: [
        say('Pike', COL.pike, 'She gets faster when you fill her mirrors. Not magic. Pride. Give her air or eat dust.'),
        say('Blaze', COL.blaze, 'Or pay me and I will tell you the canyon she pretends not to miss. Vex already has a price. I am the discount aisle.'),
        say('Sidewinder Sal', COL.sal, 'Blaze talks like a receipt. Drive the bowl. We will see what you are when nobody is selling it.'),
        say('Pike', COL.pike, 'That was a long speech, for her. Remember the short one. Do not lift.')
      ]
    },

    race_2_2: {
      who: 'Blaze', color: COL.blaze,
      lines: [
        say('Blaze', COL.blaze, 'Last canyon before Sal stops being polite. I can miss a call to Vex. Four hundred. Her line, the one she thinks is still hers.'),
        say('Pike', COL.pike, 'You do not need it.', lacksAll(['blazeCheat', 'blazeTold'])),
        say('Blaze', COL.blaze, 'Four hundred and a secret.', lacksAll(['blazeCheat', 'blazeTold']), 'You already picked a side. I am just here to watch the dunes collect.')
      ],
      choices: [
        { t: 'Buy the canyon. (-$400)', when: function (s) { return (s.money || 0) >= 400 && !(s.flags && (s.flags.blazeCheat || s.flags.blazeTold)); }, effects: { money: -400, flag: 'blazeCheat' } },
        { t: 'Tell Sal. I am not buying her.', when: lacksAll(['blazeCheat', 'blazeTold']), effects: { respect: 6, flag: 'blazeTold' } }
      ]
    },

    preboss2: {
      who: 'Sidewinder Sal', color: COL.sal, goLabel: 'Into the dust',
      lines: [
        say('Sidewinder Sal', COL.sal, 'I do not wear a mask and I do not sell the finish. If you came to the dunes to be hired, you came to the wrong horizon.'),
        say('Sidewinder Sal', COL.sal, 'I know you bought my canyon. Race me anyway. Earn the dust back.', has('blazeCheat')),
        say('Sidewinder Sal', COL.sal, 'Blaze talks too much. You do not. I like that. It will not make me slow.', has('blazeTold')),
        say('Pike', COL.pike, 'Do not fill her mirrors.'),
        say('Sidewinder Sal', COL.sal, 'Show me the docks taught you something besides noise, {name}.')
      ]
    },

    boss2: {
      who: 'Sidewinder Sal', color: COL.sal,
      lines: [
        say('Sidewinder Sal', COL.sal, 'You drove that like the dune owed you money. Fine. The desert respects a debt paid in public.'),
        say('Pike', COL.pike, 'Good.'),
        say('Sidewinder Sal', COL.sal, 'The Vipers will be worse than the bowl. They invoice. I do not. Ride with the Dustline, or take the bounty Vex put on my name and we stop pretending this was friendly.')
      ],
      choices: [
        { t: 'Ride with the Dustline. (+Respect)', when: lacksAll(['salAlly', 'salSold']), effects: { respect: 10, flag: 'salAlly' } },
        { t: 'Take Vex\'s bounty. (+$1500)', when: lacksAll(['salAlly', 'salSold']), effects: { money: 1500, respect: -8, flag: 'salSold' } }
      ]
    },

    race_3_0: {
      who: 'Roxy', color: COL.roxy,
      lines: [
        say('Roxy', COL.roxy, 'Roxy. I keep the Vipers pointed straight. The ice does not care about Vex\'s money. It cares if your tires were a wish.'),
        say('Roxy', COL.roxy, 'He told me you can be bought. If that is still true, the pass is a bad place to find out.', has('vexDeal')),
        say('Roxy', COL.roxy, 'He said you turned down fifteen hundred. I came to see if the story was real.', has('vexRefused')),
        say('Roxy', COL.roxy, 'Vex has not briefed me, which means you have not sat down with him yet. He will hate that more than a no.', lacksAll(['vexDeal', 'vexRefused'])),
        say('Sidewinder Sal', COL.sal, 'Dustline radio still reaches this far. We are with you. Do not pay the toll.', has('salAlly')),
        say('Sidewinder Sal', COL.sal, 'I am not on this channel for you. The mountain can have the lecture.', has('salSold')),
        say('Roxy', COL.roxy, 'Kai is on the grid because Vex entered them, not because they asked. Remember that when you see a Neon GT that does not want the fight.')
      ],
      choices: [
        { t: 'I will see you at the top.', effects: { flag: 'roxyLine' }, when: lacks('roxyLine') },
        { t: 'I am not proud of the deal.', when: function (s) { return !!(s.flags && s.flags.vexDeal) && !(s.flags && s.flags.vexSorry); }, effects: { respect: 5, flag: 'vexSorry' } },
        { t: 'Everything is for sale, Roxy.', when: function (s) { return !!(s.flags && s.flags.vexDeal) && !(s.flags && s.flags.vexDouble); }, effects: { money: 200, respect: -3, flag: 'vexDouble' } }
      ]
    },

    race_3_1: {
      who: 'Kai', color: COL.kai,
      lines: [
        say('Kai', COL.kai, 'Kai. Vex\'s sibling. I do not want the crew. I want a shop that does not fix thrown races. If I leave wrong, he calls it betrayal and makes it true.'),
        say('Kai', COL.kai, 'Talk to Roxy before you talk to him. She still believes the Vipers can be a straight line. I would like to believe her.'),
        say('Neko', COL.neko, 'You did not hear this. Grease and old coffee. That is what the Phantom smells like. I stood downwind on the dune ridge. Fans take photos. That coat took notes.'),
        say('Roxy', COL.roxy, 'The next hairpins are not a favor. Drive them like Kai is watching, because they are.')
      ]
    },

    race_3_2: {
      who: 'Neko', color: COL.neko,
      lines: [
        say('Neko', COL.neko, 'Plain coat, again, on the ridge above your dune race. They checked tire wear and left before the photo would have counted. I am a scout. I know when I am being out-scouted.'),
        say('Roxy', COL.roxy, 'Vex is done waiting. The glacier is his sermon. He thinks nitro is theology.'),
        say('Kai', COL.kai, 'I will be on the snowbank, not in his mirror, if you have already chosen me a road. If you have not, I am still hoping the road is a shop.', lacks('kaiSold')),
        say('Neko', COL.neko, 'Kai is gone. You did that. Win the ice anyway. Losing will not make the note kinder.', has('kaiSold')),
        say('Mags', COL.mags, 'I am not at the bar. Hands hurt. Race the mountain, not the rumor. We will talk after, if you still want a wrench and not a ghost story.')
      ]
    },

    preboss3: {
      who: 'Vex (Vipers Crew)', color: COL.vex, goLabel: 'Take the ice',
      lines: [
        say('Vex', COL.vex, 'The Vipers are not a feeling. We are the house. The house does not lose, {name}. It sends an invoice.'),
        say('Vex', COL.vex, 'I paid you to be useful, not fast. Try to remember which one you are.', function (s) { return !!(s.flags && s.flags.vexDeal) && !(s.flags && s.flags.vexSorry); }),
        say('Vex', COL.vex, 'Regret does not warm an engine. Drive anyway.', has('vexSorry')),
        say('Vex', COL.vex, 'You turned me down in my own bar. Bold. I will bury the bold part in a snowbank and see what is left.', has('vexRefused')),
        say('Vex', COL.vex, 'Tell Sal the mountain did not need her permission.', has('salAlly')),
        say('Vex', COL.vex, 'Kai stays out of this start. That is the one kindness on offer. Do not make me poetic about it.', has('kaiFree')),
        say('Vex', COL.vex, 'Thanks for the sibling, by the way. They will not be a distraction. You will.', has('kaiSold')),
        say('Roxy', COL.roxy, 'Beat him fair or do not talk to me after.')
      ]
    },

    boss3: {
      who: 'Vex (Vipers Crew)', color: COL.vex,
      lines: [
        say('Vex', COL.vex, '...On my ice. I hate how clean that felt. The house is not supposed to lose in a way that looks like a lesson.'),
        say('Vex', COL.vex, 'Kai can have the shop. You beat me fair. I hate that fairness is the reason.', has('kaiFree')),
        say('Vex', COL.vex, 'Kai is gone. You did that part. Do not confuse it with this part.', has('kaiSold')),
        say('Vex', COL.vex, 'Tell Sal the mountain did not take you. She will pretend not to care. Pike will nod.', has('salAlly')),
        say('Vex', COL.vex, 'You sell a rival and still drive like a saint. Pick a personality before the highway does.', has('salSold')),
        say('Vex', COL.vex, 'The Phantom has noticed you. That is worse than me. Handshake, or the pink slip I should never have bet?')
      ],
      choices: [
        { t: 'Offer a handshake. (+10 Respect)', when: lacksAll(['vexHandshake', 'vexSlip']), effects: { respect: 10, flag: 'vexHandshake' } },
        { t: 'Collect his pink-slip bet. (+$3000)', when: lacksAll(['vexHandshake', 'vexSlip']), effects: { money: 3000, flag: 'vexSlip' } }
      ]
    },

    race_4_0: {
      who: 'Nova', color: COL.nova,
      lines: [
        say('Nova', COL.nova, 'Nova. I lost to the Phantom and never saw a face. I saw a habit. They brake like somebody who pays the repair bill personally.'),
        say('Nova', COL.nova, 'Rule one of that mask: never be touched. Rule two: they learned in a hatch, down on these docks, before the Vipers priced the finish.'),
        say('Vince', COL.vince, 'Smile for the cameras, legend-in-progress. We can ruin it with money after you survive Lightspeed.'),
        say('Lola', COL.lola, 'I am only here to feel the draft. Ignore me. I will fail to be ignorable in about one race.')
      ]
    },

    race_4_1: {
      who: 'Lola', color: COL.lola,
      lines: [
        say('Lola', COL.lola, 'The Vortex has a hand weld on the rear subframe. One garage in this city still does that and calls it a favor for collectors.'),
        say('Lola', COL.lola, 'Ask Old Tom about Maggie Voss. Then ask the garage, if you still need the name said out loud by the person who flinches.'),
        say('Vince', COL.vince, 'Different offer. Four thousand. Let the Phantom have one corner on camera, then take the night back. Pretty, arranged, paid either way.'),
        say('Nova', COL.nova, 'The mask hates theater. I am only the cautionary tale in the front row.')
      ],
      choices: [
        { t: 'Take the theater money. (+$4000)', when: lacksAll(['vinceFix', 'vinceReal']), effects: { money: 4000, respect: -6, flag: 'vinceFix' } },
        { t: 'Race it real. (+Respect)', when: lacksAll(['vinceFix', 'vinceReal']), effects: { respect: 8, flag: 'vinceReal' } }
      ]
    },

    race_4_2: {
      who: 'Mags (Mechanic)', color: COL.mags,
      lines: [
        say('Mags', COL.mags, 'I am closing early. Hands hurt. There is a race I should not watch, and I will.'),
        say('Mags', COL.mags, 'Whatever is under that helmet, do not hate the mask. Hate how many years it costs to keep a crown honest.'),
        say('Mags', COL.mags, 'You already asked who Maggie is. After the finish. Not before. I need the line honest.', has('magsAsked')),
        say('Mags', COL.mags, 'You are ready. That is not a mechanic talking. That is a wish.', function (s) { return cleanSheet(s); }, 'Maybe the city gets the legend it paid for. Drive anyway.'),
        say('Rook', COL.rook, 'I will be as close as the barriers allow. Spell it right when you win.')
      ]
    },

    preboss4: {
      who: 'The Phantom', color: COL.phantom, goLabel: 'Lights down',
      lines: [
        say('The Phantom', COL.phantom, 'Four leagues. I counted the corners you sold and the corners you did not.'),
        say('The Phantom', COL.phantom, 'I heard the price of your theater. The highway did not agree to be an advertisement.', has('vinceFix')),
        say('The Phantom', COL.phantom, 'Good. Come as yourself.', has('vinceReal')),
        say('The Phantom', COL.phantom, 'The mask does not owe you a face. You owe this city a true line, {name}. Come take it.')
      ]
    },

    boss4: {
      who: 'The Phantom', color: COL.phantom,
      lines: [
        say('Redline City', COL.city, 'The Vortex rolls under the neon and stops. The engine ticks. The helmet seal breaks.'),
        say('Mags', COL.mags, 'It is me. Maggie Voss. Mags, if you still want the wrench instead of the ghost.'),
        say('Mags', COL.mags, 'I was the last Legend. The night the Vipers started buying wins, I put the mask on so the crown could not be purchased. Only taken.'),
        say('Mags', COL.mags, 'You took the easy money more than once. You won anyway. The crown does not care. I hoped you would.', dirtyAtLeast(3), 'You left money on the table. That is how I knew it could be you.'),
        say('Mags', COL.mags, 'The garage key is yours. The mask too. Hang it up, or wear it until somebody faster comes. Do not wear it forever. That is the part I got wrong.'),
        say('Mags', COL.mags, 'Redline City has a new Legend, {name}. Now decide what we do with the mask.')
      ],
      choices: [
        { t: 'Hang the mask in the garage. (+Respect)', when: lacksAll(['hungMask', 'woreMask']), effects: { respect: 10, flag: 'hungMask' } },
        { t: 'Wear it. One season. (+$1000)', when: lacksAll(['hungMask', 'woreMask']), effects: { money: 1000, respect: 2, flag: 'woreMask' } }
      ]
    },

    epilogue: {
      who: 'Mags (Mechanic)', color: COL.mags,
      lines: [
        say('Redline City', COL.city, 'The highway goes quiet the way a crowd goes quiet: all at once, then somebody remembers how to breathe.'),
        say('Rook', COL.rook, 'I told everybody. They did not believe me until the lights went out. Your name is on the pylon in paint. Brick said the paint can stay.', has('rookStood'), 'I still timed you. Every lap. Even from further back, where you told me to stand.'),
        say('Turbo Tia', COL.tia, 'Do not get sentimental, hatchback. That was the best race this city has had. Rematch someday. No crew. No mask. I will even let the kid hold the watch.'),
        say('Brick Malone', COL.brick, 'The kids ate. I told them your name right.', has('brickMentor'), 'I paid you. I also told them you were faster. Try to deserve the second sentence.'),
        say('Jinx', COL.jinx, 'Come rob me properly at the bar. I am ruined and delighted.', has('jinxBet'), 'You cost me a fortune in bets I did not get to place. Annoying, expensive respect.'),
        say('Sidewinder Sal', COL.sal, 'Dustline is with you. Radios stay open. Do not let them turn the night into a commercial.', has('salAlly'), 'You got your bounty already. Drive like you still have to earn the rest of us.'),
        say('Pike', COL.pike, 'Did not lift. Knew you would not.'),
        say('Vex', COL.vex, 'The Vipers stop fixing races. Roxy has the crew. I have a long drive and no throne.', has('vexHandshake'), 'Pink slip is paid. I am leaving before I become a kind story. Do not become me with a nicer car.'),
        say('Roxy', COL.roxy, 'I will keep them honest. You keep the highway honest. That is the whole deal.'),
        say('Kai', COL.kai, 'The shop is called Exit Ramp. Oil changes and no favors. Thank you for saying my name like it was mine.', has('kaiFree')),
        say('Neko', COL.neko, 'Kai left a note that is not for you. The part I will read out loud: win better.', has('kaiSold')),
        say('Kai', COL.kai, 'I am still here. That is a start. Do not make me regret the start.', lacksAll(['kaiFree', 'kaiSold'])),
        say('Nova', COL.nova, 'You made the mask come off. I am going to sleep for a week. Thank you for finishing the race I could not.'),
        say('Lola', COL.lola, 'The archive will say Maggie Voss, then {name}. A person, then a person. No question mark. Vince already lost that argument.'),
        say('Lola', COL.lola, 'The number was me. The minutes stay clean because you did not sell them.', has('unknownTrust')),
        say('Lola', COL.lola, 'You sold the number. I archived the sale. It is a short page.', has('unknownSold')),
        say('Drift Dana', COL.dana, 'If one of us still owes a slide, we argue it at the bar. The corners there are worse and the drinks are theoretical.'),
        say('Old Tom', COL.tom, 'I said washed-up champ. I did not say I was hoping. There is dust in my eye. Leave it alone.'),
        say('Rumor Rita', COL.rita, 'New rumor, still warm: the Legend knows your name, and the neon answered. I am not selling this one.'),
        say('Mags', COL.mags, 'The mask is on the hook beside the torque wrench. That is the right nail.', has('hungMask'), 'You kept the mask. One season. I will hold you to the number.'),
        say('Mags', COL.mags, 'Neon stays on, {name}. Go race. I will keep the lights. That is the job. It was always the job.')
      ]
    }
  };

  /* Brick's third line uses say() with an else that only fits one flag.
     If neither rook flag is set, the else still reads. Good.
     If BOTH could be set they cannot. Good.
     Sal's epilogue else is the sold/neutral line. Ally uses the when text.
     If neither ally nor sold, the else ("bounty") is wrong. Fix with a third line. */
  (function fixEpilogueSal() {
    const lines = RL.STORY.epilogue.lines;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].who === 'Sidewinder Sal') {
        lines[i].else = null;
        lines.splice(i + 1, 0,
          say('Sidewinder Sal', COL.sal, 'You got your bounty. Drive like you still have to earn the rest of us.', has('salSold')),
          say('Sidewinder Sal', COL.sal, 'The desert felt that finish. I do not own a banner. Come drink water sometime.', lacksAll(['salAlly', 'salSold']))
        );
        break;
      }
    }
  })();
  (function fixEpilogueVex() {
    const lines = RL.STORY.epilogue.lines;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].who === 'Vex') {
        lines[i].else = null;
        lines.splice(i + 1, 0,
          say('Vex', COL.vex, 'The pink slip is paid. I am leaving the city. Try not to become me with a nicer car.', has('vexSlip')),
          say('Vex', COL.vex, 'The house lost. Do not become a new house. Houses get lonely, then they get cruel.', lacksAll(['vexHandshake', 'vexSlip']))
        );
        break;
      }
    }
  })();
  (function fixEpilogueBrick() {
    const lines = RL.STORY.epilogue.lines;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].who === 'Brick Malone') {
        lines[i].else = null;
        lines.splice(i + 1, 0,
          say('Brick Malone', COL.brick, 'I paid you. I also told the kids you were faster. Try to deserve the second sentence.', has('brickShakedown')),
          say('Brick Malone', COL.brick, 'The door is yours. Do not let it rust shut.', lacksAll(['brickMentor', 'brickShakedown']))
        );
        break;
      }
    }
  })();
  (function fixEpilogueMags() {
    const lines = RL.STORY.epilogue.lines;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].who === 'Mags' && lines[i].text.indexOf('torque wrench') >= 0) {
        lines[i].else = null;
        lines.splice(i + 1, 0,
          say('Mags', COL.mags, 'You kept the mask. One season. I will hold you to the number.', has('woreMask')),
          say('Mags', COL.mags, 'The mask is on the bench. It can wait until you decide. I am not going anywhere.', lacksAll(['hungMask', 'woreMask']))
        );
        break;
      }
    }
  })();

  RL.STORY.unknown_dock = {
    who: 'UNKNOWN', color: '#c86bff',
    lines: [
      say('UNKNOWN', '#c86bff', 'The text is already on your phone. I am not in the bar. The bar is where he watches.'),
      say('Mags', COL.mags, 'If a stranger is texting you, kid, read it twice and do not send them the garage key.'),
      say('UNKNOWN', '#c86bff', 'Brick lost a door. The next smile has a receipt. The desert does not. Hold the brake with the gas if you want the tree to tell the truth.')
    ],
    choices: [
      { t: 'Keep the number.', when: lacksAll(['unknownKeep', 'unknownJob']), effects: { flag: 'unknownKeep' } },
      { t: 'Take the strip job. It pays once, after a win.', when: lacksAll(['unknownKeep', 'unknownJob']), effects: { flag: 'unknownJob', quest: 'unk_strip' } }
    ]
  };
  RL.STORY.unknown_dunes = {
    who: 'UNKNOWN', color: '#c86bff',
    lines: [
      say('UNKNOWN', '#c86bff', 'She will not sell the canyon. Blaze will. Vex already has a price. I am the note that is not for sale.'),
      say('Sidewinder Sal', COL.sal, 'If a number is warning you about my line, it is not one of his. I still do not lift.'),
      say('Vex', COL.vex, 'Information is a tab. Someone is running one without my name on it. I dislike tabs I did not open.')
    ],
    choices: [
      { t: 'Tell Sal the number warned you.', when: lacksAll(['unknownTold', 'unknownQuiet']), effects: { respect: 2, flag: 'unknownTold' } },
      { t: 'Stay quiet.', when: lacksAll(['unknownTold', 'unknownQuiet']), effects: { flag: 'unknownQuiet' } }
    ]
  };
  RL.STORY.unknown_reveal = {
    who: 'UNKNOWN', color: '#c86bff',
    lines: [
      say('UNKNOWN', '#c86bff', 'The house lost a fair one. I was in the stands with a notebook, not a mask.'),
      say('Lola', COL.lola, 'Lola. I archive the night circuit. The number stayed nameless because Vex reads rooms, and Sal does not need another person invoicing her canyon.'),
      say('Lola', COL.lola, 'I wanted a champion the ledger could not buy. That is the whole agenda. It does not come with a purse.'),
      say('Sidewinder Sal', COL.sal, 'An archivist. I can live with an archivist. I cannot live with a sold canyon.', has('salAlly')),
      say('Vex', COL.vex, 'An archivist with a hobby. Hobbies become evidence. Evidence becomes mine, if you are practical.', has('vexDeal'))
    ],
    choices: [
      { t: 'Trust her. Keep the number.', when: lacksAll(['unknownTrust', 'unknownSold', 'unknownToldSal']), effects: { respect: 3, flag: 'unknownTrust' } },
      { t: 'Sell the number to Vex. (+$1200)', when: lacksAll(['unknownTrust', 'unknownSold', 'unknownToldSal']), effects: { money: 1200, respect: -6, flag: 'unknownSold' } },
      { t: 'Tell Sal who it was.', when: lacksAll(['unknownTrust', 'unknownSold', 'unknownToldSal']), effects: { respect: 2, flag: 'unknownToldSal' } }
    ]
  };

  RL.STORY_LOG = [
    { flag: 'seen_intro', title: 'Arrival', text: 'Mags put a wrench in one hand and a warning in the other. Four leagues. A mask at the top.' },
    { flag: 'seen_race_1_0', title: 'Harbor Sprint', text: 'Rook learned your name. Turbo Tia filed you under shopping carts.' },
    { flag: 'seen_race_1_1', title: 'Rush Hour', text: 'Jinx offered a marker on Brick. Tom reminded you that not every piece of paper is a destiny.' },
    { flag: 'seen_race_1_2', title: 'Container Run', text: 'Tia stood on Rook\'s chalk. You either stepped in or you did not.' },
    { flag: 'seen_preboss1', title: 'The Door', text: 'Brick promised the desert, the ice, and the mask would all hear if you opened him.' },
    { flag: 'seen_boss1', title: 'Door Open', text: 'Brick lost and told the truth. Vex is next, and Vex smiles with a price on the back.' },
    { flag: 'seen_race_2_0', title: 'Mesa', text: 'Sal does not care who owns the docks. Pike said not to lift. Mags knew the bowl too well.' },
    { flag: 'seen_race_2_1', title: 'Sandblaster', text: 'Sal goes faster when you fill her mirrors. Blaze is already selling the canyon.' },
    { flag: 'seen_race_2_2', title: 'Canyon Echo', text: 'Blaze named a price. The Dustline will remember who you told.' },
    { flag: 'seen_preboss2', title: 'No Fixed Finish', text: 'Sal does not wear a mask and does not sell a finish.' },
    { flag: 'seen_boss2', title: 'Dustline', text: 'You beat Sal. She offered a radio, or Vex\'s bounty. Only one of those stays friendly.' },
    { flag: 'seen_race_3_0', title: 'Frostbite', text: 'Roxy keeps the Vipers straight. Kai is on the grid because Vex entered them.' },
    { flag: 'seen_race_3_1', title: 'Icebreaker', text: 'Kai wants a shop, not a crew. Neko says the Phantom smells like a garage.' },
    { flag: 'seen_race_3_2', title: 'Avalanche', text: 'A plain coat keeps taking notes from the ridges. Mags is not at the bar.' },
    { flag: 'seen_preboss3', title: 'The House', text: 'Vex called himself the house and sent you the invoice in person.' },
    { flag: 'seen_boss3', title: 'On His Ice', text: 'Vex lost a fair one. The Phantom has noticed, which he swears is worse.' },
    { flag: 'seen_race_4_0', title: 'Lightspeed', text: 'Nova lost to a habit, not a ghost: a hatch, once, on these docks.' },
    { flag: 'seen_race_4_1', title: 'Midnight Coil', text: 'Lola found Mags\'s weld on the Vortex. Vince offered to arrange the ending.' },
    { flag: 'seen_race_4_2', title: 'Afterglow', text: 'Mags closed the garage early and told you not to hate the mask.' },
    { flag: 'seen_preboss4', title: 'Counted Corners', text: 'The Phantom counted what you sold and what you kept, then asked for a true line.' },
    { flag: 'seen_boss4', title: 'The Mask', text: 'Maggie Voss took the helmet off. The crown was never for sale. It was waiting.' },
    { flag: 'seen_epilogue', title: 'Neon Stays On', text: 'The city said your name back. Mags kept the lights. That was always the job.' },
    { flag: 'seen_unknown_dock', title: 'No Caller ID', text: 'A number counted the lights and told you the third one lies. Mags said not to send the garage key.' },
    { flag: 'seen_unknown_dunes', title: 'Not an Invoice', text: 'UNKNOWN said Sal does not sell the canyon. Vex disliked a tab he did not open.' },
    { flag: 'seen_unknown_reveal', title: 'The Minutes', text: 'The number was Lola. She wanted a champion the ledger could not buy. The choice was trust, a sale, or Sal.' }
  ];

  RL.rumorsFor = function (s) {
    const f = (s && s.flags) || {};
    const L = (s && s.league) || 1;
    const out = [
      'Brick has never let anyone past on the inside of Downtown Dash. He would rather wreck than blink.',
      'Rain on the Neon Highway turns the paint into a rumor and the grip into a prayer.'
    ];
    if (!f.leagueBoss1) out.push('The Vipers pay dock kids to stop timing the wrong cars.');
    if (L >= 2 || f.leagueBoss1) {
      out.push('Sal\'s Raptor gets twitchy when someone fills her mirrors. Then it gets faster.');
      out.push('A plain coat was seen on the dune ridge, checking tire wear like a mechanic.');
    }
    if (L >= 3 || f.leagueBoss2) {
      out.push('Vex keeps a full nitro tank. Always. The ice is just where he spends it.');
      out.push('Rumor has a smell attached: engine grease and old coffee. Nobody will say why it matters.');
    }
    if (L >= 4 || f.leagueBoss3) {
      out.push('The Phantom has never been touched. Nova says that is a habit, not a ghost.');
      out.push('The Vortex has a hand weld that only one garage in the city still does.');
    }
    if (f.champion) out.push('New rumor, still warm: the Legend has a name, and the neon answered it.');
    else out.push('Nobody has seen the Phantom\'s face. Tom says some people hang a helmet up and keep the habit.');
    return out;
  };

  RL.npcAvailable = function (id, s) {
    const n = RL.NPCS[id];
    if (!n) return false;
    s = s || {};
    if (!n.requires) return true;
    if (typeof n.requires === 'function') return !!n.requires(s);
    return !!(s.flags && s.flags[n.requires]);
  };
  RL.npcStart = function (id, s) {
    const n = RL.NPCS[id];
    if (!n) return null;
    s = s || {};
    if (typeof n.route === 'function') {
      const k = n.route(s);
      if (k && n.nodes && n.nodes[k]) return k;
    }
    return n.start;
  };
  RL.npcFresh = function (id, s) {
    s = s || {};
    if (!RL.npcAvailable(id, s)) return false;
    const n = RL.NPCS[id];
    const stage = RL.npcStart(id, s);
    const seen = s.talked && s.talked[id];
    if (!seen) return true;
    if (seen === true) return stage !== n.start;
    return seen !== stage;
  };
  RL.barHasNews = function (s) {
    if (!s) return false;
    if (s.quests && s.quests.active && s.quests.active.indexOf('m3') >= 0) return true;
    const ids = RL.NPC_ORDER || Object.keys(RL.NPCS);
    for (let i = 0; i < ids.length; i++) if (RL.npcFresh(ids[i], s)) return true;
    return false;
  };
})();
