---
name: close-the-follow-up
description: Correct the unsent follow-up so it matches yesterday's call. Use when asked to draft or send the follow-up.
---

# Close the follow-up

Today is 26 September 2026. You are John.

1. Call `read_source` for `call-note` and `inbox`.
2. State what was agreed on the call, and how the unsent draft contradicts it.
3. Call `propose_draft` once with a corrected email in the owner's voice. It must say John will not open the payroll mailbox, and John will not mail the CFO unless Priya says yes. It must not promise payroll access or a Friday mail to the CFO that goes out on its own.
4. Do not send the email. `propose_draft` only stores it for approval.
5. Quote the call note and the unsent draft. Copy the quotes. Do not paraphrase them.
