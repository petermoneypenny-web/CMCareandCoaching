/**
 * CM Care and Coaching — Personal Training Session Tracker & Invoicing App
 * Supports LocalStorage persistence + GitHub Repository API Sync (data/db.json)
 */

const STORAGE_KEY_DB = 'cm_coaching_db_v2';
const STORAGE_KEY_BACKUPS = 'cm_coaching_db_backups_v1';
const STORAGE_KEY_BACKUP_COUNTER = 'cm_coaching_db_change_count_v1';
const STORAGE_KEY_GH = 'cm_coaching_gh_config_v1';
const STORAGE_KEY_GDRIVE = 'cm_coaching_gdrive_config_v1';
const MAX_BACKUPS = 5;
const BACKUP_EVERY_N_CHANGES = 10;

const INITIAL_CLIENT_NAMES = [
  'Margot',
  'Nesta',
  'Hen',
  'Kath',
  'Jill',
  'Sara M',
  'Christine & Chris',
  'Lynne',
  'Nicola',
  'Harri',
  'Ali & James',
  'Richard Pilkington',
  'Liz S',
  'Tash',
  'Rach & Rosie',
  'Mikey',
  'Sara H',
  'Marian',
  'Briony & Amos',
  'Lucy',
  'Peter',
  'Richard Banham',
  'Anne',
  'Lady Valerie',
  'Fiona',
  'David',
  'Karen',
  'Graham'
];

const DEFAULT_SEED_DB = {
  version: 2,
  lastUpdated: new Date().toISOString(),
  businessProfile: {
    name: 'CM Care and Coaching',
    tagline: 'Personal Training & Holistic Fitness Coaching',
    initials: 'CM',
    email: 'info@cmcareandcoaching.co.uk',
    phone: '07700 900123',
    address: 'United Kingdom',
    bankAccountName: 'CM Care and Coaching',
    bankName: 'Monzo / High Street Bank',
    sortCode: '00-00-00',
    accountNumber: '12345678',
    paymentTerms:
      'Payment due within 14 days of invoice date. Please use the invoice number as your payment reference. Thank you for training with CM Care and Coaching!'
  },
  sessionTypes: [
    {
      id: 'st_1',
      name: '1-to-1 Personal Training (60 min)',
      duration: 60,
      price: 45.0,
      color: '#2563eb',
      description: 'Full 60-minute tailored personal training session'
    },
    {
      id: 'st_2',
      name: 'Express PT Session (30 min)',
      duration: 30,
      price: 28.0,
      color: '#0d9488',
      description: 'High-efficiency 30-minute focused workout'
    },
    {
      id: 'st_3',
      name: '2-to-1 Partner Session (60 min)',
      duration: 60,
      price: 60.0,
      color: '#7c3aed',
      description: 'Shared 60-minute coaching session for two clients'
    },
    {
      id: 'st_4',
      name: 'Initial Assessment & Goal Review',
      duration: 60,
      price: 40.0,
      color: '#ea580c',
      description: 'Movement screening, posture check, and programme design'
    }
  ],
  clients: INITIAL_CLIENT_NAMES.map((name, idx) => ({
    id: `cl_${idx + 1}`,
    name,
    email: '',
    phone: '',
    address: '',
    defaultSessionTypeId: '',
    allowedSessionTypeIds: [],
    status: 'active',
    notes: '',
    createdAt: '2026-11-13T08:52:00.000Z'
  })),
  sessions: [],
  invoiceOverrides: {}
};

// Application State
let db = structuredClone(DEFAULT_SEED_DB);
let currentView = 'tracker';
let activeMonth = getCurrentYearMonth();

let ghConfig = {
  owner: 'petermoneypenny-web',
  repo: 'CMCareandCoaching',
  branch: 'main',
  path: 'data/db.json',
  token: '',
  autoSync: false,
  lastSha: null
};

let gdriveConfig = {
  clientId: '',
  rootFolderInput: ''
};
let gdriveAccessToken = null;
let gdriveTokenExpiresAt = 0;

// Utility Functions
function getCurrentYearMonth() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function getTodayDateString() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatGBP(amount) {
  const num = Number(amount) || 0;
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP'
  }).format(num);
}

function formatMonthDisplay(ym) {
  if (!ym || !ym.includes('-')) return ym;
  const [year, month] = ym.split('-').map(Number);
  const date = new Date(year, month - 1, 1);
  return date.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
}

function formatDateUK(dateStr) {
  if (!dateStr) return '—';
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  const [y, m, d] = parts.map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });
}

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function getInitials(name) {
  if (!name) return 'PT';
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((n) => n[0].toUpperCase())
    .join('');
}

function uid(prefix = 'id') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
}

function showToast(message, type = 'success') {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => {
    toast.remove();
  }, 3600);
}

// UTF-8 Safe Base64 Encoding & Decoding for GitHub Contents API
function utf8ToBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToUtf8(base64) {
  const cleaned = base64.replace(/\s/g, '');
  const binary = atob(cleaned);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
}

// Initialization & Data Loading
async function initApp() {
  loadGitHubConfig();
  loadGDriveConfig();
  await loadDatabase();

  // Set default active monthpicker
  const monthInput = document.getElementById('globalMonthPicker');
  monthInput.value = activeMonth;

  bindEvents();
  refreshAllViews();
  updateSyncStatusUI();

  // If GitHub token is configured, pull latest automatically on load
  if (ghConfig.token && ghConfig.owner && ghConfig.repo) {
    pullFromGitHub(true);
  }
}

function loadGitHubConfig() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_GH);
    if (raw) {
      const parsed = JSON.parse(raw);
      ghConfig = { ...ghConfig, ...parsed };
    }
  } catch (err) {
    console.warn('Could not read GitHub config from localStorage:', err);
  }
}

function saveGitHubConfig() {
  try {
    localStorage.setItem(STORAGE_KEY_GH, JSON.stringify(ghConfig));
  } catch (err) {
    console.warn('Could not save GitHub config:', err);
  }
}

function loadGDriveConfig() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_GDRIVE);
    if (raw) {
      const parsed = JSON.parse(raw);
      gdriveConfig = { ...gdriveConfig, ...parsed };
    }
  } catch (err) {
    console.warn('Could not read Google Drive config from localStorage:', err);
  }
}

function saveGDriveConfig() {
  try {
    localStorage.setItem(STORAGE_KEY_GDRIVE, JSON.stringify(gdriveConfig));
  } catch (err) {
    console.warn('Could not save Google Drive config:', err);
  }
}

function extractGoogleDriveFolderId(input) {
  const trimmed = (input || '').trim();
  if (!trimmed) return '';
  const match = trimmed.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (match && match[1]) return match[1];
  const idParamMatch = trimmed.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (idParamMatch && idParamMatch[1]) return idParamMatch[1];
  return trimmed;
}

async function loadDatabase() {
  // 1. Check localStorage first
  const localRaw = localStorage.getItem(STORAGE_KEY_DB);
  if (localRaw) {
    try {
      const parsed = JSON.parse(localRaw);
      if (parsed && Array.isArray(parsed.clients) && Array.isArray(parsed.sessions)) {
        db = {
          ...structuredClone(DEFAULT_SEED_DB),
          ...parsed,
          businessProfile: {
            ...DEFAULT_SEED_DB.businessProfile,
            ...(parsed.businessProfile || {})
          },
          invoiceOverrides: parsed.invoiceOverrides || {}
        };
        return;
      }
    } catch (e) {
      console.warn('Failed to parse local DB, falling back to repo db.json', e);
    }
  }

  // 2. Try fetching ./data/db.json from hosted GitHub Pages / local server
  try {
    const res = await fetch('./data/db.json', { cache: 'no-store' });
    if (res.ok) {
      const remoteData = await res.json();
      if (remoteData && Array.isArray(remoteData.clients)) {
        db = {
          ...structuredClone(DEFAULT_SEED_DB),
          ...remoteData,
          businessProfile: {
            ...DEFAULT_SEED_DB.businessProfile,
            ...(remoteData.businessProfile || {})
          },
          invoiceOverrides: remoteData.invoiceOverrides || {}
        };
        persistLocalDb(null, { skipBackup: true });
        return;
      }
    }
  } catch (err) {
    // Expected when opened directly via file://
  }

  // 3. Fallback to default seed data
  persistLocalDb(null, { skipBackup: true });
}

function getBackupsList() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_BACKUPS);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.warn('Failed to read backup history:', err);
    return [];
  }
}

function saveBackupsList(list) {
  const trimmed = list.slice(0, MAX_BACKUPS);
  try {
    localStorage.setItem(STORAGE_KEY_BACKUPS, JSON.stringify(trimmed));
  } catch (err) {
    console.error('Error saving backup history:', err);
  }
}

function captureBackupSnapshot(snapshotObj, reason = 'Database update') {
  if (!snapshotObj || !Array.isArray(snapshotObj.clients) || !Array.isArray(snapshotObj.sessions)) {
    return;
  }

  const backups = getBackupsList();
  const entry = {
    id: uid('bak'),
    timestamp: new Date().toISOString(),
    reason: reason || 'Database update',
    summary: {
      clients: snapshotObj.clients.length,
      sessions: snapshotObj.sessions.length,
      sessionTypes: Array.isArray(snapshotObj.sessionTypes) ? snapshotObj.sessionTypes.length : 0
    },
    data: snapshotObj
  };

  backups.unshift(entry);
  saveBackupsList(backups);
}

function getBackupChangeCount() {
  const val = Number(localStorage.getItem(STORAGE_KEY_BACKUP_COUNTER));
  return Number.isFinite(val) && val >= 0 ? val : 0;
}

function setBackupChangeCount(count) {
  try {
    localStorage.setItem(STORAGE_KEY_BACKUP_COUNTER, String(Math.max(0, count)));
  } catch (err) {
    console.warn('Could not save backup change counter:', err);
  }
}

function maybeTriggerAutoBackup(reason = 'Database update') {
  try {
    const prevRaw = localStorage.getItem(STORAGE_KEY_DB);
    if (prevRaw) {
      const prevParsed = JSON.parse(prevRaw);
      const prevComparable = JSON.stringify({ ...prevParsed, lastUpdated: '' });
      const nextComparable = JSON.stringify({ ...db, lastUpdated: '' });
      if (prevComparable === nextComparable) return;
    }

    const nextCount = getBackupChangeCount() + 1;
    if (nextCount >= BACKUP_EVERY_N_CHANGES) {
      captureBackupSnapshot(
        structuredClone(db),
        `Auto-backup after ${BACKUP_EVERY_N_CHANGES} changes (${reason})`
      );
      setBackupChangeCount(0);
    } else {
      setBackupChangeCount(nextCount);
    }
  } catch (err) {
    console.warn('Could not process auto-backup trigger:', err);
  }
}

function persistLocalDb(reason = 'Database update', options = {}) {
  db.lastUpdated = new Date().toISOString();
  if (!options.skipBackup) {
    maybeTriggerAutoBackup(reason);
  }
  try {
    localStorage.setItem(STORAGE_KEY_DB, JSON.stringify(db));
  } catch (err) {
    console.error('Error saving to localStorage:', err);
  }
}

let autoSyncTimeout = null;
function saveAndRefresh(triggerMsg) {
  persistLocalDb(triggerMsg || 'Database update');
  refreshAllViews();
  if (triggerMsg) {
    showToast(triggerMsg, 'success');
  }
  if (ghConfig.autoSync && ghConfig.token) {
    clearTimeout(autoSyncTimeout);
    autoSyncTimeout = setTimeout(() => {
      pushToGitHub(true);
    }, 900);
  }
}

// GitHub API Sync Logic
function updateSyncStatusUI(state = 'idle', customMessage = '') {
  const dot = document.getElementById('ghStatusDot');
  const label = document.getElementById('ghStatusLabel');
  const meta = document.getElementById('ghSyncMeta');

  dot.className = 'status-dot';
  if (!ghConfig.token) {
    label.textContent = 'Browser Storage';
    meta.textContent = 'Add a GitHub Token in Settings to sync data/db.json.';
    return;
  }

  if (state === 'syncing') {
    dot.classList.add('syncing');
    label.textContent = 'Syncing with GitHub...';
    meta.textContent = `${ghConfig.owner}/${ghConfig.repo} (${ghConfig.branch})`;
  } else if (state === 'error') {
    dot.classList.add('error');
    label.textContent = 'GitHub Sync Error';
    meta.textContent = customMessage || 'Check token permissions or repo path.';
  } else {
    dot.classList.add('connected');
    label.textContent = 'GitHub Sync Ready';
    meta.textContent =
      customMessage || `${ghConfig.owner}/${ghConfig.repo}:${ghConfig.path}`;
  }
}

async function pullFromGitHub(silent = false) {
  if (!ghConfig.owner || !ghConfig.repo || !ghConfig.path) {
    if (!silent) showToast('Please configure GitHub Owner, Repo, and Path first.', 'error');
    return;
  }

  updateSyncStatusUI('syncing');
  const url = `https://api.github.com/repos/${encodeURIComponent(ghConfig.owner)}/${encodeURIComponent(ghConfig.repo)}/contents/${ghConfig.path}?ref=${encodeURIComponent(ghConfig.branch || 'main')}`;

  const headers = {
    Accept: 'application/vnd.github+json'
  };
  if (ghConfig.token) {
    headers.Authorization = `Bearer ${ghConfig.token}`;
  }

  try {
    const res = await fetch(url, { headers, cache: 'no-store' });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.message || `HTTP ${res.status}`);
    }
    const fileObj = await res.json();
    ghConfig.lastSha = fileObj.sha;
    saveGitHubConfig();

    const jsonString = base64ToUtf8(fileObj.content);
    const remoteDb = JSON.parse(jsonString);
    if (remoteDb && Array.isArray(remoteDb.clients) && Array.isArray(remoteDb.sessions)) {
      db = {
        ...structuredClone(DEFAULT_SEED_DB),
        ...remoteDb,
        businessProfile: {
          ...DEFAULT_SEED_DB.businessProfile,
          ...(remoteDb.businessProfile || {})
        },
        invoiceOverrides: remoteDb.invoiceOverrides || {}
      };
      persistLocalDb('Pulled latest from GitHub');
      refreshAllViews();
      updateSyncStatusUI('connected', `Pulled latest @ ${new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`);
      if (!silent) showToast('Database pulled from GitHub repository!');
    }
  } catch (err) {
    updateSyncStatusUI('error', err.message);
    if (!silent) showToast(`GitHub Pull failed: ${err.message}`, 'error');
  }
}

async function pushToGitHub(silent = false) {
  if (!ghConfig.token) {
    if (!silent) {
      switchView('settings');
      showToast('Please enter your GitHub Personal Access Token to push changes.', 'error');
    }
    return;
  }

  updateSyncStatusUI('syncing');
  const baseUrl = `https://api.github.com/repos/${encodeURIComponent(ghConfig.owner)}/${encodeURIComponent(ghConfig.repo)}/contents/${ghConfig.path}`;
  const headers = {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${ghConfig.token}`,
    'Content-Type': 'application/json'
  };

  try {
    // Fetch current SHA first to prevent 409 conflict
    let currentSha = ghConfig.lastSha;
    const getRes = await fetch(`${baseUrl}?ref=${encodeURIComponent(ghConfig.branch || 'main')}`, {
      headers,
      cache: 'no-store'
    });
    if (getRes.ok) {
      const existing = await getRes.json();
      currentSha = existing.sha;
    }

    db.lastUpdated = new Date().toISOString();
    const contentFormatted = JSON.stringify(db, null, 2);
    const bodyPayload = {
      message: `Update PT session & invoice database (${activeMonth})`,
      content: utf8ToBase64(contentFormatted),
      branch: ghConfig.branch || 'main'
    };
    if (currentSha) {
      bodyPayload.sha = currentSha;
    }

    const putRes = await fetch(baseUrl, {
      method: 'PUT',
      headers,
      body: JSON.stringify(bodyPayload)
    });

    if (!putRes.ok) {
      const errData = await putRes.json().catch(() => ({}));
      throw new Error(errData.message || `HTTP ${putRes.status}`);
    }

    const result = await putRes.json();
    if (result.content && result.content.sha) {
      ghConfig.lastSha = result.content.sha;
      saveGitHubConfig();
    }

    updateSyncStatusUI(
      'connected',
      `Synced @ ${new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`
    );
    if (!silent) showToast('Database pushed to GitHub repository!');
  } catch (err) {
    updateSyncStatusUI('error', err.message);
    if (!silent) showToast(`GitHub Push failed: ${err.message}`, 'error');
  }
}

// Helpers for Lookups
function getClientById(id) {
  return db.clients.find((c) => c.id === id) || null;
}

function getSessionTypeById(id) {
  return db.sessionTypes.find((st) => st.id === id) || null;
}

function getClientAllowedSessionTypes(client) {
  if (!client) return [];
  const ids = new Set(Array.isArray(client.allowedSessionTypeIds) ? client.allowedSessionTypeIds : []);
  if (client.defaultSessionTypeId) {
    ids.add(client.defaultSessionTypeId);
  }
  return db.sessionTypes.filter((st) => ids.has(st.id));
}

function getSessionsForMonth(monthStr) {
  return db.sessions
    .filter((s) => (s.month || s.date.slice(0, 7)) === monthStr)
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

// View Navigation
const VIEW_TITLES = {
  tracker: 'Monthly Session Tracker',
  clients: 'Clients Directory',
  'session-types': 'Session Types & Pricing',
  history: 'Monthly History Database',
  invoices: 'End-of-Month Invoices',
  settings: 'Business Profile & GitHub Sync'
};

function switchView(viewName) {
  currentView = viewName;
  document.querySelectorAll('.nav-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.view === viewName);
  });
  document.querySelectorAll('.view-section').forEach((sec) => {
    sec.classList.toggle('active', sec.id === `view-${viewName}`);
  });
  document.getElementById('pageHeading').textContent = VIEW_TITLES[viewName] || 'Dashboard';
  refreshAllViews();
}

function changeActiveMonth(newMonth) {
  if (!newMonth) return;
  activeMonth = newMonth;
  document.getElementById('globalMonthPicker').value = activeMonth;
  const invMonth = document.getElementById('invoiceMonthSelect');
  if (invMonth && invMonth.value !== activeMonth) {
    invMonth.value = activeMonth;
  }
  refreshAllViews();
}

function stepMonth(delta) {
  const [y, m] = activeMonth.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  const ny = d.getFullYear();
  const nm = String(d.getMonth() + 1).padStart(2, '0');
  changeActiveMonth(`${ny}-${nm}`);
}

// Refresh UI Views
function refreshAllViews() {
  // Update sidebar branding
  const bp = db.businessProfile || DEFAULT_SEED_DB.businessProfile;
  document.getElementById('sidebarLogo').textContent = bp.initials || 'CM';
  document.getElementById('sidebarBrandName').textContent = bp.name || 'CM Care and Coaching';

  // Update month labels
  const prettyMonth = formatMonthDisplay(activeMonth);
  document.querySelectorAll('.active-month-label').forEach((el) => {
    el.textContent = prettyMonth;
  });

  renderTrackerView();
  renderClientsView();
  renderSessionTypesView();
  renderHistoryView();
  renderInvoicesView();
  populateSettingsForms();
}

// 1. Render Monthly Tracker View
function renderTrackerView() {
  const monthSessions = getSessionsForMonth(activeMonth);
  const totalSessionsCount = monthSessions.reduce((sum, s) => sum + (Number(s.quantity) || 1), 0);
  const totalRevenue = monthSessions.reduce(
    (sum, s) => sum + (Number(s.quantity) || 1) * (Number(s.unitPrice) || 0),
    0
  );
  const activeClientsInMonth = new Set(monthSessions.map((s) => s.clientId)).size;
  const totalActiveClients = db.clients.filter((c) => c.status !== 'archived').length;

  const statsGrid = document.getElementById('trackerStatsGrid');
  statsGrid.innerHTML = `
    <div class="stat-card">
      <span class="stat-label">Sessions in ${escapeHtml(formatMonthDisplay(activeMonth))}</span>
      <span class="stat-value">${totalSessionsCount}</span>
      <span class="stat-sub">Across ${activeClientsInMonth} client${activeClientsInMonth === 1 ? '' : 's'} trained this month</span>
    </div>
    <div class="stat-card">
      <span class="stat-label">Monthly Billable Revenue</span>
      <span class="stat-value" style="color: var(--primary);">${formatGBP(totalRevenue)}</span>
      <span class="stat-sub">${totalSessionsCount > 0 ? `Avg ${formatGBP(totalRevenue / totalSessionsCount)} per session` : 'No sessions logged yet'}</span>
    </div>
    <div class="stat-card">
      <span class="stat-label">Active Clients</span>
      <span class="stat-value">${totalActiveClients}</span>
      <span class="stat-sub">${activeClientsInMonth} of ${totalActiveClients} logged in ${escapeHtml(activeMonth)}</span>
    </div>
    <div class="stat-card">
      <span class="stat-label">Avg Monthly Spend / Client</span>
      <span class="stat-value">${activeClientsInMonth > 0 ? formatGBP(totalRevenue / activeClientsInMonth) : formatGBP(0)}</span>
      <span class="stat-sub">Ready for end-of-month invoicing</span>
    </div>
  `;

  // Render Client Counter Cards
  const activeClients = db.clients.filter((c) => c.status !== 'archived');
  const cardsContainer = document.getElementById('clientTrackerCards');

  if (activeClients.length === 0) {
    cardsContainer.innerHTML = `
      <div class="empty-state" style="grid-column: 1 / -1;">
        <p>No active clients found. Add your first personal training client to start tracking sessions.</p>
        <button class="btn btn-primary" onclick="openClientModal()">+ Add First Client</button>
      </div>
    `;
  } else {
    cardsContainer.innerHTML = activeClients
      .map((client) => {
        const cSessions = monthSessions.filter((s) => s.clientId === client.id);
        const cTotalQty = cSessions.reduce((sum, s) => sum + (Number(s.quantity) || 1), 0);
        const cTotalAmount = cSessions.reduce(
          (sum, s) => sum + (Number(s.quantity) || 1) * (Number(s.unitPrice) || 0),
          0
        );
        const defaultType = getSessionTypeById(client.defaultSessionTypeId) || null;
        const allowedTypes = getClientAllowedSessionTypes(client);

        // Breakdown by session type
        const byType = {};
        cSessions.forEach((s) => {
          const st = getSessionTypeById(s.sessionTypeId);
          const name = st ? st.name : 'Custom Session';
          if (!byType[name]) byType[name] = { qty: 0, total: 0 };
          byType[name].qty += Number(s.quantity) || 1;
          byType[name].total += (Number(s.quantity) || 1) * (Number(s.unitPrice) || 0);
        });

        const breakdownRows = Object.entries(byType)
          .map(
            ([name, info]) => `
            <div class="breakdown-row">
              <span>${escapeHtml(name)} &times; <strong>${info.qty}</strong></span>
              <span>${formatGBP(info.total)}</span>
            </div>
          `
          )
          .join('');

        return `
          <div class="client-tracker-card">
            <div>
              <div class="tracker-card-top">
                <div class="client-avatar-row">
                  <div class="avatar-circle">${escapeHtml(getInitials(client.name))}</div>
                  <div>
                    <div class="client-name-link">${escapeHtml(client.name)}</div>
                    <div class="client-default-type">
                      Default: ${defaultType ? `${escapeHtml(defaultType.name)} (${formatGBP(defaultType.price)})` : 'None set'}
                    </div>
                    <div class="client-default-type" style="margin-top: 2px;">
                      ${
                        allowedTypes.length > 0
                          ? `Allowed: ${allowedTypes.length} session type${allowedTypes.length === 1 ? '' : 's'}`
                          : `<a href="javascript:void(0)" onclick="openClientModal('${client.id}')" style="color: var(--warning); font-weight: 600; text-decoration: underline;">Assign allowed session types</a>`
                      }
                    </div>
                  </div>
                </div>
                <div class="counter-badge">
                  <div class="count-num">${cTotalQty}</div>
                  <div class="count-label">Sessions</div>
                </div>
              </div>

              <div class="tracker-breakdown" style="margin-top: 0.85rem;">
                ${
                  breakdownRows ||
                  `<div style="color: var(--text-muted); text-align: center;">No sessions logged in ${escapeHtml(formatMonthDisplay(activeMonth))}</div>`
                }
              </div>
            </div>

            <div class="tracker-card-footer">
              <div>
                <div style="font-size: 0.72rem; color: var(--text-muted); text-transform: uppercase; font-weight: 600;">Month Total</div>
                <div class="month-total-price">${formatGBP(cTotalAmount)}</div>
              </div>
              <div style="display: flex; gap: 0.35rem; flex-wrap: wrap;">
                <button class="btn btn-xs btn-primary" onclick="quickIncrementSession('${client.id}')" title="Quickly add +1 session of default session type">
                  +1 Session
                </button>
                <button class="btn btn-xs btn-secondary" onclick="openSessionModal(null, '${client.id}')" title="Log session with custom date/type/notes">
                  Log
                </button>
                <button class="btn btn-xs btn-subtle" onclick="openInvoiceForClient('${client.id}', '${activeMonth}')" title="Create End-of-Month Invoice">
                  Invoice
                </button>
              </div>
            </div>
          </div>
        `;
      })
      .join('');
  }

  // Populate Log Filter Dropdowns
  const clientFilter = document.getElementById('logClientFilter');
  const prevClientVal = clientFilter.value || 'all';
  clientFilter.innerHTML =
    `<option value="all">All Clients</option>` +
    db.clients
      .map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`)
      .join('');
  if ([...clientFilter.options].some((o) => o.value === prevClientVal)) {
    clientFilter.value = prevClientVal;
  }

  const typeFilter = document.getElementById('logTypeFilter');
  const prevTypeVal = typeFilter.value || 'all';
  typeFilter.innerHTML =
    `<option value="all">All Session Types</option>` +
    db.sessionTypes
      .map((st) => `<option value="${st.id}">${escapeHtml(st.name)}</option>`)
      .join('');
  if ([...typeFilter.options].some((o) => o.value === prevTypeVal)) {
    typeFilter.value = prevTypeVal;
  }

  renderSessionLogTable(monthSessions);
}

function renderSessionLogTable(monthSessions) {
  const clientFilterVal = document.getElementById('logClientFilter').value;
  const typeFilterVal = document.getElementById('logTypeFilter').value;

  const filtered = monthSessions.filter((s) => {
    if (clientFilterVal !== 'all' && s.clientId !== clientFilterVal) return false;
    if (typeFilterVal !== 'all' && s.sessionTypeId !== typeFilterVal) return false;
    return true;
  });

  const tbody = document.getElementById('sessionLogTableBody');
  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" class="empty-state">
          No sessions recorded for ${escapeHtml(formatMonthDisplay(activeMonth))} matching current filters.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = filtered
    .map((s) => {
      const client = getClientById(s.clientId);
      const st = getSessionTypeById(s.sessionTypeId);
      const qty = Number(s.quantity) || 1;
      const unitPrice = Number(s.unitPrice) || 0;
      const lineTotal = qty * unitPrice;

      return `
        <tr>
          <td style="white-space: nowrap; font-weight: 600;">${escapeHtml(formatDateUK(s.date))}</td>
          <td><strong>${escapeHtml(client ? client.name : 'Unknown Client')}</strong></td>
          <td>
            <span class="type-pill">
              <span class="color-dot" style="background: ${st ? st.color : '#64748b'};"></span>
              ${escapeHtml(st ? st.name : 'Custom Session')}
            </span>
          </td>
          <td>${qty}</td>
          <td>${formatGBP(unitPrice)}</td>
          <td><strong>${formatGBP(lineTotal)}</strong></td>
          <td style="color: var(--text-secondary);">${escapeHtml(s.notes || '—')}</td>
          <td style="text-align: right; white-space: nowrap;">
            <button class="btn btn-xs btn-secondary" onclick="openSessionModal('${s.id}')">Edit</button>
            <button class="btn btn-xs btn-danger" onclick="deleteSession('${s.id}')">Delete</button>
          </td>
        </tr>
      `;
    })
    .join('');
}

// 2. Render Clients View
function renderClientsView() {
  const searchVal = (document.getElementById('clientSearchInput')?.value || '').toLowerCase().trim();
  const statusVal = document.getElementById('clientStatusFilter')?.value || 'all';
  const monthSessions = getSessionsForMonth(activeMonth);

  const filtered = db.clients.filter((c) => {
    if (statusVal !== 'all' && c.status !== statusVal) return false;
    if (searchVal) {
      const hay = `${c.name} ${c.email || ''} ${c.phone || ''} ${c.notes || ''}`.toLowerCase();
      if (!hay.includes(searchVal)) return false;
    }
    return true;
  });

  const tbody = document.getElementById('clientsTableBody');
  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" class="empty-state">No clients match your search criteria.</td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = filtered
    .map((c) => {
      const defType = getSessionTypeById(c.defaultSessionTypeId);
      const allowedTypes = getClientAllowedSessionTypes(c);
      const allowedBadgesHtml =
        allowedTypes.length > 0
          ? allowedTypes
              .map(
                (st) =>
                  `<span class="type-pill" style="margin: 2px 4px 2px 0;"><span class="color-dot" style="background: ${st.color};"></span>${escapeHtml(st.name)}</span>`
              )
              .join('')
          : `<button class="btn btn-xs btn-subtle" onclick="openClientModal('${c.id}')">+ Assign Allowed Types</button>`;

      const thisMonthCount = monthSessions
        .filter((s) => s.clientId === c.id)
        .reduce((sum, s) => sum + (Number(s.quantity) || 1), 0);
      const thisMonthSpend = monthSessions
        .filter((s) => s.clientId === c.id)
        .reduce((sum, s) => sum + (Number(s.quantity) || 1) * (Number(s.unitPrice) || 0), 0);
      const allTimeCount = db.sessions
        .filter((s) => s.clientId === c.id)
        .reduce((sum, s) => sum + (Number(s.quantity) || 1), 0);

      return `
        <tr>
          <td>
            <div style="font-weight: 700;">${escapeHtml(c.name)}</div>
            ${c.notes ? `<div style="font-size: 0.78rem; color: var(--text-muted); max-width: 260px;">${escapeHtml(c.notes)}</div>` : ''}
          </td>
          <td>
            <div>${escapeHtml(c.email || '—')}</div>
            <div style="font-size: 0.78rem; color: var(--text-muted);">${escapeHtml(c.phone || '')}</div>
          </td>
          <td>
            ${
              defType
                ? `<span class="type-pill"><span class="color-dot" style="background: ${defType.color};"></span>${escapeHtml(defType.name)} (${formatGBP(defType.price)})</span>`
                : '—'
            }
          </td>
          <td style="max-width: 300px;">
            ${allowedBadgesHtml}
          </td>
          <td>
            <strong>${thisMonthCount}</strong> session${thisMonthCount === 1 ? '' : 's'}
            <div style="font-size: 0.78rem; color: var(--text-muted);">${formatGBP(thisMonthSpend)}</div>
          </td>
          <td>${allTimeCount}</td>
          <td>
            <span class="badge ${c.status === 'archived' ? 'badge-archived' : 'badge-active'}">
              ${c.status === 'archived' ? 'Archived' : 'Active'}
            </span>
          </td>
          <td style="text-align: right; white-space: nowrap;">
            <button class="btn btn-xs btn-primary" onclick="openSessionModal(null, '${c.id}')">+ Session</button>
            <button class="btn btn-xs btn-subtle" onclick="openInvoiceForClient('${c.id}', '${activeMonth}')">Invoice</button>
            <button class="btn btn-xs btn-secondary" onclick="openClientModal('${c.id}')">Edit</button>
            <button class="btn btn-xs btn-danger" onclick="deleteClient('${c.id}')">Remove</button>
          </td>
        </tr>
      `;
    })
    .join('');
}

// 3. Render Session Types View
function renderSessionTypesView() {
  const tbody = document.getElementById('sessionTypesTableBody');
  if (db.sessionTypes.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" class="empty-state">No session types configured. Add your first session type above.</td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = db.sessionTypes
    .map((st) => {
      const countUsed = db.sessions
        .filter((s) => s.sessionTypeId === st.id)
        .reduce((sum, s) => sum + (Number(s.quantity) || 1), 0);

      return `
        <tr>
          <td>
            <span class="type-pill">
              <span class="color-dot" style="background: ${st.color || '#2563eb'};"></span>
              <strong>${escapeHtml(st.name)}</strong>
            </span>
          </td>
          <td>${Number(st.duration) || 60} mins</td>
          <td><strong>${formatGBP(st.price)}</strong></td>
          <td style="color: var(--text-secondary);">${escapeHtml(st.description || '—')}</td>
          <td>${countUsed} session${countUsed === 1 ? '' : 's'}</td>
          <td style="text-align: right; white-space: nowrap;">
            <button class="btn btn-xs btn-secondary" onclick="openSessionTypeModal('${st.id}')">Edit</button>
            <button class="btn btn-xs btn-danger" onclick="deleteSessionType('${st.id}')">Remove</button>
          </td>
        </tr>
      `;
    })
    .join('');
}

// 4. Render Monthly History Database View
function renderHistoryView() {
  const monthsSet = new Set([activeMonth]);
  db.sessions.forEach((s) => {
    const m = s.month || (s.date ? s.date.slice(0, 7) : null);
    if (m) monthsSet.add(m);
  });

  const sortedMonths = Array.from(monthsSet).sort((a, b) => (a < b ? 1 : -1));
  const tbody = document.getElementById('historyTableBody');

  if (sortedMonths.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="empty-state">No monthly history recorded yet.</td></tr>`;
    return;
  }

  tbody.innerHTML = sortedMonths
    .map((ym) => {
      const mSessions = getSessionsForMonth(ym);
      const totalSessions = mSessions.reduce((sum, s) => sum + (Number(s.quantity) || 1), 0);
      const totalRev = mSessions.reduce(
        (sum, s) => sum + (Number(s.quantity) || 1) * (Number(s.unitPrice) || 0),
        0
      );

      // Group per client
      const perClient = {};
      mSessions.forEach((s) => {
        if (!perClient[s.clientId]) {
          perClient[s.clientId] = { qty: 0, spend: 0 };
        }
        perClient[s.clientId].qty += Number(s.quantity) || 1;
        perClient[s.clientId].spend += (Number(s.quantity) || 1) * (Number(s.unitPrice) || 0);
      });

      const clientBreakdownHtml = Object.entries(perClient)
        .map(([cid, stats]) => {
          const cl = getClientById(cid);
          const cname = cl ? cl.name : 'Deleted Client';
          return `
            <span class="type-pill" style="margin: 2px 4px 2px 0; cursor: pointer;" onclick="openInvoiceForClient('${cid}', '${ym}')" title="Click to open ${escapeHtml(cname)}'s invoice for ${escapeHtml(formatMonthDisplay(ym))}">
              ${escapeHtml(cname)}: <strong>${stats.qty}</strong> (${formatGBP(stats.spend)})
            </span>
          `;
        })
        .join('');

      const isCurrentSelected = ym === activeMonth;

      return `
        <tr style="${isCurrentSelected ? 'background-color: var(--primary-soft);' : ''}">
          <td style="white-space: nowrap;">
            <strong>${escapeHtml(formatMonthDisplay(ym))}</strong>
            <div style="font-size: 0.75rem; color: var(--text-muted);">${escapeHtml(ym)}</div>
          </td>
          <td>${Object.keys(perClient).length} client${Object.keys(perClient).length === 1 ? '' : 's'}</td>
          <td><strong>${totalSessions}</strong> session${totalSessions === 1 ? '' : 's'}</td>
          <td><strong style="color: var(--primary);">${formatGBP(totalRev)}</strong></td>
          <td>${clientBreakdownHtml || '<span style="color: var(--text-muted);">No sessions logged</span>'}</td>
          <td style="text-align: right; white-space: nowrap;">
            <button class="btn btn-xs btn-primary" onclick="jumpToMonthTracker('${ym}')">View Tracker</button>
            <button class="btn btn-xs btn-secondary" onclick="jumpToMonthInvoices('${ym}')">Invoices</button>
          </td>
        </tr>
      `;
    })
    .join('');
}

function jumpToMonthTracker(ym) {
  changeActiveMonth(ym);
  switchView('tracker');
}

function jumpToMonthInvoices(ym) {
  changeActiveMonth(ym);
  document.getElementById('invoiceMonthSelect').value = ym;
  switchView('invoices');
}

// 5. Render End-of-Month Invoices View
function renderInvoicesView() {
  const clientSelect = document.getElementById('invoiceClientSelect');
  const monthInput = document.getElementById('invoiceMonthSelect');

  if (!monthInput.value) {
    monthInput.value = activeMonth;
  }

  const prevClientId = clientSelect.value;
  if (db.clients.length === 0) {
    clientSelect.innerHTML = `<option value="">No clients available</option>`;
    document.getElementById('printableInvoiceArea').innerHTML = `
      <div class="empty-state">Add a client first to generate an end-of-month invoice.</div>
    `;
    return;
  }

  clientSelect.innerHTML = db.clients
    .map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`)
    .join('');

  if (prevClientId && db.clients.some((c) => c.id === prevClientId)) {
    clientSelect.value = prevClientId;
  } else {
    clientSelect.value = db.clients[0].id;
  }

  loadInvoiceMetaFields();
  renderInvoicePreviewPaper();
}

function getDefaultInvoiceNumber(clientId, ym) {
  const clientIdx = Math.max(1, db.clients.findIndex((c) => c.id === clientId) + 1);
  const cleanYm = (ym || activeMonth).replace('-', '');
  return `INV-${cleanYm}-${String(clientIdx).padStart(3, '0')}`;
}

function getEndOfMonthDates(ym) {
  const [y, m] = (ym || activeMonth).split('-').map(Number);
  const lastDay = new Date(y, m, 0);
  const dueDay = new Date(y, m - 1, lastDay.getDate() + 14);
  const fmt = (d) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return {
    issueDate: fmt(lastDay),
    dueDate: fmt(dueDay)
  };
}

function loadInvoiceMetaFields() {
  const clientId = document.getElementById('invoiceClientSelect').value;
  const ym = document.getElementById('invoiceMonthSelect').value || activeMonth;
  const key = `${clientId}_${ym}`;
  const saved = (db.invoiceOverrides && db.invoiceOverrides[key]) || {};
  const defaults = getEndOfMonthDates(ym);

  document.getElementById('invoiceNumberInput').value =
    saved.invoiceNumber || getDefaultInvoiceNumber(clientId, ym);
  document.getElementById('invoiceIssueDate').value = saved.issueDate || defaults.issueDate;
  document.getElementById('invoiceDueDate').value = saved.dueDate || defaults.dueDate;
  document.getElementById('invoiceDiscountInput').value =
    saved.discount !== undefined ? saved.discount : 0;
  document.getElementById('invoiceCustomNote').value = saved.customNote || '';
  if (saved.displayMode) {
    document.getElementById('invoiceDisplayMode').value = saved.displayMode;
  }
}

function saveCurrentInvoiceMeta(silent = false) {
  const clientId = document.getElementById('invoiceClientSelect').value;
  const ym = document.getElementById('invoiceMonthSelect').value || activeMonth;
  if (!clientId) return;

  const key = `${clientId}_${ym}`;
  if (!db.invoiceOverrides) db.invoiceOverrides = {};
  db.invoiceOverrides[key] = {
    invoiceNumber: document.getElementById('invoiceNumberInput').value.trim(),
    issueDate: document.getElementById('invoiceIssueDate').value,
    dueDate: document.getElementById('invoiceDueDate').value,
    discount: Number(document.getElementById('invoiceDiscountInput').value) || 0,
    customNote: document.getElementById('invoiceCustomNote').value.trim(),
    displayMode: document.getElementById('invoiceDisplayMode').value
  };

  persistLocalDb('Saved invoice details');
  renderInvoicePreviewPaper();
  if (!silent) {
    showToast('Invoice details saved!');
    if (ghConfig.autoSync && ghConfig.token) pushToGitHub(true);
  }
}

function buildInvoiceHtmlForClient(clientId, ym, options = {}) {
  const key = `${clientId}_${ym}`;
  const saved = (db.invoiceOverrides && db.invoiceOverrides[key]) || {};
  const defaults = getEndOfMonthDates(ym);

  const displayMode = options.displayMode || saved.displayMode || 'itemized';
  const invNumber =
    options.invNumber || saved.invoiceNumber || getDefaultInvoiceNumber(clientId, ym);
  const issueDate = options.issueDate || saved.issueDate || defaults.issueDate;
  const dueDate = options.dueDate || saved.dueDate || defaults.dueDate;
  const discount =
    options.discount !== undefined
      ? Number(options.discount) || 0
      : Number(saved.discount) || 0;
  const customNote =
    options.customNote !== undefined ? options.customNote : saved.customNote || '';

  const client = getClientById(clientId);
  if (!client) {
    return {
      html: `<div class="empty-state">Select a client to view their invoice.</div>`,
      invNumber,
      client: null,
      sessionCount: 0
    };
  }

  const bp = db.businessProfile || DEFAULT_SEED_DB.businessProfile;
  const clientMonthSessions = getSessionsForMonth(ym)
    .filter((s) => s.clientId === clientId)
    .sort((a, b) => (a.date > b.date ? 1 : -1));

  const totalSessionsCount = clientMonthSessions.reduce(
    (sum, s) => sum + (Number(s.quantity) || 1),
    0
  );
  const subtotal = clientMonthSessions.reduce(
    (sum, s) => sum + (Number(s.quantity) || 1) * (Number(s.unitPrice) || 0),
    0
  );
  const grandTotal = Math.max(0, subtotal - discount);

  let tableRowsHtml = '';

  if (clientMonthSessions.length === 0) {
    tableRowsHtml = `
      <tr>
        <td colspan="5" style="text-align: center; padding: 2rem; color: #64748b;">
          No training sessions recorded for ${escapeHtml(client.name)} in ${escapeHtml(formatMonthDisplay(ym))}.
        </td>
      </tr>
    `;
  } else if (displayMode === 'grouped') {
    const groups = {};
    clientMonthSessions.forEach((s) => {
      const st = getSessionTypeById(s.sessionTypeId);
      const stName = st ? st.name : 'Personal Training Session';
      const rate = Number(s.unitPrice) || 0;
      const gKey = `${stName}_${rate}`;
      if (!groups[gKey]) {
        groups[gKey] = {
          name: stName,
          description: st?.description || '',
          qty: 0,
          unitPrice: rate,
          dates: []
        };
      }
      groups[gKey].qty += Number(s.quantity) || 1;
      groups[gKey].dates.push(formatDateUK(s.date));
    });

    tableRowsHtml = Object.values(groups)
      .map(
        (g) => `
        <tr>
          <td>${escapeHtml(formatMonthDisplay(ym))}</td>
          <td>
            <strong>${escapeHtml(g.name)}</strong>
            <div style="font-size: 0.78rem; color: #64748b; margin-top: 2px;">
              Dates: ${escapeHtml(g.dates.join(', '))}
            </div>
          </td>
          <td class="num">${g.qty}</td>
          <td class="num">${formatGBP(g.unitPrice)}</td>
          <td class="num"><strong>${formatGBP(g.qty * g.unitPrice)}</strong></td>
        </tr>
      `
      )
      .join('');
  } else {
    tableRowsHtml = clientMonthSessions
      .map((s) => {
        const st = getSessionTypeById(s.sessionTypeId);
        const qty = Number(s.quantity) || 1;
        const rate = Number(s.unitPrice) || 0;
        return `
          <tr>
            <td style="white-space: nowrap;">${escapeHtml(formatDateUK(s.date))}</td>
            <td>
              <strong>${escapeHtml(st ? st.name : 'Personal Training Session')}</strong>
              ${s.notes ? `<div style="font-size: 0.78rem; color: #64748b;">${escapeHtml(s.notes)}</div>` : ''}
            </td>
            <td class="num">${qty}</td>
            <td class="num">${formatGBP(rate)}</td>
            <td class="num"><strong>${formatGBP(qty * rate)}</strong></td>
          </tr>
        `;
      })
      .join('');
  }

  const html = `
    <div class="inv-header">
      <div class="inv-brand-block">
        <div class="inv-logo-box">${escapeHtml(bp.initials || 'CM')}</div>
        <div>
          <div class="inv-biz-name">${escapeHtml(bp.name)}</div>
          <div class="inv-biz-details">
            ${bp.tagline ? `<div>${escapeHtml(bp.tagline)}</div>` : ''}
            ${bp.email ? `<div>${escapeHtml(bp.email)} ${bp.phone ? `&bull; ${escapeHtml(bp.phone)}` : ''}</div>` : ''}
            ${bp.address ? `<div>${escapeHtml(bp.address)}</div>` : ''}
          </div>
        </div>
      </div>
      <div class="inv-title-block">
        <div class="inv-label">INVOICE</div>
        <div class="inv-number">#${escapeHtml(invNumber)}</div>
        <div style="font-size: 0.8rem; color: #64748b; margin-top: 4px;">
          Billing Period: ${escapeHtml(formatMonthDisplay(ym))}
        </div>
      </div>
    </div>

    <div class="inv-meta-grid">
      <div>
        <div class="inv-section-label">Billed To</div>
        <div class="inv-client-name">${escapeHtml(client.name)}</div>
        <div class="inv-client-details">${[client.address, client.email, client.phone].filter(Boolean).map(escapeHtml).join('\n')}</div>
      </div>
      <div class="inv-dates-box">
        <div class="inv-dates-row">
          <span>Invoice Date:</span>
          <span>${escapeHtml(formatDateUK(issueDate))}</span>
        </div>
        <div class="inv-dates-row">
          <span>Due Date:</span>
          <span>${escapeHtml(formatDateUK(dueDate))}</span>
        </div>
        <div class="inv-dates-row">
          <span>Sessions Completed:</span>
          <span>${totalSessionsCount}</span>
        </div>
      </div>
    </div>

    <table class="inv-table">
      <thead>
        <tr>
          <th style="width: 125px;">${displayMode === 'grouped' ? 'Period' : 'Date'}</th>
          <th>Session Description</th>
          <th class="num" style="width: 70px;">Qty</th>
          <th class="num" style="width: 110px;">Rate</th>
          <th class="num" style="width: 120px;">Line Total</th>
        </tr>
      </thead>
      <tbody>
        ${tableRowsHtml}
      </tbody>
    </table>

    <div class="inv-summary-wrap">
      <div class="inv-totals-box">
        <div class="inv-total-row">
          <span>Total Sessions (${totalSessionsCount})</span>
          <span>${formatGBP(subtotal)}</span>
        </div>
        ${
          discount > 0
            ? `
          <div class="inv-total-row" style="color: #16a34a;">
            <span>Discount / Credit</span>
            <span>-${formatGBP(discount)}</span>
          </div>
        `
            : ''
        }
        <div class="inv-total-row grand-total">
          <span>Total Due</span>
          <span>${formatGBP(grandTotal)}</span>
        </div>
      </div>
    </div>

    ${
      customNote
        ? `
      <div style="margin-bottom: 1.5rem; padding: 0.85rem 1rem; background: #eff6ff; border-left: 4px solid #2563eb; border-radius: 6px; font-size: 0.85rem; color: #1e3a8a;">
        <strong>Coach's Note:</strong> ${escapeHtml(customNote)}
      </div>
    `
        : ''
    }

    <div class="inv-footer-grid">
      <div class="inv-bank-box">
        <div class="inv-section-label">Bank Transfer Details</div>
        <div><strong>Bank:</strong> ${escapeHtml(bp.bankName || '—')}</div>
        <div><strong>Account Name:</strong> ${escapeHtml(bp.bankAccountName || bp.name)}</div>
        <div><strong>Sort Code:</strong> ${escapeHtml(bp.sortCode || '—')}</div>
        <div><strong>Account No:</strong> ${escapeHtml(bp.accountNumber || '—')}</div>
        <div style="margin-top: 0.35rem; font-size: 0.76rem; color: #64748b;">
          Reference: <strong>${escapeHtml(invNumber)}</strong>
        </div>
      </div>
      <div>
        <div class="inv-section-label">Payment Terms &amp; Notes</div>
        <p style="line-height: 1.5;">${escapeHtml(bp.paymentTerms || '')}</p>
      </div>
    </div>
  `;

  return { html, invNumber, client, sessionCount: totalSessionsCount };
}

function renderInvoicePreviewPaper() {
  const clientId = document.getElementById('invoiceClientSelect').value;
  const ym = document.getElementById('invoiceMonthSelect').value || activeMonth;
  const displayMode = document.getElementById('invoiceDisplayMode').value;
  const invNumber =
    document.getElementById('invoiceNumberInput').value || getDefaultInvoiceNumber(clientId, ym);
  const issueDate = document.getElementById('invoiceIssueDate').value;
  const dueDate = document.getElementById('invoiceDueDate').value;
  const discount = Number(document.getElementById('invoiceDiscountInput').value) || 0;
  const customNote = document.getElementById('invoiceCustomNote').value.trim();

  const paper = document.getElementById('printableInvoiceArea');
  const rendered = buildInvoiceHtmlForClient(clientId, ym, {
    displayMode,
    invNumber,
    issueDate,
    dueDate,
    discount,
    customNote
  });
  paper.innerHTML = rendered.html;
  updateBatchExportSummary(ym);
}

function getClientsWithSessionsInMonth(ym) {
  const monthSessions = getSessionsForMonth(ym);
  const clientIdsWithSessions = new Set(monthSessions.map((s) => s.clientId));
  return db.clients.filter((c) => clientIdsWithSessions.has(c.id));
}

function getMonthFolderParts(ym) {
  const [yearStr, monthNum] = (ym || activeMonth).split('-');
  const monthDate = new Date(Number(yearStr), Number(monthNum) - 1, 1);
  const monthName = monthDate.toLocaleDateString('en-GB', { month: 'long' });
  return {
    yearStr,
    monthFolderName: `${monthNum} - ${monthName}`
  };
}

function updateBatchExportSummary(ym) {
  const summaryEl = document.getElementById('batchExportSummary');
  const zipBtn = document.getElementById('batchDownloadZipBtn');
  const driveBtn = document.getElementById('batchUploadDriveBtn');
  if (!summaryEl) return;

  const eligibleClients = getClientsWithSessionsInMonth(ym);
  const { yearStr, monthFolderName } = getMonthFolderParts(ym);

  if (eligibleClients.length === 0) {
    summaryEl.textContent = `No clients have sessions recorded in ${formatMonthDisplay(ym)}.`;
    if (zipBtn) zipBtn.disabled = true;
    if (driveBtn) driveBtn.disabled = true;
  } else {
    summaryEl.innerHTML = `<strong>${eligibleClients.length}</strong> client${eligibleClients.length === 1 ? '' : 's'} with sessions in ${escapeHtml(formatMonthDisplay(ym))} &rarr; folder <code>${escapeHtml(yearStr)}/${escapeHtml(monthFolderName)}/</code>`;
    if (zipBtn) zipBtn.disabled = false;
    if (driveBtn) driveBtn.disabled = false;
  }
}

function setBatchProgress(message, visible = true) {
  const box = document.getElementById('batchProgressBox');
  if (!box) return;
  box.style.display = visible ? 'block' : 'none';
  box.textContent = message;
}

async function renderInvoiceHtmlToPdfBlob(html) {
  if (typeof window.html2pdf === 'undefined') {
    throw new Error('PDF library is still loading or unavailable. Please check your internet connection and try again.');
  }

  // Keep the invoice element itself static-positioned so html2pdf's internal cloner
  // does not inherit position:fixed offsets that cause blank captures.
  const wrapper = document.createElement('div');
  wrapper.style.cssText =
    'position: absolute; left: 0; top: 0; width: 700px; background: #ffffff; z-index: 9999; pointer-events: none;';

  const container = document.createElement('div');
  container.className = 'invoice-paper';
  container.style.cssText =
    'width: 700px; max-width: 700px; padding: 24px; box-sizing: border-box; background: #ffffff; color: #0f172a; border: none; box-shadow: none; margin: 0;';
  container.innerHTML = html;

  wrapper.appendChild(container);
  document.body.appendChild(wrapper);

  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

  try {
    const opt = {
      margin: [10, 10, 10, 10],
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: {
        scale: 2,
        useCORS: true,
        logging: false,
        scrollX: 0,
        scrollY: 0,
        windowWidth: 700
      },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };
    const blob = await window.html2pdf().set(opt).from(container).outputPdf('blob');
    return blob;
  } finally {
    wrapper.remove();
  }
}

async function generateMonthInvoicePdfs(ym, onProgress = null) {
  const eligibleClients = getClientsWithSessionsInMonth(ym);
  if (eligibleClients.length === 0) {
    throw new Error(`No sessions recorded for ${formatMonthDisplay(ym)}.`);
  }

  const displayMode = document.getElementById('invoiceDisplayMode')?.value || 'itemized';
  const results = [];

  for (let i = 0; i < eligibleClients.length; i++) {
    const client = eligibleClients[i];
    if (onProgress) {
      onProgress(i + 1, eligibleClients.length, client.name);
    }
    const rendered = buildInvoiceHtmlForClient(client.id, ym, { displayMode });
    const safeClientName = client.name.replace(/[\\/:*?"<>|]/g, '_');
    const filename = `${rendered.invNumber} - ${safeClientName}.pdf`;
    const blob = await renderInvoiceHtmlToPdfBlob(rendered.html);
    results.push({ client, filename, invNumber: rendered.invNumber, blob });
  }

  return results;
}

async function batchDownloadMonthZip() {
  const ym = document.getElementById('invoiceMonthSelect').value || activeMonth;
  if (typeof window.JSZip === 'undefined') {
    showToast('ZIP library is still loading or unavailable.', 'error');
    return;
  }

  const zipBtn = document.getElementById('batchDownloadZipBtn');
  const driveBtn = document.getElementById('batchUploadDriveBtn');
  zipBtn.disabled = true;
  driveBtn.disabled = true;

  try {
    const pdfs = await generateMonthInvoicePdfs(ym, (idx, total, name) => {
      setBatchProgress(`Generating PDF ${idx} of ${total}: ${name}...`);
    });

    setBatchProgress('Packaging invoices into ZIP...');
    const { yearStr, monthFolderName } = getMonthFolderParts(ym);
    const zip = new window.JSZip();
    const folder = zip.folder(yearStr).folder(monthFolderName);

    pdfs.forEach((item) => {
      folder.file(item.filename, item.blob);
    });

    const zipBlob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(zipBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `CM-Care-Coaching-Invoices-${ym}.zip`;
    a.click();
    URL.revokeObjectURL(url);

    setBatchProgress(`Done! Downloaded ${pdfs.length} invoice PDF(s) in ${yearStr}/${monthFolderName}/.`);
    showToast(`Downloaded ${pdfs.length} invoice PDF(s) as ZIP!`);
  } catch (err) {
    setBatchProgress(`Error: ${err.message}`);
    showToast(err.message, 'error');
  } finally {
    updateBatchExportSummary(ym);
  }
}

// Google Drive OAuth & Upload Helpers
function updateGDriveStatusUI() {
  const badge = document.getElementById('gdriveStatusBadge');
  if (!badge) return;
  if (!gdriveConfig.clientId) {
    badge.className = 'badge badge-archived';
    badge.textContent = 'Not Configured';
  } else if (gdriveAccessToken && Date.now() < gdriveTokenExpiresAt) {
    badge.className = 'badge badge-active';
    badge.textContent = 'Connected';
  } else {
    badge.className = 'badge badge-active';
    badge.textContent = 'Client ID Saved';
  }
}

function requestGoogleDriveAccessToken() {
  return new Promise((resolve, reject) => {
    if (gdriveAccessToken && Date.now() < gdriveTokenExpiresAt - 30000) {
      resolve(gdriveAccessToken);
      return;
    }

    if (!gdriveConfig.clientId) {
      reject(new Error('Please enter your Google OAuth Client ID in Business & GitHub Sync settings first.'));
      return;
    }

    if (typeof google === 'undefined' || !google.accounts || !google.accounts.oauth2) {
      reject(new Error('Google Sign-In script is not loaded yet. Please refresh or check your internet connection.'));
      return;
    }

    const tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: gdriveConfig.clientId,
      scope: 'https://www.googleapis.com/auth/drive',
      callback: (resp) => {
        if (resp.error) {
          reject(new Error(resp.error_description || resp.error));
          return;
        }
        gdriveAccessToken = resp.access_token;
        gdriveTokenExpiresAt = Date.now() + (Number(resp.expires_in) || 3600) * 1000;
        updateGDriveStatusUI();
        resolve(gdriveAccessToken);
      }
    });

    tokenClient.requestAccessToken({ prompt: gdriveAccessToken ? '' : 'consent' });
  });
}

async function findOrCreateDriveFolder(token, folderName, parentId = null) {
  const escapedName = folderName.replace(/'/g, "\\'");
  let q = `mimeType = 'application/vnd.google-apps.folder' and name = '${escapedName}' and trashed = false`;
  if (parentId) {
    q += ` and '${parentId}' in parents`;
  } else {
    q += ` and 'root' in parents`;
  }

  const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name)&supportsAllDrives=true&includeItemsFromAllDrives=true`;
  const searchRes = await fetch(searchUrl, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!searchRes.ok) {
    const err = await searchRes.json().catch(() => ({}));
    throw new Error(err.error?.message || `Drive folder search failed (${searchRes.status})`);
  }
  const searchData = await searchRes.json();
  if (searchData.files && searchData.files.length > 0) {
    return searchData.files[0].id;
  }

  const metadata = {
    name: folderName,
    mimeType: 'application/vnd.google-apps.folder'
  };
  if (parentId) {
    metadata.parents = [parentId];
  }

  const createRes = await fetch(
    'https://www.googleapis.com/drive/v3/files?supportsAllDrives=true&fields=id',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(metadata)
    }
  );
  if (!createRes.ok) {
    const err = await createRes.json().catch(() => ({}));
    throw new Error(err.error?.message || `Could not create Drive folder "${folderName}"`);
  }
  const created = await createRes.json();
  return created.id;
}

async function uploadPdfToDriveFolder(token, folderId, filename, pdfBlob) {
  const escapedName = filename.replace(/'/g, "\\'");
  const q = `name = '${escapedName}' and '${folderId}' in parents and trashed = false`;
  const checkRes = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id)&supportsAllDrives=true&includeItemsFromAllDrives=true`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const checkData = checkRes.ok ? await checkRes.json() : { files: [] };
  const existingFileId = checkData.files?.[0]?.id || null;

  const metadata = existingFileId
    ? { name: filename, mimeType: 'application/pdf' }
    : { name: filename, mimeType: 'application/pdf', parents: [folderId] };

  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  form.append('file', pdfBlob, filename);

  const uploadUrl = existingFileId
    ? `https://www.googleapis.com/upload/drive/v3/files/${existingFileId}?uploadType=multipart&supportsAllDrives=true`
    : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true';

  const uploadRes = await fetch(uploadUrl, {
    method: existingFileId ? 'PATCH' : 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form
  });

  if (!uploadRes.ok) {
    const err = await uploadRes.json().catch(() => ({}));
    throw new Error(err.error?.message || `Failed to upload ${filename}`);
  }
  return uploadRes.json();
}

async function batchUploadMonthToGoogleDrive() {
  const ym = document.getElementById('invoiceMonthSelect').value || activeMonth;
  if (!gdriveConfig.clientId) {
    switchView('settings');
    showToast('Please enter your Google OAuth Client ID in Settings first.', 'error');
    return;
  }

  const zipBtn = document.getElementById('batchDownloadZipBtn');
  const driveBtn = document.getElementById('batchUploadDriveBtn');
  zipBtn.disabled = true;
  driveBtn.disabled = true;

  try {
    setBatchProgress('Signing in to Google Drive...');
    const token = await requestGoogleDriveAccessToken();

    setBatchProgress('Preparing Year / Month folders in Google Drive...');
    let rootFolderId = extractGoogleDriveFolderId(gdriveConfig.rootFolderInput);
    if (!rootFolderId) {
      rootFolderId = await findOrCreateDriveFolder(token, 'CM Care and Coaching Invoices', null);
    }

    const { yearStr, monthFolderName } = getMonthFolderParts(ym);
    const yearFolderId = await findOrCreateDriveFolder(token, yearStr, rootFolderId);
    const monthFolderId = await findOrCreateDriveFolder(token, monthFolderName, yearFolderId);

    const pdfs = await generateMonthInvoicePdfs(ym, (idx, total, name) => {
      setBatchProgress(`Generating PDF ${idx} of ${total}: ${name}...`);
    });

    for (let i = 0; i < pdfs.length; i++) {
      const item = pdfs[i];
      setBatchProgress(`Uploading ${i + 1} of ${pdfs.length} to Drive (${yearStr}/${monthFolderName}): ${item.filename}...`);
      await uploadPdfToDriveFolder(token, monthFolderId, item.filename, item.blob);
    }

    setBatchProgress(`Uploaded ${pdfs.length} invoice PDF(s) to Google Drive: ${yearStr} / ${monthFolderName}`);
    showToast(`Uploaded ${pdfs.length} invoice PDF(s) to Google Drive!`);
  } catch (err) {
    setBatchProgress(`Error: ${err.message}`);
    showToast(`Google Drive upload failed: ${err.message}`, 'error');
  } finally {
    updateBatchExportSummary(ym);
  }
}

function openInvoiceForClient(clientId, ym) {
  if (ym) {
    activeMonth = ym;
    document.getElementById('globalMonthPicker').value = ym;
  }
  switchView('invoices');
  const clientSelect = document.getElementById('invoiceClientSelect');
  const monthInput = document.getElementById('invoiceMonthSelect');
  clientSelect.value = clientId;
  monthInput.value = ym || activeMonth;
  loadInvoiceMetaFields();
  renderInvoicePreviewPaper();
}

// 6. Settings Forms Population
function populateSettingsForms() {
  document.getElementById('ghOwner').value = ghConfig.owner || 'petermoneypenny-web';
  document.getElementById('ghRepo').value = ghConfig.repo || 'CMCareandCoaching';
  document.getElementById('ghBranch').value = ghConfig.branch || 'main';
  document.getElementById('ghPath').value = ghConfig.path || 'data/db.json';
  document.getElementById('ghToken').value = ghConfig.token || '';
  document.getElementById('ghAutoSync').checked = Boolean(ghConfig.autoSync);

  document.getElementById('gdriveClientId').value = gdriveConfig.clientId || '';
  document.getElementById('gdriveRootFolderInput').value = gdriveConfig.rootFolderInput || '';
  updateGDriveStatusUI();

  const bp = db.businessProfile || DEFAULT_SEED_DB.businessProfile;
  document.getElementById('bizName').value = bp.name || '';
  document.getElementById('bizInitials').value = bp.initials || '';
  document.getElementById('bizTagline').value = bp.tagline || '';
  document.getElementById('bizEmail').value = bp.email || '';
  document.getElementById('bizPhone').value = bp.phone || '';
  document.getElementById('bizAddress').value = bp.address || '';
  document.getElementById('bizBankName').value = bp.bankName || '';
  document.getElementById('bizBankAccountName').value = bp.bankAccountName || '';
  document.getElementById('bizSortCode').value = bp.sortCode || '';
  document.getElementById('bizAccountNumber').value = bp.accountNumber || '';
  document.getElementById('bizPaymentTerms').value = bp.paymentTerms || '';

  renderBackupHistory();
}

function formatBackupTimestamp(isoStr) {
  if (!isoStr) return '—';
  const dt = new Date(isoStr);
  if (Number.isNaN(dt.getTime())) return isoStr;
  return dt.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

function renderBackupHistory() {
  const tbody = document.getElementById('backupHistoryTableBody');
  const badge = document.getElementById('backupCountBadge');
  const changeCounterBadge = document.getElementById('backupChangeCounterBadge');
  if (!tbody) return;

  const backups = getBackupsList();
  if (badge) {
    badge.textContent = `${backups.length} / ${MAX_BACKUPS} Saved`;
  }
  if (changeCounterBadge) {
    changeCounterBadge.textContent = `${getBackupChangeCount()} / ${BACKUP_EVERY_N_CHANGES} Changes`;
  }

  if (backups.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5" class="empty-state" style="padding: 1.5rem 1rem;">
          No automatic backups yet. A snapshot is automatically saved after every ${BACKUP_EVERY_N_CHANGES} database changes (up to the last ${MAX_BACKUPS}).
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = backups
    .map((bak, index) => {
      const s = bak.summary || {};
      const clientsCount = s.clients ?? (Array.isArray(bak.data?.clients) ? bak.data.clients.length : 0);
      const sessionsCount = s.sessions ?? (Array.isArray(bak.data?.sessions) ? bak.data.sessions.length : 0);
      const typesCount = s.sessionTypes ?? (Array.isArray(bak.data?.sessionTypes) ? bak.data.sessionTypes.length : 0);

      return `
        <tr>
          <td><strong>#${index + 1}</strong></td>
          <td style="white-space: nowrap;">${escapeHtml(formatBackupTimestamp(bak.timestamp))}</td>
          <td>${escapeHtml(bak.reason || 'Database update')}</td>
          <td style="font-size: 0.82rem; color: var(--text-secondary);">
            ${clientsCount} client${clientsCount === 1 ? '' : 's'} &bull;
            ${sessionsCount} session${sessionsCount === 1 ? '' : 's'} &bull;
            ${typesCount} type${typesCount === 1 ? '' : 's'}
          </td>
          <td style="text-align: right; white-space: nowrap;">
            <button class="btn btn-xs btn-primary" onclick="restoreBackup('${bak.id}')">Restore</button>
            <button class="btn btn-xs btn-secondary" onclick="downloadBackupSnapshot('${bak.id}')">Download</button>
          </td>
        </tr>
      `;
    })
    .join('');
}

function createManualBackup() {
  captureBackupSnapshot(structuredClone(db), 'Manual snapshot');
  setBackupChangeCount(0);
  renderBackupHistory();
  showToast('Manual database snapshot saved!');
}

function restoreBackup(backupId) {
  const backups = getBackupsList();
  const bak = backups.find((b) => b.id === backupId);
  if (!bak || !bak.data) {
    showToast('Backup snapshot not found.', 'error');
    return;
  }

  const s = bak.summary || {};
  const clientsCount = s.clients ?? bak.data.clients?.length ?? 0;
  const sessionsCount = s.sessions ?? bak.data.sessions?.length ?? 0;

  if (
    !confirm(
      `Restore database from ${formatBackupTimestamp(bak.timestamp)}?\n\n` +
        `Snapshot contains: ${clientsCount} client(s) and ${sessionsCount} session(s).\n` +
        `Your current database will also be saved into backup history before restoring.`
    )
  ) {
    return;
  }

  db = {
    ...structuredClone(DEFAULT_SEED_DB),
    ...structuredClone(bak.data),
    businessProfile: {
      ...DEFAULT_SEED_DB.businessProfile,
      ...(bak.data.businessProfile || {})
    },
    invoiceOverrides: bak.data.invoiceOverrides || {}
  };

  saveAndRefresh(`Restored backup from ${formatBackupTimestamp(bak.timestamp)}`);
}

function downloadBackupSnapshot(backupId) {
  const backups = getBackupsList();
  const bak = backups.find((b) => b.id === backupId);
  if (!bak || !bak.data) {
    showToast('Backup snapshot not found.', 'error');
    return;
  }

  const blob = new Blob([JSON.stringify(bak.data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const stamp = (bak.timestamp || '').slice(0, 19).replace(/[:T]/g, '-');
  a.href = url;
  a.download = `cm-care-coaching-backup-${stamp}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('Backup snapshot downloaded!');
}

// CRUD Operations: Clients
function getCheckedAllowedTypeIdsInClientModal() {
  const checkboxes = document.querySelectorAll(
    '#clientAllowedTypesList input[type="checkbox"]:checked'
  );
  return Array.from(checkboxes).map((cb) => cb.value);
}

function syncClientModalDefaultDropdown(preferredDefaultId = null) {
  const defTypeSelect = document.getElementById('clientFormDefaultType');
  const currentDefault = preferredDefaultId !== null ? preferredDefaultId : defTypeSelect.value;
  const checkedIds = getCheckedAllowedTypeIdsInClientModal();

  // Only allow selecting a Default Session Type from the ticked Allowed Session Types
  // (or if none are ticked yet, show all and ticking happens automatically on selection)
  const pool =
    checkedIds.length > 0
      ? db.sessionTypes.filter((st) => checkedIds.includes(st.id))
      : db.sessionTypes;

  defTypeSelect.innerHTML =
    `<option value="">— None —</option>` +
    pool
      .map((st) => `<option value="${st.id}">${escapeHtml(st.name)} (${formatGBP(st.price)})</option>`)
      .join('');

  if (currentDefault && pool.some((st) => st.id === currentDefault)) {
    defTypeSelect.value = currentDefault;
  } else if (checkedIds.length === 1) {
    defTypeSelect.value = checkedIds[0];
  } else {
    defTypeSelect.value = '';
  }
}

function renderClientModalAllowedChecklist(selectedIds = [], preferredDefaultId = '') {
  const listEl = document.getElementById('clientAllowedTypesList');
  if (!listEl) return;

  const selectedSet = new Set(selectedIds);
  if (preferredDefaultId) selectedSet.add(preferredDefaultId);

  if (db.sessionTypes.length === 0) {
    listEl.innerHTML = `<div style="color: var(--text-muted); font-size: 0.82rem; padding: 0.4rem;">No session types created yet.</div>`;
    syncClientModalDefaultDropdown('');
    return;
  }

  listEl.innerHTML = db.sessionTypes
    .map((st) => {
      const isChecked = selectedSet.has(st.id);
      return `
        <label class="allowed-type-item ${isChecked ? 'checked' : ''}">
          <span class="allowed-type-left">
            <input type="checkbox" value="${st.id}" ${isChecked ? 'checked' : ''} />
            <span class="color-dot" style="background: ${st.color || '#2563eb'};"></span>
            <span>${escapeHtml(st.name)}</span>
          </span>
          <span class="allowed-type-price">${formatGBP(st.price)}</span>
        </label>
      `;
    })
    .join('');

  listEl.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
    cb.addEventListener('change', () => {
      const labelItem = cb.closest('.allowed-type-item');
      if (labelItem) labelItem.classList.toggle('checked', cb.checked);
      syncClientModalDefaultDropdown();
    });
  });

  syncClientModalDefaultDropdown(preferredDefaultId);
}

function openClientModal(clientId = null) {
  const modal = document.getElementById('clientModal');
  const title = document.getElementById('clientModalTitle');

  if (clientId) {
    const client = getClientById(clientId);
    if (!client) return;
    title.textContent = `Edit Client — ${client.name}`;
    document.getElementById('clientFormId').value = client.id;
    document.getElementById('clientFormName').value = client.name || '';
    document.getElementById('clientFormEmail').value = client.email || '';
    document.getElementById('clientFormPhone').value = client.phone || '';
    document.getElementById('clientFormAddress').value = client.address || '';
    document.getElementById('clientFormStatus').value = client.status || 'active';
    document.getElementById('clientFormNotes').value = client.notes || '';

    const allowedIds = Array.isArray(client.allowedSessionTypeIds)
      ? client.allowedSessionTypeIds
      : [];
    renderClientModalAllowedChecklist(allowedIds, client.defaultSessionTypeId || '');
  } else {
    title.textContent = 'Add New Client';
    document.getElementById('clientForm').reset();
    document.getElementById('clientFormId').value = '';
    document.getElementById('clientFormStatus').value = 'active';
    renderClientModalAllowedChecklist([], '');
  }

  modal.classList.add('open');
}

function deleteClient(clientId) {
  const client = getClientById(clientId);
  if (!client) return;
  const sessionCount = db.sessions.filter((s) => s.clientId === clientId).length;
  const msg =
    sessionCount > 0
      ? `Delete "${client.name}" and their ${sessionCount} recorded session(s)? (Tip: You can also Edit the client and set Status to Archived to keep past history.)`
      : `Remove client "${client.name}"?`;

  if (!confirm(msg)) return;
  db.clients = db.clients.filter((c) => c.id !== clientId);
  db.sessions = db.sessions.filter((s) => s.clientId !== clientId);
  saveAndRefresh(`Removed client ${client.name}`);
}

// CRUD Operations: Session Types
function openSessionTypeModal(typeId = null) {
  const modal = document.getElementById('sessionTypeModal');
  const title = document.getElementById('sessionTypeModalTitle');

  if (typeId) {
    const st = getSessionTypeById(typeId);
    if (!st) return;
    title.textContent = 'Edit Session Type';
    document.getElementById('sessionTypeFormId').value = st.id;
    document.getElementById('sessionTypeFormName').value = st.name || '';
    document.getElementById('sessionTypeFormPrice').value = st.price ?? 45;
    document.getElementById('sessionTypeFormDuration').value = st.duration ?? 60;
    document.getElementById('sessionTypeFormColor').value = st.color || '#2563eb';
    document.getElementById('sessionTypeFormDesc').value = st.description || '';
  } else {
    title.textContent = 'Add Session Type';
    document.getElementById('sessionTypeForm').reset();
    document.getElementById('sessionTypeFormId').value = '';
    document.getElementById('sessionTypeFormDuration').value = 60;
    document.getElementById('sessionTypeFormColor').value = '#2563eb';
  }

  modal.classList.add('open');
}

function deleteSessionType(typeId) {
  const st = getSessionTypeById(typeId);
  if (!st) return;
  const usedCount = db.sessions.filter((s) => s.sessionTypeId === typeId).length;
  const confirmMsg =
    usedCount > 0
      ? `"${st.name}" is used in ${usedCount} logged session(s). Delete this session type anyway?`
      : `Delete session type "${st.name}"?`;

  if (!confirm(confirmMsg)) return;
  db.sessionTypes = db.sessionTypes.filter((t) => t.id !== typeId);
  saveAndRefresh(`Removed session type ${st.name}`);
}

// CRUD Operations: Sessions
function populateSessionModalTypesForClient(clientId, currentSessionTypeId = null) {
  const client = getClientById(clientId);
  const typeSelect = document.getElementById('sessionFormType');
  const noticeEl = document.getElementById('sessionAllowedTypesNotice');
  const saveBtn = document.getElementById('sessionSaveBtn');

  let allowedTypes = getClientAllowedSessionTypes(client);

  // If editing an existing session whose type was previously logged, ensure it remains selectable
  if (currentSessionTypeId && !allowedTypes.some((st) => st.id === currentSessionTypeId)) {
    const existingSt = getSessionTypeById(currentSessionTypeId);
    if (existingSt) {
      allowedTypes = [...allowedTypes, existingSt];
    }
  }

  if (allowedTypes.length === 0) {
    typeSelect.innerHTML = `<option value="">— No allowed session types assigned to ${escapeHtml(client ? client.name : 'client')} —</option>`;
    typeSelect.disabled = true;
    document.getElementById('sessionFormPrice').value = '';
    if (saveBtn) saveBtn.disabled = true;
    if (noticeEl) {
      noticeEl.style.display = 'flex';
      noticeEl.className = 'session-type-restriction-notice';
      noticeEl.innerHTML = `
        <span>No session types are assigned to <strong>${escapeHtml(client ? client.name : 'this client')}</strong> yet. Assign their allowed session types first to prevent logging errors.</span>
        <button type="button" class="btn btn-xs btn-primary" onclick="document.getElementById('sessionModal').classList.remove('open'); openClientModal('${client ? client.id : ''}')">
          Assign Session Types
        </button>
      `;
    }
    return;
  }

  typeSelect.disabled = false;
  if (saveBtn) saveBtn.disabled = false;

  typeSelect.innerHTML = allowedTypes
    .map((st) => `<option value="${st.id}">${escapeHtml(st.name)} (${formatGBP(st.price)})</option>`)
    .join('');

  const preferredId =
    currentSessionTypeId && allowedTypes.some((st) => st.id === currentSessionTypeId)
      ? currentSessionTypeId
      : client?.defaultSessionTypeId && allowedTypes.some((st) => st.id === client.defaultSessionTypeId)
        ? client.defaultSessionTypeId
        : allowedTypes[0].id;

  typeSelect.value = preferredId;
  const chosenSt = getSessionTypeById(preferredId);
  if (chosenSt && !currentSessionTypeId) {
    document.getElementById('sessionFormPrice').value = chosenSt.price;
  }

  if (noticeEl) {
    noticeEl.style.display = 'flex';
    noticeEl.className = '';
    noticeEl.style.cssText =
      'display: flex; align-items: center; justify-content: space-between; font-size: 0.76rem; color: var(--text-muted); margin-top: 0.3rem;';
    noticeEl.innerHTML = `
      <span>Showing ${allowedTypes.length} allowed session type${allowedTypes.length === 1 ? '' : 's'} assigned to <strong>${escapeHtml(client.name)}</strong>.</span>
      <a href="javascript:void(0)" onclick="document.getElementById('sessionModal').classList.remove('open'); openClientModal('${client.id}')" style="color: var(--primary); font-weight: 600; text-decoration: none;">Edit client's allowed types &rarr;</a>
    `;
  }
}

function openSessionModal(sessionId = null, prefillClientId = null) {
  if (db.clients.length === 0) {
    showToast('Please add a client first before logging a session.', 'error');
    openClientModal();
    return;
  }
  if (db.sessionTypes.length === 0) {
    showToast('Please add a session type first.', 'error');
    openSessionTypeModal();
    return;
  }

  const modal = document.getElementById('sessionModal');
  const title = document.getElementById('sessionModalTitle');
  const clientSelect = document.getElementById('sessionFormClient');

  clientSelect.innerHTML = db.clients
    .map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`)
    .join('');

  if (sessionId) {
    const ses = db.sessions.find((s) => s.id === sessionId);
    if (!ses) return;
    title.textContent = 'Edit Logged Session';
    document.getElementById('sessionFormId').value = ses.id;
    clientSelect.value = ses.clientId;
    populateSessionModalTypesForClient(ses.clientId, ses.sessionTypeId);
    document.getElementById('sessionFormDate').value = ses.date;
    document.getElementById('sessionFormQty').value = ses.quantity || 1;
    document.getElementById('sessionFormPrice').value = ses.unitPrice;
    document.getElementById('sessionFormNotes').value = ses.notes || '';
  } else {
    title.textContent = 'Log Training Session';
    document.getElementById('sessionForm').reset();
    document.getElementById('sessionFormId').value = '';

    const chosenClientId = prefillClientId || db.clients[0].id;
    clientSelect.value = chosenClientId;
    populateSessionModalTypesForClient(chosenClientId, null);

    document.getElementById('sessionFormQty').value = 1;

    // Default date inside activeMonth if activeMonth is not current month
    const today = getTodayDateString();
    if (today.startsWith(activeMonth)) {
      document.getElementById('sessionFormDate').value = today;
    } else {
      document.getElementById('sessionFormDate').value = `${activeMonth}-01`;
    }
  }

  modal.classList.add('open');
}

function quickIncrementSession(clientId) {
  const client = getClientById(clientId);
  if (!client) return;

  const allowedTypes = getClientAllowedSessionTypes(client);
  if (allowedTypes.length === 0) {
    showToast(
      `Please assign allowed session types for ${client.name} first to prevent logging errors.`,
      'error'
    );
    openClientModal(client.id);
    return;
  }

  const defaultSt =
    (client.defaultSessionTypeId &&
      allowedTypes.find((st) => st.id === client.defaultSessionTypeId)) ||
    (allowedTypes.length === 1 ? allowedTypes[0] : null);

  if (!defaultSt) {
    showToast(
      `${client.name} has multiple allowed session types and no default set — choose the session type to log.`,
      'success'
    );
    openSessionModal(null, client.id);
    return;
  }

  const today = getTodayDateString();
  const sessionDate = today.startsWith(activeMonth) ? today : `${activeMonth}-15`;

  db.sessions.push({
    id: uid('ses'),
    clientId: client.id,
    sessionTypeId: defaultSt.id,
    date: sessionDate,
    month: activeMonth,
    quantity: 1,
    unitPrice: Number(defaultSt.price) || 0,
    notes: ''
  });

  saveAndRefresh(`+1 ${defaultSt.name} logged for ${client.name} (${formatMonthDisplay(activeMonth)})`);
}

function deleteSession(sessionId) {
  const ses = db.sessions.find((s) => s.id === sessionId);
  if (!ses) return;
  if (!confirm('Delete this logged session?')) return;
  db.sessions = db.sessions.filter((s) => s.id !== sessionId);
  saveAndRefresh('Session removed');
}

// Event Listeners Setup
function bindEvents() {
  // Sidebar navigation
  document.querySelectorAll('.nav-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      switchView(btn.dataset.view);
    });
  });

  // Month picker controls
  document.getElementById('globalMonthPicker').addEventListener('change', (e) => {
    changeActiveMonth(e.target.value);
  });
  document.getElementById('prevMonthBtn').addEventListener('click', () => stepMonth(-1));
  document.getElementById('nextMonthBtn').addEventListener('click', () => stepMonth(1));

  // Top action buttons
  document.getElementById('topLogSessionBtn').addEventListener('click', () => openSessionModal());
  document.getElementById('trackerAddClientBtn').addEventListener('click', () => openClientModal());
  document.getElementById('openAddClientModalBtn').addEventListener('click', () => openClientModal());
  document
    .getElementById('openAddSessionTypeModalBtn')
    .addEventListener('click', () => openSessionTypeModal());

  // Modal Close Buttons
  document.querySelectorAll('[data-close-modal]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = btn.getAttribute('data-close-modal');
      document.getElementById(target)?.classList.remove('open');
    });
  });

  // Close modal when clicking backdrop
  document.querySelectorAll('.modal-backdrop').forEach((backdrop) => {
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) backdrop.classList.remove('open');
    });
  });

  // Auto-update session form allowed types & rate when client or session type changes
  document.getElementById('sessionFormClient').addEventListener('change', (e) => {
    populateSessionModalTypesForClient(e.target.value, null);
  });

  document.getElementById('sessionFormType').addEventListener('change', (e) => {
    const st = getSessionTypeById(e.target.value);
    if (st) {
      document.getElementById('sessionFormPrice').value = st.price;
    }
  });

  // Client Modal Allowed Session Types Select All / Clear All / Default sync
  document.getElementById('clientAllowedSelectAllBtn').addEventListener('click', () => {
    document
      .querySelectorAll('#clientAllowedTypesList input[type="checkbox"]')
      .forEach((cb) => {
        cb.checked = true;
        cb.closest('.allowed-type-item')?.classList.add('checked');
      });
    syncClientModalDefaultDropdown();
  });

  document.getElementById('clientAllowedClearAllBtn').addEventListener('click', () => {
    document
      .querySelectorAll('#clientAllowedTypesList input[type="checkbox"]')
      .forEach((cb) => {
        cb.checked = false;
        cb.closest('.allowed-type-item')?.classList.remove('checked');
      });
    syncClientModalDefaultDropdown('');
  });

  document.getElementById('clientFormDefaultType').addEventListener('change', (e) => {
    const selectedDefault = e.target.value;
    if (selectedDefault) {
      const cb = document.querySelector(
        `#clientAllowedTypesList input[type="checkbox"][value="${selectedDefault}"]`
      );
      if (cb && !cb.checked) {
        cb.checked = true;
        cb.closest('.allowed-type-item')?.classList.add('checked');
        syncClientModalDefaultDropdown(selectedDefault);
      }
    }
  });

  // Form Submits: Client
  document.getElementById('clientForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const id = document.getElementById('clientFormId').value;
    const defaultSessionTypeId = document.getElementById('clientFormDefaultType').value;
    const allowedSet = new Set(getCheckedAllowedTypeIdsInClientModal());
    if (defaultSessionTypeId) {
      allowedSet.add(defaultSessionTypeId);
    }

    const payload = {
      name: document.getElementById('clientFormName').value.trim(),
      email: document.getElementById('clientFormEmail').value.trim(),
      phone: document.getElementById('clientFormPhone').value.trim(),
      address: document.getElementById('clientFormAddress').value.trim(),
      defaultSessionTypeId,
      allowedSessionTypeIds: Array.from(allowedSet),
      status: document.getElementById('clientFormStatus').value,
      notes: document.getElementById('clientFormNotes').value.trim()
    };

    if (id) {
      const idx = db.clients.findIndex((c) => c.id === id);
      if (idx !== -1) {
        db.clients[idx] = { ...db.clients[idx], ...payload };
      }
      document.getElementById('clientModal').classList.remove('open');
      saveAndRefresh(`Updated client ${payload.name}`);
    } else {
      db.clients.push({
        id: uid('cl'),
        ...payload,
        createdAt: new Date().toISOString()
      });
      document.getElementById('clientModal').classList.remove('open');
      saveAndRefresh(`Added client ${payload.name}`);
    }
  });

  // Form Submits: Session Type
  document.getElementById('sessionTypeForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const id = document.getElementById('sessionTypeFormId').value;
    const payload = {
      name: document.getElementById('sessionTypeFormName').value.trim(),
      price: Number(document.getElementById('sessionTypeFormPrice').value) || 0,
      duration: Number(document.getElementById('sessionTypeFormDuration').value) || 60,
      color: document.getElementById('sessionTypeFormColor').value || '#2563eb',
      description: document.getElementById('sessionTypeFormDesc').value.trim()
    };

    if (id) {
      const idx = db.sessionTypes.findIndex((t) => t.id === id);
      if (idx !== -1) {
        db.sessionTypes[idx] = { ...db.sessionTypes[idx], ...payload };
      }
      document.getElementById('sessionTypeModal').classList.remove('open');
      saveAndRefresh(`Updated session type ${payload.name}`);
    } else {
      db.sessionTypes.push({
        id: uid('st'),
        ...payload
      });
      document.getElementById('sessionTypeModal').classList.remove('open');
      saveAndRefresh(`Added session type ${payload.name}`);
    }
  });

  // Form Submits: Log Session
  document.getElementById('sessionForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const id = document.getElementById('sessionFormId').value;
    const sessionTypeId = document.getElementById('sessionFormType').value;
    if (!sessionTypeId) {
      showToast('Please assign allowed session types to this client first.', 'error');
      return;
    }
    const dateVal = document.getElementById('sessionFormDate').value;
    const monthVal = dateVal.slice(0, 7);

    const payload = {
      clientId: document.getElementById('sessionFormClient').value,
      sessionTypeId,
      date: dateVal,
      month: monthVal,
      quantity: Math.max(1, Number(document.getElementById('sessionFormQty').value) || 1),
      unitPrice: Number(document.getElementById('sessionFormPrice').value) || 0,
      notes: document.getElementById('sessionFormNotes').value.trim()
    };

    if (id) {
      const idx = db.sessions.findIndex((s) => s.id === id);
      if (idx !== -1) {
        db.sessions[idx] = { ...db.sessions[idx], ...payload };
      }
      document.getElementById('sessionModal').classList.remove('open');
      saveAndRefresh('Updated training session');
    } else {
      db.sessions.push({
        id: uid('ses'),
        ...payload
      });
      // Switch activeMonth to the logged session's month so user sees it right away
      activeMonth = monthVal;
      document.getElementById('globalMonthPicker').value = activeMonth;
      document.getElementById('sessionModal').classList.remove('open');
      saveAndRefresh('Logged training session');
    }
  });

  // Tracker & Client Filters
  document.getElementById('logClientFilter').addEventListener('change', () => {
    renderSessionLogTable(getSessionsForMonth(activeMonth));
  });
  document.getElementById('logTypeFilter').addEventListener('change', () => {
    renderSessionLogTable(getSessionsForMonth(activeMonth));
  });
  document.getElementById('clientSearchInput').addEventListener('input', renderClientsView);
  document.getElementById('clientStatusFilter').addEventListener('change', renderClientsView);

  // Invoice Builder Events
  document.getElementById('invoiceClientSelect').addEventListener('change', () => {
    loadInvoiceMetaFields();
    renderInvoicePreviewPaper();
  });
  document.getElementById('invoiceMonthSelect').addEventListener('change', (e) => {
    activeMonth = e.target.value;
    document.getElementById('globalMonthPicker').value = activeMonth;
    loadInvoiceMetaFields();
    renderInvoicePreviewPaper();
  });
  ['invoiceDisplayMode', 'invoiceNumberInput', 'invoiceIssueDate', 'invoiceDueDate', 'invoiceDiscountInput', 'invoiceCustomNote'].forEach(
    (fieldId) => {
      document.getElementById(fieldId).addEventListener('input', () => {
        renderInvoicePreviewPaper();
      });
    }
  );
  document.getElementById('saveInvoiceMetaBtn').addEventListener('click', () => {
    saveCurrentInvoiceMeta(false);
  });
  document.getElementById('printInvoiceBtn').addEventListener('click', () => {
    saveCurrentInvoiceMeta(true);
    window.print();
  });
  document.getElementById('batchDownloadZipBtn').addEventListener('click', batchDownloadMonthZip);
  document.getElementById('batchUploadDriveBtn').addEventListener('click', batchUploadMonthToGoogleDrive);

  // Google Drive Settings
  document.getElementById('gdriveConfigForm').addEventListener('submit', (e) => {
    e.preventDefault();
    gdriveConfig.clientId = document.getElementById('gdriveClientId').value.trim();
    gdriveConfig.rootFolderInput = document.getElementById('gdriveRootFolderInput').value.trim();
    saveGDriveConfig();
    updateGDriveStatusUI();
    showToast('Google Drive settings saved!');
  });

  document.getElementById('gdriveConnectBtn').addEventListener('click', async () => {
    document.getElementById('gdriveConfigForm').dispatchEvent(new Event('submit'));
    try {
      const token = await requestGoogleDriveAccessToken();
      const targetId = extractGoogleDriveFolderId(gdriveConfig.rootFolderInput);
      if (targetId) {
        const res = await fetch(
          `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(targetId)}?fields=id,name,mimeType&supportsAllDrives=true`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          const apiMsg = errData.error?.message || `HTTP ${res.status}`;
          if (res.status === 401 || res.status === 403) {
            gdriveAccessToken = null;
            gdriveTokenExpiresAt = 0;
            updateGDriveStatusUI();
          }
          throw new Error(`${apiMsg} (Folder ID: ${targetId})`);
        }
        const folder = await res.json();
        showToast(`Connected to Google Drive folder: "${folder.name}"!`);
      } else {
        showToast('Connected to Google Drive! Invoices will be saved in "CM Care and Coaching Invoices".');
      }
    } catch (err) {
      showToast(`Google Drive connection failed: ${err.message}`, 'error');
    }
  });

  // GitHub Settings & Sync Buttons
  document.getElementById('githubConfigForm').addEventListener('submit', (e) => {
    e.preventDefault();
    ghConfig.owner = document.getElementById('ghOwner').value.trim();
    ghConfig.repo = document.getElementById('ghRepo').value.trim();
    ghConfig.branch = document.getElementById('ghBranch').value.trim() || 'main';
    ghConfig.path = document.getElementById('ghPath').value.trim() || 'data/db.json';
    ghConfig.token = document.getElementById('ghToken').value.trim();
    ghConfig.autoSync = document.getElementById('ghAutoSync').checked;
    saveGitHubConfig();
    updateSyncStatusUI();
    showToast('GitHub sync settings saved!');
  });

  document.getElementById('quickPushBtn').addEventListener('click', () => pushToGitHub(false));
  document.getElementById('quickPullBtn').addEventListener('click', () => pullFromGitHub(false));
  document.getElementById('settingsPushBtn').addEventListener('click', () => {
    document.getElementById('githubConfigForm').dispatchEvent(new Event('submit'));
    pushToGitHub(false);
  });
  document.getElementById('settingsPullBtn').addEventListener('click', () => {
    document.getElementById('githubConfigForm').dispatchEvent(new Event('submit'));
    pullFromGitHub(false);
  });

  // Business Profile Form
  document.getElementById('businessProfileForm').addEventListener('submit', (e) => {
    e.preventDefault();
    db.businessProfile = {
      name: document.getElementById('bizName').value.trim(),
      initials: document.getElementById('bizInitials').value.trim() || 'CM',
      tagline: document.getElementById('bizTagline').value.trim(),
      email: document.getElementById('bizEmail').value.trim(),
      phone: document.getElementById('bizPhone').value.trim(),
      address: document.getElementById('bizAddress').value.trim(),
      bankName: document.getElementById('bizBankName').value.trim(),
      bankAccountName: document.getElementById('bizBankAccountName').value.trim(),
      sortCode: document.getElementById('bizSortCode').value.trim(),
      accountNumber: document.getElementById('bizAccountNumber').value.trim(),
      paymentTerms: document.getElementById('bizPaymentTerms').value.trim()
    };
    saveAndRefresh('Business profile updated!');
  });

  // Export / Import / Reset Data
  const exportHandler = () => {
    const blob = new Blob([JSON.stringify(db, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cm-care-coaching-db-${activeMonth}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Database backup downloaded!');
  };
  document.getElementById('downloadBackupBtn').addEventListener('click', exportHandler);
  document.getElementById('exportDbBtnHistory').addEventListener('click', exportHandler);

  document.getElementById('importBackupInput').addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const imported = JSON.parse(ev.target.result);
        if (!Array.isArray(imported.clients) || !Array.isArray(imported.sessions)) {
          throw new Error('Invalid database JSON format.');
        }
        db = {
          ...structuredClone(DEFAULT_SEED_DB),
          ...imported
        };
        saveAndRefresh('Database imported successfully!');
      } catch (err) {
        showToast(`Import failed: ${err.message}`, 'error');
      }
    };
    reader.readAsText(file);
  });

  document.getElementById('createManualBackupBtn').addEventListener('click', createManualBackup);

  document.getElementById('clearAllSessionsBtn').addEventListener('click', () => {
    if (
      !confirm(
        'Clear all sample clients and sessions so you can start with an empty database? (Your Business Profile and Session Types will be kept.)'
      )
    ) {
      return;
    }
    db.clients = [];
    db.sessions = [];
    db.invoiceOverrides = {};
    saveAndRefresh('Sample clients and sessions cleared!');
  });
}

// Expose inline onclick handlers to global window scope
window.openClientModal = openClientModal;
window.deleteClient = deleteClient;
window.openSessionTypeModal = openSessionTypeModal;
window.deleteSessionType = deleteSessionType;
window.openSessionModal = openSessionModal;
window.quickIncrementSession = quickIncrementSession;
window.deleteSession = deleteSession;
window.openInvoiceForClient = openInvoiceForClient;
window.jumpToMonthTracker = jumpToMonthTracker;
window.jumpToMonthInvoices = jumpToMonthInvoices;
window.restoreBackup = restoreBackup;
window.downloadBackupSnapshot = downloadBackupSnapshot;

document.addEventListener('DOMContentLoaded', initApp);
