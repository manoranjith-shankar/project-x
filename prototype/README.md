# John workflow-agent prototype

John is a workspace-scoped AI agent presented through a Slack-style interface. The demo connects four read-only workflow sources, shows two enterprise failures, and uses Hermes Agent plus an allowlisted MCP server to answer an invoice-status request.

## What runs locally

One Node process serves the browser UI, JSON API, workspace state, and Hermes requests:

```text
Browser → server.mjs → Hermes Agent → workspace MCP → connected source records
```

- UI and API: `http://localhost:4740`
- Agent runtime: Hermes Agent
- Model provider: OpenRouter
- Worker model: `deepseek/deepseek-v4-pro`
- Source tool: `read_source`
- Local source records: `workspace/integrations.json`
- App-specific Hermes state: `hermes-home/` (created locally and ignored by git)

The Microsoft 365, Teams, SAP, Slack, and cron screens represent production integrations. This repository uses local JSON records and a button-triggered cron simulation so it can run without enterprise credentials.

## Prerequisites

- Node.js **22.22 or newer**
- npm
- Git
- An [OpenRouter](https://openrouter.ai/) API key with access to the configured DeepSeek models
- Hermes Agent

Install Hermes using the official installer:

### macOS, Linux, or WSL2

```bash
curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash
source ~/.zshrc 2>/dev/null || source ~/.bashrc
hermes --version
```

### Windows PowerShell

```powershell
iex (irm https://hermes-agent.nousresearch.com/install.ps1)
hermes --version
```

See the [official Hermes installation guide](https://hermes-agent.nousresearch.com/docs/getting-started/installation) if the command is not available after installation.

## Install and run

From the repository root:

```bash
cd prototype
npm install
cp .env.example .env
```

Open `prototype/.env` and set:

```dotenv
OPENROUTER_API_KEY=your_openrouter_key
```

Start the complete application:

```bash
npm start
```

Open [http://localhost:4740](http://localhost:4740).

The first AI request can be slower because Hermes initializes its app-specific home and model metadata.

## Confirm the setup

In another terminal:

```bash
curl -s http://localhost:4740/api/health
```

Expected:

```json
{"ok":true,"hermes":true,"model":true}
```

- `hermes: false`: install Hermes or set `HERMES_BIN` to its executable.
- `model: false`: add `OPENROUTER_API_KEY` to `prototype/.env`, then restart.

For a nonstandard Hermes installation:

```bash
HERMES_BIN=/absolute/path/to/hermes npm start
```

To use another port:

```bash
PORT=8080 npm start
```

## Run the demo

1. Open John.
2. Connect Email, Calendar, Call note, and Invoice register.
3. Click a connected source to inspect the exact JSON records available to the agent.
4. Run **Simulate without John** for the missed-handoff case.
5. Run **Simulate 15:30 cron trigger** for the duplicate-payment control.
6. Click **Invoice status** in Slack. Mano's question posts immediately and John answers from the connected sources.
7. Remove a source to demonstrate that access and the Ask action are revoked.

Use [`DEMO.md`](./DEMO.md) for the timed seven-minute presentation.
Use [`SOLUTION-ONE-PAGER.md`](./SOLUTION-ONE-PAGER.md) as the judge-facing problem, solution, architecture, and prototype summary.

## Development checks

Install the Playwright browser once:

```bash
npx playwright install chromium
```

Then run:

```bash
npm run check
npm run test:ui
```

The UI test resets the workspace, connects and removes sources, inspects the email JSON, exercises both workflow simulations, and verifies the Slack request.

Reset the demo manually:

```bash
curl -s -X POST http://localhost:4740/api/reset
```

## Important implementation boundaries

- The source integrations are local records, not live Microsoft 365, Teams, or SAP connections.
- The 15:30 cron button simulates the scheduler event. A deployed workflow would invoke the same skill from Hermes cron or an enterprise scheduler.
- John can read only source IDs exposed by `mcp/workspace-mcp.mjs`.
- Terminal, web, unrestricted file access, browser control, sending, and Hermes cron tools are disabled for interactive requests.
- The reminder offered in Slack is not created in this build.
- Do not commit `.env`, `hermes-home/`, workspace runtime state, or screenshots.

## Key files

```text
prototype/
├── public/                  Browser UI
├── server.mjs              HTTP server, routing, and Hermes invocation
├── mcp/workspace-mcp.mjs   Allowlisted source tools
├── skills/                 Hermes job instructions
├── workspace/              Local integration records
├── scripts/ui-smoke.mjs    Browser smoke test
├── SOLUTION-ONE-PAGER.md    Judge-facing one-page solution
├── DEMO.md                 Seven-minute presentation script
└── DEPLOYMENT.md           Public hosting options
```

## Troubleshooting

### `Cannot find module 'yaml'`

Run `npm install` inside `prototype/`.

### `Hermes was not found`

Run `hermes --version`. If Hermes works but is installed somewhere unusual, start with `HERMES_BIN=/absolute/path/to/hermes npm start`.

### Hermes returns an authentication or model error

Check that `.env` contains a valid OpenRouter key, the account has credits, and the configured DeepSeek models are available. Restart after changing `.env`.

### Port 4740 is already in use

Stop the existing process or run `PORT=8080 npm start`.

### Browser smoke test cannot launch Chromium

Run `npx playwright install chromium`, then retry `npm run test:ui`.

### A request appears slow

The model can take tens of seconds. Keep the server running and check the terminal for Hermes errors. Reverse proxies should allow at least a 120-second request timeout.
