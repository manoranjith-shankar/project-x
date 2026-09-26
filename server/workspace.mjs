import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workspaceDir = path.join(root, "data", "workspace");
const logPath = path.join(workspaceDir, "action-log.json");

export const SOURCES = [
  { id: "inbox", title: "Inbox", kind: "Email", file: "inbox.md" },
  { id: "calendar", title: "Calendar", kind: "Calendar", file: "calendar.md" },
  { id: "call-note", title: "Yesterday's call", kind: "Meeting", file: "call-note.md" },
  { id: "pipeline", title: "Pipeline", kind: "Sheet", file: "pipeline.csv" },
];

export const NOT_CONNECTED = [
  {
    id: "other-company",
    title: "Another company's files",
    reason: "Not in this workspace.",
  },
];

export const FOLLOW_UPS = [
  { title: "Voice updates", detail: "You talk, and John answers in voice." },
  { title: "Slack and Telegram", detail: "The team asks in Slack. You ask on Telegram." },
  { title: "A machine per customer", detail: "Each customer's workspace runs on its own." },
  { title: "Live connections", detail: "Mail, calendar, and the pipeline update themselves." },
  { title: "Morning brief on a schedule", detail: "It shows up without you asking." },
];

const BAIT = [/2\.4/, /break fee/i, /\bgoa\b/i, /november 12/i];

export function readSources() {
  return SOURCES.map((source) => {
    const text = fs.readFileSync(path.join(workspaceDir, source.file), "utf8");
    return { ...source, text };
  });
}

export function readLog() {
  if (!fs.existsSync(logPath)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(logPath, "utf8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function writeLog(entries) {
  fs.writeFileSync(logPath, JSON.stringify(entries, null, 2));
}

export function logAsText(entries) {
  if (!entries.length) {
    return "No actions have been approved or held in this workspace yet.";
  }
  return entries
    .map((entry) => {
      const when = entry.at ? entry.at.slice(0, 16).replace("T", " ") : "";
      return [
        `${entry.decision.toUpperCase()} ${when} by ${entry.by}`,
        entry.title,
        entry.to ? `To: ${entry.to}` : "",
        entry.subject ? `Subject: ${entry.subject}` : "",
        entry.body || "",
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n\n");
}

export function workspaceCorpus(sources, logText) {
  return [...sources.map((source) => source.text), logText].join("\n");
}

export function buildMessages(question, sources, logText, job = "other") {
  const today = "26 September 2026";
  const packed = sources
    .map(
      (source) =>
        `SOURCE ${source.id}\nTitle: ${source.title}\nKind: ${source.kind}\n\n${source.text.trim()}`,
    )
    .join("\n\n----\n\n");

  const system = `You are John, the private coworker for this workspace.
Today is ${today}. The person asking is the owner. Harbor Ops is sample data, not a live customer.

The route for this turn is: ${job}
- brief: overnight email, what is urgent, and calendar conflicts. Draft a reply only if one is actually needed, and do not send it.
- follow_up: what was agreed on the call, how the unsent draft contradicts it, and one corrected follow-up waiting for approval.
- pipeline: deals with no activity in the 7 days before today. Draft follow-ups. Do not send them.
- recall: answer from the action log. Do not draft anything new.
- other: answer from the workspace only.

Rules:
- The user message contains the entire workspace. Use nothing else.
- If the question is about a company, inbox, or file that is not in those sources, put the explanation in "missing" and return empty decisions, risks, and actions. Do not invent the missing document.
- Voice updates, Slack, Telegram, a machine per customer, and live app connections are follow-ups. If asked for those, say so in "missing" and do not pretend they already happened.
- Do not send, file, or schedule anything yourself.
- Every decision, risk, and action needs at least one citation. Copy the quote from the source. Do not paraphrase the quote.
- Do not say a deadline has already passed unless a source says it has.
- A risk should cite two sources when neither source states the problem on its own.
- Write drafts in the owner's voice: short, specific, ready to approve. Sign off as the owner, not as John.
- Return one JSON object and nothing else.

Shape:
{
  "brief": "at most 2 sentences",
  "missing": "",
  "decisions": [{ "text": "", "owner": "", "deadline": "", "citations": [{ "source": "", "quote": "" }] }],
  "risks": [{ "title": "", "detail": "", "severity": "high", "citations": [{ "source": "", "quote": "" }] }],
  "actions": [{ "kind": "draft_email", "title": "", "to": "", "subject": "", "body": "", "why": "", "citations": [{ "source": "", "quote": "" }] }]
}

Use at most 3 decisions, 2 risks, and 2 actions. severity is "high" or "medium". source must be one of: ${sources.map((source) => source.id).join(", ")}, action-log.`;

  const user = `Question: ${question}

WORKSPACE ACTION LOG
${logText}

${packed}`;

  return { system, user };
}

function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[^a-z0-9%$.,:/ -]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function quoteInCorpus(quote, corpus) {
  const q = normalize(quote);
  const hay = normalize(corpus);
  if (q.length < 16) return false;
  if (hay.includes(q)) return true;
  const words = q.split(" ");
  for (let i = 0; i < words.length - 5; i += 1) {
    const slice = words.slice(i, i + 6).join(" ");
    if (slice.length > 24 && hay.includes(slice)) return true;
  }
  return false;
}

function cleanCitations(citations, corpus) {
  if (!Array.isArray(citations)) return [];
  return citations
    .filter((citation) => citation && typeof citation.quote === "string")
    .map((citation) => ({
      source: String(citation.source || ""),
      quote: String(citation.quote || "").trim(),
      verified: quoteInCorpus(citation.quote, corpus),
    }))
    .filter((citation) => citation.quote);
}

function leaked(value) {
  return BAIT.some((pattern) => pattern.test(String(value || "")));
}

export function sanitizeAnswer(raw, corpus) {
  const brief = String(raw?.brief || "").trim();
  const missing = String(raw?.missing || "").trim();
  const decisions = (Array.isArray(raw?.decisions) ? raw.decisions : [])
    .slice(0, 3)
    .map((item) => ({
      text: String(item?.text || "").trim(),
      owner: String(item?.owner || "").trim(),
      deadline: String(item?.deadline || "").trim(),
      citations: cleanCitations(item?.citations, corpus),
    }))
    .filter((item) => item.text && !leaked(item.text));

  const risks = (Array.isArray(raw?.risks) ? raw.risks : [])
    .slice(0, 2)
    .map((item) => ({
      title: String(item?.title || "").trim(),
      detail: String(item?.detail || "").trim(),
      severity: item?.severity === "medium" ? "medium" : "high",
      citations: cleanCitations(item?.citations, corpus),
    }))
    .filter((item) => item.title && !leaked(item.title) && !leaked(item.detail));

  const actions = (Array.isArray(raw?.actions) ? raw.actions : [])
    .slice(0, 2)
    .map((item) => ({
      kind: "draft_email",
      title: String(item?.title || "Draft").trim(),
      to: String(item?.to || "").trim(),
      subject: String(item?.subject || "").trim(),
      body: String(item?.body || "").trim(),
      why: String(item?.why || "").trim(),
      citations: cleanCitations(item?.citations, corpus),
    }))
    .filter(
      (item) =>
        item.body &&
        !leaked(item.body) &&
        !leaked(item.subject) &&
        !leaked(item.title),
    );

  const outside =
    leaked(brief) ||
    leaked(missing) ||
    decisions.some((item) => item.citations.some((citation) => leaked(citation.quote))) ||
    risks.some((item) => item.citations.some((citation) => leaked(citation.quote)));

  if (outside) {
    return {
      brief: "",
      missing: "That is not in this workspace.",
      decisions: [],
      risks: [],
      actions: [],
    };
  }

  return { brief, missing, decisions, risks, actions };
}
