const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

let mainWindow;

function createLockScreen() {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    kiosk: true, 
    fullscreen: true,
    alwaysOnTop: true,
    skipTaskbar: true, 
    frame: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false, 
      contextIsolation: true,
      backgroundThrottling: false // <-- ADD THIS LINE!
    }
  });

  mainWindow.loadFile('index.html');
}

app.whenReady().then(createLockScreen);

// When the bridge says "unlock", minimize the screen
ipcMain.on('unlock-pc', () => {
  mainWindow.setKiosk(false);
  mainWindow.minimize(); 
});

// When the bridge says "lock", pop the screen back up
ipcMain.on('lock-pc', () => {
  mainWindow.restore();
  mainWindow.setKiosk(true);
  mainWindow.setAlwaysOnTop(true);
});

let warningWindow = null;

// Listen for the warning command
ipcMain.on('show-warning', () => {
  // Prevent opening multiple warnings at once
  if (warningWindow) return; 

  const { screen } = require('electron');
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width } = primaryDisplay.workAreaSize;

  warningWindow = new BrowserWindow({
    width: 350,
    height: 100,
    x: width - 360, // Puts it in the top right corner
    y: 20,
    frame: false,
    transparent: true, // Invisible background!
    alwaysOnTop: true,
    skipTaskbar: true,
    focusable: false, // CRITICAL: Doesn't steal keyboard focus from the game!
    webPreferences: { nodeIntegration: false, contextIsolation: true }
  });

  warningWindow.loadFile('warning.html');
  warningWindow.setAlwaysOnTop(true, 'screen-saver'); // Force it above full-screen games

  // Automatically close the warning after 8 seconds
  setTimeout(() => {
    if (warningWindow) {
      warningWindow.close();
      warningWindow = null;
    }
  }, 8000);
});