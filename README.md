# SAO Command Deck

A dashboard for running several **Snored Art Online** characters from one page. It is styled to match the game.

- **Accounts:** add an existing character by logging in, or create a new one with a strong generated password. The password is shown once and kept encrypted.
- **Characters table:** one dense row per character — name, level, HP, EXP, attack, area, what it's doing, gold, EXP/min — sized for running ~20 accounts at once. Just three actions per row: **Farm**, **Boss**, **Mission**. Restock and returning to town happen automatically; there's no manual "go to" — Farm/Boss auto-travel to a safe area for the character's level first.
- **Character profile** (click a name): skills and equipment preview, a unique-weapon goal picker (steers what **Mission** chases), plus the account-management actions (password, raw command, remove, health/potions settings).
- **Parties:** run as many as you like. Each party has a **leader** and a **tank** (see below); members are shown with the same compact row as the Characters table, plus role badges and add/remove controls.
- **Per-bot health and potions:** every character runs its own safety loop and restocks itself.
- **EN / 中文** toggle in the top bar.

> ⚠️ **Read "Not verified yet" before you use this with a real character.** It was built without access to the game server, so login, sign-up and party commands are guesses until someone checks them.

## Run it

Needs Node 22 or newer. Nothing to install to *run* it — `npm install` is only needed if you're going to edit the dashboard's markup (see "The dashboard page" below).

```bash
npm start                 # dashboard on http://127.0.0.1:4400
```

To try everything without touching a real character, use the bundled practice server:

```bash
npm run mock              # practice server on :8787, accounts demo_tank / demo_healer / demo_dps
SAO_PROTOCOL=protocol.mock.json npm start
```

`npm test` runs the test suite against the practice server.

The practice server's numbers mean nothing — it's a toy combat loop, not the game. Two knobs for trying things quickly:

```bash
MOCK_DAMAGE=900 npm run mock            # monsters hit harder
MOCK_EXP_MULTIPLIER=20 npm run mock     # level up faster (doesn't touch damage, so the safety loop still keeps pace)
```

Optional environment variables:

| Variable | Purpose |
|---|---|
| `PORT`, `HOST` | Where the dashboard listens. Default `127.0.0.1:4400`, so only this machine can reach it. |
| `DASHBOARD_PASSWORD` | Requires a password to open the dashboard. Set it if you bind to anything other than localhost. |
| `SAO_VAULT_KEY` | Passphrase that encrypts the vault. If unset, a random key file is created in `data/` (chmod 600). |
| `SAO_PROTOCOL` | Path to a protocol override file. Default `protocol.local.json`. |

## How parties work

- The **leader** walks to the party's goal area first, and everyone else follows the leader's actual position, so nobody arrives alone.
- The **tank** starts fighting first. The others fight only while the tank is in the area, fighting, and above its **retreat HP** (default 40%). If the tank drops below that, the others stop and wait until it recovers.
- The goal area must be safe for the **lowest-level** member: monster level must be below their level. If that stops being true, the party is pulled back to town.
- If any member's bot halts itself after repeated close calls, the whole party holds.
- **Also form the party in-game** (off by default) additionally sends the game's own party commands. Those commands are guesses; see below.

## Health and potions (per bot)

Each character checks its HP every 500 ms while it's fighting, even when the dashboard page is closed:

| HP at or below | Normal fight | Boss fight | Action |
|---|---|---|---|
| Potion line | 25% | 35% | Drink a potion (in `bot` heal mode; in `crystal` mode the game's own auto-drink handles this) |
| Emergency line | 20% | 20% | 瞬補 emergency heal, when off cooldown |
| Crystal line | 10% | 10% | 回復水晶 full heal; if none, 轉移水晶 teleport to town; if none, emergency heal; failing all of that, stop hunting |

- Lowering the potion or emergency line below these values asks for confirmation. The crystal line can never go below 10%.
- After 3 close calls within 5 minutes the bot stops hunting and waits for you to press **Resume bot**.
- **Auto-restock:** when supplies drop below their minimum, the bot walks to the right shop floor (using the game's shop rules), buys up to the target within a spending cap (default 50% of current gold), then returns and resumes hunting.

## Not verified yet

These are configured in `src/protocol.js`. Override any of them in `protocol.local.json` once you've captured the real calls in the browser's network panel. Never put a token or password in that file.

| Item | Current guess |
|---|---|
| How the socket signs in | First frame `{"t":"auth","token":...}` (modes `query`, `header` and `cookie` are also supported) |
| Log in | `POST /api/link {name, password}` → `{token}` |
| Create account | `POST /api/characters {name}` → `{token}`, then `POST /api/password {password}` |
| Max HP field | Tries `maxHp`, `hpMax`, … and otherwise uses the highest HP seen (marked "max est.") |
| EXP needed field | Tries `expNeeded`, `expNext`, … and otherwise shows raw EXP |
| Attack field | Tries `attack`, `atk`, `stats.attack`, `stats.atk`; shows "—" if none match |
| Boss fight / mission commands | `startBoss`, `stopBoss`, `completeMission` — same guess-and-override pattern as `startHunt`. No real capture exists for these yet. |
| Party commands | `partyCreate`, `partyInvite`, `partyAccept`, `partyLeave`, `partySetLeader`. There's no known tank command. The game's boss "gaze" (aggro) is the likely hook for one. |

A character's **unique weapon goal** (set from its profile) is dashboard-only bookkeeping, not a game field — it's just attached as `{questType:'uniqueWeapon', weapon}` on the `completeMission` command above when set.

Also check with the server owner that running several automated accounts is allowed.

## Layout

```
src/protocol.js     everything about the game's API (verified vs guessed)
src/game-client.js  one WebSocket per account: init/patch mirror, reconnect, command replies
src/game-rules.js   areas, monster levels, items, shop rules, recommended kit by level
src/safety.js       heal decisions and restock planning (pure functions)
src/session.js      one bot per account: lock, travel, safety loop, restock, metrics
src/party.js        parties: leader, tank, follow/hold logic
src/accounts.js     login / create / remove, settings and encrypted vault
src/server.js       HTTP API + live stream for the UI (localhost by default)
public/             the dashboard page (Vue 3, vendored locally — see below)
mock/               local practice server (not the game)
test/               node:test suite
```

Secrets (tokens and passwords) are kept only in `data/vault.enc`, encrypted with AES-256-GCM. They never appear in logs, the UI's data stream or `data/settings.json`. The `data/` folder is git-ignored.

### The dashboard page

The server sends `Content-Security-Policy: default-src 'self'` — no CDN scripts, and no `eval`/`new Function`, which rules out Vue's usual in-browser template compiler. So:

- `public/vue.esm-browser.prod.js` is Vue's ES-module build, vendored locally.
- `public/app.js` defines the three components (root App, `CharacterRow`, `PartyCard`) with `render` functions, not `template` strings.
- Those render functions live in `public/render-app.js`, `public/render-character-row.js`, `public/render-party-card.js` — precompiled offline with `@vue/compiler-dom` (`mode: 'module'`), so nothing is compiled in the browser.

To change the markup: edit the matching file in `build/templates/` and run `npm install && npm run build:ui` to regenerate `public/render-*.js` (`@vue/compiler-dom` is a devDependency only — the shipped page still has zero runtime dependencies besides the vendored `vue.esm-browser.prod.js`). For a small tweak you can also hand-edit the generated `render-*.js` directly; it's plain, readable output (`_createElementVNode`, `_renderList`, etc.), not minified — just keep `build/templates/*.html` in sync or the next `build:ui` will overwrite your edit.
