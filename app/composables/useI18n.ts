// EN / 中文 strings. `lang` is a module-level ref so every component shares it.
import { ITEMS, WORLD_AREAS } from '#shared/game-rules'
import type { Alert } from '#shared/types'

const MESSAGES = {
  en: {
    addAccount: '+ Add account', pauseAll: 'Pause all', parties: 'Parties', active: 'active',
    newParty: '+ New', partyNamePlaceholder: 'Party name', create: 'Create', noParties: 'No parties yet.',
    characters: 'Characters', noAccounts: 'No characters yet. Use "+ Add account" to log in or create one.',
    eventLog: 'Event log', filterByAccount: 'Character to show and command', allAccounts: 'All characters',
    logPlaceholder: 'Next step', send: 'Send', hideLog: 'Hide', showLog: 'Show',
    logHelp: 'farm 10 · stop · goto f1-west · town · restock · resume · rise · {raw json}',
    weaponGoal: 'Unique weapon goal', skills: 'Skills', equipment: 'Equipment', none: 'None', noData: 'Not available yet',
    resumeBot: 'Resume bot', reconnect: 'Reconnect', healthPotions: 'Health & potions', showPassword: 'Show password',
    removeAccount: 'Remove from dashboard', close: 'Close', cancel: 'Cancel', save: 'Save',
    farm: 'Farm', boss: 'Boss', mission: 'Mission', potion: 'Potion',
    partyStatus_off: 'Off', partyStatus_starting: 'Starting…', partyStatus_waitLeader: 'Waiting for leader {name} to connect',
    partyStatus_waitMembers: 'Waiting for {names}', partyStatus_pulledBack: 'Too dangerous — pulled back to town', partyStatus_halted: 'Holding — {name} stopped itself',
    partyStatus_moving: 'Moving', partyStatus_rest: 'Resting', partyStatus_standby: 'Standing by', partyStatus_fight: 'Fighting', partyStatus_fightBoss: 'Boss fight',
    partyStatus_tankWaiting: 'Waiting for tank {name} to start', partyStatus_tankLow: 'Tank {name} low ({hp}%) — others wait', partyStatus_error: 'Error: {message}', partyStatus_lowPotions: '{name} is low on potions ({count}/{needed}) — no boss fight',
    inParty: 'In party', previousAccounts: 'Previously added', oneClickLogin: 'password saved — click to log in', needsPassword: 'click, then type the password', forget: 'Forget (also deletes its saved password)', addedAccount: '{name} added', deadMask: 'Dead', confirmRemoveAccount: 'Remove {name} from the dashboard? The game account itself is not deleted.', removedAccount: '{name} removed', aggressive: 'aggressive', goTo: 'Go', partyState: 'Party state', partyMoving: 'Party on the way',
    partyMode_rest: 'Rest', partyMode_standby: 'Standby', partyMode_fight: 'Fight',
    // health & potions settings
    safetyOn: 'Safety loop on (heals and retreats by itself)', healMode: 'Who drinks potions',
    healModeBot: 'The bot drinks at the HP % below', healModeCrystal: 'The game auto-drinks; the bot steps in only for emergencies and crystals',
    healAtHp: 'Heal when HP drops below (%)', normalFight: 'Normal', bossFight: 'Boss',
    thresholdPotion: 'Potion', thresholdEmergency: 'Emergency heal (瞬補)', thresholdCrystal: 'Crystal (at least 10)',
    autoRestock: 'Restock by itself when low', restockTitle: 'Restock: when below → buy up to',
    restockBelow: 'Below', restockUpTo: 'Up to', healCrystal: 'Heal crystal', teleportCrystal: 'Teleport crystal',
    maxSpendPct: 'Spend at most (% of gold)', settingsSaved: 'Settings saved',
    unsafeConfirm: '{message}.\n\nLower thresholds make death more likely. Save anyway?',
    potionHint: 'Recovery potion: what the game auto-drinks. Instant potion: what the bot keeps stocked for emergency heals (瞬補). How many to keep is in Health & potions.',
    recoveryPotion: 'Recovery potion', instantPotion: 'Instant potion (瞬補)',
    // alerts
    alert_disconnected: 'Disconnected — reconnecting…', alert_queued: 'Server full — queued (#{pos})',
    alert_ended_unauthorized: 'Login rejected — re-add this account or save its password', alert_ended_replaced: 'Logged in somewhere else — press ⟳ to take over',
    alert_ended_kicked: 'Kicked by the server', alert_ended_banned: 'Banned by the server', alert_ended_idleKick: 'Disconnected for idling in town — press ⟳',
    alert_ended_dead: 'Character died', alert_ended_other: 'The server ended the session ({reason})',
    alert_dead: 'Character is dead!', alert_nearDeath: 'Danger: HP {hp}%', alert_halted: 'Bot stopped itself after {count} close calls in 5 min',
    alert_stockBlocked: 'Not enough gold for {items} (budget {budget} 摳)', alert_stockLow: 'Running low: {items}', alert_noFarmArea: 'No safe area to farm at this level',
    doing_idle: 'Idle', doing_hunting: 'Farming', doing_boss: 'Boss fight',
    leader: 'Leader', tank: 'Tank', addMember: '+ Add member…', noFree: 'No free characters', members: 'Members', remove: 'Remove',
    goalFloor: 'Goal floor', goalAreaKind: 'Location',
    deleteParty: 'Delete party', settings: 'Settings',
    retreatLabel: 'Tank retreat HP %',
    noMembers: 'No members yet', untank: 'Untank', online: 'Online', totalGold: 'Total 摳',
    goldPerHour: '摳 / hour', activeParties: 'Active parties', alerts: 'Alerts',
    loginTab: 'Log in existing', createTab: 'Create new', accountId: 'Account', password: 'Password',
    characterName: 'Character name', rememberPassword: 'Keep the password (encrypted) so the dashboard can log in again by itself',
    logIn: 'Log in', createAccount: 'Create account', copy: 'Copy',
    createHint: 'A strong password is generated for you and shown once. It is also saved encrypted in the dashboard vault.',
    passwordFor: 'Password for',
  },
  zh: {
    addAccount: '+ 新增角色', pauseAll: '全部暫停', parties: '隊伍', active: '啟用中',
    newParty: '+ 新增', partyNamePlaceholder: '隊伍名稱', create: '建立', noParties: '尚無隊伍。',
    characters: '角色', noAccounts: '尚無角色，使用「+ 新增角色」登入或建立。',
    eventLog: '事件紀錄', filterByAccount: '顯示及指揮的角色', allAccounts: '全部角色',
    logPlaceholder: '下一步', send: '送出', hideLog: '收起', showLog: '展開',
    logHelp: 'farm 10 · stop · goto f1-west · town · restock · resume · rise · {原始 json}',
    weaponGoal: '專武目標', skills: '技能', equipment: '裝備', none: '無', noData: '暫無資料',
    resumeBot: '恢復機器人', reconnect: '重新連線', healthPotions: '血量與補藥', showPassword: '顯示密碼',
    removeAccount: '從儀表板移除', close: '關閉', cancel: '取消', save: '儲存',
    farm: '練功', boss: '王戰', mission: '任務', potion: '藥水',
    partyStatus_off: '未啟動', partyStatus_starting: '啟動中…', partyStatus_waitLeader: '等待隊長 {name} 連線',
    partyStatus_waitMembers: '等待 {names} 上線', partyStatus_pulledBack: '太危險，已撤回城鎮', partyStatus_halted: '暫停 — {name} 的機器人已自動停止',
    partyStatus_moving: '移動中', partyStatus_rest: '休息', partyStatus_standby: '待命', partyStatus_fight: '戰鬥中', partyStatus_fightBoss: '王戰中',
    partyStatus_tankWaiting: '等待坦 {name} 開打', partyStatus_tankLow: '坦 {name} 血量低（{hp}%）— 其他人等待', partyStatus_error: '錯誤：{message}', partyStatus_lowPotions: '{name} 藥水不足（{count}/{needed}），不開王戰',
    inParty: '組隊中', previousAccounts: '曾經加入的帳號', oneClickLogin: '已保存密碼 — 點一下即可登入', needsPassword: '點一下後輸入密碼', forget: '忘記（同時刪除保存的密碼）', addedAccount: '已加入 {name}', deadMask: '已死亡', confirmRemoveAccount: '要從儀表板移除 {name} 嗎？遊戲帳號本身不會被刪除。', removedAccount: '已移除 {name}', aggressive: '主動攻擊', goTo: '前往', partyState: '隊伍狀態', partyMoving: '隊伍出發',
    partyMode_rest: '休息', partyMode_standby: '待命', partyMode_fight: '戰鬥',
    // 血量與補藥設定
    safetyOn: '開啟安全保護（自動補血、撤退）', healMode: '由誰喝藥水',
    healModeBot: '機器人依下方 HP% 喝藥水', healModeCrystal: '遊戲自動喝藥；機器人只負責緊急補血與水晶',
    healAtHp: 'HP 低於多少 % 時補血', normalFight: '一般', bossFight: '王戰',
    thresholdPotion: '藥水', thresholdEmergency: '瞬補', thresholdCrystal: '水晶（至少 10）',
    autoRestock: '補給不足時自動補貨', restockTitle: '補貨：低於 → 補到',
    restockBelow: '低於', restockUpTo: '補到', healCrystal: '回復水晶', teleportCrystal: '轉移水晶',
    maxSpendPct: '最多花費（金錢 %）', settingsSaved: '設定已儲存',
    unsafeConfirm: '{message}。\n\n門檻調低會更容易死亡，仍要儲存嗎？',
    potionHint: '回復藥水：遊戲自動喝的藥水。瞬補藥水：機器人緊急補血時用、並自動補貨的藥水。要保持幾瓶請到「血量與補藥」設定。',
    recoveryPotion: '回復藥水', instantPotion: '瞬補藥水',
    // 警示
    alert_disconnected: '連線中斷，正在重新連線…', alert_queued: '伺服器已滿，排隊中（第 {pos} 位）',
    alert_ended_unauthorized: '登入被拒 — 請重新加入此帳號，或保存密碼', alert_ended_replaced: '已在其他地方登入 — 按 ⟳ 接手',
    alert_ended_kicked: '被伺服器踢出', alert_ended_banned: '帳號已被封鎖', alert_ended_idleKick: '在城鎮閒置太久被斷線 — 按 ⟳ 重新連線',
    alert_ended_dead: '角色已死亡', alert_ended_other: '伺服器結束了連線（{reason}）',
    alert_dead: '角色已死亡！', alert_nearDeath: '危險：HP 只剩 {hp}%', alert_halted: '5 分鐘內 {count} 次險情，機器人已自動停止',
    alert_stockBlocked: '金錢不足，買不起 {items}（預算 {budget} 摳）', alert_stockLow: '補給偏低：{items}', alert_noFarmArea: '目前等級沒有安全的練功地點',
    doing_idle: '待機', doing_hunting: '練功中', doing_boss: '王戰中',
    leader: '隊長', tank: '坦', addMember: '+ 新增隊員…', noFree: '無空閒角色', members: '隊員', remove: '移除',
    goalFloor: '目標樓層', goalAreaKind: '地點',
    deleteParty: '刪除隊伍', settings: '設定',
    retreatLabel: '坦退避HP %',
    noMembers: '尚無隊員', untank: '解除坦', online: '上線', totalGold: '總摳',
    goldPerHour: '摳/時', activeParties: '啟用隊伍', alerts: '警示',
    loginTab: '登入既有帳號', createTab: '建立新帳號', accountId: '帳號', password: '密碼',
    characterName: '角色名稱', rememberPassword: '保存密碼（加密），讓儀表板可自動重新登入',
    logIn: '登入', createAccount: '建立帳號', copy: '複製',
    createHint: '系統會產生高強度密碼並只顯示一次，同時加密保存在儀表板中。',
    passwordFor: '密碼：',
  },
} as const

export type Lang = keyof typeof MESSAGES
export type MessageKey = keyof typeof MESSAGES.en

const lang = ref<Lang>('en')
if (import.meta.client) {
  try { if (localStorage.getItem('sao-lang') === 'zh') lang.value = 'zh' } catch { /* storage blocked */ }
}

export function useI18n() {
  // t('alert_nearDeath', { hp: 12 }) fills {hp}.
  const t = (key: MessageKey | string, params: Record<string, string | number> = {}): string => {
    const template = (MESSAGES[lang.value] as Record<string, string>)[key] ?? (MESSAGES.en as Record<string, string>)[key] ?? key
    return template.replace(/\{(\w+)\}/g, (match, name: string) => String(params[name] ?? match))
  }
  // Server alerts come as a code + values; item ids become item names.
  const alertText = (alert: Alert): string => {
    const key = `alert_${alert.code}`
    if (!(key in MESSAGES.en)) return alert.text
    const params = { ...alert.params }
    if (typeof params.items === 'string') {
      params.items = params.items.split(',').map((itemId) => ITEMS[itemId]?.name ?? itemId).join(lang.value === 'zh' ? '、' : ', ')
    }
    return t(key, params)
  }
  const toggleLang = () => {
    lang.value = lang.value === 'en' ? 'zh' : 'en'
    try { localStorage.setItem('sao-lang', lang.value) } catch { /* storage blocked */ }
  }
  // An area's name in the current language; with level info for pickers ("稀飯原野 · Lv1–2").
  const areaName = (areaId: string | null | undefined): string => {
    const area = WORLD_AREAS[areaId ?? '']
    if (!area) return areaId ?? '—'
    return (lang.value === 'zh' && area.nameZh) || area.name
  }
  const areaLabel = (areaId: string): string => {
    const area = WORLD_AREAS[areaId]
    if (!area || area.maxLevel == null) return areaName(areaId)
    return `${areaName(areaId)} · Lv${area.minLevel ?? area.maxLevel}–${area.maxLevel}${area.aggressive ? ` · ${t('aggressive')}` : ''}`
  }
  const partyStatusText = (status: { code: string, params?: Record<string, string | number>, text: string }) =>
    (`partyStatus_${status.code}` in MESSAGES.en ? t(`partyStatus_${status.code}`, status.params) : status.text)
  return { lang, t, alertText, areaName, areaLabel, partyStatusText, toggleLang }
}
