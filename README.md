# The Garden — Spiritual Health Snapshot

This folder is a complete, ready-to-deploy copy of the assessment. No setup needed inside it — it just needs a GitHub repo and a Vercel project pointed at that repo.

## What's in here
- `src/App.jsx` — the whole assessment (questions, scoring, results, Trellis flow)
- `src/main.jsx`, `index.html` — the small wrapper that runs it as a website
- `package.json`, `vite.config.js` — tells Vercel how to build it (Vite + React, nothing custom to configure)

Progress is saved in the visitor's own browser (localStorage), so refreshing the page won't lose their place. Nothing is sent to a server yet — that's the Supabase step, later.

## Step 1 — Put this on GitHub
1. Create a free account at [github.com](https://github.com) if you don't have one.
2. Click **New repository**. Name it something like `garden-spiritual-health-snapshot`. Set it to **Private**. Don't check any of the "initialize with" boxes.
3. On the new repo's page, click **uploading an existing file**, then drag in every file and folder from this project (keep the `src` folder intact).
4. Commit the upload.

That's it — no command line needed.

## Step 2 — Deploy it on Vercel
1. Create a free account at [vercel.com](https://vercel.com) and sign in **with your GitHub account** (this is what lets Vercel see your repo).
2. Click **Add New → Project**.
3. Select the `garden-spiritual-health-snapshot` repo.
4. Vercel will detect it's a Vite app automatically — you don't need to change any settings. Click **Deploy**.
5. In a minute or two, you'll get a live URL, something like:
   `garden-spiritual-health-snapshot.vercel.app`

## Step 3 — Test it on its own first
Open that Vercel URL on your computer and your phone before touching Squarespace. Walk through the whole thing: context question, all three sections, back button, auto-advance, reflections, the results page, choosing a focus, choosing a practice, and the final Trellis screen. If anything looks off, that's the moment to fix it — it's much easier to debug on its own URL than inside a Squarespace iframe.

## Step 4 — Embed it in Squarespace (once Step 3 feels right)
On the Squarespace page where you want it, add a **Code Block** and paste:

```html
<iframe
  src="YOUR-VERCEL-URL-HERE"
  style="width:100%; height:900px; border:0;"
  title="Spiritual Health Snapshot"
></iframe>
```

Replace `YOUR-VERCEL-URL-HERE` with your actual `https://...vercel.app` address. Turn off "Display Source" on the code block if that toggle is on, or Squarespace will show the code as text instead of running it. This needs a Squarespace plan that supports code blocks with custom HTML (Core plan or higher).

The fixed `height:900px` is a placeholder — some screens (like the results page) are taller than others, so there may be extra blank space or a scrollbar depending on which screen someone's on. That's expected for now. The next step — automatic height resizing — fixes that, and is worth asking for once the iframe is live and you can see how it actually behaves on your page.

## After this is live
- **Automatic iframe resizing** — so the embedded height always matches whatever screen the person is on, no dead space or scrollbars.
- **Planning Center Church Center tab** — once this is live on Squarespace, the same Vercel URL can also be added as a navigation item in Church Center, so it shows up as a tab inside Planning Center too.

## Saving results with Supabase

1. Create a free project at [supabase.com](https://supabase.com).
2. Open the **SQL Editor** in your Supabase project, paste in everything from `supabase/schema.sql` in this folder, and run it. This creates the `assessment_submissions` table with Row Level Security already turned on — participants can submit a result, but the public site can never read anyone's results back, including their own.
3. Open **Project Settings → API** and copy the **Project URL** and the **anon public** key (not the `service_role` key — that one should never appear in this app).
4. In Vercel, go to your project → **Settings → Environment Variables** and add:
   - `VITE_SUPABASE_URL` — the Project URL
   - `VITE_SUPABASE_ANON_KEY` — the anon public key
5. Redeploy (Vercel → Deployments → the three-dot menu → Redeploy) so the new variables take effect.

Once that's done, every completed assessment saves automatically — no further setup needed. If saving ever fails (bad connection, Supabase briefly down), the participant sees a short message but can still continue to their Trellis; nothing blocks them from finishing.

To see saved results: open your Supabase project → **Table Editor → assessment_submissions**. There's intentionally no in-app admin view yet — RLS keeps the public site from reading data back, so viewing results happens in the Supabase dashboard itself, while logged in as the project owner.

## Making changes later
Whenever you want something changed, tell Claude what to update, get the new `App.jsx`, and re-upload it to the same GitHub repo (or ask Claude to walk you through connecting git properly so updates sync automatically). Vercel redeploys on its own within a minute or two of the GitHub repo changing.
