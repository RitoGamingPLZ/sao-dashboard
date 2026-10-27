// What each per-account button on the dashboard does.

import { areaLevel, frontierFloor, isAreaSafeFor, parseArea, safeAreaFor } from '#shared/game-rules'
import type { ActionRequest } from '#shared/types'
import type { CommandResult } from '../sao/connector'
import type { Session } from './session'

export type { ActionRequest }

export async function runAccountAction(session: Session, body: ActionRequest): Promise<CommandResult> {
  const player = session.player
  const busyError = { error: `Account busy: ${session.busyLabel}` }
  switch (body.action) {
    case 'startHunt': {
      if (session.busyLabel) return busyError
      if (!player) return { error: 'disconnected' }
      // Out of town: hunt right here. In town: walk to the best safe field first.
      if (parseArea(player.areaId)?.kind !== 'town') return session.command('startHunt', {}, 'dashboard')
      const targetAreaId = safeAreaFor(player.level, 'field', frontierFloor(player.clearedFloors))
      if (!targetAreaId) return { error: 'noSafeArea' }
      session.withLock(`go to ${targetAreaId}`, () => session.goTo(targetAreaId))
        .then(async (result) => {
          if (result?.error) return session.log('error', `Travel: ${result.error}`)
          await session.command('startHunt', {}, 'dashboard')
        })
      return { ok: true, isStarted: true }
    }
    case 'startBoss': { // 王戰: boss farming on/off — the highest boss it can beat, again and again
      if (session.isBossFarming) { session.setBossFarming(false); return { ok: true } }
      if (!player) return { error: 'disconnected' }
      if (!session.bestBossFloor()) return { error: `No boss to farm yet — ${session.bossBlocker(1)?.error}` }
      session.stopModes()
      session.setBossFarming(true)
      session.keepBossFarming().catch((error: Error) => session.log('error', error.message))
      return { ok: true, isStarted: true }
    }
    case 'farm': {
      const untilLevel = body.untilLevel == null ? null : Math.floor(Number(body.untilLevel))
      if (untilLevel != null && !(untilLevel > (player?.level ?? 0) && untilLevel <= 999)) return { error: 'untilLevel must be above the current level' }
      if (session.mission) session.stopMissions()
      if (session.isBossFarming) session.setBossFarming(false)
      session.setAutoFarm({ untilLevel })
      session.keepFarming().catch((error: Error) => session.log('error', error.message))
      return { ok: true, isStarted: true }
    }
    case 'stopHunt':
    case 'stopBoss':
      session.stopModes()
      if (session.busyLabel) return busyError
      return session.command('stopHunt', {}, 'dashboard')
    case 'completeMission': // 任務: start a mission run, or stop the one in progress
      if (session.mission) { session.stopMissions(); return { ok: true } }
      if (!player) return { error: 'disconnected' }
      session.startMissions()
      return { ok: true, isStarted: true }
    case 'town': // emergency teleport crystal; skips the lock on purpose
      if (session.autoFarm) session.setAutoFarm(null)
      if (!((player?.inventory?.['crystal-teleport'] ?? 0) > 0)) return { error: 'No teleport crystals' }
      return session.command('use', { itemId: 'crystal-teleport' }, 'dashboard')
    case 'goto': {
      const areaId = body.areaId
      if (!areaId || areaLevel(areaId) == null) return { error: 'Unknown area id (expected like f1-west)' }
      if (player && !isAreaSafeFor(areaId, player.level)) {
        const monsterLevel = areaLevel(areaId)
        return { error: `${areaId} is monster level ${monsterLevel} — too dangerous for Lv${player.level}` }
      }
      if (session.busyLabel) return busyError
      session.withLock(`go to ${areaId}`, () => session.goTo(areaId))
        .then((result) => result?.error && session.log('error', `Travel: ${result.error}`))
      return { ok: true, isStarted: true }
    }
    case 'refit': // 修整: pause everything, refit in town, and stay there
      session.stopModes()
      if (session.busyLabel) return busyError
      session.refit().then((result) => result?.error && session.log('error', `Refit: ${result.error}`))
      return { ok: true, isStarted: true }
    case 'restock':
      if (session.busyLabel) return busyError
      session.restock().then((result) => result?.error && session.log('error', `Restock: ${(result as CommandResult).detail || result.error}`))
      return { ok: true, isStarted: true }
    case 'resume':
      session.resume()
      return { ok: true }
    case 'awake':
      session.client.awake()
      session.log('mode', 'Told the game we are still here')
      return { ok: true }
    case 'partyAccept':
      if (!body.name) return { error: 'name is required' }
      return session.client.sendPartyOp('accept', body.name)
    case 'reconnect':
      session.reconnect()
      return { ok: true }
    case 'raw':
      if (session.busyLabel) return busyError
      if (!body.command || typeof body.command.type !== 'string') return { error: 'command.type is required' }
      return session.sendCommand(body.command, 'console')
    default:
      return { error: 'Unknown action' }
  }
}
