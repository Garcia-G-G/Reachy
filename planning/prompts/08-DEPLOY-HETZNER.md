# Phase 08 — DEPLOY to Hetzner + Cloudflare + R2

> **Read `00-CONTEXT.md`. Phases 01–07 complete.**
> **Take your time. Apply §0.10 of `00-CONTEXT.md` (Quality & depth directive). Do NOT deliver in 5 minutes — research, plan, build, verify, refactor, re-read. Garcia values depth over speed.**

## Goal

Ship the app to production on a Hetzner CX22 (€3.99/mo) using **Dokploy** (preferred over Coolify for production), with Cloudflare handling DNS, R2 for assets, and an optional Tunnel for added security. Automatic SSL via Let's Encrypt, daily Postgres backups, automatic deploy from GitHub.

## Mandatory prior research

WebSearch:
- **Dokploy** — current version, requirements, install instructions (May 2026)
- **Cloudflare R2** create bucket, public bucket vs custom domain, CORS for direct uploads
- **Cloudflare DNS** — point A records to Hetzner IP
- **Cloudflare Tunnel** — pros/cons vs direct DNS
- **Hetzner CX22** — Ubuntu 22.04 vs 24.04 currently recommended, disk size

## Steps

### 1. Create Hetzner server

Via Hetzner Cloud Console:
- Type: **CX22** (2 vCPU, 4 GB RAM, 40 GB disk) — €3.99/mo
- OS: **Ubuntu 24.04 LTS**
- Location: closest to your audience (Falkenstein/Helsinki/Ashburn)
- SSH key: add Garcia's public key
- Note the public IP

### 2. Basic hardening

```bash
ssh root@<IP>
# Update
apt update && apt upgrade -y
# Create non-root user
adduser deploy
usermod -aG sudo deploy
# SSH config: disable root login and password auth
sed -i 's/PermitRootLogin yes/PermitRootLogin no/' /etc/ssh/sshd_config
sed -i 's/PasswordAuthentication yes/PasswordAuthentication no/' /etc/ssh/sshd_config
systemctl restart ssh
# UFW
ufw allow OpenSSH
ufw allow 80
ufw allow 443
ufw enable
# Fail2ban
apt install -y fail2ban
```

### 3. Install Dokploy

```bash
curl -sSL https://dokploy.com/install.sh | sh
```

Wait 3-5 min. Access `http://<IP>:3000` and create admin (Garcia).

### 4. Configure domain in Cloudflare

- Cloudflare → your domain → DNS:
  - `A @` → Hetzner IP (proxied: ON)
  - `A app` → Hetzner IP (for `app.domain.com`, optional)
  - `CNAME assets` → `<bucket>.r2.dev` (custom domain later)

### 5. R2: bucket + public domain

- Cloudflare → R2 → Create bucket `reachy-assets`
- Settings → Public Access → Enable
- Custom domain: `assets.domain.com` (Cloudflare manages SSL)
- API tokens: create one with R/W permission only on this bucket → save `R2_ACCESS_KEY_ID` and `R2_SECRET_ACCESS_KEY`
- Note the `R2_ACCOUNT_ID` (URL: `<account-id>.r2.cloudflarestorage.com`)
- Configure CORS if the app uploads directly from the browser (future):
  ```json
  [{ "AllowedOrigins":["https://domain.com"], "AllowedMethods":["PUT","GET","HEAD"], "AllowedHeaders":["*"], "ExposeHeaders":["ETag"], "MaxAgeSeconds":3600 }]
  ```

### 6. App Dockerfile

`Dockerfile`:
```dockerfile
# === builder ===
FROM node:22-alpine AS builder
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY package.json pnpm-lock.yaml* ./
RUN corepack enable && pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

# === runtime ===
FROM node:22-alpine AS runner
RUN apk add --no-cache ffmpeg fontconfig ttf-dejavu
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
EXPOSE 3000
CMD ["node", "server.js"]
```

`next.config.js` must have `output: 'standalone'`.

`Dockerfile.worker` (the BullMQ worker):
```dockerfile
FROM node:22-alpine
RUN apk add --no-cache ffmpeg fontconfig ttf-dejavu libc6-compat
WORKDIR /app
COPY package.json pnpm-lock.yaml* ./
RUN corepack enable && pnpm install --frozen-lockfile --prod=false
COPY . .
RUN pnpm build
CMD ["node", "--enable-source-maps", "dist/server/jobs/worker-runner.js"]
```

### 7. Compose for Dokploy (or managed via Dokploy UI)

Dokploy lets you do it three ways: Docker Compose, plain Dockerfile, or Nixpacks. For us: **Docker Compose**.

`docker-compose.prod.yml` (upload to Dokploy):
```yaml
services:
  web:
    build: { context: ., dockerfile: Dockerfile }
    env_file: .env
    depends_on: [postgres, redis]
    ports: ["3000:3000"]
  worker:
    build: { context: ., dockerfile: Dockerfile.worker }
    env_file: .env
    depends_on: [postgres, redis]
    deploy: { resources: { limits: { cpus: '1.5', memory: '2G' } } }
  postgres:
    image: postgres:16
    environment:
      POSTGRES_DB: reachy
      POSTGRES_USER: reachy
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes: [pgdata:/var/lib/postgresql/data]
  redis:
    image: redis:7-alpine
volumes:
  pgdata:
```

### 8. In Dokploy

- New Project → Application → Connect GitHub (install GitHub App)
- Source: your repo, branch `main`
- Build: Docker Compose, file `docker-compose.prod.yml`
- Domain: `app.domain.com` (auto-SSL via Let's Encrypt)
- Environment: paste all `.env` vars (NEXT_PUBLIC_* first, they're build-time)
- Health check: `GET /api/health` returning `{ ok: true }` (create it)
- Backups: Postgres → daily 03:00 UTC → keep 14 days

### 9. CI with GitHub Actions

`.github/workflows/ci.yml`:
```yaml
name: CI
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres: { image: postgres:16, env: { POSTGRES_PASSWORD: dev, POSTGRES_DB: test }, ports: ['5432:5432'] }
      redis: { image: redis:7-alpine, ports: ['6379:6379'] }
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm typecheck
      - run: pnpm lint
      - run: pnpm test
      - run: pnpm build
        env:
          DATABASE_URL: postgres://postgres:dev@localhost:5432/test
          REDIS_URL: redis://localhost:6379
          BETTER_AUTH_SECRET: $(openssl rand -hex 32)
          BETTER_AUTH_URL: http://localhost:3000
```

Dokploy detects push to main and redeploys.

### 10. Cloudflare Tunnel (optional, recommended)

Instead of exposing ports, install `cloudflared` on the server and create a Tunnel pointing to `localhost:3000`. Benefits: server doesn't need open public IP, everything goes through Cloudflare.

```bash
# on the server
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb -o cf.deb
sudo dpkg -i cf.deb
cloudflared tunnel login
cloudflared tunnel create reachy
# config in ~/.cloudflared/config.yml
```

### 11. Minimal observability

- Logs: Dokploy already shows logs per container; optional export to Better Stack / Axiom
- Errors: install **Sentry** (`@sentry/nextjs`) — free tier ~5k errors/mo
- Uptime: GitHub Actions cron or **Better Stack uptime** (free tier 10 monitors) — ping `/api/health` every minute

### 12. Backups and disaster recovery

- Dokploy → backups → enable daily Postgres dump to R2 (same bucket or new `reachy-backups`)
- Test restore on a temp server before marking phase done

## Acceptance criteria

- [ ] `https://app.domain.com` loads the app with valid SSL
- [ ] Magic link arrives and lets you log in to production
- [ ] Generating an image with OpenAI works end-to-end (worker receives job, generates, uploads to R2, appears in library)
- [ ] Push to `main` redeploys automatically (verify with a trivial change)
- [ ] Health check responds 200
- [ ] Daily backups working and verified (restore test)
- [ ] Sentry catches errors (force one and verify it arrives)

## Verification

- Production smoke test: signup, create header, generate 1 image, download
- Stop the worker for a moment, queue a job, restart it → job processes
- Check `htop`/`ctop` on the server: CPU and RAM under normal load

## Expected output

Report §0.8 + production URL + credentials in 1Password / Bitwarden (Garcia handles). Mark project as **v1.0**.
