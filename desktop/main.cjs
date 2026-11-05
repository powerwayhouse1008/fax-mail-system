const { app, BrowserWindow, dialog, ipcMain } = require("electron");
const fs = require("fs");
const path = require("path");

const configPath = path.join(app.getPath("userData"), "server-url.txt");
const packagedServerUrlPath = path.join(__dirname, "server-url.txt");
let packagedServerUrl = "";
try {
  packagedServerUrl = fs.readFileSync(packagedServerUrlPath, "utf8").trim();
} catch {}
const defaultServerUrl = process.env.FAX_SERVER_URL || packagedServerUrl || "http://localhost:3000";

function readServerUrl() {
  try {
    const value = fs.readFileSync(configPath, "utf8").trim();
    if (value) return value;
  } catch {}
  return defaultServerUrl;
}

function saveServerUrl(value) {
  const url = String(value || "").trim().replace(/\/$/, "");
  if (!/^https?:\/\/[^\s]+$/i.test(url)) throw new Error("サーバーURLが正しくありません。");
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, url, "utf8");
  return url;
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 960,
    minHeight: 640,
    title: "FAX Mail System",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  window.setMenuBarVisibility(false);
  window.loadURL(readServerUrl());
}

ipcMain.handle("configure-server", async (event) => {
  const result = await dialog.showMessageBox(BrowserWindow.fromWebContents(event.sender), {
    type: "question",
    title: "FAXサーバー設定",
    message: "接続先サーバーURLを入力してください。",
    detail: "例: https://fax.example.com",
    buttons: ["キャンセル", "URLを入力"],
    defaultId: 1,
  });
  if (result.response !== 1) return false;
  const input = await dialog.showMessageBox(BrowserWindow.fromWebContents(event.sender), {
    type: "info",
    title: "サーバーURL",
    message: "URLはアプリ初回設定ファイルで変更できます。",
    detail: `現在のURL: ${readServerUrl()}\n設定ファイル: ${configPath}`,
    buttons: ["OK"],
  });
  return Boolean(input);
});

app.whenReady().then(createWindow);
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
