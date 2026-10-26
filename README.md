# SAO Command Deck

A dashboard for running several **Snored Art Online** characters from one page. It is styled to match the game.

- **Accounts:** add an existing character by logging in, or create a new one with a strong generated password. The password is shown once and kept encrypted.
- **Characters table:** one dense row per character — name, level, HP, EXP, attack, area, what it's doing, gold, EXP/min — sized for running ~20 accounts at once. Just three actions per row: **Farm**, **Boss**, **Mission**. **Farm** turns on *keep farming*: hunt in the best safe area for the character's level, move up as it levels, and start again when the game stops the hunt (story warps, restocks). Restock and returning to town happen automatically.
- **Character profile** (click a name): skills and equipment preview, a unique-weapon goal picker (steers what **Mission** chases), plus the account-management actions (password, raw command, remove, health/potions settings).
- **Parties:** run as many as you like. Each party has a **leader** and a **tank** (see below); members are shown with the same compact row as the Characters table, plus role badges and add/remove controls.
- **Per-bot health and potions:** every character runs its own safety loop and restocks itself.
- **Event log, docked at the bottom like a chat:** the bots and the game report there. When the game asks something (idle warning, party invite, fell in battle, story scene, farming target reached), the line gets answer buttons. Below it, type the next step for one character or all: `farm 10` (keep farming until Lv10), `stop`, `goto f1-west`, `town`, `restock`, `resume`, `rise`, `join <name>`, or a raw game command as JSON.
- **EN / 中文** toggle in the top bar.

## Run it

Needs Node 22.6 or newer.

```bash
npm install
npm run dev               # dashboard on http://127.0.0.1:4400 (Nuxt dev, hot reload)
npm run build && npm start  # production build, same address
```

Try everything without touching a real character, using the bundled practice server:

```bash
npm run dev:mock          # practice server on :8787 + dashboard; accounts demo_tank / demo_healer / demo_dps, passwords practice-only-1..3
npm test                  # vitest suite against the practice server
npm run typecheck
```

Practice-server knobs: `MOCK_PORT`, `MOCK_DAMAGE=900` (monsters hit harder), `MOCK_EXP_MULTIPLIER=20` (level faster).

| Variable | Purpose |
|---|---|
| `PORT`, `HOST` | Where the dashboard listens. Default `127.0.0.1:4400`. |
| `DASHBOARD_PASSWORD` | Requires a password (HTTP Basic). Set it if you bind to anything other than localhost. |
| `SAO_VAULT_KEY` | Passphrase that encrypts the vault. If unset, a random key file is created in `data/` (chmod 600). |
| `SAO_PROTOCOL` | Protocol override file. Default `protocol.local.json`. |
| `SAO_DATA_DIR` | Where settings and the vault live. Default `data/`. |
| `SAO_WS_LOG` | Append every game socket frame (in and out, tokens masked) to this file as JSON lines — for studying the protocol. Off by default. |
| `DASHBOARD_HOSTS` | Extra host names the dashboard answers to (comma-separated). Only `localhost` / `127.0.0.1` by default, which blocks DNS-rebinding attacks. |

## Accounts

The game has one call for both: `POST /api/link {account, password, name?}` → `{token}`.

- **Log in existing:** account + password. The character name shown comes from the game.
- **Create new:** account + character name; the dashboard generates a strong password, shows it once and keeps it encrypted.
- With the password saved, an expired token logs in again by itself. Without it, the card shows "Login rejected".
- If the same account is opened somewhere else (e.g. your browser), the game disconnects the bot; the card says so and the profile has a **Reconnect** button. The bot does not fight back automatically.

## How parties work

- The **leader** walks to the goal area first; everyone else follows the leader's actual position.
- The **tank** fights first. The others fight only while the tank is in the area, fighting, and above its **retreat HP** (default 40%).
- The goal area must be safe for the **lowest-level** member, or the party is pulled back to town.
- If any member's bot halts itself after repeated close calls, the whole party holds.
- **Every running party is also formed in the game**, once all members are online: the leader `invite`s, members `accept`; members added or removed later are invited or `leave`; `promote` on leader change. The game has no tank role.

## Health and potions (per bot)

Each character checks its HP every 500 ms while fighting, even when the page is closed:

| HP at or below | Normal fight | Boss fight | Action |
|---|---|---|---|
| Potion line | 25% | 35% | Drink a potion (in `bot` heal mode) |
| Emergency line | 20% | 20% | 瞬補 emergency heal, when off cooldown |
| Crystal line | 10% | 10% | 回復水晶 full heal; else 轉移水晶 teleport to town; else emergency heal; else stop hunting |

- Lowering potion/emergency below these asks for confirmation. The crystal line can never go below 10%.
- After 3 close calls within 5 minutes the bot stops hunting until you press **Resume bot**.
- **Auto-restock:** buys up to the target within a spending cap (default 50% of gold) at the right shop floor, then returns.

## Game protocol

Checked against dev-sao.potato-proxy.com on 2026-10-26 (from the game's own web client). Lives in `server/sao/protocol.ts`; override in `protocol.local.json`.

| Dashboard action | Game call |
|---|---|
| Socket sign-in | first frame `{"t":"auth","token":...}`; bad token → `{"t":"error","code":"unauthorized"}` |
| Farm | `travel` to the best safe area, then `startHunt`; off = `stopHunt` |
| Boss | `challengeBoss` (the game has no "leave boss" command, so Boss can't be toggled off) |
| Mission | `completeAllQuests` (turn in every finished quest) |
| Travel / shop / heal | `travel`, `gate`, `buy`, `drink`, `emergency`, `use` |

Still estimated: the real player state has no max-HP, EXP-needed or attack field (the game computes them in the browser). Max HP is the highest HP seen since connecting (shown with `~`); EXP shows raw points; ATK shows "—".

The map (areas, links, monster levels, town shops) is in `shared/world.json`, copied from the game client. What the dashboard still doesn't cover of the protocol: [docs/game-protocol-gaps.md](docs/game-protocol-gaps.md).

Also check with the server owner that running several automated accounts is allowed.

## Layout

```
server/sao/connector.ts    the game connector: typed HTTP calls (SaoConnector) + one socket per character (GameSocket)
server/sao/protocol.ts     endpoints, command names, tunables
server/dashboard/          the bots: session.ts (one per account), party.ts, safety.ts, accounts.ts, actions.ts, vault.ts
server/api/                the dashboard's JSON API + /api/stream (Server-Sent Events)
server/middleware/guard.ts optional password; same-origin JSON writes only
shared/                    types, game rules and the real map (world.json), used by both server and UI
app/                       the Nuxt UI: app.vue, components/, composables/
mock/mock-server.ts        local practice server (not the game)
tests/                     vitest suite
```

Secrets (tokens and passwords) are kept only in `data/vault.enc`, encrypted with AES-256-GCM. They never appear in logs, the UI's data stream or `data/settings.json`. `data/` is git-ignored.
