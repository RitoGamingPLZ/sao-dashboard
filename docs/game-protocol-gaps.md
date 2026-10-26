# What the dashboard does and doesn't cover of the SAO game protocol

Checked 2026-10-26 against dev-sao.potato-proxy.com, two ways:

- **Recorded traffic.** About 4,500 real socket frames from alanchiu2 and alanchiu4 while farming, with `SAO_WS_LOG` on (see below).
- **The game's own web client.** Its message handler (`main-1nL5gxyG.js`) lists every frame the server can send and every command the client can send.

## Recording frames yourself

```bash
SAO_WS_LOG=/tmp/sao-frames.jsonl npm start
```

Each frame in and out is one JSON line (`{at, who, dir, frame}`), and login tokens are masked. Leave this off normally, because the file grows by about 2 frames per second per character.

## Server → dashboard frames

| Frame | What it is | Status |
|---|---|---|
| `init`, `patch`, `result`, `params`, `pong` | State, changes, command replies, game constants | Handled |
| `replaced`, `kicked`, `error` (`unauthorized`, `full`) | Session ended / queued | Handled |
| `patch.log` | The game's own log: kills, drops, level-ups, story steps, "no potions, stopped" | **Now shown** in the event log (combat/loot chatter filtered out) |
| `idleWarn` | "Still there?" after 5 min idle in town (`townIdleWarnMs`) | **Now a question** with *Stay online* / *Keep farming* buttons |
| `idleKick` | Kicked for idling | **Now handled**: stops reconnecting, offers *Reconnect* |
| `dead` | Character died | **Now handled**: stops, raises an alert |
| `reborn` | The game made a new character for this login (includes a new token) | **Now handled**: switches to the new token. *Not yet saved to the vault, so a restart uses the old token.* |
| `partyInvite` | Someone invites you to a party | **Now a question** with a *Join* button |
| `followInvite`, `friendRequest`, `retreat`, `rally`, `frozen`, `maintenance` | Social and server notices | **Now shown** in the log (no buttons yet) |
| `nearby` (~1/s), `broadcast`, `chat`, `dm`, `mail`, `notices`, `friends`, `storyText`, `lore`, `firstClears`, `fighters`, `inspect`, `feedbackMine`, `gmConsole`, `peopleFound` | Social, UI text, server news | Ignored (not needed by the bots) |

## Dashboard → server commands

Used by the dashboard: `travel`, `gate`, `startHunt`, `stopHunt`, `buy`, `use`, `drink`, `emergency`, `challengeBoss`, `completeAllQuests`, party `invite`/`accept`/`leave`/`promote`, and now `rise`, `sceneOk` and the `awake` frame (as answer buttons).

Not used yet:

| Command | What it does | Worth adding? |
|---|---|---|
| `acceptAllQuests`, `acceptQuest`, `completeQuest`, `abandonQuest` | Quests give big EXP (e.g. ch1: 950 EXP) | **Yes**: the fastest leveling boost |
| `storyClaim`, `storyClaimAll`, `storyChoose`, `storyAnswer`, `storyCardSeen` | Story rewards and choices | **Yes**: `storyClaimAll` is free EXP/gold |
| `mailClaim`, `mailRead` | Mail rewards (the server sends compensation this way) | Yes |
| `equip`, `unequip`, `sell`, `buyback`, `enhance`, `fuseStart`, `fuseClaim`, `lockGear`, `markJunk` | Gear | Later: `equip` + `sell` for auto-upgrading |
| `setSkillSlots`, `setBuffSlots`, `setBuffManual`, `useBuff`, `uniqueLearn`, `uniqueShow` | Skills | Later |
| `updateSettings` | The game's own auto-potion (`potionPct`, `restPct`) | Maybe: the bot already heals |
| `setAutoBoss`, `focus`, `setTitle`, `readNotices`, `yuiConsole` | Misc | No |
| frames `chat`, `dm`, `brag`, `friend`, `comp`, `watch`, `peopleFind`, `feedback`, `visible` | Social | No |

The real client sends `completeAllQuests` with no arguments. The dashboard's Mission button adds `questType` and `weapon`, which the server probably ignores.

## Player state the dashboard doesn't read

`quests`, `questsDone`, `story` / `storyCard`, `compOffer`, `skillXp`, `skillSlots`, `regen`, `away`, `move` (the server's own travel path), `travelCdMs`, `bossCd`, `stats`, `unlocks`, `foeDot`, `sunder`, `sap`, `focus`, `hiddenFoes`.

Max HP and EXP-to-next-level are **not** in the state; the client computes them. The dashboard still estimates max HP from the highest HP it has seen, so it shows `~`.

## Wrong guesses this run found and fixed

1. **Area names.** The real map uses `f1-west`, `f1-horunka`, `f2-plateau`, … not `f{N}-field` on every floor. Farm/Boss auto-travel picked areas that don't exist. → `shared/world.json` now holds the real map (317 areas, links, monster levels, town shops), copied from the client.
2. **Level-1 lockout.** "Monsters must be below your level" rejects every area at Lv 1. → The rule is now: at most 1 level above you, strictly below if they attack on sight, never hidden areas, and bosses strictly below you.
3. **Floor 1 shop.** The guessed rule said floor 1 sells no potions; it sells `potion-1`, `instant-1` and teleport crystals. Restocking never worked on floor 1. → Shops now come from the real map.
4. **Restock all-or-nothing.** One unaffordable item (a 400-gold crystal) cancelled the whole restock, potions included. → It skips that item, and only walks to town for a batch of 5+ (or when out of potions).
5. **Story warps stop the hunt.** The prologue teleports you to town and turns off auto-hunt; the bot sat idle. → The new keep-farming mode restarts the hunt.
6. **Floors open only after you beat their boss.** `clearedFloors` gates travel, so new characters are stuck on floor 1 (best monsters Lv 4) until they beat the Lv 7 floor boss.
