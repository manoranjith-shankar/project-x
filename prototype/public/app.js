const flows = [
  {
    step: "1",
    title: "Invoice status",
    hint: "Posts directly as @mano.",
    proves: "Reads the invoice register, inbox, and calendar; answers with the current state and next scheduled step.",
    prompt: "@john what is the status of invoice INV-2048?",
  },
  {
    step: "2",
    title: "Another company's files",
    hint: "Refused — no skill, no trace.",
    proves: "Stops before Hermes starts. No skill and no file trace. Voice, Telegram, and a machine per client are potential follow-ups.",
    prompt: "What is in the other company's contract?",
  },
];

const ordinary = [
  {
    title: "Finance updates the system",
    result: "At 10:15, Finance moves INV-2048 to In processing and queues it for the 16:00 SAP payment run.",
    screen: { kind: "mail", from: "Finance Operations", subject: "INV-2048 moved to processing", body: "The invoice passed the PO check and is queued for today's 16:00 payment run." },
  },
  {
    title: "The handoff has no owner",
    result: "Finance updated its register. Mano owns the supplier response, but the status remains in the shared mailbox.",
    screen: { kind: "end", title: "Two systems, two owners", body: "The invoice is moving. The supplier still has no update." },
  },
  {
    title: "Supplier asks",
    result: "At 11:05, Northstar asks Mano for the status before noon. Nobody replies.",
    screen: { kind: "mail", from: "Northstar Systems", subject: "Status of INV-2048", body: "Can you confirm the invoice status before noon? We need it to keep the delivery slot." },
  },
  {
    title: "The deadline passes",
    result: "The invoice is in processing, but the missed update triggers an escalation and puts the reserved delivery slot at risk.",
    screen: { kind: "end", title: "A workflow failure, not a payment failure", body: "The system had the answer. The handoff did not deliver it to the person who needed it." },
  },
];

const duplicatePayment = {
  without: [
    {
      title: "Original invoice enters SAP",
      detail: "Apex Industrial submits APX-778 for ₹7,20,000 against PO-8842.",
    },
    {
      title: "A corrected copy arrives",
      detail: "The supplier fixes its GST address and emails APX-778-R. The vendor, PO, and amount stay the same.",
    },
    {
      title: "Two IDs pass separate checks",
      detail: "Mailbox OCR and SAP treat the revised filename as a new invoice. Both records enter the 16:00 queue.",
    },
    {
      title: "₹14,40,000 is queued",
      detail: "Each record looks valid alone. The duplicate is found only after payment reconciliation.",
    },
  ],
  adjusted: [
    {
      title: "Cron invokes John at 15:30",
      detail: "The workflow scheduler starts the pre-payment skill automatically, 30 minutes before the SAP queue runs.",
    },
    {
      title: "The records are linked",
      detail: "Same vendor + same PO + same ₹7,20,000 amount + revised subject within 24 hours creates a high-confidence match.",
    },
    {
      title: "A safe action is proposed",
      detail: "John proposes holding APX-778-R and routes the evidence to the AP owner. It does not cancel a payment silently.",
    },
    {
      title: "Only ₹7,20,000 continues",
      detail: "The reviewer confirms the revision. One payable item remains, and the prevented duplicate is written to the action log.",
    },
  ],
};

let place = 1;
let simTimer = null;
let complexTimer = null;
let workspaceReady = false;

function screenHtml(screen) {
  if (screen.kind === "mail") {
    return `<div class="mini"><p class="who">From ${escapeHtml(screen.from)}</p><strong>${escapeHtml(screen.subject)}</strong><p>${escapeHtml(screen.body)}</p></div>`;
  }
  if (screen.kind === "sent") {
    return `<div class="mini"><p class="meta">Sent</p><strong>${escapeHtml(screen.subject)}</strong><p>${escapeHtml(screen.body)}</p></div>`;
  }
  if (screen.kind === "calendar") {
    return `<div class="mini"><p class="meta">26 September</p><div class="slot block">09:00–11:00 Blocked. Prepare the review.</div><div class="slot clash">09:30–10:00 Security review. This overlaps the block.</div></div>`;
  }
  if (screen.kind === "sheet") {
    return `<table class="sheet"><tr class="quiet"><td>Harbor Ops</td><td>17 Sep</td></tr><tr class="quiet"><td>Field Kit</td><td>14 Sep</td></tr><tr><td>North Line</td><td>25 Sep</td></tr></table>`;
  }
  return `<div class="mini"><strong>${escapeHtml(screen.title || "")}</strong><p>${escapeHtml(screen.body || "")}</p></div>`;
}

function renderAccordion(openIndex) {
  const accordion = document.querySelector("#accordion");
  accordion.hidden = false;
  accordion.innerHTML = ordinary
    .map((step, index) => {
      const open = index === openIndex;
      const body = open ? `${screenHtml(step.screen)}<p class="stamp">${escapeHtml(step.result)}</p>` : "";
      return `<article class="panel${open ? " open" : ""}"><button class="panel-head" type="button" data-panel="${index}"><span>${index + 1}</span><strong>${escapeHtml(step.title)}</strong></button><div class="panel-body">${body}</div></article>`;
    })
    .join("");
  accordion.querySelector(".panel.open")?.scrollIntoView({ block: "nearest" });
}

function stopSimulation() {
  if (simTimer) clearInterval(simTimer);
  simTimer = null;
  const button = document.querySelector("#simulate-flow");
  button.disabled = false;
  button.textContent = "Simulate without John";
}

function simulateFlow() {
  stopComplexSimulation();
  stopSimulation();
  let index = 0;
  renderAccordion(0);
  const button = document.querySelector("#simulate-flow");
  button.disabled = true;
  button.textContent = "Simulating…";
  simTimer = setInterval(() => {
    index += 1;
    if (index >= ordinary.length) {
      stopSimulation();
      button.textContent = "Simulate again";
      return;
    }
    renderAccordion(index);
  }, 1100);
}

function renderComplexFlow(stage) {
  const bad = duplicatePayment.without;
  const adjusted = duplicatePayment.adjusted;
  const renderSteps = (steps, offset) =>
    steps
      .map((step, index) => {
        const position = offset + index;
        const state = position < stage ? "done" : position === stage ? "active" : "pending";
        return `<li class="${state}"><strong>${escapeHtml(step.title)}</strong><span>${escapeHtml(step.detail)}</span></li>`;
      })
      .join("");
  const flow = document.querySelector("#complex-flow");
  flow.hidden = false;
  flow.innerHTML = `<div class="lanes complex-lanes"><section class="lane bad"><h3>Without John</h3><ol>${renderSteps(bad, 0)}</ol><p class="case-outcome${stage >= bad.length - 1 ? " show" : ""}">Impact · ₹7,20,000 excess cash leaves the company and Finance starts recovery.</p></section><section class="lane good"><h3>Workflow adjustment with John</h3><ol>${renderSteps(adjusted, bad.length)}</ol><p class="case-outcome${stage >= bad.length + adjusted.length - 1 ? " show" : ""}">Outcome · Duplicate held before payment; reviewer retains control.</p></section></div>`;
}

function stopComplexSimulation() {
  if (complexTimer) clearInterval(complexTimer);
  complexTimer = null;
  const button = document.querySelector("#simulate-complex");
  button.disabled = false;
  if (button.textContent === "Running scheduled control…") button.textContent = "Simulate 15:30 cron trigger";
}

function simulateComplexFlow() {
  stopSimulation();
  stopComplexSimulation();
  const total = duplicatePayment.without.length + duplicatePayment.adjusted.length;
  let stage = 0;
  renderComplexFlow(stage);
  const button = document.querySelector("#simulate-complex");
  button.disabled = true;
  button.textContent = "Running scheduled control…";
  complexTimer = setInterval(() => {
    stage += 1;
    if (stage >= total) {
      stopComplexSimulation();
      button.textContent = "Run again";
      return;
    }
    renderComplexFlow(stage);
  }, 850);
}

function showPlace(next) {
  place = next;
  document.querySelector("#lander").hidden = place !== 1;
  document.querySelector("#desk").hidden = place === 1;
  document.querySelectorAll("#rail button").forEach((button) => {
    const step = Number(button.dataset.rail);
    button.classList.toggle("now", step === place);
    button.classList.toggle("done", step < place);
  });
  if (place === 2) {
    requestAnimationFrame(() => document.querySelector("#john")?.scrollIntoView({ block: "start" }));
  }
}

const question = document.querySelector("#question");
const status = document.querySelector("#status");
const error = document.querySelector("#error");
const result = document.querySelector("#result-body");
const submit = document.querySelector("#submit");
const sourceView = document.querySelector("#source-view");
const sourceDialog = document.querySelector("#source-dialog");

async function readJson(response) {
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || "Request failed.");
  return body;
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function sourceButtonLabel(source) {
  const kind = String(source.kind || "");
  const title = String(source.title || "");
  if (kind.toLowerCase() === title.toLowerCase()) {
    return `<strong>${escapeHtml(title)}</strong>`;
  }
  return `<span class="kind">${escapeHtml(kind)}</span><strong>${escapeHtml(title)}</strong>`;
}

function setResultEmpty(show) {
  const empty = document.querySelector("#result-empty");
  if (empty) empty.hidden = !show;
}

function renderTrace(trace) {
  if (!trace?.length) return "<p class='hint'>No workspace file was opened.</p>";
  const items = trace
    .map((call) => {
      if (call.tool === "read_source") return `<li>read_source · ${escapeHtml(call.arguments?.id || "")}</li>`;
      if (call.tool === "propose_draft") return `<li>propose_draft · ${escapeHtml(call.arguments?.subject || call.arguments?.title || "draft")}</li>`;
      return `<li>${call.tool}</li>`;
    })
    .join("");
  return `<ol class="trace">${items}</ol>`;
}

function renderDraft(draft, decided) {
  if (!draft) return "";
  const actions = decided
    ? `<p class="done">${decided === "approved" ? "Approved. Written to the action log." : "Held. Nothing was sent."}</p>`
    : `<div class="row"><button class="approve" type="button" id="approve">Approve</button><button class="hold" type="button" id="hold">Hold</button></div>`;
  return `<section class="card"><h2>Waiting for your yes</h2><div class="mail"><strong>${escapeHtml(draft.title || "Draft")}</strong><p>To: ${escapeHtml(draft.to || "")}</p><p>Subject: ${escapeHtml(draft.subject || "")}</p><p class="body">${escapeHtml(draft.body || "")}</p>${actions}</div></section>`;
}

function renderWorkspace(workspace) {
  const added = workspace.sources.filter((source) => source.added);
  const allAdded = added.length === workspace.sources.length;
  workspaceReady = allAdded;
  document.querySelector("#empty-note").hidden = added.length > 0;
  document.querySelector("#empty-title").hidden = allAdded;
  document.querySelector("#setup").hidden = allAdded;
  document.querySelector("#sources").innerHTML = added
    .map(
      (source) =>
        `<div class="source-row"><button class="source" type="button" data-source="${source.id}">${sourceButtonLabel(source)}<span class="source-system">${escapeHtml(source.connector)} · ${source.records} ${source.records === 1 ? "record" : "records"}</span></button><button class="source-remove" type="button" data-remove="${source.id}" aria-label="Remove ${escapeHtml(source.title)} source">Remove</button></div>`,
    )
    .join("");
  document.querySelector("#adds").innerHTML = workspace.sources
    .filter((source) => !source.added)
    .map(
      (source) =>
        `<article><span class="kind">Tool integration · ${escapeHtml(source.kind)}</span><h3>${escapeHtml(source.title)}</h3><p class="connector">${escapeHtml(source.connector)} · ${source.records} ${source.records === 1 ? "record" : "records"}</p><p>${escapeHtml(source.about)}</p><button class="add" type="button" data-add="${source.id}">Connect</button></article>`,
    )
    .join("");
  document.querySelector("#log").textContent = workspace.log.trim();
  submit.disabled = !allAdded;
  document.querySelectorAll("#chips .flow").forEach((button) => {
    button.disabled = !allAdded;
  });
  const empty = document.querySelector("#result-empty");
  if (empty && !result.textContent.trim()) {
    empty.textContent = allAdded ? "Click Invoice status to post Mano's question." : "Add all four sources to enable John.";
  }
}

async function loadWorkspace() {
  renderWorkspace(await readJson(await fetch("/api/workspace")));
}

async function ask(text) {
  if (!workspaceReady) {
    error.hidden = false;
    error.textContent = "Add all four sources before asking John.";
    return;
  }
  question.value = text;
  submit.disabled = true;
  error.hidden = true;
  result.innerHTML = `<div class="slack-message slack-user-message"><span class="slack-avatar mano">M</span><p><strong>Mano</strong><br />${escapeHtml(text)}</p></div>`;
  setResultEmpty(false);
  status.textContent = "John is checking the workspace…";
  try {
    const answer = await readJson(
      await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: text }),
      }),
    );
    status.textContent = answer.skill ? `John used: ${answer.skill.title}` : "John stopped before opening a source.";
    const missing = answer.missing ? `<p class="slack-answer">${escapeHtml(answer.missing)}</p>` : "";
    const brief = answer.brief ? `<p class="slack-answer">${escapeHtml(answer.brief)}</p>` : "";
    const trace = answer.job === "refused" ? "" : `<details class="slack-trace"><summary>Opened sources</summary>${renderTrace(answer.trace)}</details>`;
    const skill = answer.skill ? `<p class="slack-meta">Skill · ${escapeHtml(answer.skill.title)}</p>` : "";
    const reminder = answer.job === "invoice_status" ? `<button class="reminder-chip" type="button">Set reminder when processed</button>` : "";
    result.insertAdjacentHTML(
      "beforeend",
      `<div class="slack-message slack-response"><span class="slack-avatar">J</span><div class="slack-content"><p><strong>John</strong><small>APP</small></p>${skill}${missing}${brief}${trace}${reminder}${renderDraft(answer.draft)}</div></div>`,
    );
    document.querySelector("#approve")?.addEventListener("click", () => decide("approved", answer.draft));
    document.querySelector("#hold")?.addEventListener("click", () => decide("held", answer.draft));
    document.querySelector(".reminder-chip")?.addEventListener("click", (event) => {
      event.currentTarget.disabled = true;
      event.currentTarget.textContent = "Reminder is a follow-up build";
    });
  } catch (reason) {
    error.hidden = false;
    error.textContent = reason instanceof Error ? reason.message : "John could not answer.";
    status.textContent = "";
  } finally {
    submit.disabled = false;
  }
}

async function decide(decision, draft) {
  submit.disabled = true;
  try {
    const body = await readJson(
      await fetch("/api/decide", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision }),
      }),
    );
    document.querySelector("#log").textContent = body.log.trim();
    const waiting = result.querySelector(".mail");
    if (waiting) waiting.insertAdjacentHTML("beforeend", `<p class="done">${decision === "approved" ? "Approved. Written to the action log." : "Held. Nothing was sent."}</p>`);
    document.querySelector("#approve")?.remove();
    document.querySelector("#hold")?.remove();
    document.querySelector("#log").scrollIntoView({ block: "nearest" });
  } catch (reason) {
    error.hidden = false;
    error.textContent = reason instanceof Error ? reason.message : "Could not record that.";
  } finally {
    submit.disabled = false;
  }
}

document.querySelector("#chips").innerHTML = flows
  .map(
    (flow, index) =>
      `<button class="flow${index < 3 ? " primary-flow" : ""}" type="button" data-prompt="${escapeHtml(flow.prompt)}" title="${escapeHtml(flow.proves)}"><span class="step">${flow.step}</span><span class="flow-copy"><strong>${escapeHtml(flow.title)}</strong><span class="flow-hint">${escapeHtml(flow.hint)}</span></span></button>`,
  )
  .join("");
document.querySelector("#chips").addEventListener("click", (event) => {
  const chip = event.target.closest(".flow");
  if (chip) void ask(chip.dataset.prompt);
});
document.querySelector("#ask").addEventListener("submit", (event) => {
  event.preventDefault();
  void ask(question.value);
});
document.querySelector("#sources").addEventListener("click", async (event) => {
  const remove = event.target.closest("[data-remove]");
  if (remove) {
    remove.disabled = true;
    try {
      result.innerHTML = "";
      renderWorkspace(
        await readJson(
          await fetch("/api/remove", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: remove.dataset.remove }),
          }),
        ),
      );
      setResultEmpty(true);
    } catch (reason) {
      error.hidden = false;
      error.textContent = reason instanceof Error ? reason.message : "Could not remove that source.";
      remove.disabled = false;
    }
    return;
  }
  const button = event.target.closest("[data-source]");
  if (!button) return;
  const body = await readJson(await fetch(`/api/source/${button.dataset.source}`));
  document.querySelector("#source-dialog-title").textContent = body.source.title;
  document.querySelector("#source-dialog-meta").textContent = `${body.source.connector} · ${body.source.records} ${body.source.records === 1 ? "record" : "records"} · ${body.integration.access}`;
  sourceView.textContent = JSON.stringify(body, null, 2);
  sourceDialog.showModal();
});
document.querySelector("#source-close").addEventListener("click", () => sourceDialog.close());
sourceDialog.addEventListener("click", (event) => {
  if (event.target === sourceDialog) sourceDialog.close();
});
document.querySelector("#open-john").addEventListener("click", () => showPlace(2));
document.querySelector("#rail").addEventListener("click", (event) => {
  const button = event.target.closest("[data-rail]");
  if (!button) return;
  showPlace(Number(button.dataset.rail));
});
document.querySelector("#simulate-flow").addEventListener("click", () => simulateFlow());
document.querySelector("#simulate-complex").addEventListener("click", () => simulateComplexFlow());
document.querySelector("#accordion").addEventListener("click", (event) => {
  const button = event.target.closest("[data-panel]");
  if (!button) return;
  stopSimulation();
  document.querySelector("#simulate-flow").textContent = "Simulate again";
  renderAccordion(Number(button.dataset.panel));
});
document.querySelector("#adds").addEventListener("click", async (event) => {
  const button = event.target.closest("[data-add]");
  if (!button || button.disabled) return;
  button.disabled = true;
  try {
    renderWorkspace(
      await readJson(
        await fetch("/api/add", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: button.dataset.add }),
        }),
      ),
    );
  } catch (reason) {
    error.hidden = false;
    error.textContent = reason instanceof Error ? reason.message : "Could not add that.";
    button.disabled = false;
  }
});
document.querySelector("#reset").addEventListener("click", async () => {
  stopSimulation();
  stopComplexSimulation();
  const body = await readJson(await fetch("/api/reset", { method: "POST" }));
  renderWorkspace(body);
  sourceDialog.close();
  document.querySelector("#accordion").hidden = true;
  document.querySelector("#complex-flow").hidden = true;
  result.innerHTML = "";
  setResultEmpty(true);
});

showPlace(1);
loadWorkspace().catch((reason) => {
  error.hidden = false;
  error.textContent = reason.message;
});
