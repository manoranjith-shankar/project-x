import { randomUUID } from "node:crypto";
import fs from "node:fs";
import {
  buildMessages,
  logAsText,
  readLog,
  readSources,
  sanitizeAnswer,
  workspaceCorpus,
  writeLog,
} from "./workspace.mjs";

const pending = new Map();

const MODEL_ENV_KEYS = new Set([
  "QWEN_API_KEY",
  "QWEN_BASE_URL",
  "QWEN_CHAT_MODEL",
  "OPENROUTER_API_KEY",
  "OPENROUTER_BASE_URL",
  "MODEL",
]);

function loadModelEnv() {
  const files = [
    new URL("../.env", import.meta.url),
    new URL("../../john-experiments-mz/qwen-memory-mcp/.env", import.meta.url),
  ];
  for (const file of files) {
    let text = "";
    try {
      text = fs.readFileSync(file, "utf8");
    } catch {
      continue;
    }
    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
      const index = trimmed.indexOf("=");
      const key = trimmed.slice(0, index).trim();
      if (!MODEL_ENV_KEYS.has(key)) continue;
      let value = trimmed.slice(index + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = value;
    }
  }
}

loadModelEnv();

function modelConfig(slot) {
  if (process.env.OPENROUTER_API_KEY) {
    return {
      apiKey: process.env.OPENROUTER_API_KEY,
      baseUrl: (process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1").replace(/\/$/, ""),
      model:
        slot === "classifier"
          ? process.env.CLASSIFIER_MODEL || "deepseek/deepseek-v4-flash-0731"
          : process.env.WORKER_MODEL || "deepseek/deepseek-v4-pro",
    };
  }
  const baseUrl = (
    process.env.QWEN_BASE_URL || "https://dashscope-intl.aliyuncs.com/compatible-mode/v1"
  ).replace(/\/$/, "");
  return {
    apiKey: process.env.QWEN_API_KEY || "",
    baseUrl,
    model: process.env.QWEN_CHAT_MODEL || process.env.MODEL || "qwen-plus",
  };
}

export function modelReady() {
  return Boolean(modelConfig().apiKey);
}

function extractJson(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1] : text;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start === -1 || end === -1) {
    throw new Error("The model did not return JSON.");
  }
  return JSON.parse(body.slice(start, end + 1));
}

async function complete(messages, slot) {
  const { apiKey, baseUrl, model } = modelConfig(slot);
  if (!apiKey) {
    throw new Error("No model key is configured. Set OPENROUTER_API_KEY or QWEN_API_KEY and restart.");
  }
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages,
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = payload?.error?.message || payload?.message || response.statusText;
    throw new Error(detail || "The model request failed.");
  }
  const text = payload?.choices?.[0]?.message?.content;
  if (!text) throw new Error("The model returned an empty answer.");
  return text;
}

const CLASSIFIER = `Label one request for this workspace. Return JSON only: {"scope":"workspace","job":"brief","why":""}
scope is "workspace" or "refused".
job is "brief", "follow_up", "pipeline", "recall", or "other".
Refuse when the request needs voice, Slack, Telegram, a machine per customer, live app connections, or files from another company.
This workspace only has the owner's inbox, calendar, yesterday's call, pipeline, and action log.
The why is one short sentence. Do not draft an email.`;

async function route(question) {
  try {
    const text = await complete(
      [
        { role: "system", content: CLASSIFIER },
        { role: "user", content: question },
      ],
      "classifier",
    );
    const parsed = extractJson(text);
    const scope = parsed.scope === "refused" ? "refused" : "workspace";
    const jobs = new Set(["brief", "follow_up", "pipeline", "recall", "other"]);
    return {
      scope,
      job: jobs.has(parsed.job) ? parsed.job : "other",
      why: String(parsed.why || "").trim(),
    };
  } catch {
    return { scope: "workspace", job: "other", why: "" };
  }
}

export async function ask(question) {
  const trimmed = String(question || "").trim();
  if (!trimmed) throw new Error("Ask a question first.");
  const routeResult = await route(trimmed);
  if (routeResult.scope === "refused") {
    return {
      brief: "",
      missing: routeResult.why || "That is a follow-up, not this desk.",
      decisions: [],
      risks: [],
      actions: [],
      read: [],
      job: "refused",
    };
  }
  const sources = readSources();
  const log = readLog();
  const logText = logAsText(log);
  const { system, user } = buildMessages(trimmed, sources, logText, routeResult.job);
  const text = await complete(
    [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    "worker",
  );
  const parsed = extractJson(text);
  const answer = sanitizeAnswer(parsed, workspaceCorpus(sources, logText));
  const actions = answer.actions.map((action) => {
    const id = randomUUID();
    pending.set(id, action);
    return { id, ...action };
  });
  return {
    ...answer,
    actions,
    read: sources.map((source) => ({
      id: source.id,
      title: source.title,
      kind: source.kind,
    })),
    job: routeResult.job,
  };
}

export function decide(id, decision) {
  const action = pending.get(id);
  if (!action) throw new Error("That draft is no longer waiting. Ask again.");
  if (decision !== "approved" && decision !== "held") {
    throw new Error("Choose approve or hold.");
  }
  const entry = {
    id,
    at: new Date().toISOString(),
    decision,
    by: "You",
    title: action.title,
    to: action.to,
    subject: action.subject,
    body: action.body,
  };
  const log = readLog();
  log.push(entry);
  writeLog(log);
  pending.delete(id);
  return entry;
}

export function resetLog() {
  writeLog([]);
  pending.clear();
}
