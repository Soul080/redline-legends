/* input_defaults.js — key map only, split out so settings.js and input.js
   can both import it without a cycle. */

export const DEFAULT_KEYS = {
  up: ['ArrowUp', 'KeyW'],
  down: ['ArrowDown', 'KeyS'],
  left: ['ArrowLeft', 'KeyA'],
  right: ['ArrowRight', 'KeyD'],
  drift: ['Space'],
  nitro: ['ShiftLeft', 'ShiftRight', 'KeyN'],
  action: ['KeyE', 'Enter'],
  steal: ['KeyC'],
  pause: ['Escape', 'KeyP'],
  photo: ['KeyF'],
  reset: ['KeyR'],
  exit: ['KeyQ'],
  camera: ['KeyV']
};

export const ACTION_NAMES = {
  up: 'Accelerate',
  down: 'Brake / Reverse',
  left: 'Steer Left',
  right: 'Steer Right',
  drift: 'Drift (race) / Shift (drag)',
  nitro: 'Nitro (race) / Shift (drag)',
  action: 'Interact',
  steal: 'Steal a stopped car',
  pause: 'Pause / Menu',
  photo: 'Photo mode',
  reset: 'Reset if stuck',
  exit: 'Exit / enter car',
  camera: 'Camera view'
};
