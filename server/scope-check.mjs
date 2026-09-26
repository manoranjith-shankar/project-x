import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildMessages,
  quoteInCorpus,
  readSources,
  sanitizeAnswer,
} from "./workspace.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const helios = fs.readFileSync(path.join(root, "data", "helios", "contract.md"), "utf8");
const personal = fs.readFileSync(path.join(root, "data", "personal", "inbox.md"), "utf8");
const sources = readSources();
const { system, user } = buildMessages(
  "What is in the Helios contract, and did my sister book Goa?",
  sources,
  "No actions have been approved or held in this workspace yet.",
);
const prompt = `${system}\n${user}`;

const failures = [];
if (prompt.includes("break fee") || prompt.includes("2.4")) {
  failures.push("Helios contract text leaked into the prompt.");
}
if (prompt.includes("November 12")) {
  failures.push("Personal inbox leaked into the prompt.");
}
if (!prompt.includes("capped at 4%")) {
  failures.push("Northwind contract was not included.");
}
if (!prompt.includes("INV-2041")) {
  failures.push("Northwind spend or email was not included.");
}

const corpus = sources.map((source) => source.text).join("\n");
if (quoteInCorpus("Any annual price increase is capped at 4%", corpus) !== true) {
  failures.push("A real contract quote did not verify.");
}
if (quoteInCorpus(helios, corpus) || quoteInCorpus(personal, corpus)) {
  failures.push("Outside text verified against the workspace corpus.");
}

const cleaned = sanitizeAnswer(
  {
    brief: "Helios owes a $2.4 million break fee.",
    missing: "",
    decisions: [],
    risks: [],
    actions: [],
  },
  corpus,
);
if (cleaned.brief || !cleaned.missing) {
  failures.push("Bait answer was not rejected.");
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log("scope check passed");
