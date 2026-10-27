# Redline Legends 3D

A full 3D port of the street-racing RPG. You drive an open city, climb four leagues, and build a car. The 2D game in the parent folder is unchanged. This version keeps its own save (`redline_legends_3d_save_v1`).

Graphics are Three.js r170 (vendored, MIT): PBR clearcoat paint, a shadow map that follows the car, a procedural sky with baked day / dusk / night environment probes, bloom, radial speed blur, wet-road roughness in the rain, and pooled particles for smoke, sparks, nitro, rain, and snow. Cars are original low-poly meshes, not downloaded models. See `CREDITS.md`.

## Run

The page loads `js/bundle.js`, a classic script with Three.js inside it. That works from the launchers and, in Chrome and Firefox, if you open `index.html` directly. There is no CDN request.

From this folder, double-click or run a launcher. It serves the folder with a JavaScript MIME type (Windows `python -m http.server` often sends `text/plain`, which blanked the old module build) and opens the browser only after the port is listening:

- `start.sh` (Linux)
- `start.command` (macOS)
- `start.bat` (Windows)

Or start it yourself:

```bash
python3 serve.py --port 8080
```

Then open http://127.0.0.1:8080. If this folder is still inside the 2D project, `cd 3d` first.

Rebuild the bundle after editing `js/` (from this folder):

```bash
npx --yes esbuild js/main.js --bundle --format=iife --target=es2019 --outfile=js/bundle.js --alias:three=./vendor/three/three.module.js
```

Electron, from this folder after installing Electron:

```bash
npx electron electron-main.cjs
```

## Play

Default keys (rebindable in Settings). Touch buttons appear on touch screens, or when Touch is set to On.

**City**

- Arrows or WASD — drive
- E or Enter — a door, a street rival, or the drag strip
- I inventory, K skills, J quests, G garage
- F photo mode, Esc menu
- R reset if you are stuck
- Hold a high speed for a while and the police take an interest. One star is one cruiser, or two if the bar is hot. They are slower than a decent car. The bounty under the stars is paid if you drive clean or break line of sight until the heat dies.
- Pull up next to slow traffic and press E to steal it. Higher tiers are faster and tougher. A circuit or the drag strip still uses the car you own. At 100% damage the car explodes.
- Pull into a building lot and stop, then press E. The road in front of the door is not the door.
- Traffic lights are real. Red on your axis is an offense. Yellow is not.
- At 100% damage the car explodes: fireball, debris, smoke, sparks, a light flash, camera shake, and a blast. In a race you return to the last checkpoint and the clock takes 8 seconds (5 seconds on the drag strip). In the city you are towed to the garage for $260. If a chase is already on, the explosion counts as a bust.
- Q steps you out of a stopped car. Police get out when you are stopped, wrecked, or on foot. One star is one officer on the pavement. At three stars an armed crew can step out too. Swings and shots flash before they connect. The health bar is yours, not the car's. Get in and drive to make them mount up. At 0 health you are Busted at the garage or Wasted at the hospital. The fee is capped at $380 and a downed player is never paid.

**Roles**

Switch at the police station lot (HQ). There is a 60 second cooldown, and you cannot switch while wanted.

- Neutral — police only react to loud offenses. Rank pays a small win bonus.
- Criminal — heists and smuggling from the bar, faster heat, criminal rank perks.
- Police — livery and siren. Ram or box suspects and street racers for a bounty. No heat of your own.

**Custom tracks**

The Race Office opens a custom grid (laps, AI count and difficulty, weather, time of day, damage, nitro, traffic, collisions, class) and the track editor. Click to drop spline points, set width, elevation, banking, theme, and walls, then test-drive. Save stores the layout locally. Export copies an `RL3:` share code.

**Circuit**

- Gas, brake, steer, Space to drift, Shift or N for nitro
- Esc or P to pause

**Drag (east strip, or the Race Office)**

- Hold brake and gas to stage
- Release the brake on green. Gas before green is a foul
- Space, Shift, or N shifts. The green band just under redline is a perfect shift

Quality is Low / Med / High in Settings. Low turns off shadows, bloom, and motion blur. Weather can follow the city clock or be locked.

## Layout

| File | What it owns |
| --- | --- |
| `js/data.js` | Career data, plus drag, street challenges, and extra achievements |
| `js/state.js` | Save, XP, quests, parts, payouts |
| `js/drive.js` | Shared vehicle step (player, AI, traffic) |
| `js/ai.js` | League-scaled cornering, bosses, chase steering |
| `js/cars.js` | Procedural cars and live restyle |
| `js/city.js` | Drivable downtown, POIs, drag strip |
| `js/track.js` | Circuit splines and scenery |
| `js/race.js` / `js/drag.js` / `js/hub.js` | Circuit, drag, and the drivable city |
| `js/wanted.js` / `js/roles.js` | Heat, chases, and the three roles |
| `js/tracks.js` / `js/editor.js` | Custom tracks, share codes, and the editor |
| `js/wrecks.js` | 100% damage explosions and debris |
| `js/renderer.js` | Lights, sky, probes, bloom, blur, chase camera |
| `js/ui.js` | Menus, dialogue, garage paint preview |
| `js/game.js` / `js/main.js` | Mode switch and the frame loop |
