// Monster stats learned from fights. The game never sends a monster's attack,
// defence or max HP, so every character's fights fill this in, and it's kept
// in monsters.json across restarts.
//   attack:  from hits it lands on us   (damage = atk² / (atk + our def))
//   defence: from our plain hits on it  (damage = our atk² / (our atk + its def))
//   charged attacks: the attack behind the biggest hit seen, per charge (so it converts to any defence)
//   max HP (solo fights only: party bosses get more) / attack interval: the highest seen.
//   damage rate: damage per second a solo fighter took in a boss fight (its report),
//     scaled to defence 0 with the boss's attack.
//   worst 2 s in a boss room: the hits (boss, adds, crits, charges) of the hardest
//   2 seconds anyone took there, kept as attacks so they convert to any defence.

import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { enemyAttackFromHit, WORST_WINDOW_MS, type MonsterStats } from '#shared/game-rules'

const SAMPLES = 50

interface Entry { level?: number, maxHp?: number, attackMs?: number, atkSamples: number[], defSamples: number[], charges: Record<string, number>, worstWindow?: number[], damageRates?: number[] }
interface CombatEntry { key: string, t?: number, p?: Record<string, any> }

const median = (values: number[]) => values.length ? [...values].sort((first, second) => first - second)[Math.floor(values.length / 2)] : undefined
const push = (values: number[], value: number) => { values.push(value); if (values.length > SAMPLES) values.shift() }

export class Bestiary {
  private entries: Record<string, Entry> = {}
  private isDirty = false
  // Recent hits per character in a boss room: { t: game time, attack }.
  private recentByFighter = new Map<string, Array<{ t: number, attack: number }>>()

  constructor(private file?: string) {
    if (file && existsSync(file)) {
      try { this.entries = JSON.parse(readFileSync(file, 'utf8')) } catch { this.entries = {} }
    }
  }

  private entry(monsterId: string): Entry {
    this.isDirty = true
    return this.entries[monsterId] ??= { atkSamples: [], defSamples: [], charges: {} }
  }

  // One game log entry, with the character's own stats at that moment.
  // where: who took the hit and in which area (for the boss-room worst 2 s).
  recordLog(log: CombatEntry, us: { atk: number, def: number } | null, where?: { fighter: string, name?: string, areaId: string | null | undefined }) {
    const params = log.p ?? {}
    const monsterId: string | undefined = params.m?.m
    if (!monsterId) return
    if (log.key === 'bossReport' && us && where?.name) this.recordBossReport(monsterId, params, us.def, where.name)
    if (log.key === 'enemyAttack' && us && where && typeof params.dmg === 'number' && params.dmg > 0 && typeof log.t === 'number') this.recordBossRoomHit(log.t, enemyAttackFromHit(params.dmg, us.def), where.fighter, where.areaId)
    if ((log.key === 'encounter' || log.key === 'bossOpen') && typeof params.lv === 'number') this.entry(monsterId).level = params.lv
    if (!us || typeof params.dmg !== 'number' || params.dmg <= 0 || params.crit || params.miss) return
    if (log.key === 'enemyAttack') {
      const entry = this.entry(monsterId)
      if (params.k?.k) entry.charges[params.k.k] = Math.max(entry.charges[params.k.k] ?? 0, Math.round(enemyAttackFromHit(params.dmg, us.def)))
      else push(entry.atkSamples, Math.round(enemyAttackFromHit(params.dmg, us.def)))
    }
    if (log.key === 'attack' && us.atk > 0) push(this.entry(monsterId).defSamples, Math.max(0, Math.round(us.atk * us.atk / params.dmg - us.atk)))
  }

  private recordBossReport(bossId: string, params: Record<string, any>, def: number, name: string) {
    let report = params.r
    if (typeof report === 'string') { try { report = JSON.parse(report) } catch { return } }
    const rows: Array<[string, number, number]> = report?.rows ?? []
    const attack = median(this.entries[bossId]?.atkSamples ?? [])
    if (rows.length !== 1 || rows[0]![0] !== name || !(params.sec > 0) || !attack) return // solo fights only
    const entry = this.entry(bossId)
    entry.damageRates ??= []
    push(entry.damageRates, Math.round((rows[0]![2] / params.sec) * (attack + Math.max(0, def)) / attack))
  }

  private recordBossRoomHit(t: number, attack: number, fighter: string, areaId: string | null | undefined) {
    const floor = /^f(\d+)-bossroom$/.exec(areaId ?? '')?.[1]
    if (!floor) { this.recentByFighter.delete(fighter); return }
    const hits = (this.recentByFighter.get(fighter) ?? []).filter((hit) => t - hit.t < WORST_WINDOW_MS && hit.t <= t)
    hits.push({ t, attack: Math.round(attack) })
    this.recentByFighter.set(fighter, hits)
    const boss = this.entry(`f${floor}-boss`)
    const sum = (attacks: number[]) => attacks.reduce((total, value) => total + value, 0)
    if (sum(hits.map((hit) => hit.attack)) > sum(boss.worstWindow ?? [])) boss.worstWindow = hits.map((hit) => hit.attack)
  }

  // Enemies in the current fight (from the state patch).
  recordEnemies(enemies: Array<{ monsterId?: string, hp?: number, attackTimerMs?: number }> | null | undefined, isSolo = true) {
    for (const enemy of enemies ?? []) {
      if (!enemy.monsterId) continue
      const known = this.entries[enemy.monsterId]
      if (isSolo && (enemy.hp ?? 0) > (known?.maxHp ?? 0)) this.entry(enemy.monsterId).maxHp = enemy.hp
      if ((enemy.attackTimerMs ?? 0) > (known?.attackMs ?? 0)) this.entry(enemy.monsterId).attackMs = enemy.attackTimerMs
    }
  }

  get(monsterId: string): MonsterStats | null {
    const entry = this.entries[monsterId]
    if (!entry) return null
    return { level: entry.level, maxHp: entry.maxHp, attackMs: entry.attackMs, atk: median(entry.atkSamples), def: median(entry.defSamples), charges: entry.charges, worstWindow: entry.worstWindow, damageRate: median(entry.damageRates ?? []), samples: entry.atkSamples.length + entry.defSamples.length }
  }

  all(): Record<string, MonsterStats> {
    return Object.fromEntries(Object.keys(this.entries).sort().map((monsterId) => [monsterId, this.get(monsterId)!]))
  }

  save() {
    if (!this.file || !this.isDirty) return
    this.isDirty = false
    writeFileSync(`${this.file}.tmp`, JSON.stringify(this.entries))
    renameSync(`${this.file}.tmp`, this.file)
  }
}
