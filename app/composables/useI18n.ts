// EN / 中文 strings. `lang` is a module-level ref so every component shares it.

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
  const t = (key: MessageKey | string): string =>
    (MESSAGES[lang.value] as Record<string, string>)[key] ?? (MESSAGES.en as Record<string, string>)[key] ?? key
  const toggleLang = () => {
    lang.value = lang.value === 'en' ? 'zh' : 'en'
    try { localStorage.setItem('sao-lang', lang.value) } catch { /* storage blocked */ }
  }
  return { lang, t, toggleLang }
}
