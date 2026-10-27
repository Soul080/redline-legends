# Credits

## Engine

[Three.js](https://threejs.org/) r170.0, MIT License. The library and the post-processing addons used here are vendored under `vendor/three/`. See `vendor/three/LICENSE`.

## Cars and city

Every car, building, road, and prop in this version is an original procedural mesh built in code (`js/cars.js`, `js/city.js`, `js/track.js`). No third-party 3D models are included, so there is no extra model license to track. Paint, facades, asphalt, decals, and particle sprites are generated on a canvas at startup (`js/textures.js`).

## Design

The career — cars, parts, perks, leagues, bosses, quests, dialogue, side events, and achievements — is the 3D port of the 2D Redline Legends game in the parent folder. The 3D save is a separate localStorage key and does not read or write the 2D save.
