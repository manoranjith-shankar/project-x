import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer as createViteServer } from "vite";
import { ask, decide, modelReady, resetLog } from "./ask.mjs";
import { FOLLOW_UPS, NOT_CONNECTED, readLog, readSources } from "./workspace.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const port = Number(process.env.PORT || 4730);

function send(res, status, body) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(body));
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return {};
  }
}

const vite = await createViteServer({
  root,
  configFile: path.join(root, "vite.config.js"),
  server: { middlewareMode: true, hmr: { port: 4731 } },
  appType: "spa",
});

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

  try {
    if (req.method === "GET" && url.pathname === "/api/health") {
      send(res, 200, { ok: true, model: modelReady() });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/workspace") {
      const sources = readSources().map((source) => ({
        id: source.id,
        title: source.title,
        kind: source.kind,
        text: source.text,
      }));
      send(res, 200, {
        company: "Your workspace",
        person: "You",
        role: "Owner",
        sources,
        notConnected: NOT_CONNECTED,
        followUps: FOLLOW_UPS,
        log: readLog(),
      });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/ask") {
      const body = await readBody(req);
      const answer = await ask(body.question);
      send(res, 200, answer);
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/decide") {
      const body = await readBody(req);
      const entry = decide(body.id, body.decision);
      send(res, 200, { entry, log: readLog() });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/reset") {
      resetLog();
      send(res, 200, { log: [] });
      return;
    }
  } catch (error) {
    send(res, 400, { error: error instanceof Error ? error.message : "Request failed." });
    return;
  }

  vite.middlewares(req, res, () => {
    if (!fs.existsSync(path.join(root, "index.html"))) {
      res.writeHead(404);
      res.end("Not found");
    }
  });
});

server.listen(port, () => {
  console.log(`John for Northwind  http://localhost:${port}`);
});
