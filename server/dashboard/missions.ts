// 任務 planner: what a character should do next to finish its story step and
// open quests. Pure — the Session acts on the answer every main tick.
//
// Story goals: visit an area, kill N of a monster, collect an item a monster
// drops, reach a level, or beat a floor boss. Quests are all "kill N of X".
// Both progress by themselves in the game while we stand/hunt in the right area.

import missions from '#shared/missions.json'
import { WORLD_AREAS, isAreaSafeFor, safeAreaFor } from '#shared/game-rules'

interface StoryGoal { kind: string, areaId?: string, monsterId?: string, itemId?: string, from?: string, qty?: number, level?: number, floor?: number }
interface QuestInfo { floor: number, type: string, target: string, qty: number, requires?: string, reward: { exp: number, col: number } }

export const QUESTS: Record<string, QuestInfo> = missions.quests
export const STORY: Record<string, { floor: number, title: string, titleZh: string | null, goals: Array<StoryGoal | null> }> = missions.story

export type Objective =
  | { kind: 'visit', areaId: string, why: string }
  | { kind: 'hunt', areaId: string, why: string }
  | { kind: 'boss', floor: number, why: string }
  | { kind: 'turnIn', why: string }

export interface MissionPlayer {
  level: number
  areaId: string
  story?: { ch?: string, step?: number, n?: number } | null
  quests?: Record<string, number> | null
}

// The safest area on an unlocked floor where this monster spawns.
export function huntAreaFor(monsterId: string, level: number, maxFloor: number): string | null {
  const candidates = Object.entries(WORLD_AREAS)
    .filter(([areaId, area]) => area.floor <= maxFloor && area.spawns?.includes(monsterId) && isAreaSafeFor(areaId, level))
    .sort(([, first], [, second]) => (first.maxLevel ?? 0) - (second.maxLevel ?? 0))
  return candidates[0]?.[0] ?? null
}

export const isQuestReady = (questId: string, progress: number) => progress >= (QUESTS[questId]?.qty ?? Infinity)

// Next thing to do, plus notes on what had to be skipped (too dangerous, or a goal the bot can't do).
// skipStory: the current story step already failed this run (e.g. boss too strong).
export function planMission(player: MissionPlayer, maxFloor: number, { skipStory = false } = {}): { objective: Objective | null, skipped: string[] } {
  const skipped: string[] = []
  const story = player.story
  const chapter = story?.ch ? STORY[story.ch] : undefined
  const goal = chapter?.goals[story?.step ?? 0]
  if (chapter && goal && !skipStory) {
    const why = `story: ${chapter.title} step ${(story?.step ?? 0) + 1}`
    const storyObjective = objectiveForGoal(goal, player, maxFloor, why)
    if (typeof storyObjective === 'string') skipped.push(`${why} — ${storyObjective}`)
    else return { objective: storyObjective, skipped }
  }
  const openQuests = Object.entries(player.quests ?? {})
  for (const [questId, progress] of openQuests) {
    const quest = QUESTS[questId]
    if (!quest || isQuestReady(questId, progress)) continue
    const areaId = huntAreaFor(quest.target, player.level, maxFloor)
    if (areaId) return { objective: { kind: 'hunt', areaId, why: `quest ${questId}: ${progress}/${quest.qty}` }, skipped }
    skipped.push(`quest ${questId} — no safe area for ${quest.target} at Lv${player.level}`)
  }
  if (openQuests.some(([questId, progress]) => isQuestReady(questId, progress))) {
    return { objective: { kind: 'turnIn', why: 'quests ready to turn in' }, skipped }
  }
  return { objective: null, skipped }
}

function objectiveForGoal(goal: StoryGoal, player: MissionPlayer, maxFloor: number, why: string): Objective | string {
  switch (goal.kind) {
    case 'visit':
      return goal.areaId ? { kind: 'visit', areaId: goal.areaId, why } : 'no area given'
    case 'kill':
    case 'collect': {
      const monsterId = goal.kind === 'kill' ? goal.monsterId : goal.from
      const areaId = monsterId ? huntAreaFor(monsterId, player.level, maxFloor) : null
      return areaId ? { kind: 'hunt', areaId, why } : `no safe area for ${monsterId} at Lv${player.level}`
    }
    case 'level': {
      const areaId = safeAreaFor(player.level, 'field', maxFloor)
      return areaId ? { kind: 'hunt', areaId, why: `${why} (reach Lv${goal.level})` } : 'no safe area to level up'
    }
    case 'boss':
      return goal.floor ? { kind: 'boss', floor: goal.floor, why } : 'no floor given'
    default: // clear / reaper / console / fight: story scenes the bot doesn't play
      return `needs you (${goal.kind}${goal.areaId ? ` in ${goal.areaId}` : ''})`
  }
}
