// What each per-account button on the dashboard does.

import { areaLevel, parseArea, safeAreaFor } from '#shared/game-rules'
import type { AccountAction } from '#shared/types'
import type { CommandResult, GameCommand } from '../sao/connector'
import type { Session } from './session'

export interface ActionRequest { action: AccountAction, areaId?: string, command?: GameCommand }

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
        const targetAreaId = safeAreaFor(player.level, body.action === 'startBoss' ? 'bossroom' : 'field')
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
    case 'stopHunt':
    case 'stopBoss':
      if (session.busyLabel) return busyError
      return session.command(body.action, {}, 'dashboard')
    case 'completeMission': {
      if (session.busyLabel) return busyError
      const weapon = session.preferredWeapon
      return session.command('completeMission', weapon ? { questType: 'uniqueWeapon', weapon } : {}, 'dashboard')
    }
    case 'town': // emergency teleport crystal; skips the lock on purpose
      if (!((player?.inventory?.['crystal-teleport'] ?? 0) > 0)) return { error: 'No teleport crystals' }
      return session.command('use', { itemId: 'crystal-teleport' }, 'dashboard')
    case 'goto': {
      const areaId = body.areaId
      if (!areaId || !parseArea(areaId)) return { error: 'Unknown area id (expected like f40-field)' }
      const monsterLevel = areaLevel(areaId) ?? 0
      if (parseArea(areaId)!.kind !== 'town' && player && monsterLevel >= player.level) {
        return { error: `${areaId} is monster level ${monsterLevel} — too dangerous for Lv${player.level}` }
      }
      if (session.busyLabel) return busyError
      session.withLock(`go to ${areaId}`, () => session.goTo(areaId))
        .then((result) => result?.error && session.log('error', `Travel: ${result.error}`))
      return { ok: true, isStarted: true }
    }
    case 'restock':
      if (session.busyLabel) return busyError
      session.restock().then((result) => result?.error && session.log('error', `Restock: ${(result as CommandResult).detail || result.error}`))
      return { ok: true, isStarted: true }
    case 'resume':
      session.resume()
      return { ok: true }
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
