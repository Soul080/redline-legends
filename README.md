# Redline Legends

**Version:** v1.1.3

**[Play now](https://soul080.github.io/redline-legends/)**

A finished browser street-racing RPG. You start as a nobody, drive a neon city, and climb leagues by winning races, beating bosses, and building a car. Spend cash on parts and tuning, and level up into perks and driver stats. The city has districts, drag racing, police heat, and three lives you can switch at Role HQ. It is plain HTML, CSS, and JavaScript with no build step. Progress is saved in the browser.

## Run

Open `index.html` in a browser, or serve this folder:

```bash
python3 -m http.server
```

Then open the URL the server prints (usually http://localhost:8000).

## Multiplayer

From the title screen or the Race Office, choose **Multiplayer**. Host a room and share the 4-character code. Friends join with that code (2–6 racers). The host picks any unlocked track; AI fills empty grid spots. The countdown, finish, and results are shared. League progress is not changed.

Online play is peer-to-peer WebRTC. The game loads [PeerJS](https://peerjs.com/) from a CDN and uses the free public broker at `0.peerjs.com` to introduce peers, so it works as static files (itch.io and any web host) and inside an Electron build. No game server is required. If the broker cannot be reached, two tabs in the same browser can still share a room. Each player should use their own device or browser profile so career saves stay separate.

## Controls

Default keys (rebindable in Settings). Touch buttons show on touch devices, or when Touch controls is set to On.

**City**

- Up or W — gas (or walk north on foot)
- Down or S — brake (or walk south on foot)
- Left / Right or A / D — steer (or walk sideways on foot)
- E or Enter — park at a door, talk, or get back in the car
- L — police siren (police role)
- F — photo mode (arrows pan, C filters, Enter snaps, Esc exits)
- H — daily challenges
- I — inventory
- K — skills and stats
- J — quest log
- G — garage
- B — phone
- V — call your selected garage car (also on the phone)
- Esc — menu

Call car parks the garage car you have selected beside you. It does not add a second copy, it waits a few seconds between calls, and it will not come at 3 stars or while you are busted. The phone (B, or TXT) keeps message threads in the save. UNKNOWN texts at story beats and can be answered freely. That reply uses the same in-browser model as bar chat, with a scripted fallback when WebGPU is unavailable. Chat does not pay. A strip job from UNKNOWN pays once, from the quest log.

Speeding, red lights, hard hits, and street races raise a 1–5 star wanted level. A light bump or a clipped sign adds nothing, and four or five stars take a sustained spree. Heat falls when you drive clean, but a star only drops once the police lose sight of you. The green bounty next to the stars is what a clean escape pays. One star is a single slow cruiser; five stars is a crowd, a roadblock, spikes, and a helicopter. Stop, wreck, step out, or get boxed in and officers chase on foot. Higher stars add a few armed rivals. Attacks flash a warning before they land, and driving off ends the foot chase. An HP bar sits with the stars. At zero HP you are Busted if the police got you, or Wasted otherwise, then you respawn at the nearest garage or hospital and pay a capped fee. Stop and press C (or STEAL) to take a traffic car. That adds heat, never money, and the car stays out of your garage. Races always use the car you own. A bust impounds the car. At 100% damage the car explodes: races respawn you at the last checkpoint with a time penalty, the city tows you to the garage (or counts it as a bust during a chase). A stolen car explodes back into your own car, or leaves you on foot if it is parked nearby. Turn explosions off in Settings.

**Race**

- Up or W — gas
- Down or S — brake / reverse
- Left / Right or A / D — steer
- Space — drift (handbrake). Hold it while turning to slide; drifting fills the nitro bar.
- Shift or N — nitro
- Esc or P — pause

**Drag**

Stage at the dragway building. Pick a quarter mile or a half mile. Hold gas and brake together for launch control, then release the brake when the tree goes green. The shift light shows good, perfect, and late. Q, E, or Space shifts. N or Shift fires nitro. A stake is deducted up front and paid double if you win. Quitting forfeits the stake and voids a pink slip. A pink slip can add the rival's car once. It will not copy a car you already own, and it will not take the last car in the garage. The run uses your car's stats, parts, tune, and gear ratios.

**Settings** includes AI difficulty: Easy, Normal, Hard, or Legend. Normal is the default. It changes how fast and how cleanly rivals race, including bosses.

**Touch**

On-screen pad for movement, plus ACT, TXT, and CAR in the hub. DRIFT and NITRO show in a race. SHIFT replaces drift on the drag strip. A pause button stays up.
