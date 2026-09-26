import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";

const workspaceDir = process.env.WORKSPACE_DIR;
if (!workspaceDir) {
  console.error("WORKSPACE_DIR is required");
  process.exit(1);
}

const SOURCES = {
  inbox: "inbox.md",
  calendar: "calendar.md",
  "call-note": "call-note.md",
  pipeline: "pipeline.csv",
  "action-log": "action-log.md",
};

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function addedIds() {
  const file = path.join(workspaceDir, "added.json");
  if (!fs.existsSync(file)) return [];
  try {
    const list = JSON.parse(fs.readFileSync(file, "utf8"));
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function readSource(id) {
  const file = SOURCES[id];
  if (!file) return { error: `No source named ${id}. This workspace cannot open that.` };
  if (id !== "action-log" && !addedIds().includes(id)) {
    return { error: `${id} is not in this workspace. Add it first.` };
  }
  if (id !== "action-log") {
    const integrationsPath = path.join(workspaceDir, "integrations.json");
    const integrations = JSON.parse(fs.readFileSync(integrationsPath, "utf8"));
    const data = integrations[id];
    if (!data) return { error: `No integration payload exists for ${id}.` };
    return { source: id, text: JSON.stringify({ source: id, ...data }, null, 2) };
  }
  const full = path.join(workspaceDir, file);
  if (!fs.existsSync(full)) {
    return { source: id, text: "No actions have been approved or held in this workspace yet." };
  }
  return { source: id, text: fs.readFileSync(full, "utf8") };
}

function proposeDraft(args) {
  const draft = {
    title: String(args.title || "Follow-up").trim(),
    to: String(args.to || "").trim(),
    subject: String(args.subject || "").trim(),
    body: String(args.body || "").trim(),
  };
  if (!draft.body) return { error: "A draft needs a body." };
  fs.writeFileSync(path.join(workspaceDir, "pending-draft.json"), JSON.stringify(draft, null, 2));
  return { stored: true, ...draft };
}

const tools = [
  {
    name: "read_source",
    description: "Read one allowlisted workspace source by id. There is no tool for files outside this workspace.",
    inputSchema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          enum: Object.keys(SOURCES),
          description: "inbox, calendar, call-note, pipeline, or action-log",
        },
      },
      required: ["id"],
    },
  },
  {
    name: "propose_draft",
    description: "Store a draft for the owner to approve. This does not send email.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string" },
        to: { type: "string" },
        subject: { type: "string" },
        body: { type: "string" },
      },
      required: ["body"],
    },
  },
];

function handle(message) {
  if (!message || message.jsonrpc !== "2.0") return;
  if (!message.id) return;

  if (message.method === "initialize") {
    send({
      jsonrpc: "2.0",
      id: message.id,
      result: {
        protocolVersion: "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: { name: "workspace", version: "1.0.0" },
      },
    });
    return;
  }

  if (message.method === "ping") {
    send({ jsonrpc: "2.0", id: message.id, result: {} });
    return;
  }

  if (message.method === "tools/list") {
    send({ jsonrpc: "2.0", id: message.id, result: { tools } });
    return;
  }

  if (message.method === "tools/call") {
    const name = message.params?.name;
    const args = message.params?.arguments || {};
    let payload;
    if (name === "read_source") payload = readSource(String(args.id || ""));
    else if (name === "propose_draft") payload = proposeDraft(args);
    else payload = { error: `Unknown tool ${name}` };
    send({
      jsonrpc: "2.0",
      id: message.id,
      result: {
        content: [{ type: "text", text: JSON.stringify(payload) }],
        isError: Boolean(payload.error),
      },
    });
    return;
  }

  send({
    jsonrpc: "2.0",
    id: message.id,
    error: { code: -32601, message: `Method not found: ${message.method}` },
  });
}

const lines = readline.createInterface({ input: process.stdin });
lines.on("line", (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;
  try {
    handle(JSON.parse(trimmed));
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
  }
});
