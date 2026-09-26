---
name: quiet-deals
description: Deals with no activity in the 7 days before 26 September 2026, and drafts that do not send.
---

# Quiet deals

Today is 26 September 2026. A quiet deal has last_activity on or before 19 September 2026.

1. Call `read_source` for `pipeline`.
2. Name the quiet deals. Do not call a deal quiet if its last activity is 25 September 2026.
3. Call `propose_draft` once, with a short follow-up the owner can approve for the quiet deals. Do not send it.
4. Quote the pipeline rows you used.
