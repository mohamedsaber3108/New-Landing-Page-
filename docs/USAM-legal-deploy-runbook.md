# USAM Legal/Consent — Production Deployment Runbook (migration 0004)

This deploys the legal/consent second-pass changes and applies **migration
`0004_serious_chamber.sql`** (adds `consent_events`, `privacy_requests`,
`policy_publications`). Until 0004 is applied, the new privacy-request and
consent endpoints **fail closed** with a clear 503 — no silent data loss — so
there is no rush-induced risk, but the new features stay inert until it runs.

> **Do not assume the runtime.** From prior deployment the Master runs on EC2 as
> a **systemd service `usam`** that executes **wrangler in `--local` mode with
> `--persist-to .wrangler/state`** — i.e. a **local Miniflare SQLite file**, NOT
> managed Cloudflare D1. **Step 0 confirms this before anything destructive.**
> If Step 0 shows a different runtime (e.g. real managed D1, a different service
> name, or a different working directory), STOP and adjust — do not run the
> later steps blindly.

All commands run on the production EC2 host as the deploy user (`ubuntu`).

---

## Step 0 — Confirm runtime, DB location, and migration state (read-only)

```bash
# Service + how it starts (expect: wrangler ... dev --local --persist-to .wrangler/state)
systemctl cat usam | sed -n '1,40p'
systemctl is-active usam

# Working directory of the app (expect the repo checkout, e.g. /home/ubuntu/usam)
sudo systemctl show usam -p WorkingDirectory

# The local D1 sqlite the service persists to (expect ONE app db + metadata.sqlite)
ls -la /home/ubuntu/usam/.wrangler/state/v3/d1/miniflare-D1DatabaseObject/

# Which drizzle migrations exist in the checkout
ls -1 /home/ubuntu/usam/drizzle/*.sql

# Current migration state: do the 0004 tables already exist? (expect 0 rows now)
DB=$(ls /home/ubuntu/usam/.wrangler/state/v3/d1/miniflare-D1DatabaseObject/*.sqlite | grep -v metadata | head -1)
echo "DB file: $DB"
sqlite3 "$DB" "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('consent_events','privacy_requests','policy_publications');"
```

Proceed only if: the service runs wrangler `--local --persist-to`, the working
directory is the repo checkout, there is exactly one app sqlite, and the three
0004 tables are **absent** (if present, 0004 is already applied — skip Step 3).

If `sqlite3` is not installed: `sudo apt-get update && sudo apt-get install -y sqlite3`.

---

## Step 1 — Backup (database + current checkout state)

```bash
cd /home/ubuntu/usam
TS=$(date +%Y%m%d-%H%M%S)
mkdir -p ~/usam-backups

# 1a. Consistent copy of the local D1 sqlite using sqlite3's online backup
DB=$(ls .wrangler/state/v3/d1/miniflare-D1DatabaseObject/*.sqlite | grep -v metadata | head -1)
sqlite3 "$DB" ".backup '/home/ubuntu/usam-backups/d1-$TS.sqlite'"

# 1b. Record the currently deployed commit so we can roll the code back
git rev-parse HEAD | tee ~/usam-backups/commit-$TS.txt

# 1c. Verify the backup is a valid, non-empty sqlite file
ls -la ~/usam-backups/d1-$TS.sqlite
sqlite3 ~/usam-backups/d1-$TS.sqlite "PRAGMA integrity_check;"
```

Do not continue unless `integrity_check` prints `ok` and the backup file is
non-empty. Keep the `TS` value for the restore procedure below.

---

## Step 2 — Pull the new code and build

```bash
cd /home/ubuntu/usam
git fetch origin
git log --oneline -1 origin/main            # confirm the expected commit is there
git pull --ff-only origin main
rm -rf dist .vinext
npm ci
npm run build
```

If `npm run build` fails, STOP: the service is still running the old build, and
nothing has changed in the DB yet. Investigate before restarting.

---

## Step 3 — Apply migration 0004 (only if Step 0 showed the tables absent)

The service holds the sqlite open, so stop it first, apply, then restart. The
helper is idempotent (skips objects that already exist), so a re-run is safe.

```bash
cd /home/ubuntu/usam
sudo systemctl stop usam

# Apply ONLY 0004 (0000–0003 are already applied in production).
node scripts/apply-migration-local.mjs drizzle/0004_serious_chamber.sql

# Confirm the three tables now exist
DB=$(ls .wrangler/state/v3/d1/miniflare-D1DatabaseObject/*.sqlite | grep -v metadata | head -1)
sqlite3 "$DB" "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('consent_events','privacy_requests','policy_publications');"
```

Expect all three table names printed. (`node:sqlite` requires Node ≥ 22; the
host runs Node ≥ 22 per `package.json engines`.)

---

## Step 4 — Restart and smoke-test

```bash
cd /home/ubuntu/usam
sudo systemctl start usam
sleep 5
systemctl is-active usam

# The service listens locally (nginx proxies 443 → it). Smoke-test via the
# public origin so we exercise the real path.

# 4a. Legal pages serve (200) and the API serves all policy types
for p in legal privacy terms cookies refunds payments ai-use privacy-requests; do
  printf '%-18s ' "/$p"; curl -s -o /dev/null -w '%{http_code}\n' "https://usamif.com/$p"
done
curl -s "https://usamif.com/api/v1/legal/privacy?locale=en" | head -c 200; echo

# 4b. Requirements endpoint (expect terms/privacy published=false until a human publishes)
curl -s "https://usamif.com/api/v1/legal/requirements"; echo

# 4c. Privacy-request write path now works (expect 201 + a PRQ- reference)
curl -s -X POST "https://usamif.com/api/v1/privacy-requests" \
  -H 'Content-Type: application/json' -H 'Idempotency-Key: smoke-'"$TS" \
  -d '{"requestType":"access","name":"Smoke Test","email":"smoke@usamif.com","locale":"en"}'; echo

# 4d. Admin stays FAIL-CLOSED unless USAM_ADMIN_TOKEN is set (expect 403)
curl -s -o /dev/null -w 'admin policies: %{http_code}\n' "https://usamif.com/api/v1/admin/policies"

# 4e. Existing contact form still submits (expect 201)
curl -s -X POST "https://usamif.com/api/v1/leads" \
  -H 'Content-Type: application/json' -H 'Idempotency-Key: smoke-lead-'"$TS" \
  -d '{"name":"Smoke","email":"smoke2@usamif.com","kind":"general","locale":"en","message":"deployment smoke test message"}'; echo
```

Success criteria: 4a all `200`; 4b `published:false` for both; 4c returns a
`PRQ-` reference; 4d prints `403`; 4e returns a `USAM-` reference.

---

## Rollback

**If the smoke test fails after migration**, restore the DB and the previous
commit:

```bash
cd /home/ubuntu/usam
sudo systemctl stop usam

# Restore the pre-deploy database (use the TS from Step 1)
DB=$(ls .wrangler/state/v3/d1/miniflare-D1DatabaseObject/*.sqlite | grep -v metadata | head -1)
cp "/home/ubuntu/usam-backups/d1-$TS.sqlite" "$DB"

# Restore the previous code
git checkout "$(cat ~/usam-backups/commit-$TS.txt)"
rm -rf dist .vinext && npm ci && npm run build

sudo systemctl start usam
```

Because 0004 is purely additive (three new tables; no change to existing
tables/data), a code-only rollback without restoring the DB is also safe — the
old build simply ignores the new tables. Restore the DB only if you need an
exact pre-deploy state.

---

## Notes

- **Enabling staff features:** the admin endpoints stay 403 until
  `USAM_ADMIN_TOKEN` is set in the service environment. Set it via a systemd
  drop-in (`sudo systemctl edit usam` → `[Service]` `Environment=USAM_ADMIN_TOKEN=...`)
  and `sudo systemctl restart usam`. Never put the token in the repo or a URL.
- **Notifications remain unconfigured:** `lead.created` and
  `privacy_request.created` outbox events stay `pending` until
  `USAM_LEAD_NOTIFY_WEBHOOK`/`USAM_LEAD_NOTIFY_EMAIL` is set. Delivery has **not**
  been tested; do not tell users notifications are delivered.
- **No DNS, domain, email, or homepage changes** are part of this deployment.
