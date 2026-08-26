# Deployment Guide

Backend → Render (always-on container — needed for SQLite persistence,
generated file downloads, and in-memory model caching).
Frontend → Vercel (exactly what it's built for).

Deploy the backend first — the frontend needs its URL.

---

## 1. Prerequisite: push to GitHub

Both platforms deploy from a git repo. If you haven't already:
```bash
cd fraud-risk-manager  # your repo root, containing backend/, frontend/, render.yaml
git init
git add .
git commit -m "Deploy: backend + frontend"
git remote add origin <your-github-repo-url>
git push -u origin main
```

---

## 2. Backend → Render

1. Go to [render.com](https://render.com), sign in, click **New +** → **Web Service**.
2. Connect your GitHub repo.
3. Configure:
   - **Root Directory:** `backend`
   - **Runtime:** Python 3
   - **Build Command:** `pip install -r requirements.txt`
   - **Start Command:** `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
   - **Plan:** Free (fine for a demo — see caveats below)
4. Under **Environment**, add:
   - `ALLOWED_ORIGINS` — leave blank for now, you'll set this in step 4 once you have the Vercel URL.
5. Click **Create Web Service**. First deploy takes a few minutes (installing `xgboost`/`shap`/etc.).
6. Once live, copy the service URL — looks like `https://risk-manager-api.onrender.com`.
7. Verify it's actually working:
   ```bash
   curl https://risk-manager-api.onrender.com/
   # should return {"status":"ok","service":"risk-manager-api"}
   curl https://risk-manager-api.onrender.com/metrics
   # should return real numbers, not an error
   ```

**A `render.yaml` is included at the repo root** if you'd rather use Render's Blueprint flow (New + → Blueprint) instead of the manual steps above — it encodes the same settings.

---

## 3. Frontend → Vercel

1. Go to [vercel.com](https://vercel.com), sign in, click **Add New** → **Project**.
2. Import the same GitHub repo.
3. Configure:
   - **Root Directory:** `frontend`
   - **Framework Preset:** Vite (should auto-detect)
   - Build/output settings are already correct via `frontend/vercel.json` — Vercel will pick these up automatically.
4. Under **Environment Variables**, add:
   - `VITE_API_BASE_URL` = `https://risk-manager-api.onrender.com` (your actual Render URL from step 2)

   **This is critical and easy to miss:** Vite bakes environment variables in at *build time*, not runtime. If you add/change this after the first deploy, you must trigger a new deploy for it to take effect — just saving the env var alone does nothing to an already-built app.
5. Click **Deploy**. Takes 1-2 minutes.
6. Copy your live URL — looks like `https://your-app.vercel.app`.

---

## 4. Close the loop: update backend CORS

Now that you have the Vercel URL, go back to Render:

1. Open your backend service → **Environment**.
2. Set `ALLOWED_ORIGINS` = `https://your-app.vercel.app` (your actual Vercel URL from step 3).
3. Save — Render will automatically redeploy with the new value.

Without this step, the deployed frontend's requests to the backend will fail with a CORS error in the browser console, even though both services are individually up.

---

## 5. Verify end-to-end

Visit your Vercel URL, click "Try the console now," and check:
- Dashboard loads real metrics (not an error card)
- Score order returns a real score
- Evidence PDF actually downloads
- Batch upload accepts the sample CSV

If the Dashboard shows a connection error, open browser dev tools → Network tab → check whether the request went to the right backend URL and what the actual error was (CORS vs. 404 vs. timeout point to different fixes above).

---

## Known limitations of this setup — read before judging day

**Render's free tier spins down after ~15 minutes of inactivity.** The
first request after a period of no traffic will be slow (30-60 second
cold start) while the container restarts. If you have a scheduled
judging slot, visit the site yourself 5-10 minutes beforehand to warm
it up — don't let the judge's first click be the cold start.

**Render's free tier disk is not guaranteed to persist across
redeploys or restarts.** This matters specifically for the SQLite
review-queue audit trail (`app/db/risk_manager.db`) we built —
resolved cases could reset if the service restarts between sessions.
This isn't a bug in the app; it's a property of the free hosting tier.
The database re-seeds automatically on first access either way (see
`review_store.py`), so the app won't error — you just might see the
review queue back to "22 pending, 0 resolved" if the container
restarted since you last used it. If persistent state across the full
judging period matters, Render's paid tier includes a persistent disk
add-on.

**Evidence PDFs and batch CSV results are also written to that same
ephemeral disk** — same caveat applies. Generate them fresh if you're
demoing after a gap.
