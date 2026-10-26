# SAO Command Deck

> [English below](#english)

## 中文說明

在同一個網頁上同時操作多個 **Snored Art Online** 角色（最多 10 個）：自動練功、組隊、修整、補藥，遊戲的提問也會在下方的事件紀錄裡等你回答。

### 1. 需要準備

- **Node.js 22.6 以上**（輸入 `node -v` 確認）
- **git**
- 一個遊戲帳號（或在儀表板裡直接建立新帳號）

### 2. 安裝

```bash
git clone https://github.com/RitoGamingPLZ/sao-dashboard.git
cd sao-dashboard
npm install
```

### 3. 啟動

```bash
npm run build
npm start
```

打開瀏覽器到 **http://127.0.0.1:4400**。右上角可以切換 **EN / 中文**。

- 想邊改程式邊看效果：`npm run dev`（同一個網址，會自動重新載入）。
- **更新程式後要重新啟動時，請先停止舊的伺服器（Ctrl+C）再執行 `npm run build`。** 伺服器還在跑的時候重新 build，畫面會出現 500 錯誤。

### 4. 先用練習伺服器試玩（不會動到真正的角色）

```bash
npm run dev:mock
```

會在 :8787 開一個本機練習伺服器，儀表板一樣在 http://127.0.0.1:4400。練習帳號：

| 帳號 | 密碼 |
|---|---|
| `demo_tank` | `practice-only-1` |
| `demo_healer` | `practice-only-2` |
| `demo_dps` | `practice-only-3` |

練習模式的資料存在 `data-mock/`，和真正的 `data/` 分開。

### 5. 加入角色

按 **+ 新增角色**：

- **登入既有帳號**：輸入帳號、密碼。勾選「保存密碼」後，登入過期時儀表板會自動重新登入（密碼加密保存）。
- **建立新帳號**：輸入帳號和角色名稱，儀表板會產生一組高強度密碼，**只顯示一次，請馬上複製**。
- **曾經加入的帳號**：從儀表板移除過的帳號會列在這裡。有保存密碼的點一下就能登入；沒有的點一下後輸入密碼。按 ✕ 會連同保存的密碼一起忘記。

### 6. 日常操作

每張角色卡：

| 按鈕 | 作用 |
|---|---|
| **練功** | 持續練功：自動去目前等級最好的安全地點，升級後換更好的地點，被劇情傳送或補貨打斷後會自己回去 |
| **王戰** | 挑戰樓層頭目（開始後不能中途離開） |
| **任務** | 交付完成的任務 |
| **修整** | 回城：交任務、接任務、補藥、換上買得起的最好裝備（同類型：劍還是劍、輕甲還是輕甲；空的防具／頭／腳／飾品也會補上），鍛造爐開放後還會強化 |
| **⟳** | 重新連線（被擠下線或斷線時變紅色） |
| **✕** | 從儀表板移除（遊戲帳號本身不會被刪除） |

點角色名字可以打開個人資料：選擇 **回復藥水**（遊戲自動喝的）和 **瞬補藥水**（機器人緊急補血用、會自動補貨的）。要保持幾瓶、HP 多少時補血，在「**血量與補藥**」設定裡調整。

### 7. 隊伍

1. 按 **+ 新增** 建立隊伍，用下拉選單加入隊員，指定 **隊長** 和 **坦**。
2. 選樓層和地點，按 **前往**（選了和現在不同的地點才能按）。
3. 選隊伍狀態：
   - **修整**：回該層城鎮，每個隊員依序修整，之後每 10 分鐘再修整一次
   - **待命**：留在地點，不戰鬥
   - **戰鬥**：坦先開打，坦血量低於「坦退避HP %」時其他人停手等待；在頭目房間就是挑戰頭目
- 隊伍會自動在遊戲內組隊，隊員會自動接受邀請。
- 只要有任何隊員藥水低於設定的下限，就不會開王戰。
- 在隊伍裡的角色，個人卡片會蓋上「組隊中」，由隊伍統一指揮。

### 8. 事件紀錄與指令列

畫面下方是事件紀錄。遊戲或機器人需要你回答時（閒置警告、組隊邀請、倒下、劇情、練功達標），訊息旁會出現按鈕，**每個問題只能回答一次**，狀況改變（例如已重新連線）按鈕會自動消失。

下方的輸入框可以對單一角色或全部角色下指令，輸入時會出現建議清單（↑↓ 選擇、Tab 填入）：

| 指令 | 作用 |
|---|---|
| `farm` / `farm 10` | 持續練功／練到 Lv10 為止 |
| `stop` | 停止練功 |
| `goto f1-west` | 走到某個地點。輸入 `goto 稀飯` 可以用中文名稱搜尋，再從清單選一個 |
| `town` | 用轉移水晶回城 |
| `refit` / `修整` | 修整 |
| `restock` | 立刻補貨 |
| `resume` | 機器人自動停止後恢復 |
| `rise` | 倒下後起身 |
| `{"type":"..."}` | 直接送原始遊戲指令（JSON） |

### 9. 注意事項

- **同一個帳號不能同時在兩個地方登入。** 你在瀏覽器開遊戲玩，儀表板上的角色會顯示「已在其他地方登入」並停下來，不會搶回去；想讓儀表板接手時按 **⟳**。
- 儀表板預設只接受本機（`127.0.0.1` / `localhost`）連線。要從別的電腦連線，請設定 `DASHBOARD_HOSTS` 和 `DASHBOARD_PASSWORD`（見下表）。
- 帳號的登入憑證和密碼只存在 `data/vault.enc`（AES-256-GCM 加密），不會出現在畫面、紀錄或 `data/settings.json`。**不要把 `data/` 資料夾分享給別人。**
- 使用多個自動化帳號前，請先確認遊戲管理員允許。

### 10. 環境變數（選用）

| 變數 | 用途 |
|---|---|
| `PORT`、`HOST` | 儀表板的位址，預設 `127.0.0.1:4400` |
| `DASHBOARD_PASSWORD` | 開啟網頁時需要輸入密碼（不是只在本機使用時請設定） |
| `DASHBOARD_HOSTS` | 允許的其他主機名稱，用逗號分隔 |
| `SAO_VAULT_KEY` | 加密保存密碼用的密語；沒設定時會在 `data/` 產生隨機金鑰檔 |
| `SAO_DATA_DIR` | 設定和加密資料的資料夾，預設 `data/` |
| `SAO_PROTOCOL` | 遊戲協定覆寫檔，預設 `protocol.local.json` |
| `SAO_WS_LOG` | 把所有遊戲連線訊息記錄到這個檔案（研究協定用，預設關閉） |

例如：

```bash
PORT=5000 DASHBOARD_PASSWORD=換成你的密碼 npm start
```

### 11. 常見問題

- **畫面顯示 500 錯誤**：通常是伺服器還在跑的時候重新 build 了。停止伺服器、重新 `npm run build`、再 `npm start`，然後重新整理網頁。
- **`EADDRINUSE`（連接埠被占用）**：已經有一個儀表板在跑。先關掉它，或用 `PORT=4401 npm start` 換一個連接埠。
- **角色一直顯示「已在其他地方登入」**：有人（可能是你自己的遊戲視窗）登入了同一個帳號。關掉另一邊再按 ⟳。
- **「登入被拒」**：保存的登入過期而且沒有保存密碼。把角色移除後重新登入，並勾選「保存密碼」。

---

## English

A dashboard for running several **Snored Art Online** characters from one page. It is styled to match the game.

- **Accounts:** add an existing character by logging in, or create a new one with a strong generated password. The password is shown once and kept encrypted.
- **Characters table:** one dense row per character — name, level, HP, EXP, attack, area, what it's doing, gold, EXP/min — up to 10 characters, two cards per row. Actions per card: **Farm**, **Boss**, **Mission**, **修整 Refit**, plus ⟳ reconnect and ✕ remove. **Farm** turns on *keep farming*: hunt in the best safe area for the character's level, move up as it levels, and start again when the game stops the hunt (story warps, restocks). Restock and returning to town happen automatically.
- **Character profile** (click a name): skills and equipment preview, a unique-weapon goal picker (steers what **Mission** chases), recovery and instant potion choice, plus account actions (password, remove, health/potions settings). Raw game commands go in the event-log command box.
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
npm run dev:mock          # practice server on :8787 + dashboard (data in data-mock/); accounts demo_tank / demo_healer / demo_dps, passwords practice-only-1..3
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

The real player state has no max-HP, EXP-needed or attack field (the game computes them in the browser). EXP-needed uses the client's own formula; max HP is still the highest HP seen since connecting (shown with `~`); ATK shows "—".

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
