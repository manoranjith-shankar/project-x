import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)));
const workspaceDir = path.join(root, "workspace");
const hermesHome = path.join(root, "hermes-home");
const publicDir = path.join(root, "public");
const port = Number(process.env.PORT || 4740);

const SKILLS = {
  invoice_status: { id: "invoice-status", title: "Invoice status" },
  brief: { id: "morning-brief", title: "Morning brief" },
  follow_up: { id: "close-the-follow-up", title: "Close the follow-up" },
  pipeline: { id: "quiet-deals", title: "Quiet deals" },
  recall: { id: "recall", title: "Recall" },
};

const CATALOG = [
  {
    id: "inbox",
    title: "Email",
    kind: "Email",
    connector: "Microsoft 365 Mail",
    records: 10,
    about: "Supplier questions and Finance Operations updates that need an owner.",
    lands: "Finance moved INV-2048 to processing. Northstar asked Mano for the status.",
  },
  {
    id: "calendar",
    title: "Calendar",
    kind: "Calendar",
    connector: "Microsoft 365 Calendar",
    records: 3,
    about: "Deadlines and scheduled processing runs for the workflow.",
    lands: "The supplier update is due at noon. The SAP payment run is at 16:00.",
  },
  {
    id: "call-note",
    title: "Call note",
    kind: "Meeting",
    connector: "Microsoft Teams",
    records: 1,
    about: "The handoff: who owns the system update, and who owns the supplier response.",
    lands: "Finance updates the register. Mano updates the supplier.",
  },
  {
    id: "pipeline",
    title: "Invoice register",
    kind: "Sheet",
    connector: "SAP S/4HANA",
    records: 4,
    about: "Invoice number, vendor, PO, amount, current status, and next processing step.",
    lands: "INV-2048 is processing. APX-778 and its revision are both queued against the same PO.",
  },
];

const FOLLOW_UPS = [
  { title: "Voice updates", detail: "You talk, and John answers in voice." },
  { title: "Telegram channel", detail: "Use the same approval workflow from Telegram." },
  { title: "A machine per customer", detail: "Each customer's workspace runs on its own." },
  { title: "Live connections", detail: "Mail, calendar, and the pipeline update themselves." },
  { title: "Morning brief on a schedule", detail: "It shows up without you asking." },
];

function loadEnv() {
  const file = path.join(root, ".env");
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const index = trimmed.indexOf("=");
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key === "OPENROUTER_API_KEY" && value) process.env.OPENROUTER_API_KEY = value;
  }
}

loadEnv();

function hermesBin() {
  if (process.env.HERMES_BIN) return process.env.HERMES_BIN;
  const candidates = [
    path.join(hermesHome, "hermes-agent", ".hermes", "bin", "hermes"),
    path.join(hermesHome, "hermes-agent", "venv", "bin", "hermes"),
    path.join(hermesHome, "hermes-agent", ".venv", "bin", "hermes"),
    path.join(process.env.HOME || "", ".local", "bin", "hermes"),
    "/usr/local/bin/hermes",
    "/opt/homebrew/bin/hermes",
    path.join(process.env.LOCALAPPDATA || "", "hermes", "bin", "hermes.exe"),
  ];
  return candidates.find((candidate) => candidate && fs.existsSync(candidate)) || "";
}

function ensureWorkspace() {
  fs.mkdirSync(workspaceDir, { recursive: true });
  const logPath = path.join(workspaceDir, "action-log.md");
  if (!fs.existsSync(logPath)) {
    fs.writeFileSync(logPath, "No actions have been approved or held in this workspace yet.\n");
  }
}

function writeHermesConfig() {
  fs.mkdirSync(hermesHome, { recursive: true });
  const key = process.env.OPENROUTER_API_KEY || "";
  const envPath = path.join(hermesHome, ".env");
  if (key) fs.writeFileSync(envPath, `OPENROUTER_API_KEY=${key}\n`, { mode: 0o600 });
  else if (fs.existsSync(envPath)) fs.rmSync(envPath);
  const configPath = path.join(hermesHome, "config.yaml");
  const YAML = require("yaml");
  const doc = fs.existsSync(configPath) ? YAML.parse(fs.readFileSync(configPath, "utf8")) || {} : {};
  doc.model = { ...(doc.model || {}), provider: "openrouter", default: "deepseek/deepseek-v4-pro" };
  doc.agent = {
    ...(doc.agent || {}),
    disabled_toolsets: [
      "terminal",
      "file",
      "web",
      "search",
      "browser",
      "vision",
      "memory",
      "delegation",
      "cronjob",
      "image_gen",
      "tts",
      "code_execution",
      "skills",
      "computer_use",
      "todo",
      "session_search",
      "clarify",
    ],
  };
  doc.skills = { ...(doc.skills || {}), external_dirs: [path.join(root, "skills")] };
  doc.mcp_servers = {
    ...(doc.mcp_servers || {}),
    workspace: {
      command: process.execPath,
      args: [path.join(root, "mcp", "workspace-mcp.mjs")],
      env: { WORKSPACE_DIR: workspaceDir },
    },
  };
  fs.writeFileSync(configPath, YAML.stringify(doc));
}

function send(res, status, body, type = "application/json; charset=utf-8") {
  const payload = Buffer.isBuffer(body) || typeof body === "string" ? body : JSON.stringify(body);
  res.writeHead(status, { "Content-Type": type, "Cache-Control": "no-store" });
  res.end(payload);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      if (!chunks.length) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch (error) {
        reject(error);
      }
    });
  });
}

function extractJson(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1] : text;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("The classifier did not return JSON.");
  return JSON.parse(body.slice(start, end + 1));
}

async function classify(question) {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error("OPENROUTER_API_KEY is missing. Add it to prototype/.env and restart.");
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "deepseek/deepseek-v4-flash-0731",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `Label one request. Return JSON only: {"scope":"workspace","job":"brief","why":""}
scope is "workspace" or "refused".
job is "invoice_status", "brief", "follow_up", "pipeline", "recall", or "other".
Use "invoice_status" when asked for the status, processing state, payment run, or next step of an invoice.
Refuse when the request needs voice, Slack, Telegram, a machine per customer, live app connections, or files from another company.
This desk only has the owner's inbox, calendar, yesterday's call, pipeline, and action log.
The why is one short sentence. Do not draft an email.`,
        },
        { role: "user", content: question },
      ],
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = payload?.error?.message || "The classifier request failed.";
    throw new Error(`OpenRouter rejected the classifier (${response.status}): ${detail}`);
  }
  const text = payload?.choices?.[0]?.message?.content || "";
  const parsed = extractJson(text);
  const jobs = new Set(["invoice_status", "brief", "follow_up", "pipeline", "recall", "other"]);
  return {
    scope: parsed.scope === "refused" ? "refused" : "workspace",
    job: jobs.has(parsed.job) ? parsed.job : "other",
    why: String(parsed.why || "").trim(),
  };
}

function walkSessions(dir, found = []) {
  if (!fs.existsSync(dir)) return found;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkSessions(full, found);
    else if (/\.(jsonl|json)$/.test(entry.name)) found.push(full);
  }
  return found;
}

function collectToolCalls(value, calls) {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const item of value) collectToolCalls(item, calls);
    return;
  }
  const name = value.name || value.tool_name || value.function?.name;
  const args = value.arguments || value.args || value.function?.arguments;
  if (typeof name === "string" && (name === "read_source" || name.endsWith("read_source") || name === "propose_draft" || name.endsWith("propose_draft"))) {
    let parsed = args;
    if (typeof args === "string") {
      try {
        parsed = JSON.parse(args);
      } catch {
        parsed = { raw: args };
      }
    }
    const short = name.endsWith("read_source") ? "read_source" : name.endsWith("propose_draft") ? "propose_draft" : name;
    calls.push({ tool: short, arguments: parsed || {} });
  }
  for (const child of Object.values(value)) collectToolCalls(child, calls);
}

function traceFromSessions(since) {
  const files = walkSessions(path.join(hermesHome, "sessions")).filter((file) => {
    try {
      return fs.statSync(file).mtimeMs >= since - 1000;
    } catch {
      return false;
    }
  });
  const calls = [];
  for (const file of files) {
    const raw = fs.readFileSync(file, "utf8");
    if (file.endsWith(".jsonl")) {
      for (const line of raw.split("\n")) {
        if (!line.trim()) continue;
        try {
          collectToolCalls(JSON.parse(line), calls);
        } catch {
          // Skip a partial line.
        }
      }
    } else {
      try {
        collectToolCalls(JSON.parse(raw), calls);
      } catch {
        // Skip a file that is not JSON.
      }
    }
  }
  const seen = new Set();
  return calls.filter((call) => {
    const key = `${call.tool}:${JSON.stringify(call.arguments)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function traceFromStream(stdout) {
  const calls = [];
  let answer = "";
  for (const line of stdout.split("\n")) {
    if (!line.trim()) continue;
    let event;
    try {
      event = JSON.parse(line);
    } catch {
      continue;
    }
    if (event.type === "tool_use") {
      const name = String(event.name || "");
      const tool = name.endsWith("read_source") ? "read_source" : name.endsWith("propose_draft") ? "propose_draft" : name;
      if (tool === "read_source" || tool === "propose_draft") {
        calls.push({ tool, arguments: event.input || {} });
      }
    }
    if (event.type === "result" && event.text) answer = String(event.text);
  }
  return { answer, trace: calls };
}

function runHermes(question, skillId) {
  const bin = hermesBin();
  if (!bin) {
    return Promise.reject(
      new Error("Hermes was not found. Install it or set HERMES_BIN to the Hermes executable."),
    );
  }
  writeHermesConfig();
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const child = spawn(
      bin,
      [
        "chat",
        "-q",
        question,
        "--oneshot",
        "-s",
        skillId,
        "--provider",
        "openrouter",
        "--model",
        "deepseek/deepseek-v4-pro",
        "--format",
        "stream-json",
        "--max-turns",
        "8",
      ],
      {
        cwd: root,
        env: {
          ...process.env,
          HERMES_HOME: hermesHome,
          OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      const parsed = traceFromStream(stdout);
      const trace = parsed.trace.length ? parsed.trace : traceFromSessions(started);
      if (code !== 0 && !parsed.answer) {
        reject(new Error(stderr.trim() || stdout.trim() || `Hermes exited ${code}.`));
        return;
      }
      resolve({ answer: parsed.answer, trace });
    });
  });
}

function readDraft() {
  const file = path.join(workspaceDir, "pending-draft.json");
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function readLog() {
  const file = path.join(workspaceDir, "action-log.md");
  if (!fs.existsSync(file)) return "";
  return fs.readFileSync(file, "utf8");
}

async function ask(question) {
  const trimmed = String(question || "").trim();
  if (!trimmed) throw new Error("Ask a question first.");
  const route = await classify(trimmed);
  if (route.scope === "refused") {
    return {
      brief: "",
      missing: route.why || "That is a follow-up, not this desk.",
      skill: null,
      trace: [],
      draft: null,
      job: "refused",
    };
  }
  const skill = SKILLS[route.job] || { id: "morning-brief", title: "This workspace" };
  fs.rmSync(path.join(workspaceDir, "pending-draft.json"), { force: true });
  const result = await runHermes(trimmed, skill.id);
  return {
    brief: result.answer,
    missing: "",
    skill,
    trace: result.trace,
    draft: readDraft(),
    job: route.job,
  };
}

function decide(decision) {
  if (decision !== "approved" && decision !== "held") throw new Error("Choose approve or hold.");
  const draft = readDraft();
  if (!draft) throw new Error("There is no draft waiting.");
  const stamp = new Date().toISOString().slice(0, 16).replace("T", " ");
  const block = [
    "",
    `${decision.toUpperCase()} ${stamp} by you`,
    draft.title || "Draft",
    draft.to ? `To: ${draft.to}` : "",
    draft.subject ? `Subject: ${draft.subject}` : "",
    draft.body || "",
  ]
    .filter(Boolean)
    .join("\n");
  let current = readLog();
  if (current.includes("No actions have been approved")) current = "";
  fs.writeFileSync(path.join(workspaceDir, "action-log.md"), `${current.trim()}\n${block}\n`);
  fs.rmSync(path.join(workspaceDir, "pending-draft.json"), { force: true });
  return { decision, log: readLog() };
}

function addedPath() {
  return path.join(workspaceDir, "added.json");
}

function readAdded() {
  if (!fs.existsSync(addedPath())) return [];
  try {
    const list = JSON.parse(fs.readFileSync(addedPath(), "utf8"));
    return Array.isArray(list) ? list.filter((id) => CATALOG.some((item) => item.id === id)) : [];
  } catch {
    return [];
  }
}

function writeAdded(ids) {
  fs.writeFileSync(addedPath(), `${JSON.stringify(ids)}\n`);
}

function workspaceView() {
  const added = new Set(readAdded());
  return {
    followUps: FOLLOW_UPS,
    log: readLog(),
    sources: CATALOG.map((source) => ({ ...source, added: added.has(source.id) })),
  };
}

function integrationView(id) {
  const source = CATALOG.find((item) => item.id === id);
  if (!source) throw new Error("That integration is not available.");
  const file = path.join(workspaceDir, "integrations.json");
  const integrations = JSON.parse(fs.readFileSync(file, "utf8"));
  return {
    source: {
      id: source.id,
      title: source.title,
      connector: source.connector,
      records: source.records,
    },
    ...integrations[id],
  };
}

function addSource(id) {
  const source = CATALOG.find((item) => item.id === id);
  if (!source) throw new Error("That is not a component of this workspace.");
  const ids = readAdded();
  if (!ids.includes(id)) writeAdded([...ids, id]);
  return workspaceView();
}

function removeSource(id) {
  const source = CATALOG.find((item) => item.id === id);
  if (!source) throw new Error("That is not a component of this workspace.");
  writeAdded(readAdded().filter((addedId) => addedId !== id));
  return workspaceView();
}

function resetWorkspace() {
  fs.writeFileSync(
    path.join(workspaceDir, "action-log.md"),
    "No actions have been approved or held in this workspace yet.\n",
  );
  fs.rmSync(path.join(workspaceDir, "pending-draft.json"), { force: true });
  writeAdded([]);
  return workspaceView();
}

ensureWorkspace();
try {
  writeHermesConfig();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  try {
    if (req.method === "GET" && url.pathname === "/api/health") {
      send(res, 200, {
        ok: true,
        hermes: Boolean(hermesBin()),
        model: Boolean(process.env.OPENROUTER_API_KEY),
      });
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/workspace") {
      send(res, 200, workspaceView());
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/add") {
      const body = await readBody(req);
      send(res, 200, addSource(body.id));
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/remove") {
      const body = await readBody(req);
      send(res, 200, removeSource(body.id));
      return;
    }
    if (req.method === "GET" && url.pathname.startsWith("/api/source/")) {
      const id = url.pathname.slice("/api/source/".length);
      const files = {
        inbox: "inbox.md",
        calendar: "calendar.md",
        "call-note": "call-note.md",
        pipeline: "pipeline.csv",
      };
      const file = files[id];
      if (!file || !readAdded().includes(id)) {
        send(res, 404, { error: "That file is not in this workspace. Add it first." });
        return;
      }
      send(res, 200, integrationView(id));
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/ask") {
      const body = await readBody(req);
      send(res, 200, await ask(body.question));
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/decide") {
      const body = await readBody(req);
      send(res, 200, decide(body.decision));
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/reset") {
      send(res, 200, resetWorkspace());
      return;
    }
  } catch (error) {
    send(res, 400, { error: error instanceof Error ? error.message : "Request failed." });
    return;
  }

  if (req.method === "GET" && url.pathname === "/slide.html") {
    send(res, 200, fs.readFileSync(path.join(root, "slide.html")), "text/html; charset=utf-8");
    return;
  }

  const requested = url.pathname === "/" ? "/index.html" : url.pathname;
  const file = path.normalize(path.join(publicDir, requested));
  if (!file.startsWith(publicDir) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    send(res, 404, "Not found", "text/plain; charset=utf-8");
    return;
  }
  const types = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8" };
  send(res, 200, fs.readFileSync(file), types[path.extname(file)] || "application/octet-stream");
});

server.listen(port, () => {
  console.log(`Lighter John  http://localhost:${port}`);
});
