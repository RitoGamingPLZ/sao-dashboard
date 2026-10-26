// Dashboard UI. Listens to the server's live stream and redraws from each
// snapshot; every control posts an intent to the JSON API. No framework.

const MAX_LOG_ROWS = 300;
const ROLE_BADGES = { leader: '隊長 Leader', tank: '坦 Tank', member: '隊員 Member' };

let latestSnapshot = { accounts: [], parties: [] };
const logEvents = [];

// ---- small helpers -------------------------------------------------------

const findElement = (selector, root = document) => root.querySelector(selector);

// Build DOM nodes without innerHTML, so names from the game are never parsed as HTML.
function buildElement(tagName, properties = {}, children = []) {
  const element = document.createElement(tagName);
  for (const [key, value] of Object.entries(properties)) {
    if (value == null || value === false) continue;
    if (key === 'className') element.className = value;
    else if (key === 'text') element.textContent = value;
    else if (key === 'dataset') Object.assign(element.dataset, value);
    else if (key.startsWith('on')) element.addEventListener(key.slice(2).toLowerCase(), value);
    else element.setAttribute(key, value === true ? '' : value);
  }
  for (const child of [].concat(children)) if (child != null) element.append(child);
  return element;
}

const formatNumber = (value) => (value == null ? '—' : Number(value).toLocaleString());
const formatCompact = (value) => (value == null ? '—' : Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(value));

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
  const toast = buildElement('div', { className: `toast ${tone}`, role: 'status', text: message });
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

const accountName = (accountId) => latestSnapshot.accounts.find((account) => account.id === accountId)?.name ?? '?';

// ---- live stream -----------------------------------------------------------

function connectStream() {
  const linkStatus = findElement('#link-status');
  const stream = new EventSource('/api/stream');
  stream.addEventListener('open', () => { linkStatus.dataset.state = 'live'; linkStatus.textContent = 'live'; });
  stream.addEventListener('error', () => { linkStatus.dataset.state = 'down'; linkStatus.textContent = 'dashboard offline — retrying'; });
  stream.addEventListener('snapshot', (message) => { latestSnapshot = JSON.parse(message.data); render(); });
  stream.addEventListener('log', (message) => {
    logEvents.push(JSON.parse(message.data));
    if (logEvents.length > MAX_LOG_ROWS) logEvents.shift();
    renderLog();
  });
}

// ---- rendering -------------------------------------------------------------

function render() {
  renderOverview();
  // Don't redraw a region while someone is typing or choosing in it.
  const partiesRegion = findElement('#parties');
  if (!partiesRegion.contains(document.activeElement) || document.activeElement === document.body) renderParties();
  renderAccounts();
  renderLogFilter();
}

function renderOverview() {
  const accounts = latestSnapshot.accounts;
  const onlineCount = accounts.filter((account) => account.isConnected).length;
  const totalGold = accounts.reduce((sum, account) => sum + (account.player?.gold ?? 0), 0);
  const goldPerHour = accounts.reduce((sum, account) => sum + (account.rates.goldPerHour ?? 0), 0);
  const alertCount = accounts.reduce((sum, account) => sum + account.alerts.length, 0);
  const activeParties = latestSnapshot.parties.filter((party) => party.isActive).length;
  const tiles = [
    ['Online', `${onlineCount} / ${accounts.length}`],
    ['Total 摳', formatCompact(totalGold)],
    ['摳 / hour', goldPerHour ? formatCompact(goldPerHour) : '—'],
    ['Active parties', String(activeParties)],
    ['Alerts', String(alertCount), alertCount ? 'warn' : ''],
  ];
  findElement('#overview').replaceChildren(...tiles.map(([label, value, tone]) =>
    buildElement('div', { className: `stat-tile ${tone || ''}` }, [
      buildElement('span', { className: 'stat-label', text: label }),
      buildElement('span', { className: 'stat-value', text: value }),
    ])));
}

// The game's own .stat-bar markup: label | bordered track, numbers below.
function statBar({ label, valuePct, leftText, rightText, barClass, markers = [] }) {
  const fill = buildElement('i');
  fill.style.width = `${Math.max(0, Math.min(100, valuePct ?? 0))}%`;
  const track = buildElement('span', { className: `sb-track ${barClass}` }, [fill]);
  for (const marker of markers) {
    const markerElement = buildElement('span', { className: 'sb-marker', title: marker.title });
    markerElement.style.left = `${marker.pct}%`;
    track.append(markerElement);
  }
  return buildElement('div', { className: 'stat-bar' }, [
    buildElement('span', { className: 'sb-label', text: label }),
    track,
    buildElement('span', { className: 'sb-num' }, [
      buildElement('span', { text: leftText }),
      buildElement('span', { className: 'dim', text: rightText || '' }),
    ]),
  ]);
}

function hpBarClass(hpPct, thresholds) {
  if (hpPct == null || hpPct > thresholds.potionPct + 15) return 'sb-hp';
  return hpPct <= thresholds.emergencyPct ? 'sb-hp low' : 'sb-hp warn';
}

function stockGauge(label, quantity, minimum) {
  const isLow = quantity < minimum;
  return buildElement('div', { className: `stock ${isLow ? 'low' : ''}`, title: `Restock below ${minimum}` }, [
    buildElement('span', { className: 'stock-label', text: label }),
    buildElement('span', { className: 'stock-value', text: formatNumber(quantity) }),
  ]);
}

function renderAccountCard(account) {
  const player = account.player;
  const thresholds = player?.activity === 'boss' ? account.safety.boss : account.safety.normal;
  const roleBadges = account.partyRole
    ? account.partyRole.roles.map((role) => buildElement('span', { className: `badge role-${role}`, text: `${ROLE_BADGES[role]} · ${account.partyRole.partyName}` }))
    : [];
  const statusDotState = !account.isConnected ? 'down' : account.isStale ? 'stale' : 'live';

  const header = buildElement('div', { className: 'card-head' }, [
    buildElement('span', { className: 'status-dot', dataset: { state: statusDotState }, title: statusDotState }),
    buildElement('h3', { text: account.name }),
    buildElement('span', { className: 'level', text: player ? `Lv ${player.level}` : '' }),
    ...roleBadges,
  ]);

  if (!player) {
    return buildElement('article', { className: 'account-card offline' }, [
      header,
      buildElement('p', { className: 'muted', text: account.isConnected ? 'Waiting for state…' : 'Connecting to the game…' }),
      ...account.alerts.map((text) => buildElement('p', { className: 'alert', text })),
      accountButtons(account),
    ]);
  }

  const hpMarkers = [
    { pct: thresholds.potionPct, title: `Potion at ${thresholds.potionPct}%` },
    { pct: thresholds.emergencyPct, title: `Emergency at ${thresholds.emergencyPct}%` },
    { pct: thresholds.crystalPct, title: `Crystal at ${thresholds.crystalPct}%` },
  ];
  const hpText = `${formatNumber(player.hp)} / ${formatNumber(player.maxHp)}`;
  const expText = player.expNeeded ? `${formatNumber(player.exp)} / ${formatNumber(player.expNeeded)}` : formatNumber(player.exp);
  const consumables = player.consumables;
  const restockLimits = account.safety.restock;

  const facts = buildElement('dl', { className: 'facts' }, [
    ['Area', `${player.areaId}${player.areaLevel ? ` · mob Lv ${player.areaLevel}` : ''}`],
    ['Doing', `${player.activity}${player.enemyCount ? ` · ${player.enemyCount} enemies` : ''}`],
    ['摳', `${formatNumber(player.gold)}${account.rates.goldPerHour ? ` · ${formatCompact(account.rates.goldPerHour)}/h` : ''}`],
    ['EXP / min', formatNumber(account.rates.expPerMin)],
    ['Frontier', `Floor ${player.frontierFloor}`],
    ['Heal mode', account.safety.isEnabled ? account.safety.healMode : 'OFF'],
  ].map(([term, value]) => buildElement('div', { title: `${term} ${value}` }, [buildElement('dt', { text: term }), buildElement('dd', { text: value })])));

  const isSuggestedItemDifferent = consumables.autoDrink && player.recommendedKit && consumables.autoDrink.itemId !== player.recommendedKit.autoDrink;

  return buildElement('article', { className: `account-card ${player.isDead ? 'dead' : ''}` }, [
    header,
    statBar({ label: 'HP', valuePct: player.hpPct, leftText: hpText, rightText: player.isMaxHpEstimated ? 'max est.' : `${player.hpPct}%`, barClass: hpBarClass(player.hpPct, thresholds), markers: hpMarkers }),
    statBar({ label: 'EXP', valuePct: player.expPct, leftText: expText, rightText: player.expPct != null ? `${player.expPct}%` : '', barClass: 'sb-exp' }),
    facts,
    buildElement('div', { className: 'section-title', text: 'Supplies' }),
    buildElement('div', { className: 'stock-row' }, [
      stockGauge(consumables.autoDrink?.name || consumables.autoDrink?.itemId || 'Auto-drink', consumables.autoDrink?.quantity ?? 0, restockLimits.autoDrinkMin),
      stockGauge('Potions', consumables.potionsTotal, 100),
      stockGauge('回復水晶', consumables.crystalHeal, restockLimits.crystalHealMin),
      stockGauge('轉移水晶', consumables.crystalTeleport, restockLimits.teleportMin),
    ]),
    isSuggestedItemDifferent ? buildElement('p', { className: 'hint', text: `Suggested auto-drink at Lv ${player.level}: ${player.recommendedKit.autoDrink}` }) : null,
    player.miasmaStage ? buildElement('p', { className: 'alert', text: `Miasma stage ${player.miasmaStage} (+${player.miasmaStage * 15}% damage taken)` }) : null,
    account.busyLabel ? buildElement('p', { className: 'busy', text: `Busy: ${account.busyLabel}` }) : null,
    ...account.alerts.map((text) => buildElement('p', { className: 'alert', text })),
    accountButtons(account),
  ]);
}

function accountButtons(account) {
  const accountAction = (action, extra = {}) => runAndReport(() => callApi('POST', `/api/accounts/${account.id}/action`, { action, ...extra }));
  const isHunting = account.player?.activity === 'hunting';
  return buildElement('div', { className: 'card-actions' }, [
    isHunting
      ? buildElement('button', { className: 'button', text: 'Stop hunt', onClick: () => accountAction('stopHunt') })
      : buildElement('button', { className: 'button', text: 'Start hunt', onClick: () => accountAction('startHunt'), disabled: !account.player }),
    buildElement('button', { className: 'button', text: 'Go to…', disabled: !account.player, onClick: () => {
      const areaId = prompt('Area id (e.g. f40-field, f16-town):', account.player?.areaId || '');
      if (areaId) accountAction('goto', { areaId: areaId.trim() });
    } }),
    buildElement('button', { className: 'button danger', text: 'Town now', title: 'Use a teleport crystal', onClick: () => accountAction('town') }),
    buildElement('button', { className: 'button', text: 'Restock', onClick: () => accountAction('restock') }),
    account.haltReason ? buildElement('button', { className: 'button primary', text: 'Resume bot', onClick: () => accountAction('resume') }) : null,
    buildElement('button', { className: 'button', text: 'Health & potions', onClick: () => openSettings(account) }),
    buildElement('details', { className: 'more' }, [
      buildElement('summary', { text: 'More' }),
      buildElement('button', { className: 'button', text: 'Show password', onClick: async () => {
        const result = await runAndReport(() => callApi('POST', `/api/accounts/${account.id}/password`, {}));
        if (result) prompt(`Password for ${account.name} (copy it now):`, result.password);
      } }),
      buildElement('button', { className: 'button', text: 'Raw command…', onClick: () => {
        const commandText = prompt('Command JSON, e.g. {"type":"startHunt"}');
        if (!commandText) return;
        let command;
        try { command = JSON.parse(commandText); } catch { return showToast('That is not valid JSON', 'error'); }
        runAndReport(() => callApi('POST', `/api/accounts/${account.id}/action`, { action: 'raw', command }), 'Sent');
      } }),
      buildElement('button', { className: 'button danger', text: 'Remove from dashboard', onClick: () => {
        if (confirm(`Remove ${account.name}? The game account itself is not deleted.`)) runAndReport(() => callApi('DELETE', `/api/accounts/${account.id}`), 'Removed');
      } }),
    ]),
  ]);
}

function renderAccounts() {
  const grid = findElement('#accounts');
  if (!latestSnapshot.accounts.length) {
    grid.replaceChildren(buildElement('p', { className: 'empty', text: 'No characters yet. Use “+ Add account” to log in or create one.' }));
    return;
  }
  // Keep any open "More" menu open across redraws.
  const openMenuAccountIds = new Set([...grid.querySelectorAll('details[open]')].map((menu) => menu.closest('[data-account-id]')?.dataset.accountId));
  grid.replaceChildren(...latestSnapshot.accounts.map((account) => {
    const card = renderAccountCard(account);
    card.dataset.accountId = account.id;
    if (openMenuAccountIds.has(account.id)) findElement('details', card)?.setAttribute('open', '');
    return card;
  }));
}

// ---- parties ---------------------------------------------------------------

function updateParty(party, changes) {
  return runAndReport(() => callApi('PUT', `/api/parties/${party.id}`, changes));
}

function renderPartyCard(party) {
  const takenIds = new Set(latestSnapshot.parties.flatMap((otherParty) => otherParty.memberIds));
  const freeAccounts = latestSnapshot.accounts.filter((account) => !takenIds.has(account.id));

  const memberRows = party.memberIds.map((memberId) => {
    const account = latestSnapshot.accounts.find((candidate) => candidate.id === memberId);
    const isLeader = memberId === party.leaderId;
    const isTank = memberId === party.tankId;
    const hpPct = account?.player?.hpPct;
    const isOnline = !!account?.player;
    const hpFill = buildElement('i');
    hpFill.style.width = `${hpPct ?? 0}%`;
    return buildElement('li', { className: `member ${isOnline ? '' : 'away'} ${isTank ? 'is-tank' : ''}` }, [
      buildElement('div', { className: 'member-head' }, [
        buildElement('span', { className: 'member-name', text: accountName(memberId) }),
        isLeader ? buildElement('span', { className: 'badge role-leader', text: '隊長 Leader' }) : null,
        isTank ? buildElement('span', { className: 'badge role-tank', text: '坦 Tank' }) : null,
      ]),
      buildElement('span', { className: 'member-sub', text: isOnline ? `Lv${account.player.level} · ${account.player.areaId} · ${account.player.activity}` : 'offline' }),
      buildElement('span', { className: `mate-bar ${hpPct != null && hpPct < 30 ? 'low' : ''}`, title: `HP ${hpPct ?? '?'}%` }, [hpFill]),
      buildElement('span', { className: 'member-actions' }, [
        isLeader ? null : buildElement('button', { className: 'button small', text: 'Leader', title: 'Make leader', onClick: () => updateParty(party, { leaderId: memberId }) }),
        isTank
          ? buildElement('button', { className: 'button small', text: 'Untank', title: 'Unset tank', onClick: () => updateParty(party, { tankId: null }) })
          : buildElement('button', { className: 'button small', text: 'Tank', title: 'Make tank', onClick: () => updateParty(party, { tankId: memberId }) }),
        buildElement('button', { className: 'button small danger', text: '✕', title: 'Remove from party', onClick: () => updateParty(party, { memberIds: party.memberIds.filter((id) => id !== memberId) }) }),
      ]),
    ]);
  });

  const addMemberSelect = buildElement('select', { 'aria-label': 'Add member' }, [
    buildElement('option', { value: '', text: freeAccounts.length ? '+ Add member…' : 'No free characters' }),
    ...freeAccounts.map((account) => buildElement('option', { value: account.id, text: account.name })),
  ]);
  addMemberSelect.addEventListener('change', () => {
    if (addMemberSelect.value) updateParty(party, { memberIds: [...party.memberIds, addMemberSelect.value] });
  });

  const goalInput = buildElement('input', { value: party.goal?.areaId || '', placeholder: 'Goal area, e.g. f40-field (blank = where the leader is)', 'aria-label': 'Goal area' });
  const retreatInput = buildElement('input', { type: 'number', min: 10, max: 90, value: party.tankRetreatPct, 'aria-label': 'Tank retreat HP %' });
  retreatInput.addEventListener('change', () => updateParty(party, { tankRetreatPct: Number(retreatInput.value) }));
  const syncCheckbox = buildElement('input', { type: 'checkbox', checked: party.shouldSyncInGame });
  syncCheckbox.addEventListener('change', () => updateParty(party, { shouldSyncInGame: syncCheckbox.checked }));

  const startParty = (shouldHunt) => {
    const areaId = goalInput.value.trim() || undefined;
    const path = party.isActive ? `/api/parties/${party.id}/goal` : `/api/parties/${party.id}/start`;
    const body = party.isActive ? { areaId, shouldHunt } : { goal: { areaId, shouldHunt } };
    runAndReport(() => callApi('POST', path, body), shouldHunt ? 'Party heading out' : 'Party holding');
  };

  return buildElement('article', { className: `party-card ${party.isActive ? 'active' : ''}` }, [
    buildElement('div', { className: 'card-head' }, [
      buildElement('h3', { text: party.name }),
      buildElement('span', { className: `badge ${party.isActive ? 'on' : ''}`, text: party.isActive ? 'ACTIVE' : 'off' }),
      buildElement('span', { className: 'party-status', text: party.status }),
    ]),
    buildElement('ul', { className: 'members' }, memberRows.length ? memberRows : [buildElement('li', { className: 'muted', text: 'No members yet' })]),
    buildElement('div', { className: 'party-controls' }, [
      addMemberSelect,
      goalInput,
      buildElement('button', { className: 'button primary', text: party.isActive ? 'Hunt here' : 'Start party', onClick: () => startParty(true) }),
      buildElement('button', { className: 'button', text: 'Hold (no fighting)', onClick: () => startParty(false) }),
      party.isActive ? buildElement('button', { className: 'button danger', text: 'Stop party', onClick: () => runAndReport(() => callApi('POST', `/api/parties/${party.id}/stop`, {}), 'Party stopped') }) : null,
    ]),
    buildElement('div', { className: 'party-options' }, [
      buildElement('label', {}, ['Tank retreat HP % ', retreatInput]),
      buildElement('label', { className: 'checkbox', title: 'Uses the unverified in-game party commands from protocol.js' }, [syncCheckbox, ' Also form the party in-game (experimental)']),
      buildElement('button', { className: 'button small danger', text: 'Delete party', onClick: () => {
        if (confirm(`Delete party ${party.name}?`)) runAndReport(() => callApi('DELETE', `/api/parties/${party.id}`), 'Party deleted');
      } }),
    ]),
  ]);
}

function renderParties() {
  const container = findElement('#parties');
  const parties = latestSnapshot.parties;
  container.replaceChildren(...(parties.length ? parties.map(renderPartyCard) : [buildElement('p', { className: 'empty', text: 'No parties yet.' })]));
}

// ---- log -------------------------------------------------------------------

function renderLogFilter() {
  const filter = findElement('#log-filter');
  const knownIds = new Set([...filter.options].map((option) => option.value));
  for (const account of latestSnapshot.accounts) {
    if (!knownIds.has(account.id)) filter.append(buildElement('option', { value: account.id, text: account.name }));
  }
}

function renderLog() {
  const selectedAccountId = findElement('#log-filter').value;
  const visibleEvents = logEvents.filter((event) => !selectedAccountId || event.accountId === selectedAccountId).slice(-120).reverse();
  findElement('#event-log').replaceChildren(...visibleEvents.map((event) =>
    buildElement('li', { className: `log-row kind-${event.kind}` }, [
      buildElement('time', { text: new Date(event.ts).toLocaleTimeString() }),
      buildElement('span', { className: 'log-account', text: event.account }),
      buildElement('span', { className: 'log-kind', text: event.kind }),
      buildElement('span', { className: 'log-detail', text: event.source ? `${event.detail} (${event.source})` : event.detail }),
    ])));
}

// ---- dialogs ---------------------------------------------------------------

function setupAddAccountDialog() {
  const dialog = findElement('#add-account-dialog');
  const loginForm = findElement('#login-form');
  const createForm = findElement('#create-form');
  findElement('#open-add-account').addEventListener('click', () => dialog.showModal());
  for (const closeButton of dialog.querySelectorAll('[data-close]')) closeButton.addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => {
    loginForm.reset();
    createForm.reset();
    findElement('[data-password]', createForm).hidden = true;
    findElement('[data-password-value]', createForm).textContent = '';
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
    const errorLine = findElement('[data-error]', loginForm);
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
    const errorLine = findElement('[data-error]', createForm);
    errorLine.textContent = 'Creating…';
    try {
      const result = await callApi('POST', '/api/accounts/create', { name: formData.get('name') });
      errorLine.textContent = '';
      findElement('[data-password-name]', createForm).textContent = result.name;
      findElement('[data-password-value]', createForm).textContent = result.password;
      findElement('[data-password]', createForm).hidden = false;
      showToast(`${result.name} created — copy the password now`);
    } catch (error) {
      errorLine.textContent = error.message;
    }
  });

  findElement('[data-copy]', createForm).addEventListener('click', async () => {
    const password = findElement('[data-password-value]', createForm).textContent;
    try { await navigator.clipboard.writeText(password); showToast('Password copied'); } catch { showToast('Copy failed — select it by hand', 'error'); }
  });
}

let settingsAccountId = null;

function openSettings(account) {
  settingsAccountId = account.id;
  const dialog = findElement('#settings-dialog');
  const form = findElement('#settings-form');
  findElement('[data-account-name]', form).textContent = account.name;
  findElement('[data-error]', form).textContent = '';
  const safety = account.safety;
  form.elements.isEnabled.checked = safety.isEnabled;
  form.elements.isAutoRestockOn.checked = safety.isAutoRestockOn;
  form.elements.healMode.value = safety.healMode;
  for (const input of form.querySelectorAll('input[name*="."]')) {
    const [group, key] = input.name.split('.');
    input.value = safety[group][key];
  }
  dialog.showModal();
}

function readSettingsForm(form) {
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
  return update;
}

function setupSettingsDialog() {
  const dialog = findElement('#settings-dialog');
  const form = findElement('#settings-form');
  findElement('[data-close]', form).addEventListener('click', () => dialog.close());
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const errorLine = findElement('[data-error]', form);
    const safety = readSettingsForm(form);
    const save = (isUnsafeConfirmed) => callApi('PUT', `/api/accounts/${settingsAccountId}/safety`, { safety, isUnsafeConfirmed });
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
}

// ---- page setup ------------------------------------------------------------

function setupTopBar() {
  findElement('#pause-all').addEventListener('click', () => {
    if (confirm('Stop every party and every hunt?')) runAndReport(() => callApi('POST', '/api/pause-all', {}), 'Everything paused');
  });
  findElement('#new-party-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const nameInput = findElement('#new-party-name');
    runAndReport(() => callApi('POST', '/api/parties', { name: nameInput.value }), 'Party created').then(() => { nameInput.value = ''; });
  });
  findElement('#log-filter').addEventListener('change', renderLog);
}

async function start() {
  setupTopBar();
  setupAddAccountDialog();
  setupSettingsDialog();
  try {
    logEvents.push(...(await callApi('GET', '/api/events')));
    renderLog();
  } catch { /* the stream will fill it in */ }
  connectStream();
}

start();
