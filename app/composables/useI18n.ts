// EN / 中文 strings. `lang` is a module-level ref so every component shares it.
import { ITEMS } from '#shared/game-rules'
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
    resumeBot: 'Resume bot', reconnect: 'Reconnect', healthPotions: 'Health & potions', showPassword: 'Show password', rawCommand: 'Raw command…',
    removeAccount: 'Remove from dashboard', close: 'Close', cancel: 'Cancel', save: 'Save',
    farm: 'Farm', boss: 'Boss', mission: 'Mission', potion: 'Potion', keep: 'keep',
    // health & potions settings
    safetyOn: 'Safety loop on (heals and retreats by itself)', healMode: 'Who drinks potions',
    healModeBot: 'The bot drinks at the HP % below', healModeCrystal: 'The game auto-drinks; the bot steps in only for emergencies and crystals',
    healAtHp: 'Heal when HP drops below (%)', normalFight: 'Normal', bossFight: 'Boss',
    thresholdPotion: 'Potion', thresholdEmergency: 'Emergency heal (瞬補)', thresholdCrystal: 'Crystal (at least 10)',
    autoRestock: 'Restock by itself when low', restockTitle: 'Restock: when below → buy up to',
    restockBelow: 'Below', restockUpTo: 'Up to', autoDrinkItem: 'Default potion', healCrystal: 'Heal crystal', teleportCrystal: 'Teleport crystal',
    maxSpendPct: 'Spend at most (% of gold)', settingsSaved: 'Settings saved',
    unsafeConfirm: '{message}.\n\nLower thresholds make death more likely. Save anyway?', keepingPotions: 'Keeping {count} potions',
    potionHint: 'Which potion the game drinks, and how many to keep. Restock tops back up when below half.',
    // alerts
    alert_disconnected: 'Disconnected — reconnecting…', alert_queued: 'Server full — queued (#{pos})',
    alert_ended_unauthorized: 'Login rejected — re-add this account or save its password', alert_ended_replaced: 'Logged in somewhere else — press ⟳ to take over',
    alert_ended_kicked: 'Kicked by the server', alert_ended_banned: 'Banned by the server', alert_ended_idleKick: 'Disconnected for idling in town — press ⟳',
    alert_ended_dead: 'Character died', alert_ended_other: 'The server ended the session ({reason})',
    alert_dead: 'Character is dead!', alert_nearDeath: 'Danger: HP {hp}%', alert_halted: 'Bot stopped itself after {count} close calls in 5 min',
    alert_stockBlocked: 'Not enough gold for {items} (budget {budget} 摳)', alert_stockLow: 'Running low: {items}', alert_noFarmArea: 'No safe area to farm at this level',
    doing_idle: 'Idle', doing_hunting: 'Farming', doing_boss: 'Boss fight',
    leader: 'Leader', tank: 'Tank', addMember: '+ Add member…', noFree: 'No free characters',
    goalFloor: 'Goal floor', goalAreaKind: 'Goal area kind', startParty: 'Start party', huntHere: 'Hunt here',
    hold: 'Hold (no fighting)', stopParty: 'Stop party', deleteParty: 'Delete party', settings: 'Settings',
    retreatLabel: 'Tank retreat HP %', syncInGame: 'Also form the party in-game',
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
    resumeBot: '恢復機器人', reconnect: '重新連線', healthPotions: '血量與補藥', showPassword: '顯示密碼', rawCommand: '原始指令…',
    removeAccount: '從儀表板移除', close: '關閉', cancel: '取消', save: '儲存',
    farm: '練功', boss: '王戰', mission: '任務', potion: '藥水', keep: '保持',
    // 血量與補藥設定
    safetyOn: '開啟安全保護（自動補血、撤退）', healMode: '由誰喝藥水',
    healModeBot: '機器人依下方 HP% 喝藥水', healModeCrystal: '遊戲自動喝藥；機器人只負責緊急補血與水晶',
    healAtHp: 'HP 低於多少 % 時補血', normalFight: '一般', bossFight: '王戰',
    thresholdPotion: '藥水', thresholdEmergency: '瞬補', thresholdCrystal: '水晶（至少 10）',
    autoRestock: '補給不足時自動補貨', restockTitle: '補貨：低於 → 補到',
    restockBelow: '低於', restockUpTo: '補到', autoDrinkItem: '預設藥水', healCrystal: '回復水晶', teleportCrystal: '轉移水晶',
    maxSpendPct: '最多花費（金錢 %）', settingsSaved: '設定已儲存',
    unsafeConfirm: '{message}。\n\n門檻調低會更容易死亡，仍要儲存嗎？', keepingPotions: '保持 {count} 瓶藥水',
    potionHint: '遊戲自動喝哪種藥水，以及要保持幾瓶。低於一半時會自動補貨。',
    // 警示
    alert_disconnected: '連線中斷，正在重新連線…', alert_queued: '伺服器已滿，排隊中（第 {pos} 位）',
    alert_ended_unauthorized: '登入被拒 — 請重新加入此帳號，或保存密碼', alert_ended_replaced: '已在其他地方登入 — 按 ⟳ 接手',
    alert_ended_kicked: '被伺服器踢出', alert_ended_banned: '帳號已被封鎖', alert_ended_idleKick: '在城鎮閒置太久被斷線 — 按 ⟳ 重新連線',
    alert_ended_dead: '角色已死亡', alert_ended_other: '伺服器結束了連線（{reason}）',
    alert_dead: '角色已死亡！', alert_nearDeath: '危險：HP 只剩 {hp}%', alert_halted: '5 分鐘內 {count} 次險情，機器人已自動停止',
    alert_stockBlocked: '金錢不足，買不起 {items}（預算 {budget} 摳）', alert_stockLow: '補給偏低：{items}', alert_noFarmArea: '目前等級沒有安全的練功地點',
    doing_idle: '待機', doing_hunting: '練功中', doing_boss: '王戰中',
    leader: '隊長', tank: '坦', addMember: '+ 新增隊員…', noFree: '無空閒角色',
    goalFloor: '目標樓層', goalAreaKind: '目標區域類型', startParty: '出發', huntHere: '就地開打',
    hold: '待命（不戰鬥）', stopParty: '停止隊伍', deleteParty: '刪除隊伍', settings: '設定',
    retreatLabel: '坦退避HP %', syncInGame: '同時在遊戲內組隊',
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
  return { lang, t, alertText, toggleLang }
}
