# Tutor Amma — Key to Success

A verified-tutor marketplace and teaching platform for India. Students and parents find tutors by board, grade and subject, then book online classes or safe home tuition with escrow payments. Classes run in a live digital classroom, and tutors build lesson plans and question papers in the AI Teaching Studio.

**Version 2** runs on Cloudflare: Workers, D1, Durable Objects and Workers AI. It also adds a study toolkit for students.

Crafted with heart by **Kiran Challa**.

---

## What's new in v2

| | Feature | What it does |
|---|---|---|
| 🧠 | **Smart Flashcards** | AI writes study cards from a chapter, from your own notes, or you write them yourself. The SM-2 spaced-repetition engine schedules each review just before you'd forget. Includes 3D flip cards, keyboard rating (1–4), hints, and XP for each review. |
| ⏱️ | **Focus Studio** | Pomodoro, deep-work and sprint timers. Rain, ocean and brown-noise soundscapes are generated in the browser (no audio files). Also: a daily goal ring, a 16-week consistency heatmap, a time split by subject, focus streaks and 1 XP per focused minute. The timer keeps running when you switch pages. |
| 🗓️ | **Revision Planner** | A day-by-day exam plan. Weak topics come first, each topic comes back for revision 1, 3 and 7 days later, every 7th day is a light day, and the final days are mock tests. An optional AI coach rewrites tasks into concrete actions. Shows a live countdown, gives +10 XP per task, and exports to Google, Apple or Outlook calendars (.ics). |
| ⌘ | **Command palette** | Press `Ctrl/⌘ K` (or `/`) anywhere to jump to any page or run quick actions ("Start a 25-minute focus block", "Review due flashcards"). Press `?` to see all shortcuts. |
| 📊 | **Learning pulse** | A strip on the student dashboard showing due cards, minutes focused today and today's plan tasks. |
| 📱 | **Installable app (PWA)** | Manifest, branded icons, an offline shell via a service worker, and home-screen shortcuts that open Focus Studio and Flashcards directly. |
| ☁️ | **Cloudflare-native** | Global edge hosting. Live tracking and the classroom run on Durable Objects, AI runs on Workers AI, data lives in D1, and the database schema and demo data set themselves up on first use. |
| 🔒 | **Hardening** | Security headers. Demo reset is admin-only, because it wipes all data. Seed generation is dev-only. |

Everything from v1 is still here: the five role workspaces (Student, Parent, Tutor, Institute, Admin), tutor discovery and verification, escrow payments, SafeHome Guardian (OTP check-in, live GPS, geofence, SOS), the live classroom (WebRTC, whiteboard, polls, quizzes, Q&A, captions, breakout rooms), the lesson plan and question paper generators, and branded PDF export.

## Architecture

```
Browser ──► Cloudflare Worker (worker/index.ts)
             ├── /rt/livehub    → LiveHubDO       (Durable Object: home-visit tracking, OTP, SOS, safety rules)
             ├── /rt/classroom  → ClassroomHubDO  (Durable Object: WebRTC signalling, chat, polls, quizzes…)
             └── everything else → Next.js 16 app (built by OpenNext)
                                    ├── Prisma ORM → Cloudflare D1 (SQLite)
                                    └── Workers AI  (Llama 3.3 70B text, Llama 4 Scout vision)
```

| Layer | Choice |
|---|---|
| Framework | Next.js 16 (App Router) + TypeScript 5, deployed with `@opennextjs/cloudflare` |
| Styling | Tailwind CSS 4 + shadcn/ui + Lucide icons |
| Database | Prisma 6 + `@prisma/adapter-d1` on **Cloudflare D1** |
| Realtime | **Durable Objects**, using a small socket.io-compatible WebSocket layer (`worker/mini-io.ts`, `src/lib/realtime/client.ts`) |
| AI | **Workers AI** (`src/lib/ai.ts`). Every generator has a deterministic fallback, and fallback output is labelled as such. |
| State | Zustand |

### Repository layout

```
├── worker/                 Cloudflare entry, Durable Objects, realtime server shim, bundled schema
├── src/
│   ├── app/                Next.js routes + REST API (/api/...)
│   ├── views/              Role workspaces (student, parent, tutor, institute, admin, studio, live, auth)
│   ├── components/         shadcn/ui primitives + app shell, command palette
│   └── lib/                db (D1), ai (Workers AI), auth, learning engine (SM-2, planner), seeding, PDF
├── prisma/schema.prisma    Data model (source of truth)
├── migrations/             D1 SQL migrations (idempotent)
├── scripts/                gen-schema.mjs, snapshot-seed.mjs
├── wrangler.jsonc          Cloudflare configuration (bindings, Durable Objects, AI)
└── .github/workflows/      Optional GitHub Actions deploy
```

---

## Deploy to Cloudflare (step by step)

> This app deploys as a **Cloudflare Worker** with static assets. That is the current recommended way to run Next.js on Cloudflare, and it shows up under **Workers & Pages** in your dashboard. A separate Pages project is not needed.
>
> **Plan:** the Workers **Paid** plan ($5/month) is recommended. A full Next.js app with Prisma needs more CPU per request than the free tier's 10 ms limit. The bundle is about 2.4 MB gzipped, so it fits within both plans' size limits.

### 1. Prerequisites
- Node.js 22+ and a Cloudflare account
- `npm install`
- `npx wrangler login`

### 2. Create the D1 database
```bash
npx wrangler d1 create tutor-amma-db
```
Copy the printed `database_id` into `wrangler.jsonc`, replacing `REPLACE_WITH_YOUR_D1_DATABASE_ID`. Commit that change.

### 3. Set secrets
```bash
npx wrangler secret put AUTH_SECRET        # e.g. output of: openssl rand -base64 32
npx wrangler secret put INTERNAL_SECRET    # any long random string
```
(Optional) `DEMO_RESET_KEY` lets you reset demo data with `POST /api/demo/reset` and the header `x-demo-reset-key`.

### 4. Deploy
```bash
npm run deploy
```
This builds the app, applies the D1 migrations and uploads the Worker. When it finishes, open the `*.workers.dev` URL it prints. Click any **demo tile** on the sign-in page: the first demo login seeds the full demo dataset in about a second.

### Option B — deploy from GitHub automatically

**Cloudflare dashboard (Workers Builds):**
1. Go to **Workers & Pages → Create → Import a repository** and pick this repo.
2. Set the build command to `npm run cf:build`.
3. Set the deploy command to `npx opennextjs-cloudflare deploy`.
4. Add `AUTH_SECRET` and `INTERNAL_SECRET` under **Settings → Variables and Secrets**.

The schema is created automatically on the first request, so you don't need a separate migration step.

**GitHub Actions:** add the `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` repository secrets. After that, every push to `main` runs `.github/workflows/deploy.yml`.

### Custom domain
Go to **Workers & Pages → tutor-amma → Settings → Domains & Routes → Add → Custom domain**.

---

## Local development

```bash
npm install
cp .dev.vars.example .dev.vars
npm run preview:local     # full Worker locally (D1 + Durable Objects), http://localhost:8787
```

`preview:local` uses `wrangler.test.jsonc`, which leaves out the remote-only Workers AI binding so everything runs offline. AI features fall back to their deterministic generators. To use real AI locally, run `npm run preview` while logged in with `wrangler login`.

For fast UI iteration you can also run `npm run dev` (Next.js dev server with local D1 bindings).

| Command | What it does |
|---|---|
| `npm run cf:build` | Generate the Prisma client, bundle the schema, build with OpenNext |
| `npm run preview:local` | Build and run the full Worker locally, offline |
| `npm run deploy` | Build, migrate remote D1 and deploy |
| `npm run typecheck` | TypeScript check |
| `npm run db:migrate:local` / `db:migrate:remote` | Apply D1 migrations |
| `npm run cf-typegen` | Regenerate Cloudflare binding types |

### Changing the data model
1. Edit `prisma/schema.prisma`.
2. Add a new idempotent SQL file to `migrations/`. You can generate one with `npx prisma migrate diff --from-schema-datamodel <old> --to-schema-datamodel prisma/schema.prisma --script`.
3. Run `npm run cf:build`. This regenerates `worker/schema.ts`, the bundle used for auto-bootstrap.

### Demo data
Production seeding replays `src/lib/seed-snapshot.json` in **one D1 batch**. Every date is shifted so the demo always looks live relative to today. Writing the roughly 6,000 rows one ORM query at a time would exceed Cloudflare's per-request D1 query limit.

If you change `src/lib/seed.ts`, regenerate the snapshot:
```bash
npm run cf:build
npx wrangler dev -c wrangler.test.jsonc --var ALLOW_SEED_GENERATE:1
curl -X POST http://localhost:8787/api/demo/generate     # in another terminal
npm run seed:snapshot
```

## Demo accounts

Password for every demo account: `demo1234`. You can also use the one-tap demo tiles.

| Role | Email |
|---|---|
| Student | student.demo@tutoramma.test |
| Parent | parent.demo@tutoramma.test |
| Tutor | tutor.demo@tutoramma.test |
| Institute | institute.demo@tutoramma.test |
| Admin | admin.demo@tutoramma.test |

All data is fictional. An admin can restore the canonical demo data from the user menu with **Reset data**.

## Feature tour

1. **Student** → *Smart Flashcards* → *Review due* (Space to flip, keys 1–4 to rate) → *Focus Studio* (pick Rain, press Space) → *Revision Planner* (tick tasks, *Add to calendar*). Press `Ctrl K` anywhere.
2. **Tutor** → *Teaching Studio* → generate a 5E lesson plan → convert it to a question paper.
3. **Parent** → *Live Tracking* to watch a home visit in real time (Durable Object).
4. **Tutor** → *Live Classes* → *Go Live*, then share the join link.
5. **Admin** → verification queue, disputes, payouts and audit trail.

## AI behaviour (honest notes)
- Generators call Workers AI with a hard timeout and always return an answer. If the AI is unavailable, a deterministic, syllabus-grounded generator takes over, and its output is labelled as fallback, never passed off as AI.
- Humans approve everything: papers, answer keys and lesson plans stay drafts until a teacher saves them.

## Credits
Tutor Amma — "Key to Success". Built by Kiran Challa with Next.js, Prisma, Tailwind CSS, shadcn/ui and Cloudflare.
