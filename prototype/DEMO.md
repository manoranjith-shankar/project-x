# John AI Agent — 7-minute judge demo

## Before the clock

- Open `http://localhost:4740`.
- Click **John → Clear workspace**, then return to **The problem**.
- Confirm `GET /api/health` reports `hermes: true` and `model: true`.
- Keep `John-solution.pdf` open as the leave-behind.

## 0:00–1:05 — 1. The problem

**On screen:** The problem.

> Enterprise workflows usually break at the handoff. One team updates a system, but the person who must act never sees it.
>
> Here, Finance updates an invoice to “in processing.” Mano owns the supplier update, but misses the shared-mailbox message. The supplier waits, and a delivery slot is at risk. No system failed; the handoff did.
>
> John lives in Slack and closes that gap using only the sources the user adds.

Click **Open John**.

## 1:05–2:05 — 2. How the solution solves it

**On screen:** John, with an empty workspace.

> This is John in the private invoice-operations Slack channel. It starts with no connected sources and therefore no workflow context.

Add **Email**, **Calendar**, **Call note**, and **Invoice register**. Point to each appearing under Sources.

> These are tool integrations: Microsoft 365 Mail and Calendar, Teams, and SAP. This prototype backs them with local JSON records. The visible source list is also John's boundary—if a source is not connected, John cannot open it.

Click **Email** once, show the JSON payload, then close it.

> The judge can inspect every value exposed to John, including the integration, access mode, sync time, and ten email records.

Click **Simulate without John**.

> Finance updates INV-2048, but the handoff has no visible owner. Mano misses the shared mailbox, the supplier asks again, and the noon deadline passes. No system failed; the handoff did.

Do not wait for every animation if time is tight; click the final panel and continue.

**Optional complexity proof:** Click **Simulate 15:30 cron trigger**.

> Nobody asks John in Slack for this workflow. A scheduler invokes the pre-payment skill through a cron trigger at 15:30, before the 16:00 SAP run. A supplier has sent a corrected ₹7.2 lakh invoice with a new ID, so both versions entered SAP. John matches vendor, PO, amount, and revision timing; proposes a hold; and keeps the AP reviewer in control. One valid payment continues and the duplicate is recorded as prevented.

## 2:05–4:25 — Live proof: John solves it

Click **Invoice status** under **Ask John in Slack**. Mano's question posts immediately:

> @john what is the status of invoice INV-2048?

When the answer returns, point in this order:

1. **Skill**
   > The request is routed to one job: Invoice status.
2. **Opened**
   > John opened only the sources required for the answer.
3. **Grounded answer**
   > John says INV-2048 is in processing and the next SAP run is at 4 PM. He does not guess that “in processing” means “paid.”
4. **Next action**
   > John asks whether Mano wants a reminder. The reminder itself is explicitly a follow-up build.

If the response is fast, click **Another company's files**.

> This stops before Hermes and before any file tool. There is no tool for another company's workspace.

## 4:25–5:20 — 3. How AI is used

**On screen:** Stay on the John Slack thread (skill + opened sources visible). Do not change tabs—the UI only has **The problem** and **John**.

> The model assembles context. Tools enforce the boundary.
>
> **1 · Route** — DeepSeek V4 Flash labels the request as invoice status, brief, follow-up, recall, or refused. It does not answer the question.
>
> **2 · Work** — Hermes loads the invoice-status skill. DeepSeek V4 Pro calls `read_source` and reconciles the newest status with the next scheduled step.
>
> **3 · Verify** — The Slack reply shows the skill and every source opened. John says “in processing,” not “paid,” because the source does.

## 5:20–6:15 — 4. Key technical choices

**On screen:** Same John view, or scroll to Sources / action log if helpful.

> We deliberately kept the surface small.
>
> **Scoped MCP** — Only allowlisted workspace source IDs; terminal, web, general file access, and send are disabled.
>
> **Grounded status** — John reports “in processing” from the register and the 16:00 run from the calendar; it does not invent “paid.”
>
> **Action boundary** — John can offer a reminder, but creating it is a potential follow-up—not a hidden action.
>
> **Trace over claims** — The UI shows the selected skill and each tool call.

## 6:15–6:45 — 5. Follow-up build

**On screen:** Optional: point at the disabled **Set reminder when processed** chip after the invoice answer.

> Keep the safety model; connect it to where work happens.
>
> This prototype proves the workflow and the safety model. Slack is the surface. The next build makes the offered reminder executable, then adds:
>
> - **Voice updates** — You talk, and John answers in voice.
> - **Telegram channel** — Same approval workflow from Telegram.
> - **A machine per customer** — Each customer's workspace runs on its own.
> - **Live connections** — Mail, calendar, and the pipeline update themselves.
> - **Morning brief on a schedule** — It shows up without you asking.
>
> Those are new surfaces. The core stays the same: scoped sources, a proposed action, a human gate, and an auditable log.

## 6:45–7:00 — Close

> John does not replace the system of record. It closes the gap between a status update and the person who has to act on it.
>
> One workspace. One safe action. Your approval.

Stop.

## If inference is slow

- Continue explaining the visible **Skill / Opened sources** contract while waiting.
- Skip the out-of-scope question.
- Never claim the reminder was set. It is explicitly a follow-up build.
