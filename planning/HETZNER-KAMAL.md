# Hetzner + Kamal deploy runbook

> Replaces the Dokploy steps in `planning/prompts/08-DEPLOY-HETZNER.md`.
> Repo-side prep is already shipped (Dockerfile, config/deploy.yml,
> .kamal/secrets, .kamal/hooks/pre-deploy.sample, /api/health). The
> steps below are everything you need to run on your own machine + on
> the Hetzner host.

---

## 0. Prerequisites on your Mac

```bash
# Ruby + Kamal CLI (Kamal 2.x is the current line). If you don't have
# Ruby, install via mise: `mise install ruby 3.3`.
gem install kamal

# Or use the Docker image and skip Ruby entirely:
#   alias kamal='docker run -it --rm -v "$(pwd)":/workdir \
#     -v ~/.ssh:/root/.ssh -v /var/run/docker.sock:/var/run/docker.sock \
#     ghcr.io/basecamp/kamal:latest'

# Docker Desktop must be running locally (Kamal uses your local
# buildx to build the image, then pushes to GHCR).

# direnv recommended for loading .env.production.local automatically:
brew install direnv
```

## 1. Provision the Hetzner CX22

- Hetzner Cloud → Add Server → CX22 (2 vCPU, 4 GB, 40 GB SSD, €3.79/mo).
- OS: **Ubuntu 24.04 LTS**.
- Region: Falkenstein (DE) or Ashburn (US) — closer to your audience.
- SSH key: add your public key (Kamal SSHes as root by default).
- Note the public IPv4.

## 2. Basic server hardening (one time)

```bash
ssh root@<SERVER_IP>

# updates
apt update && apt upgrade -y

# non-root user
adduser deploy
usermod -aG sudo,docker deploy

# SSH hardening — comment in nano
sed -i 's/^#\?PermitRootLogin .*/PermitRootLogin prohibit-password/' /etc/ssh/sshd_config
sed -i 's/^#\?PasswordAuthentication .*/PasswordAuthentication no/' /etc/ssh/sshd_config
systemctl restart ssh

# firewall
ufw allow OpenSSH
ufw allow 80
ufw allow 443
ufw --force enable

# fail2ban
apt install -y fail2ban
systemctl enable --now fail2ban

# Docker (the host needs it for kamal-proxy + accessory + app containers)
curl -fsSL https://get.docker.com | sh
usermod -aG docker deploy
```

## 3. Create a GitHub Personal Access Token

- https://github.com/settings/tokens → "Generate new token (classic)".
- Scope: `write:packages` (read:packages is also needed but write implies read).
- Copy the token, you'll set it as `KAMAL_REGISTRY_PASSWORD`.

## 4. Fill in `.env.production.local` locally

```bash
cp .env.production.example .env.production.local
# Edit with real values. Generate:
#   openssl rand -base64 32   → BETTER_AUTH_SECRET
#   openssl rand -base64 32   → NEXT_SERVER_ACTIONS_ENCRYPTION_KEY
#   openssl rand -base64 24   → POSTGRES_PASSWORD
# Copy from .env.local:
#   OPENAI_API_KEY, FAL_KEY, RESEND_API_KEY, R2_* — same values as dev
#   work for staging
# Set fresh:
#   KAMAL_REGISTRY_PASSWORD  → the GitHub PAT from step 3
```

If you use direnv, add `dotenv .env.production.local` to a `.envrc`
and `direnv allow`. The shell will auto-load whenever you `cd` into the
repo.

## 5. Fill in the server IP in `config/deploy.yml`

Replace every `<SERVER_IP>` with the Hetzner IPv4:

```bash
sed -i '' "s|<SERVER_IP>|XX.XX.XX.XX|g" config/deploy.yml
```

(`-i ''` is BSD sed on macOS; on Linux it's `-i`.)

The default `BETTER_AUTH_URL` is `http://<SERVER_IP>:3000`. That works
for testing the container is up, but magic-link sign-in WILL NOT work
over HTTP — better-auth refuses to send Secure cookies on plain HTTP
in production mode. Plan to swap to a real domain before testing login.

## 6. First-time setup

```bash
# Bootstraps the host: installs Docker, kamal-proxy, pushes the first
# image, boots accessories (postgres + redis), runs the web + worker.
kamal setup
```

Watch for:
- ✓ `kamal-proxy` started on host:80/443.
- ✓ `reachy-postgres` and `reachy-redis` healthy.
- ✓ `reachy-web` health check passes against `/api/health`.
- ✓ `reachy-worker` boots (`[reachy:worker] image-gen worker started.`).

## 7. Run DB migrations (one-time after first boot)

```bash
kamal app exec --primary --reuse \
  "node --conditions=react-server --import tsx src/server/db/migrate.ts"
```

When you add a new migration later: rename
`.kamal/hooks/pre-deploy.sample` to `.kamal/hooks/pre-deploy` and
Kamal will run migrations automatically on every deploy. Until then,
run the command above after each `kamal deploy` that includes a new
migration file.

## 8. Verify

```bash
# Quick health check via the public IP
curl http://<SERVER_IP>/api/health
# {"ok":true,"service":"reachy-web",...}

# Tail logs
kamal app logs --follow              # web
kamal app logs --roles worker --follow

# Open a shell inside the live container
kamal app exec --primary --reuse --interactive bash
```

## 9. Subsequent deploys

```bash
git push origin main
kamal deploy
# (Kamal builds locally, pushes to GHCR, zero-downtime rolls over
# the web role, restarts the worker.)
```

## 10. When DNS is ready

1. Point an `A` record at `<SERVER_IP>` (e.g., `app.reachy.app`).
2. Edit `config/deploy.yml`:
   ```yaml
   proxy:
     ssl: true
     host: app.reachy.app
   env:
     clear:
       BETTER_AUTH_URL: https://app.reachy.app
   ```
3. `kamal deploy`. Kamal-proxy provisions a Let's Encrypt cert
   automatically on next boot.

## 11. Backups (do this before depending on the data)

```bash
# Daily Postgres backup to R2 via cron on the host:
ssh deploy@<SERVER_IP>
sudo crontab -e
# Add:
# 0 3 * * * docker exec reachy-postgres pg_dump -U reachy reachy | \
#   gzip > /backup/reachy-$(date +\%F).sql.gz && \
#   aws s3 cp /backup/reachy-$(date +\%F).sql.gz \
#     s3://reachy-backups/ --endpoint-url=https://<account>.r2.cloudflarestorage.com
```

A more polished pattern: install `restic` + point at an R2 bucket
named `reachy-backups`, run nightly via systemd timer. Park this for
v1.1; manual `pg_dump` + R2 copy is enough for early beta.

## 12. Cost summary

- Hetzner CX22: €3.79/mo
- Cloudflare R2: free up to 10 GB egress
- GHCR: free for public + private packages on personal accounts
- Resend: free tier 100/day, 3k/mo
- Optional Sentry: free tier 5k errors/mo

≈ €4/mo to run Reachy, plus per-generation AI costs.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `kamal setup` hangs on "Connecting to host" | SSH key not loaded | `ssh-add ~/.ssh/id_ed25519` |
| Build fails with "exec format error" on Hetzner | Built ARM but pushed to AMD64 host | `builder.arch: amd64` in deploy.yml (already set) |
| Magic-link email never arrives | `EMAIL_FROM` domain not verified in Resend | Verify domain or switch back to `onboarding@resend.dev` |
| Worker stays "queued" forever | Worker container isn't running | `kamal app logs --roles worker` then redeploy with `kamal deploy --roles worker` |
| Postgres connection refused | Accessory not booted | `kamal accessory boot postgres` |
| Image build OOM on Mac | Docker Desktop memory limit too low | Settings → Resources → Memory ≥ 6 GB |
