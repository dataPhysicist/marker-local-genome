/**
 * Marker desktop shell: serves the Vite `dist/` folder over loopback so Web Workers
 * (module type) work reliably; no raw genotype data is sent to this server.
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { app, BrowserWindow } from "electron";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.resolve(__dirname, "..", "dist");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".woff2": "font/woff2",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  ".map": "application/json",
};

function safeJoin(base, unsafe) {
  const target = path.normalize(path.join(base, unsafe));
  if (!target.startsWith(base)) return null;
  return target;
}

function staticServer(req, res) {
  const host = `http://${req.headers.host}`;
  let pathname;
  try {
    pathname = new URL(req.url ?? "/", host).pathname;
  } catch {
    res.writeHead(400);
    res.end();
    return;
  }

  const filePath = safeJoin(distDir, pathname === "/" ? "index.html" : pathname.slice(1));
  if (!filePath) {
    res.writeHead(403);
    res.end();
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (!err) {
      const ext = path.extname(filePath);
      res.writeHead(200, { "Content-Type": MIME[ext] ?? "application/octet-stream" });
      res.end(data);
      return;
    }
    if (req.method === "GET") {
      fs.readFile(path.join(distDir, "index.html"), (e2, html) => {
        if (e2) {
          res.writeHead(404);
          res.end("Not found");
        } else {
          res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
          res.end(html);
        }
      });
    } else {
      res.writeHead(404);
      res.end();
    }
  });
}

let server;
/** @type {number | undefined} */
let serverPort;

function startServerOnce() {
  return new Promise((resolve, reject) => {
    if (serverPort != null) {
      resolve(serverPort);
      return;
    }
    const s = http.createServer(staticServer);
    s.listen(0, "127.0.0.1", () => {
      const addr = s.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      if (!port) {
        reject(new Error("No port"));
        return;
      }
      server = s;
      serverPort = port;
      resolve(port);
    });
    s.on("error", reject);
  });
}

async function createWindow() {
  const port = await startServerOnce();
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 720,
    minHeight: 560,
    title: "Marker",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });
  await mainWindow.loadURL(`http://127.0.0.1:${port}/`);
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  void createWindow().catch((err) => {
    console.error(err);
    app.quit();
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) void createWindow();
  });
});

app.on("window-all-closed", () => {
  // Keep loopback server alive on macOS so reopen from Dock works
  if (process.platform !== "darwin") {
    if (server) {
      server.close();
      server = undefined;
      serverPort = undefined;
    }
    app.quit();
  }
});

app.on("before-quit", () => {
  if (server) {
    server.close();
    server = undefined;
    serverPort = undefined;
  }
});
