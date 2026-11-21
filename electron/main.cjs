const { app, BrowserWindow, shell, dialog } = require("electron");
const { autoUpdater } = require("electron-updater");
const path = require("node:path");

const isDev = !app.isPackaged;
let updateCheckTimer;

function createWindow() {
  const win = new BrowserWindow({
    width: 1440, height: 920, minWidth: 980, minHeight: 650,
    backgroundColor: "#1e1f22",
    icon: path.join(__dirname, "../build/gitmessage.ico"),
    titleBarStyle: "hidden",
    titleBarOverlay: { color: "#1e1f22", symbolColor: "#ffffff", height: 38 },
    webPreferences: { preload: path.join(__dirname, "preload.cjs"), contextIsolation: true, nodeIntegration: false, sandbox: true }
  });
  if (isDev) win.loadURL("http://127.0.0.1:5173");
  else win.loadFile(path.join(__dirname, "../dist/index.html"));
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: "deny" }; });
}

function startUpdateChecks() {
  if (!app.isPackaged) return;

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowPrerelease = true;

  autoUpdater.on("error", (error) => {
    console.error("GitMessage update check failed:", error);
  });

  autoUpdater.on("update-downloaded", async () => {
    const result = await dialog.showMessageBox({
      type: "info",
      title: "GitMessage update ready",
      message: "A GitMessage update has been downloaded.",
      detail: "Restart GitMessage now to install the update.",
      buttons: ["Restart now", "Later"],
      defaultId: 0,
      cancelId: 1
    });
    if (result.response === 0) autoUpdater.quitAndInstall();
  });

  const check = () => autoUpdater.checkForUpdates().catch((error) => {
    console.error("GitMessage update check failed:", error);
  });

  setTimeout(check, 10000);
  updateCheckTimer = setInterval(check, 4 * 60 * 60 * 1000);
}

app.whenReady().then(() => {
  createWindow();
  startUpdateChecks();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("before-quit", () => {
  if (updateCheckTimer) clearInterval(updateCheckTimer);
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
