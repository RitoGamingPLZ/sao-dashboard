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
    case 'startHunt':
    case 'startBoss': {
      if (session.busyLabel) return busyError
      if (!player) return { error: 'disconnected' }
      // There's no manual "go to" for Farm/Boss: auto-travel to a safe area first if in town.
      if (parseArea(player.areaId)?.kind === 'town') {
        const targetAreaId = safeAreaFor(player.level, body.action === 'startBoss' ? 'bossroom' : 'field', frontierFloor(player.clearedFloors))
        if (!targetAreaId) return { error: 'noSafeArea' }
        session.withLock(`go to ${targetAreaId}`, () => session.goTo(targetAreaId))
          .then(async (result) => {
            if (result?.error) return session.log('error', `Travel: ${result.error}`)
            await session.command(body.action as 'startHunt' | 'startBoss', {}, 'dashboard')
          })
        return { ok: true, isStarted: true }
      }
      return session.command(body.action, {}, 'dashboard')
    }
    case 'farm': {
      const untilLevel = body.untilLevel == null ? null : Math.floor(Number(body.untilLevel))
      if (untilLevel != null && !(untilLevel > (player?.level ?? 0) && untilLevel <= 999)) return { error: 'untilLevel must be above the current level' }
      session.setAutoFarm({ untilLevel })
      session.keepFarming().catch((error: Error) => session.log('error', error.message))
      return { ok: true, isStarted: true }
    }
    case 'stopHunt':
    case 'stopBoss':
      if (session.autoFarm) session.setAutoFarm(null)
      if (session.busyLabel) return busyError
      return session.command(body.action, {}, 'dashboard')
    case 'completeMission': {
      if (session.busyLabel) return busyError
      const weapon = session.preferredWeapon
      return session.command('completeMission', weapon ? { questType: 'uniqueWeapon', weapon } : {}, 'dashboard')
    }
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
    case 'refit':
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
