// Dashboard UI, built on Vue (vendored locally in vue.esm-browser.prod.js —
// the server's CSP is default-src 'self', so no CDN script and no in-browser
// template compilation, which needs eval/new Function). Templates are
// precompiled offline to render-app.js / render-character-row.js /
// render-party-card.js (see $CLAUDE_JOB_DIR/tmp/compile.mjs from the session
// that built this, using @vue/compiler-dom with mode:'module'); re-run that
// if you edit markup — there's no template string left in this file.
// Listens to the server's live stream and re-renders from each snapshot;
// every control posts an intent to the JSON API.

import { createApp, reactive } from './vue.esm-browser.prod.js';
import { render as renderApp } from './render-app.js';
import { render as renderCharacterRow } from './render-character-row.js';
import { render as renderPartyCard } from './render-party-card.js';

// Reactive so every component that calls t() during its own render gets
// tracked as a dependent and re-renders on toggle, not just the root.
const i18nState = reactive({ lang: localStorage.getItem('sao-lang') === 'zh' ? 'zh' : 'en' });

const WEAPON_TYPES = ['one-handed-sword', 'rapier', 'dual-blades', 'spear', 'two-handed-sword', 'short-sword'];
const MAX_LOG_ROWS = 300;

// ---- i18n -------------------------------------------------------------------

const MESSAGES = {
  en: {
    addAccount: '+ Add account', pauseAll: 'Pause all', parties: 'Parties', active: 'active',
    newParty: '+ New', partyNamePlaceholder: 'Party name', create: 'Create', noParties: 'No parties yet.',
    characters: 'Characters', noAccounts: 'No characters yet. Use "+ Add account" to log in or create one.',
    name: 'Name', lv: 'Lv', hp: 'HP', exp: 'EXP', atk: 'ATK', area: 'Area', doing: 'Doing',
    gold: '摳', expMin: 'EXP/min', actions: 'Actions', eventLog: 'Event log', hide: 'Hide', show: 'Show',
    events: 'events', filterByAccount: 'Filter log by account', allAccounts: 'All accounts',
    weaponGoal: 'Unique weapon goal', skills: 'Skills', equipment: 'Equipment', none: 'None', noData: 'Not available yet',
    resumeBot: 'Resume bot', healthPotions: 'Health & potions', showPassword: 'Show password', rawCommand: 'Raw command…',
    removeAccount: 'Remove from dashboard', close: 'Close',
    farm: 'Farm', boss: 'Boss', mission: 'Mission',
    doing_idle: 'Idle', doing_hunting: 'Farming', doing_boss: 'Boss fight',
    leader: 'Leader', tank: 'Tank', addMember: '+ Add member…', noFree: 'No free characters',
    goalPlaceholder: 'Goal area (blank = leader\'s area)', startParty: 'Start party', huntHere: 'Hunt here',
    hold: 'Hold (no fighting)', stopParty: 'Stop party', deleteParty: 'Delete party',
    retreatLabel: 'Tank retreat HP %', syncLabel: 'Also form the party in-game (experimental)',
    noMembers: 'No members yet', untank: 'Untank', online: 'Online', totalGold: 'Total 摳',
    goldPerHour: '摳 / hour', activeParties: 'Active parties', alerts: 'Alerts',
  },
  zh: {
    addAccount: '+ 新增角色', pauseAll: '全部暫停', parties: '隊伍', active: '啟用中',
    newParty: '+ 新增', partyNamePlaceholder: '隊伍名稱', create: '建立', noParties: '尚無隊伍。',
    characters: '角色', noAccounts: '尚無角色，使用「+ 新增角色」登入或建立。',
    name: '名稱', lv: '等級', hp: 'HP', exp: '經驗', atk: '攻擊', area: '區域', doing: '狀態',
    gold: '摳', expMin: '經驗/分', actions: '操作', eventLog: '事件紀錄', hide: '隱藏', show: '顯示',
    events: '筆事件', filterByAccount: '依角色篩選紀錄', allAccounts: '全部角色',
    weaponGoal: '專武目標', skills: '技能', equipment: '裝備', none: '無', noData: '暫無資料',
    resumeBot: '恢復機器人', healthPotions: '血量與補藥', showPassword: '顯示密碼', rawCommand: '原始指令…',
    removeAccount: '從儀表板移除', close: '關閉',
    farm: '練功', boss: '王戰', mission: '任務',
    doing_idle: '待機', doing_hunting: '練功中', doing_boss: '王戰中',
    leader: '隊長', tank: '坦', addMember: '+ 新增隊員…', noFree: '無空閒角色',
    goalPlaceholder: '目標區域（留空＝跟隨隊長）', startParty: '出發', huntHere: '就地開打',
    hold: '待命（不戰鬥）', stopParty: '停止隊伍', deleteParty: '刪除隊伍',
    retreatLabel: '坦退避HP %', syncLabel: '同步遊戲內隊伍（實驗性）',
    noMembers: '尚無隊員', untank: '解除坦', online: '上線', totalGold: '總摳',
    goldPerHour: '摳/時', activeParties: '啟用隊伍', alerts: '警示',
  },
};

function t(key) {
  return (MESSAGES[i18nState.lang] && MESSAGES[i18nState.lang][key]) ?? MESSAGES.en[key] ?? key;
}

// ---- small helpers -----------------------------------------------------------

const formatNumber = (value) => (value == null ? '—' : Number(value).toLocaleString());
const formatCompact = (value) => (value == null ? '—' : Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(value));
const formatTime = (ts) => new Date(ts).toLocaleTimeString();

async function callApi(method, path, body) {
  const response = await fetch(path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.error) throw Object.assign(new Error(result.error || `HTTP ${response.status}`), { result });
  return result;
}

function showToast(message, tone = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast ${tone}`;
  toast.setAttribute('role', 'status');
  toast.textContent = message;
  document.body.append(toast);
  setTimeout(() => toast.remove(), 4200);
}

async function runAndReport(action, successMessage) {
  try {
    const result = await action();
    if (successMessage) showToast(successMessage);
    return result;
  } catch (error) {
    showToast(error.message, 'error');
    return null;
  }
}

const Api = {
  accountAction: (accountId, action, extra = {}) => runAndReport(() => callApi('POST', `/api/accounts/${accountId}/action`, { action, ...extra })),
  updateParty: (partyId, changes) => runAndReport(() => callApi('PUT', `/api/parties/${partyId}`, changes)),
};

const modeOf = (account) => {
  const activity = account.player?.activity;
  return activity === 'hunting' ? 'farm' : activity === 'boss' ? 'boss' : 'idle';
};

const hpBarClass = (account) => {
  const hpPct = account.player?.hpPct;
  if (hpPct == null) return 'sb-hp';
  const thresholds = account.player.activity === 'boss' ? account.safety.boss : account.safety.normal;
  if (hpPct > thresholds.potionPct + 15) return 'sb-hp';
  return hpPct <= thresholds.emergencyPct ? 'sb-hp low' : 'sb-hp warn';
};

// ---- CharacterRow: one <tr> per account; shared by the Characters table and party member lists ----

const CharacterRow = {
  props: { account: { type: Object, required: true } },
  emits: ['open-profile'],
  computed: {
    mode() { return modeOf(this.account); },
    statusDotState() {
      if (!this.account.isConnected) return 'down';
      return this.account.isStale ? 'stale' : 'live';
    },
    hpFillStyle() { return { width: `${Math.max(0, Math.min(100, this.account.player?.hpPct ?? 0))}%` }; },
    hpBarClass() { return hpBarClass(this.account); },
  },
  methods: {
    t, fmt: formatNumber, fmtCompact: formatCompact,
    doingLabel(account) { return account.player ? t(`doing_${account.player.activity || 'idle'}`) : '—'; },
    toggleFarm() {
      Api.accountAction(this.account.id, this.mode === 'farm' ? 'stopHunt' : 'startHunt');
    },
    toggleBoss() {
      Api.accountAction(this.account.id, this.mode === 'boss' ? 'stopBoss' : 'startBoss');
    },
    doMission() {
      Api.accountAction(this.account.id, 'completeMission');
    },
  },
  render: renderCharacterRow,
};

// ---- PartyCard ----------------------------------------------------------------

const PartyCard = {
  components: { CharacterRow },
  props: { party: { type: Object, required: true }, accounts: { type: Array, required: true }, takenIds: { type: Set, required: true } },
  emits: ['open-profile'],
  data() {
    return { goalAreaId: this.party.goal?.areaId || '', addMemberId: '' };
  },
  computed: {
    freeAccounts() { return this.accounts.filter((account) => !this.takenIds.has(account.id)); },
    members() {
      return this.party.memberIds
        .map((id) => this.accounts.find((account) => account.id === id))
        .filter(Boolean);
    },
  },
  methods: {
    t,
    accountName(id) { return this.accounts.find((account) => account.id === id)?.name ?? '?'; },
    addMember() {
      if (!this.addMemberId) return;
      Api.updateParty(this.party.id, { memberIds: [...this.party.memberIds, this.addMemberId] });
      this.addMemberId = '';
    },
    removeMember(id) { Api.updateParty(this.party.id, { memberIds: this.party.memberIds.filter((memberId) => memberId !== id) }); },
    makeLeader(id) { Api.updateParty(this.party.id, { leaderId: id }); },
    makeTank(id) { Api.updateParty(this.party.id, { tankId: id }); },
    untank() { Api.updateParty(this.party.id, { tankId: null }); },
    updateRetreat(event) { Api.updateParty(this.party.id, { tankRetreatPct: Number(event.target.value) }); },
    toggleSync(event) { Api.updateParty(this.party.id, { shouldSyncInGame: event.target.checked }); },
    startParty(shouldHunt) {
      const areaId = this.goalAreaId.trim() || undefined;
      const path = this.party.isActive ? `/api/parties/${this.party.id}/goal` : `/api/parties/${this.party.id}/start`;
      const body = this.party.isActive ? { areaId, shouldHunt } : { goal: { areaId, shouldHunt } };
      runAndReport(() => callApi('POST', path, body), shouldHunt ? 'Party heading out' : 'Party holding');
    },
    stopParty() { runAndReport(() => callApi('POST', `/api/parties/${this.party.id}/stop`, {}), 'Party stopped'); },
    deleteParty() {
      if (confirm(`${t('deleteParty')} "${this.party.name}"?`)) runAndReport(() => callApi('DELETE', `/api/parties/${this.party.id}`), 'Party deleted');
    },
  },
  render: renderPartyCard,
};

// ---- root app -----------------------------------------------------------------

const app = createApp({
  components: { CharacterRow, PartyCard },
  data() {
    return {
      snapshot: { accounts: [], parties: [] },
      logEvents: [],
      isLogOpen: false,
      logFilter: '',
      isAddingParty: false,
      newPartyName: '',
      i18nState,
      linkState: 'connecting',
      profileAccountId: null,
      weaponTypes: WEAPON_TYPES,
      settingsAccountId: null,
    };
  },
  computed: {
    linkLabel() {
      return { connecting: 'connecting…', live: 'live', down: 'dashboard offline — retrying' }[this.linkState];
    },
    overviewTiles() {
      const accounts = this.snapshot.accounts;
      const onlineCount = accounts.filter((account) => account.isConnected).length;
      const totalGold = accounts.reduce((sum, account) => sum + (account.player?.gold ?? 0), 0);
      const goldPerHour = accounts.reduce((sum, account) => sum + (account.rates.goldPerHour ?? 0), 0);
      const alertCount = accounts.reduce((sum, account) => sum + account.alerts.length, 0);
      return [
        { label: this.t('online'), value: `${onlineCount} / ${accounts.length}` },
        { label: this.t('totalGold'), value: formatCompact(totalGold) },
        { label: this.t('goldPerHour'), value: goldPerHour ? formatCompact(goldPerHour) : '—' },
        { label: this.t('activeParties'), value: String(this.activePartiesCount) },
        { label: this.t('alerts'), value: String(alertCount), tone: alertCount ? 'warn' : '' },
      ];
    },
    activePartiesCount() { return this.snapshot.parties.filter((party) => party.isActive).length; },
    takenAccountIds() { return new Set(this.snapshot.parties.flatMap((party) => party.memberIds)); },
    latestAlert() {
      const withAlert = [...this.logEvents].reverse().find((event) => event.kind === 'alert' || event.kind === 'error');
      return withAlert ? `${withAlert.account}: ${withAlert.detail}` : '';
    },
    visibleLogEvents() {
      return this.logEvents.filter((event) => !this.logFilter || event.accountId === this.logFilter).slice(-120).reverse();
    },
    profileAccount() { return this.snapshot.accounts.find((account) => account.id === this.profileAccountId) || null; },
  },
  methods: {
    t,
    formatTime,
    toggleLang() {
      i18nState.lang = i18nState.lang === 'en' ? 'zh' : 'en';
      localStorage.setItem('sao-lang', i18nState.lang);
    },
    openAddAccountDialog() { document.getElementById('add-account-dialog').showModal(); },
    pauseAll() {
      if (confirm('Stop every party and every hunt?')) runAndReport(() => callApi('POST', '/api/pause-all', {}), 'Everything paused');
    },
    createParty() {
      if (!this.newPartyName.trim()) return;
      runAndReport(() => callApi('POST', '/api/parties', { name: this.newPartyName }), 'Party created').then(() => {
        this.newPartyName = '';
        this.isAddingParty = false;
      });
    },
    openProfile(accountId) {
      this.profileAccountId = accountId;
      this.$refs.profileDialog.showModal();
    },
    accountAction(account, action, extra) { return Api.accountAction(account.id, action, extra); },
    setWeapon(account, weapon) { runAndReport(() => callApi('PUT', `/api/accounts/${account.id}/weapon`, { weapon: weapon || null })); },
    async showPassword(account) {
      const result = await runAndReport(() => callApi('POST', `/api/accounts/${account.id}/password`, {}));
      if (result) prompt(`Password for ${account.name} (copy it now):`, result.password);
    },
    rawCommand(account) {
      const commandText = prompt('Command JSON, e.g. {"type":"startHunt"}');
      if (!commandText) return;
      let command;
      try { command = JSON.parse(commandText); } catch { return showToast('That is not valid JSON', 'error'); }
      runAndReport(() => callApi('POST', `/api/accounts/${account.id}/action`, { action: 'raw', command }), 'Sent');
    },
    removeAccount(account) {
      if (confirm(`Remove ${account.name}? The game account itself is not deleted.`)) {
        runAndReport(() => callApi('DELETE', `/api/accounts/${account.id}`), 'Removed').then(() => {
          this.$refs.profileDialog.close();
        });
      }
    },
    openSettings(account) {
      this.settingsAccountId = account.id;
      const dialog = document.getElementById('settings-dialog');
      const form = document.getElementById('settings-form');
      form.querySelector('[data-account-name]').textContent = account.name;
      form.querySelector('[data-error]').textContent = '';
      const safety = account.safety;
      form.elements.isEnabled.checked = safety.isEnabled;
      form.elements.isAutoRestockOn.checked = safety.isAutoRestockOn;
      form.elements.healMode.value = safety.healMode;
      for (const input of form.querySelectorAll('input[name*="."]')) {
        const [group, key] = input.name.split('.');
        input.value = safety[group][key];
      }
      dialog.showModal();
    },
    connectStream() {
      const stream = new EventSource('/api/stream');
      stream.addEventListener('open', () => { this.linkState = 'live'; });
      stream.addEventListener('error', () => { this.linkState = 'down'; });
      stream.addEventListener('snapshot', (message) => { this.snapshot = JSON.parse(message.data); });
      stream.addEventListener('log', (message) => {
        this.logEvents.push(JSON.parse(message.data));
        if (this.logEvents.length > MAX_LOG_ROWS) this.logEvents.shift();
      });
    },
    setupAddAccountDialog() {
      const dialog = document.getElementById('add-account-dialog');
      const loginForm = document.getElementById('login-form');
      const createForm = document.getElementById('create-form');
      for (const closeButton of dialog.querySelectorAll('[data-close]')) closeButton.addEventListener('click', () => dialog.close());
      dialog.addEventListener('close', () => {
        loginForm.reset();
        createForm.reset();
        createForm.querySelector('[data-password]').hidden = true;
        createForm.querySelector('[data-password-value]').textContent = '';
        for (const errorLine of dialog.querySelectorAll('[data-error]')) errorLine.textContent = '';
      });
      for (const tab of dialog.querySelectorAll('[data-tab]')) {
        tab.addEventListener('click', () => {
          for (const otherTab of dialog.querySelectorAll('[data-tab]')) otherTab.setAttribute('aria-selected', String(otherTab === tab));
          loginForm.hidden = tab.dataset.tab !== 'login';
          createForm.hidden = tab.dataset.tab !== 'create';
        });
      }
      loginForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const formData = new FormData(loginForm);
        const errorLine = loginForm.querySelector('[data-error]');
        errorLine.textContent = 'Logging in…';
        try {
          const result = await callApi('POST', '/api/accounts/login', {
            name: formData.get('name'),
            password: formData.get('password'),
            shouldRememberPassword: formData.get('shouldRememberPassword') === 'on',
          });
          dialog.close();
          showToast(`${result.name} added`);
        } catch (error) {
          errorLine.textContent = error.message;
        }
      });
      createForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const formData = new FormData(createForm);
        const errorLine = createForm.querySelector('[data-error]');
        errorLine.textContent = 'Creating…';
        try {
          const result = await callApi('POST', '/api/accounts/create', { name: formData.get('name') });
          errorLine.textContent = '';
          createForm.querySelector('[data-password-name]').textContent = result.name;
          createForm.querySelector('[data-password-value]').textContent = result.password;
          createForm.querySelector('[data-password]').hidden = false;
          showToast(`${result.name} created — copy the password now`);
        } catch (error) {
          errorLine.textContent = error.message;
        }
      });
      createForm.querySelector('[data-copy]').addEventListener('click', async () => {
        const password = createForm.querySelector('[data-password-value]').textContent;
        try { await navigator.clipboard.writeText(password); showToast('Password copied'); } catch { showToast('Copy failed — select it by hand', 'error'); }
      });
    },
    setupSettingsDialog() {
      const dialog = document.getElementById('settings-dialog');
      const form = document.getElementById('settings-form');
      form.querySelector('[data-close]').addEventListener('click', () => dialog.close());
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const errorLine = form.querySelector('[data-error]');
        const update = {
          isEnabled: form.elements.isEnabled.checked,
          isAutoRestockOn: form.elements.isAutoRestockOn.checked,
          healMode: form.elements.healMode.value,
          normal: {}, boss: {}, restock: {},
        };
        for (const input of form.querySelectorAll('input[name*="."]')) {
          const [group, key] = input.name.split('.');
          update[group][key] = Number(input.value);
        }
        const save = (isUnsafeConfirmed) => callApi('PUT', `/api/accounts/${this.settingsAccountId}/safety`, { safety: update, isUnsafeConfirmed });
        try {
          await save(false);
        } catch (error) {
          if (!error.result?.needsConfirm) { errorLine.textContent = error.message; return; }
          if (!confirm(`${error.message}.\n\nLower thresholds make death more likely. Save anyway?`)) return;
          try { await save(true); } catch (retryError) { errorLine.textContent = retryError.message; return; }
        }
        dialog.close();
        showToast('Settings saved');
      });
    },
  },
  render: renderApp,
  async mounted() {
    this.setupAddAccountDialog();
    this.setupSettingsDialog();
    try {
      this.logEvents.push(...(await callApi('GET', '/api/events')));
    } catch { /* the stream will fill it in */ }
    this.connectStream();
  },
});

app.mount('#app');
