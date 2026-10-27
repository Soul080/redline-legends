/* Minimal Electron shell. From this folder, after `npm install electron`:
     npx electron electron-main.cjs
   loadFile serves the page on Electron's file protocol, which resolves the
   ES module import map. A static server (see README) is the other way in. */

const { app, BrowserWindow } = require('electron');
const path = require('path');

app.whenReady().then(() => {
  const win = new BrowserWindow({
    width: 1280,
    height: 720,
    backgroundColor: '#07060f',
    webPreferences: { nodeIntegration: false, contextIsolation: true }
  });
  win.loadFile(path.join(__dirname, 'index.html'));
});

app.on('window-all-closed', () => app.quit());
