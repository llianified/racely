# Racely — Launch Readiness & Growth Audit

**Scope:** read-only inspection of `racely-main` (Next.js 16 Telegram Mini App, Neon Postgres, EC2 + PM2).
**Question answered:** which capabilities must exist before V1 launch, which should follow soon after real users arrive, and which are later/experimental.
**Not in scope:** code quality, UI redesign, visual hierarchy. The current UX hierarchy and design tokens are treated as the source of truth.
**Implementation update:** 16 September 2026 — visibilitas ajakan yang masih menunggu syarat dan notifikasi payout ke inviter sudah dirilis.

Legend: `[DONE]` clearly exists and is usable · `[PARTIAL]` exists but incomplete · `[MISSING]` not meaningfully available · `[UNCERTAIN]` cannot verify from code alone.
Blocker classes: **A** = true launch blocker · **B** = growth feature, post-launch · **C** = nice-to-have polish.

---

## 1. PRE-LAUNCH READINESS

| Capability | Status | Launch blocker? | Evidence / current implementation |
|---|---|---|---|
| Core racing loop | `[DONE]` | A — satisfied | Automatic lap racing settled server-side (`lib/game-economy.ts`, `lib/game-server.ts`), client tick reducer (`lib/game.ts` `gameReducer`), 3D race scene (`components/game/scene/race-scene.tsx`), HUD + standings (`race/race-panel.tsx`, `race-standings.tsx`). Live rivals pulled from real neighbouring players by lap rank (`lib/race-opponents-server.ts`). Three circuits with lap-based unlocks (`circuitUnlockLaps`, `technicalUnlockLaps`). |
| Progression / basic economy | `[DONE]` | A — satisfied | Engine/tires/battery upgrades Lv 1–10 with geometric cost growth; lap time and lap reward derive from levels + circuit (`lib/economy-config.ts`). All numbers are DB-backed and tunable from `/admin` → Ekonomi without deploy (`lib/economy-store.ts`, 30s cache). Offline earnings capped at 4h @ 50% rate with a welcome-back dialog. |
| Onboarding | `[DONE]` | A — satisfied | Two-step car + colour selection with 3D preview (`car/car-selection.tsx`, `carSelection.model === null` gate), then a starter-bonus bottom sheet that pushes the player to the garage (`shell/starter-bonus-dialog.tsx`). Referral binding happens on first sync via `start_param` before the first lap (`bindReferrer`). Bot `/start` replies with a Mini App button (`lib/telegram-bot.ts`). |
| Garage / setup | `[DONE]` | A — satisfied | Garage tab: car switch sheet, colour picker, paint collection (tiered, coin-priced), aero body-parts shop with slots, upgrade panel with before/after lap-time preview, and a free gear/roller setup panel that really affects lap time (`lib/car-setup.ts`, `SetupPanel`). |
| Reward / claim flow | `[DONE]` | A — satisfied | Rewards tab (`panels/rewards-panel.tsx`): race pending → claim, 7-rung daily check-in streak, one-time starter gift, three lifetime missions, two daily missions (laps/earn, reset at WIB midnight), rewarded-ad bonus (Adsgram, 5/day cap), and a "claim all" action. Every claim is idempotent via `racely_reward_claims (user_id, reward_key)` unique index. |
| Referral (if acquisition loop) | `[DONE]` | A — satisfied | Full loop present: server-built `t.me/<bot>?start=ref_<id>` link, Telegram native share sheet with copy fallback (`shareReferralLink`), bot reply for referred `/start` with `startapp` deep link, binding before first lap, qualification = check-in on N distinct days **and** N total upgrades (`referralActivityQualified`), inviter 10k / invitee 5k coins paid straight to balance, plus 5 non-monetary exclusive milestones at 1/3/5/10/25 friends (`lib/referral-rewards.ts`). Referral leaderboard metric exists. |
| Persistence | `[DONE]` | A — satisfied | Neon Postgres via Drizzle; 18 additive idempotent migrations; per-player row with `version` + `SELECT … FOR UPDATE`; action receipts give per-request idempotency; rejected withdrawals refunded exactly once. DB tests run against real Postgres in CI. |
| Deployment | `[DONE]` | A — satisfied | README states live at `https://racely.fun`. `.github/workflows/deploy.yml` SSHes into EC2 and runs `scripts/deploy-racely.sh` (install → migrate → verify schema → build with env → PM2 restart). `/api/health` returns 503 when DB is unreachable. `vercel.json` disables Vercel auto-deploys on purpose. |
| Critical bug / security | `[DONE]` | A — satisfied | Production requires Telegram `initData` HMAC + expiry; preview bypass only when `NODE_ENV !== production`. Per-player token-bucket rate limits on state + action routes, stricter per-IP bucket on admin login. Body size limits (`readJsonBody`). CSP, HSTS, nosniff, Referrer-Policy, Permissions-Policy in `next.config.mjs`; admin adds `frame-ancestors 'none'`. Admin password ≥16 chars, all admin routes `guardAdmin()`, every money decision audited. 41 Vitest suites, CI gates typecheck → lint → migrate → test → build. Withdrawal is a manual queue by design (cannot auto-pay). |
| UI ambiguity that could confuse users | `[DONE]` | C — satisfied | A consolidated help/FAQ dialog explains how racing, rivals, offline, circuits and referrals work; server error messages are surfaced verbatim in toasts; the setup panel shows lap-time deltas; and the referral panel spells out the four steps plus the exact qualification rule. The panel now also shows both *completed* friends and friends who are still *menunggu syarat*, using the existing `referral.invited` payload. |
| Wallet / withdrawal (implied by "reward flow" for a cash-out game) | `[DONE]` | A — satisfied | Wallet tab: balance, min/max, quick amounts derived from config, 8 payout methods with per-method account validation, history with status labels. Admin queue `pending → processing → paid | rejected` with copy-account button, liabilities view, audit trail. |
| Return / re-engagement mechanic | `[PARTIAL]` | B | Exists: idle notifier sweep every 5 min sends **one** Telegram message 30 min before the 4h offline cap fills, only to players who opened the bot chat (`lib/idle-notifier.ts`); inviter payout also triggers one personal Telegram message with a re-share action. Missing: no notification for streak-at-risk, daily missions unclaimed, or withdrawal status change. |
| Product analytics / growth measurement | `[MISSING]` | B (but first post-launch item) | No event tracking anywhere in the codebase (no analytics SDK, no event table). Admin overview exposes only total players, players with a car, and withdrawal totals. There is no way today to measure onboarding completion, D1/D7 retention, referral funnel (link opened → bound → qualified), or ad-bonus uptake. |

---

## 2. EXISTING GROWTH LOOP

> **"If I launched this to real users today, what user-growth loop already exists?"**
> A complete, anti-abuse-hardened **invite → play → both get paid → exclusive cosmetics** loop, reinforced by a public leaderboard that ranks referrers, and a single idle push message. That is more than most V1 Mini Apps ship with.

### 2.1 Referral / invite — `[DONE]`
- **What it does:** Player shares a bot deep link via Telegram's native share sheet (or copies it). Friend taps → bot replies with inviter's name, the exact reward terms, and a Mini App button carrying `startapp=ref_<id>`. On first sync the friend is bound to the inviter (only if they have zero laps and no existing referrer; self-referral rejected; inviter must exist). When the friend check-ins on 3 distinct WIB days and completes 3 upgrades, the friend gets 5,000 coins and the inviter 10,000 coins, both credited directly to balance with idempotent claim rows.
- **Why it can drive growth:** Two-sided cash incentive in a game whose whole premise is cash-out; the share happens inside Telegram (zero-friction distribution); the qualification rule filters fake accounts so the rupiah liability stays tied to real engaged users.
- **What is missing:** Share text is a single generic sentence; it doesn't mention the invitee's own reward. Pending invites are visible in the panel, and a successful inviter payout now triggers one personal Telegram message with the friend's name, reward amount, and an “Ajak teman lagi” share action.

### 2.2 Exclusive referral cosmetics (scarcity) — `[DONE]`
- **What it does:** Five milestone rewards that are **not sold anywhere**: Ember Rush paint (1 friend), Neon Fin Splitter (3), Aurora Prism paint (5), Crown Wing (10), Phantom X car (25). Server enforces the threshold on paint/part/car actions; UI shows a locked 3D preview of Phantom X and "N teman lagi" progress.
- **Why it can drive growth:** Zero rupiah liability, visible on the podium and in race rivals' cars (leaderboard exposes `carAppearance`), so status is social. Ladder spacing (1→3→5→10→25) gives a next-step target at every stage.
- **What is missing:** Nothing structural. Pending-invite visibility is now covered by the referral summary.

### 2.3 Rewards (daily check-in, missions, ads) — `[DONE]`
- **What it does:** 7-rung escalating check-in streak; two daily missions reset at WIB midnight; three lifetime onboarding missions; up to 5 rewarded ads/day.
- **Why it can drive growth:** Daily return reason + monetisation offset. Streak reward jumps 500→5,000 which creates loss-aversion on day 6–7.
- **What is missing:** Streak has no "at risk" reminder; daily missions have no reminder. Both are re-engagement gaps, not reward gaps.

### 2.4 Progression — `[DONE]`
- **What it does:** 27 upgrade steps across three components, three circuits unlocked by laps, free setup tuning, coin-priced paints and aero parts.
- **Why it can drive growth:** Long tail of spend targets keeps balance circulating rather than being withdrawn immediately; upgrades are also the referral qualification gate, so progression and acquisition are coupled.
- **What is missing:** Nothing for launch. Deeper missions/seasons are post-launch.

### 2.5 Competition / leaderboard — `[DONE]`
- **What it does:** Top-50 by laps and by completed referrals, 3D podium for top 3, "next rival" delta, current player's rank, 30s refresh; a shortcut card on the race tab. Race opponents are real neighbouring players, so the leaderboard and the track are the same competition.
- **Why it can drive growth:** Referral leaderboard directly gamifies sharing; seeing a real player's car one rank above is a concrete reason to keep the car running.
- **What is missing:** No way to share one's rank or podium outward (would be a viral surface). Not a blocker.

### 2.6 Social / viral mechanics — `[PARTIAL]`
- **Exists:** Telegram-native share, referral leaderboard, real-player rivals with visible cosmetics.
- **Missing:** Any outward share beyond the invite link (rank, Phantom X unlock, big withdrawal paid). Post-launch.

### 2.7 Return / re-engagement — `[PARTIAL]`
- **Exists:** One idle push 30 min before the offline cap, once per idle period, plus one personal message when an inviter receives a referral payout. Both only target users who started the bot chat.
- **Missing:** Streak-at-risk, unclaimed daily mission, and withdrawal-status notifications. These are the cheapest retention levers available because the bot channel and the `racely_bot_chats` table already exist.

### 2.8 Scarcity / exclusive content — `[DONE]`
- Covered by 2.2. Additionally, the third circuit (Apex) gates at 150 laps and paints are tiered by price.

### 2.9 Minimum pieces to make the existing growth concept actually work
1. [x] **Show pending invites** in the referral panel using `referral.invited` — shipped 16 September 2026.
2. [x] **Notify inviter on payout** via the bot — shipped 16 September 2026; one personal message after the idempotent payout commit, with an “Ajak teman lagi” action, only when `racely_bot_chats` confirms the bot may contact the inviter.
3. [ ] **Measure the funnel** — at minimum count: link opened (`/start ref_` received), bound (`referred_by` set), qualified (`referral_paid_at` set). Two of the three are already columns; the first needs a counter. Without this you cannot tune `referralActiveDays` / `referralUpgradeTarget` from data.

Everything else in the growth roadmap builds on a loop that is already whole.

---

## 3. POST-LAUNCH GROWTH ROADMAP

### Must add soon
- [ ] Basic event tracking (onboarding complete, first claim, D1/D7 return, referral open/bind/qualify, ad completed, withdrawal requested) — even a single Postgres events table is enough to start.
- [x] Referral panel shows `invited` (pending) alongside `completed` — shipped 16 September 2026; qualification details remain in “Cara kerja”.
- [x] Bot notification to inviter when a friend qualifies — shipped 16 September 2026.
- [ ] Bot notification to player when a withdrawal is marked `paid` or `rejected`.
- [ ] Streak-at-risk reminder (evening WIB, only if not claimed today) reusing the idle-notifier sweep pattern.
- [ ] Admin overview: new players/day, players with ≥1 claim, referral conversion %, D1 retention — the numbers needed to balance the economy from data.

### Can wait
- [ ] Share-your-rank / share-your-unlock outward cards (leaderboard, Phantom X, first payout).
- [ ] Personalised share text (mention invitee's 5,000 coin reward and inviter's name).
- [ ] Deeper mission variety (weekly missions, circuit-specific missions, setup-experiment missions).
- [ ] Referral milestone between 10 and 25 friends (the jump is large; add only if data shows a plateau at 10).
- [ ] Second re-engagement message type for lapsed players (e.g. day-3 inactive) with a small comeback bonus.
- [ ] Reward-value tuning of daily rewards / mission caps based on observed claim rates (all knobs already exist in `/admin`).

### Experimental / only if data supports it
- [ ] Time-limited seasonal leaderboard with cosmetic prize.
- [ ] Referral contests (top referrer of the week).
- [ ] Ad placement experiments (frequency cap, placement on rewards vs race tab).
- [ ] Clan / team competition.
- [ ] Additional starter cars or a fourth circuit.
- [ ] Any change to the qualification rule (`referralActiveDays`, `referralUpgradeTarget`) — tune from `/admin` first; only redesign if the data says the gate is the leak.

---

## 4. FINAL LAUNCH CHECKLIST

### MUST HAVE BEFORE LAUNCH
- [ ] Confirm production env is complete at build time: `PUBLIC_APP_URL`, `NEXT_PUBLIC_ADSGRAM_BLOCK_ID`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `DATABASE_URL`, `RACELY_ADMIN_PASSWORD` (README notes ads card and OG card silently vanish without build-time env). `[UNCERTAIN]` — cannot verify from repo.
- [ ] `pnpm run bot:setup` has been run against the production bot so `/start`, `/play` and the webhook are registered. `[UNCERTAIN]`
- [ ] An operator is actually staffing the withdrawal queue and a payout SLA is communicated somewhere the player can read it (wallet sheet or FAQ). The mechanism is done; the operational commitment is what's being checked.
- [ ] Economy config row in `racely_economy_config` reviewed once against the liability projection in `/admin` → Ekonomi before real users arrive.

### ALREADY DONE
- [x] Core racing loop with server-authoritative settlement and real-player rivals
- [x] Progression: 3 upgrade tracks × 10 levels, 3 circuits, free setup tuning
- [x] Onboarding: car + colour selection, starter bonus, garage hand-off
- [x] Garage: car switch, paints, aero parts, upgrades, setup
- [x] Rewards: race claim, daily streak, lifetime missions, daily missions, rewarded ads, claim-all
- [x] Referral loop end-to-end with two-sided coin reward and anti-abuse qualification
- [x] Exclusive referral cosmetics ladder (1/3/5/10/25) including Phantom X
- [x] Leaderboard by laps and by referrals with podium and next-rival
- [x] Idle re-engagement push via bot
- [x] Wallet with 8 payout methods, validation, history, manual admin queue with audit
- [x] Persistence with idempotent actions and additive migrations
- [x] Telegram initData auth, rate limits, body limits, security headers, admin hardening
- [x] CI (typecheck/lint/migrate/test/build) and EC2 deploy pipeline, health endpoint
- [x] Help/FAQ dialog covering every mechanic in plain language
- [x] Pending-invite visibility in the referral panel
- [x] Inviter payout notification with a Telegram re-share action

### NOT REQUIRED FOR LAUNCH
- [ ] Event tracking / analytics
- [ ] Withdrawal status notification
- [ ] Streak-at-risk / mission reminders
- [ ] Outward share cards (rank, unlock, payout)
- [ ] Weekly / seasonal missions and leaderboards
- [ ] Extra referral milestones, clans, contests
- [ ] Additional cars, circuits, visual polish, refactors, "sekalian rapihin"

---

## 5. BOTTOM LINE

**Based on the current app, Racely IS launch-ready.**

Every item on the pre-launch "wajib" list — core loop, economy, onboarding, garage/setup, reward/claim, referral, persistence, deployment, security — is present and server-enforced. The pending-invite copy/data gap identified by this audit is now closed; the four unchecked items above remain operational confirmations, not features.

**Freeze now:**
- Game rules, economy formulas, and qualification rule shape (tune numbers only via `/admin`).
- UI hierarchy, navigation, and the referral / rewards / wallet flows as they stand.
- Migration set 0001–0018.

**Move to post-launch (in this order):**
1. Event tracking so the next decisions are data-driven.
2. Notify the player on withdrawal status changes.
3. Streak / mission reminders over the existing bot channel.
4. Everything in "Can wait" and "Experimental", gated on what the data shows.

Do not let anything in section 3 delay the launch. Pending-invite visibility is complete; the remaining growth work is measurement and a few closing messages, both of which are more valuable *after* real users are generating the numbers.
