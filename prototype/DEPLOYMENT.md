# Deploy the full demo for judges

Complete the local setup in [`README.md`](./README.md) first. A deployment is ready only when `/api/health` reports both `hermes: true` and `model: true`.

Locally, **`npm start`** in `prototype/` runs one process that serves the UI, API, and Hermes requests. Judges need one public URL to that server—not Vercel static hosting alone.

**Vercel is not enough** for “Ask John” and live answers. Use one of the options below.

---

## Option A — Tunnel from your laptop

Good if you do not want a VM yet. **Important:** a **free, one-off** tunnel (default `ngrok http 4740`) gives a **new URL every time** you restart it. Do **not** use that URL in a final submission if the tunnel might stop and come back.

### Persistent URL with a tunnel (same link after restarts)

Pick one:

| Service | Persistent? | What you need |
|---------|-------------|----------------|
| **Cloudflare Tunnel** (named tunnel) | Yes — fixed hostname | A domain on Cloudflare (can be cheap); install `cloudflared`, create a named tunnel, point e.g. `demo.yourdomain.com` → `localhost:4740` |
| **ngrok** paid | Yes — reserved domain | ngrok account + reserved domain / static address pointing at your tunnel |
| **Free ngrok / random trycloudflare** | **No** | New URL each session — OK for a live call, not for a written submission link |

**Cloudflare (typical flow):**

1. Add your domain to Cloudflare DNS.
2. Install `cloudflared` and run `cloudflared tunnel create john-demo` (once).
3. Configure a **public hostname** in the Zero Trust dashboard: `demo.yourdomain.com` → `http://localhost:4740`.
4. Run the tunnel daemon (`cloudflared tunnel run john-demo`) whenever the demo should be up.

Judges always use **`https://demo.yourdomain.com`**. If the tunnel process stops, the URL is the same after you start it again (as long as DNS/config unchanged).

**ngrok reserved domain:** In the ngrok dashboard, assign a fixed subdomain to your account and start the agent with that config so the URL never changes between restarts.

### Quick one-off tunnel (not for submission)

```bash
cd prototype && npm start
# in another terminal:
ngrok http 4740
```

Use the printed **https** URL only for that session. Laptop must stay on.

**Downside of any laptop tunnel:** If your machine sleeps or the process dies, judges cannot reach the demo until you start server + tunnel again (URL is stable only with Cloudflare named tunnel / ngrok reserved domain).

---

## Option B — One cloud server (best for “real” deploy)

One small Linux VM (DigitalOcean, AWS Lightsail, Hetzner, etc.) runs the same stack 24/7.

### 1. Copy the app onto the server

```bash
ssh you@your-server
git clone <your-repo-url>
cd project-x/prototype
npm ci
```

Install Hermes under the same Linux user that will run the service:

```bash
curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash
source ~/.bashrc
hermes --version
```

Do not copy `hermes-home/` from another machine. It is app-specific runtime state and is recreated locally.

### 2. Secrets and workspace

```bash
cd ~/project-x/prototype
cp .env.example .env
nano .env   # paste OPENROUTER_API_KEY
```

Ensure demo files exist under `workspace/` (they are in git).

### 3. Run the server

```bash
npm start
# Listens on port 4740 by default; set PORT if your host requires it
```

Check from the server:

```bash
curl -s http://127.0.0.1:4740/api/health
```

### 4. Give judges HTTPS

Point a domain (or the VM’s public IP) at the box and put **nginx** or **Caddy** in front, proxying to `127.0.0.1:4740`. Use a long read timeout (≥ 120s) for `/api/ask`.

Or open **4740** in the firewall and share `http://YOUR_IP:4740` (works but no HTTPS—fine for internal judges only).

### 5. Keep it running

Use **systemd** or **pm2** so `npm start` restarts after reboot:

```bash
# example with pm2
npm install -g pm2
cd ~/project-x/prototype
pm2 start npm --name john-demo -- start
pm2 save
pm2 startup
```

**Share with judges:** `https://your-demo.example.com` (or your tunnel/IP URL).

---

## Option C — PaaS (Railway / Render / Fly)

Same idea as Option B: deploy the **`prototype`** folder, run **`npm ci`**, use **`npm start`**, and set **`OPENROUTER_API_KEY`**.

The platform must support a long-running process and a Hermes installation. Most Node-only buildpacks do not install Hermes automatically, so use a custom image/build step or choose Option B/A. Do not persist or deploy a developer machine's `hermes-home/`.

---

## Domain parked on Vercel

Vercel can **manage DNS** for your domain; it does **not** run this demo’s backend (Hermes + `server.mjs`). Use a **subdomain** that points to wherever the app actually runs.

**Stable link for judges:** e.g. `https://demo.yourdomain.com` — same URL forever; only the server behind it must stay up.

### Recommended: subdomain → cloud VM

1. Run **`npm start`** on a small Linux server (Option B). Put **Caddy** or **nginx** on the VM with HTTPS for that host (or use the VM provider’s load balancer).
2. In **Vercel** → your project or **Domains** → **DNS** / domain settings → **Add record**:
   - **Type:** `A`
   - **Name:** `demo` (or `john`)
   - **Value:** your VM’s public IPv4  
   - Or **CNAME** → your PaaS hostname if you use Railway/Fly instead of a raw IP.
3. Wait for DNS (minutes to a few hours). Open `https://demo.yourdomain.com` and run the health check.

Judges use **`https://demo.yourdomain.com`**. Your domain stays on Vercel; only DNS points at the demo server.

### Alternative: subdomain → laptop (persistent tunnel)

If the app stays on your Mac but you want a **fixed** hostname on your Vercel domain:

1. Run a **named Cloudflare Tunnel** (or ngrok reserved domain) to `localhost:4740`.
2. Cloudflare gives you a target like `<tunnel-id>.cfargotunnel.com`.
3. In **Vercel DNS**, add a **CNAME**:
   - **Name:** `demo`
   - **Value:** that `*.cfargotunnel.com` hostname (Cloudflare docs for your tunnel).

You do **not** need to move the domain off Vercel. The tunnel must be running whenever judges visit.

### What not to do

- Point `demo.yourdomain.com` at a **Vercel static** project (`outputDirectory: public` only). The UI loads but **`/api/ask` fails**.
- Rely on a **free random ngrok URL** in submission text if the tunnel restarts.

---

## Option D — Stable subdomain on Vercel → ngrok (no CF move)

Use a **second Vercel project** that only redirects your pretty subdomain to whatever ngrok URL is live today. Judges keep **`https://buildfest-johnceodemo.manoranjith.in`** in the submission; when ngrok restarts, you change one env var on Vercel.

Code lives in **`prototype/demo-gateway/`**.

### One-time setup

1. **Vercel → Add project** → import the same repo.
2. **Root Directory:** `prototype/demo-gateway`
3. **Domains:** add **`buildfest-johnceodemo.manoranjith.in`** (Vercel will show DNS if needed; domain already on Vercel is fine).
4. **Environment variable** (Production):

   | Name | Example value |
   |------|----------------|
   | `NGROK_URL` | `https://abc123.ngrok-free.app` |

   No trailing slash. This is the **origin** ngrok prints when you run `ngrok http 4740`.

5. Deploy.

### Every time you demo

1. On your Mac:

   ```bash
   cd prototype && npm start
   ngrok http 4740
   ```

2. Copy the new **https** forwarding URL from ngrok.

3. **Vercel** → demo-gateway project → **Settings → Environment Variables** → update **`NGROK_URL`** → **Redeploy** (or push a empty commit).

4. Judges open **`https://buildfest-johnceodemo.manoranjith.in`** — Vercel sends them to the current tunnel (307 redirect).

### Caveats

- **Redirect, not proxy:** after the first click, the browser address bar may show the **ngrok** hostname. The submission link stays your subdomain; bookmarks to ngrok will break when the tunnel changes.
- **Tunnel + server must be running** when judges visit, or the redirect lands on a dead URL.
- Free ngrok may show an interstitial warning page once per visitor.

### Optional: keep your subdomain in the address bar

Use a **proxy** instead of redirect (same env var, different middleware). Say if you want that switched in `demo-gateway/middleware.js`.

---

## Step-by-step: Vercel gateway + ngrok

### Part 1 — ngrok (on your Mac)

**One-time**

1. Create an account at [ngrok.com](https://ngrok.com) and copy your **authtoken** from the dashboard.
2. Install and log in:

   ```bash
   brew install ngrok/ngrok/ngrok
   ngrok config add-authtoken YOUR_TOKEN
   ```

   No changes to this repo are required for ngrok.

**Every demo day**

1. Terminal A — start the app (same as local judging):

   ```bash
   cd /path/to/project-x/prototype
   npm start
   ```

   Leave it running. Check: `curl -s http://127.0.0.1:4740/api/health`

2. Terminal B — tunnel **only port 4740**:

   ```bash
   ngrok http 4740
   ```

3. In the ngrok TUI or web UI, copy the **Forwarding** line that looks like:

   ```text
   https://something-random.ngrok-free.app -> http://localhost:4740
   ```

4. **`NGROK_URL` for Vercel** = that **https** origin only:

   ```text
   https://something-random.ngrok-free.app
   ```

   No path, no trailing slash, not the `http://localhost:4740` part.

5. Quick test before touching Vercel:

   ```bash
   curl -s https://something-random.ngrok-free.app/api/health
   ```

   Should match local health (`hermes` / `model` true when your stack is ready).

**When ngrok restarts (free plan)**

- The `something-random` host **usually changes**.
- Update **`NGROK_URL`** on Vercel to the new **https** forwarding URL, then redeploy.
- You do **not** change anything in the repo for ngrok itself.

**Optional ngrok upgrades (fewer Vercel updates)**

| Plan | What you get |
|------|----------------|
| Free | New random `*.ngrok-free.app` URL most restarts → update Vercel each time |
| Paid **reserved domain** | Same ngrok URL every time → set **`NGROK_URL` once** on Vercel, only run `ngrok http 4740 --domain=your-name.ngrok.app` |

You still run **`npm start` locally**; ngrok only exposes port 4740.

---

### Part 2 — Vercel `demo-gateway` project

**One-time**

1. Push the repo (includes `prototype/demo-gateway/`).
2. [Vercel](https://vercel.com) → **Add New… → Project** → import the GitHub repo.
3. **Configure:**
   - **Root Directory:** `prototype/demo-gateway` (Edit → set folder, not repo root).
   - **Framework Preset:** Other.
   - Build / Install: leave empty (uses `vercel.json`).
4. **Environment variables** → add for **Production** (and Preview if you use preview URLs):

   | Key | Value |
   |-----|--------|
   | `NGROK_URL` | `https://your-current.ngrok-free.app` |

5. **Deploy** once (even if ngrok is not running yet—you can fix `NGROK_URL` after).

6. **Domains** → **Add** → `buildfest-johnceodemo.manoranjith.in`
   - If `manoranjith.in` is already on this Vercel team, confirm the **CNAME** / assignment Vercel shows.
   - This subdomain should attach to **this** project only (not the static `prototype/public` project, if you have one).

7. Wait until the domain shows **Valid** in Vercel.

**When ngrok URL changes**

1. Vercel → **demo-gateway** project → **Settings → Environment Variables**.
2. Edit **`NGROK_URL`** → paste the new `https://….ngrok-free.app` origin.
3. **Deployments** → latest → **⋯ → Redeploy** (required so middleware picks up the new value).

**Verify the full chain**

```bash
curl -sI https://buildfest-johnceodemo.manoranjith.in/api/health
```

You should see **`307`** with a `Location:` header pointing at your current ngrok URL. Follow it:

```bash
curl -sL https://buildfest-johnceodemo.manoranjith.in/api/health
```

Should return JSON with `"ok": true` while server + ngrok are up.

**Submission text for judges**

Give them only:

```text
https://buildfest-johnceodemo.manoranjith.in
```

You maintain ngrok + Vercel `NGROK_URL`; they never paste the ngrok link.

---

## Before judges open the link

1. Open the URL yourself; click **The problem** → **Open John**.
2. **Clear workspace** if you want a fresh run.
3. Add all four sources → click **Invoice status** once to confirm John answers.
4. Follow **`DEMO.md`**.

Health check judges can ignore; you check once:

```text
GET /api/health  →  { "ok": true, "hermes": true, "model": true }
```

---

## Summary

| Goal | Do this |
|------|---------|
| Same as localhost, quick test | Ephemeral ngrok (URL **changes** when tunnel restarts) |
| **Fixed submission link + laptop + ngrok** | **Option D** — `demo-gateway` on Vercel + update `NGROK_URL` |
| Fixed URL, no laptop | **Option B** — VM + `npm start` + HTTPS |
| Vercel only | UI only; **Ask John will not work** |

**One sentence:** Deploy `prototype/` on a host with Node, Hermes, dependencies from `npm ci`, and `OPENROUTER_API_KEY`; run `npm start` continuously and send judges that URL.
