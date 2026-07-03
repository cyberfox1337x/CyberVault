// Search Chat Module — Ctrl+K command palette for searching conversations

import uiModule from './ui.js';
import sessionModule from './sessions.js';

let API_BASE = '';
let debounceTimer = null;
let selectedIndex = -1;
let results = [];

function el(id) { return document.getElementById(id); }

function normSearch(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function scoreSearchTarget(item, query) {
  const q = normSearch(query);
  if (!q) return 0;
  const label = normSearch(item.label);
  const group = normSearch(item.group);
  const detail = normSearch(item.detail);
  const keywords = normSearch(item.keywords);
  const hay = [label, group, detail, keywords].join('');
  if (label === q) return 8;
  if (label.startsWith(q)) return 7;
  if (hay.includes(q)) return 6;
  const words = String([item.label, item.group, item.detail, item.keywords].join(' '))
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .map(normSearch);
  const parts = String(query).toLowerCase().split(/[^a-z0-9]+/).filter(Boolean).map(normSearch);
  if (parts.length && parts.every((part) => words.some((word) => word.startsWith(part) || word.includes(part)))) return 5;
  return 0;
}

function clickTarget(selector) {
  const target = document.querySelector(selector);
  if (target) target.click();
}

function openSettingsTarget(tab, focusSelector, providerName) {
  if (window.settingsModule && typeof window.settingsModule.open === 'function') {
    window.settingsModule.open(tab || 'services');
    setTimeout(() => {
      if (providerName) {
        const select = el('adm-epProvider');
        const opt = select && Array.from(select.options).find(o => normSearch(o.textContent) === normSearch(providerName));
        if (select && opt) {
          select.value = opt.value;
          select.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }
      const target = focusSelector ? document.querySelector(focusSelector) : null;
      if (target) {
        target.scrollIntoView({ block: 'center', inline: 'nearest' });
        if (typeof target.focus === 'function') target.focus({ preventScroll: true });
        target.classList.add('search-jump-highlight');
        setTimeout(() => target.classList.remove('search-jump-highlight'), 1200);
      }
    }, 80);
  }
}

function openOAuthTarget(providerValue) {
  if (window.settingsModule && typeof window.settingsModule.open === 'function') {
    window.settingsModule.open('services');
    setTimeout(() => {
      const section = el('adm-epOAuthSection');
      const collapse = el('adm-epOAuthCollapseBtn');
      if (section && section.classList.contains('collapsed') && collapse) collapse.click();
      const select = el('adm-oauthProvider');
      if (select && providerValue) {
        select.value = providerValue;
        select.dispatchEvent(new Event('change', { bubbles: true }));
      }
      const target = el('adm-oauthSignInBtn') || el('adm-oauth-provider-btn');
      if (target) {
        target.scrollIntoView({ block: 'center', inline: 'nearest' });
        if (typeof target.focus === 'function') target.focus({ preventScroll: true });
        target.classList.add('search-jump-highlight');
        setTimeout(() => target.classList.remove('search-jump-highlight'), 1200);
      }
    }, 100);
  }
}

const SOURCE_TARGETS = [
  { label: 'DeepSeek', group: 'Provider', detail: 'Open Settings -> Add API Models with DeepSeek selected.', keywords: 'deep seek deepseek api model provider endpoint ai', action: () => openSettingsTarget('services', '#adm-provider-btn', 'DeepSeek') },
  { label: 'OpenAI', group: 'Provider', detail: 'Open Settings -> Add API Models with OpenAI selected.', keywords: 'open ai openai api model provider endpoint chatgpt codex', action: () => openSettingsTarget('services', '#adm-provider-btn', 'OpenAI') },
  { label: 'ChatGPT Subscription', group: 'Provider', detail: 'Open Settings -> Add API Models with ChatGPT Subscription selected.', keywords: 'chatgpt subscription codex oauth login plan openai', action: () => openSettingsTarget('services', '#adm-provider-btn', 'ChatGPT Subscription') },
  { label: 'ChatGPT OAuth', group: 'OAuth', detail: 'Open Settings -> Add OAuth Models with ChatGPT OAuth selected.', keywords: 'chatgpt oauth subscription codex openai login plan sign in paid plan', action: () => openOAuthTarget('chatgpt-subscription') },
  { label: 'Claude OAuth', group: 'OAuth', detail: 'Open Settings -> Add OAuth Models with Claude OAuth selected.', keywords: 'claude oauth anthropic login sign in paid plan subscription', action: () => openOAuthTarget('claude-oauth') },
  { label: 'GitHub Copilot', group: 'Provider', detail: 'Open Settings -> Add API Models with GitHub Copilot selected.', keywords: 'github copilot oauth login provider model', action: () => openSettingsTarget('services', '#adm-provider-btn', 'GitHub Copilot') },
  { label: 'Anthropic', group: 'Provider', detail: 'Open Settings -> Add API Models with Anthropic selected.', keywords: 'anthropic claude provider api model', action: () => openSettingsTarget('services', '#adm-provider-btn', 'Anthropic') },
  { label: 'OpenRouter', group: 'Provider', detail: 'Open Settings -> Add API Models with OpenRouter selected.', keywords: 'openrouter open router provider api model', action: () => openSettingsTarget('services', '#adm-provider-btn', 'OpenRouter') },
  { label: 'Ollama Cloud', group: 'Provider', detail: 'Open Settings -> Add API Models with Ollama Cloud selected.', keywords: 'ollama cloud local models provider', action: () => openSettingsTarget('services', '#adm-provider-btn', 'Ollama Cloud') },
  { label: 'Groq', group: 'Provider', detail: 'Open Settings -> Add API Models with Groq selected.', keywords: 'groq provider api model', action: () => openSettingsTarget('services', '#adm-provider-btn', 'Groq') },
  { label: 'Mistral', group: 'Provider', detail: 'Open Settings -> Add API Models with Mistral selected.', keywords: 'mistral provider api model', action: () => openSettingsTarget('services', '#adm-provider-btn', 'Mistral') },
  { label: 'Add API Models', group: 'Settings', detail: 'Connect cloud providers and API endpoints.', keywords: 'add api models endpoints provider settings', action: () => openSettingsTarget('services', '#adm-epUrl') },
  { label: 'Added Models', group: 'Settings', detail: 'View and probe connected endpoints.', keywords: 'added models endpoints probe offline settings', action: () => openSettingsTarget('added-models', '#adm-epList-local') },
  { label: 'AI Defaults', group: 'Settings', detail: 'Choose default chat, utility, vision, image, TTS, and STT models.', keywords: 'ai defaults default model utility vision image tts stt', action: () => openSettingsTarget('ai', '#set-defaultModelSelect') },
  { label: 'Search Settings', group: 'Settings', detail: 'Configure web search providers and fallback chains.', keywords: 'search settings searxng brave google tavily serper web', action: () => openSettingsTarget('search', '#set-searchProvider') },
  { label: 'Account', group: 'Settings', detail: 'Open account, password, logout, and 2FA settings.', keywords: 'account user password logout 2fa admin', action: () => openSettingsTarget('account', '#settings-logout-btn') },
  { label: 'Appearance', group: 'Settings', detail: 'Adjust theme, density, sidebar visibility, and UI controls.', keywords: 'appearance theme dark sidebar visibility ui layout', action: () => openSettingsTarget('appearance') },
  { label: 'Calendar', group: 'Tool', detail: 'Open the Calendar tool.', keywords: 'calendar events schedule reminders', action: () => clickTarget('#tool-calendar-btn, #rail-calendar') },
  { label: 'Cookbook', group: 'Tool', detail: 'Open Cookbook model serving and dependencies.', keywords: 'cookbook models serve download dependencies settings', action: () => clickTarget('#tool-cookbook-btn, #rail-cookbook') },
  { label: 'Library', group: 'Tool', detail: 'Open chat/document library.', keywords: 'library documents archive chats files', action: () => clickTarget('#tool-library-btn, #rail-archive') },
  { label: 'Skills', group: 'Tool', detail: 'Open Memory -> Skills.', keywords: 'skills memory audit confidence published draft', action: () => { clickTarget('#tool-memory-btn'); setTimeout(() => clickTarget('[data-memory-tab=\"skills\"]'), 80); } },
  { label: 'Memory', group: 'Tool', detail: 'Open Memory management.', keywords: 'memory memories facts saved context', action: () => clickTarget('#tool-memory-btn') },
  { label: 'Email', group: 'Tool', detail: 'Open Email inbox and tasks.', keywords: 'email inbox mail accounts reminders', action: () => clickTarget('#tool-email-btn, #rail-email') },
  { label: 'Gallery', group: 'Tool', detail: 'Open image gallery.', keywords: 'gallery images pictures drafts', action: () => clickTarget('#tool-gallery-btn, #rail-gallery') },
  { label: 'Notes', group: 'Tool', detail: 'Open notes.', keywords: 'notes note editor writing', action: () => clickTarget('#tool-notes-btn, #rail-notes') },
  { label: 'Tasks', group: 'Tool', detail: 'Open scheduled tasks and activity.', keywords: 'tasks scheduled jobs activity', action: () => clickTarget('#tool-tasks-btn, #rail-tasks') },
  { label: 'Theme', group: 'Tool', detail: 'Open theme controls.', keywords: 'theme colors dark appearance', action: () => clickTarget('#tool-theme-btn, #rail-theme') },
];

function getSourceResults(query) {
  return SOURCE_TARGETS
    .map((item) => {
      const score = scoreSearchTarget(item, query);
      return score ? { ...item, score } : null;
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score || a.label.localeCompare(b.label))
    .slice(0, 8);
}

export function openSearch() {
  const overlay = el('search-overlay');
  if (!overlay) return;
  overlay.classList.remove('hidden');
  const input = el('search-input');
  if (input) {
    input.value = '';
    input.focus();
  }
  selectedIndex = -1;
  results = [];
  el('search-results').innerHTML = '';
}

export function closeSearch() {
  const overlay = el('search-overlay');
  if (!overlay) return;
  overlay.classList.add('hidden');
  el('search-results').innerHTML = '';
  selectedIndex = -1;
  results = [];
}

export function isOpen() {
  const overlay = el('search-overlay');
  return overlay && !overlay.classList.contains('hidden');
}

var escapeHtml = uiModule.esc;

function highlightMatch(text, query) {
  if (!query) return escapeHtml(text);
  const escaped = escapeHtml(text);
  const regex = new RegExp('(' + query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi');
  return escaped.replace(regex, '<mark class="search-highlight">$1</mark>');
}

function formatTimestamp(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const diff = now - d;
  if (diff < 86400000) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  if (diff < 604800000) {
    return d.toLocaleDateString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
}

function renderResults(data, query) {
  results = data;
  selectedIndex = -1;
  const container = el('search-results');
  if (!container) return;

  if (!data || data.length === 0) {
    container.innerHTML = query
      ? '<div class="search-empty">No results found</div>'
      : '';
    return;
  }

  // Group by session
  const grouped = {};
  for (const r of data) {
    if (!grouped[r.session_id]) {
      grouped[r.session_id] = { name: r.session_name, items: [] };
    }
    grouped[r.session_id].items.push(r);
  }

  let html = '';
  let idx = 0;
  for (const [sessionId, group] of Object.entries(grouped)) {
    html += `<div class="search-group-header">${escapeHtml(group.name)}</div>`;
    for (const item of group.items) {
      const roleLabel = item.role === 'user' ? 'You' : 'AI';
      html += `<div class="search-result-item" data-index="${idx}" data-session="${escapeHtml(sessionId)}">
        <div class="search-result-role">${roleLabel}</div>
        <div class="search-result-snippet">${highlightMatch(item.content_snippet, query)}</div>
        <div class="search-result-time">${formatTimestamp(item.timestamp)}</div>
      </div>`;
      idx++;
    }
  }
  container.innerHTML = html;

  // Click handlers
  container.querySelectorAll('.search-result-item').forEach(item => {
    item.addEventListener('click', () => {
      const sid = item.dataset.session;
      navigateToSession(sid);
    });
  });
}

function renderInlineResults(container, data, query, onNavigate, sourceResults = [], onSourceNavigate) {
  if (!container) return;
  if ((!data || data.length === 0) && sourceResults.length === 0) {
    container.innerHTML = query
      ? '<div class="search-empty">No results found</div>'
      : '';
    return;
  }

  const grouped = {};
  for (const r of data) {
    if (!grouped[r.session_id]) {
      grouped[r.session_id] = { name: r.session_name, items: [] };
    }
    grouped[r.session_id].items.push(r);
  }

  let html = '';
  sourceResults.forEach((item, sourceIdx) => {
    if (sourceIdx === 0) html += '<div class="search-group-header">CyberVault</div>';
    html += `<div class="search-result-item search-source-item" data-source-index="${sourceIdx}">
      <div class="search-result-role">${escapeHtml(item.group)}</div>
      <div class="search-result-snippet"><strong>${highlightMatch(item.label, query)}</strong><span>${escapeHtml(item.detail)}</span></div>
      <div class="search-result-time">Open</div>
    </div>`;
  });
  if (data && data.length) html += '<div class="search-group-header">Conversations</div>';
  let idx = 0;
  for (const [sessionId, group] of Object.entries(grouped)) {
    html += `<div class="search-group-header">${escapeHtml(group.name)}</div>`;
    for (const item of group.items) {
      const roleLabel = item.role === 'user' ? 'You' : 'AI';
      html += `<div class="search-result-item" data-index="${idx}" data-session="${escapeHtml(sessionId)}">
        <div class="search-result-role">${roleLabel}</div>
        <div class="search-result-snippet">${highlightMatch(item.content_snippet, query)}</div>
        <div class="search-result-time">${formatTimestamp(item.timestamp)}</div>
      </div>`;
      idx++;
    }
  }
  container.innerHTML = html;
  container.querySelectorAll('.search-result-item').forEach(item => {
    item.addEventListener('click', () => {
      if (item.dataset.sourceIndex != null) onSourceNavigate(Number(item.dataset.sourceIndex));
      else onNavigate(item.dataset.session);
    });
  });
}

function navigateToSession(sessionId) {
  closeSearch();
  if (sessionModule && sessionModule.selectSession) {
    sessionModule.selectSession(sessionId);
  }
}

function updateSelection() {
  const container = el('search-results');
  if (!container) return;
  const items = container.querySelectorAll('.search-result-item');
  items.forEach((item, i) => {
    item.classList.toggle('selected', i === selectedIndex);
  });
  // Scroll selected into view
  if (selectedIndex >= 0 && items[selectedIndex]) {
    items[selectedIndex].scrollIntoView({ block: 'nearest' });
  }
}

function handleKeydown(e) {
  if (!isOpen()) return;

  const container = el('search-results');
  const items = container ? container.querySelectorAll('.search-result-item') : [];
  const count = items.length;

  if (e.key === 'ArrowDown') {
    e.preventDefault();
    selectedIndex = count > 0 ? Math.min(selectedIndex + 1, count - 1) : -1;
    updateSelection();
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    selectedIndex = Math.max(selectedIndex - 1, 0);
    updateSelection();
  } else if (e.key === 'Enter') {
    e.preventDefault();
    if (selectedIndex >= 0 && items[selectedIndex]) {
      const sid = items[selectedIndex].dataset.session;
      navigateToSession(sid);
    }
  }
}

function handleInput(e) {
  const query = e.target.value.trim();
  if (debounceTimer) clearTimeout(debounceTimer);

  if (!query) {
    renderResults([], '');
    return;
  }

  debounceTimer = setTimeout(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/search?q=${encodeURIComponent(query)}&limit=20`);
      if (!res.ok) return;
      const data = await res.json();
      renderResults(data, query);
    } catch (err) {
      console.error('Search error:', err);
    }
  }, 300);
}

export function bindInlineSearch(input, opts = {}) {
  if (!input || input.dataset.inlineSearchBound === '1') return;
  input.dataset.inlineSearchBound = '1';

  const host = opts.host || input.closest('.topbar-search') || input.parentElement;
  if (!host || !host.parentElement) return;
  let panel = opts.panel || el('dashboard-search-results');
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'dashboard-search-results';
    panel.className = 'dashboard-search-results search-results hidden';
    panel.setAttribute('role', 'listbox');
    host.insertAdjacentElement('afterend', panel);
  }

  let inlineTimer = null;
  let inlineIndex = -1;
  let inlineResults = [];
  let inlineSources = [];

  const closePanel = () => {
    panel.classList.add('hidden');
    panel.innerHTML = '';
    inlineIndex = -1;
    input.setAttribute('aria-expanded', 'false');
  };
  const openPanel = () => {
    panel.classList.remove('hidden');
    input.setAttribute('aria-expanded', 'true');
  };
  const updateInlineSelection = () => {
    const items = panel.querySelectorAll('.search-result-item');
    items.forEach((item, i) => item.classList.toggle('selected', i === inlineIndex));
    if (inlineIndex >= 0 && items[inlineIndex]) {
      items[inlineIndex].scrollIntoView({ block: 'nearest' });
    }
  };
  const goToSession = (sid) => {
    if (!sid) return;
    closePanel();
    input.value = '';
    if (sessionModule && sessionModule.selectSession) {
      sessionModule.selectSession(sid);
    }
  };
  const goToSource = (idx) => {
    const target = inlineSources[idx];
    if (!target || typeof target.action !== 'function') return;
    closePanel();
    target.action();
  };
  const runSearch = () => {
    const query = input.value.trim();
    if (inlineTimer) clearTimeout(inlineTimer);
    if (!query) {
      inlineResults = [];
      inlineSources = [];
      closePanel();
      return;
    }
    openPanel();
    inlineSources = getSourceResults(query);
    renderInlineResults(panel, [], query, goToSession, inlineSources, goToSource);
    inlineTimer = setTimeout(async () => {
      try {
        const res = await fetch(`${API_BASE}/api/search?q=${encodeURIComponent(query)}&limit=20`);
        if (!res.ok) throw new Error('Search request failed');
        inlineResults = await res.json();
        inlineIndex = -1;
        inlineSources = getSourceResults(query);
        renderInlineResults(panel, inlineResults, query, goToSession, inlineSources, goToSource);
        openPanel();
      } catch (err) {
        console.error('Header search error:', err);
        inlineSources = getSourceResults(query);
        renderInlineResults(panel, [], query, goToSession, inlineSources, goToSource);
        if (!inlineSources.length) panel.innerHTML = '<div class="search-empty">Search failed</div>';
        openPanel();
      }
    }, 220);
  };

  input.setAttribute('aria-haspopup', 'listbox');
  input.setAttribute('aria-expanded', 'false');
  input.setAttribute('aria-controls', panel.id);
  input.addEventListener('input', runSearch);
  input.addEventListener('focus', () => {
    if (input.value.trim() && panel.innerHTML.trim()) openPanel();
  });
  input.addEventListener('keydown', (e) => {
    const items = panel.querySelectorAll('.search-result-item');
    if (e.key === 'Escape') {
      closePanel();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      openPanel();
      inlineIndex = items.length ? Math.min(inlineIndex + 1, items.length - 1) : -1;
      updateInlineSelection();
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      inlineIndex = items.length ? Math.max(inlineIndex - 1, 0) : -1;
      updateInlineSelection();
      return;
    }
    if (e.key === 'Enter') {
      if (inlineIndex >= 0 && items[inlineIndex]) {
        e.preventDefault();
        if (items[inlineIndex].dataset.sourceIndex != null) goToSource(Number(items[inlineIndex].dataset.sourceIndex));
        else goToSession(items[inlineIndex].dataset.session);
      }
    }
  });
  document.addEventListener('click', (e) => {
    if (host.contains(e.target) || panel.contains(e.target)) return;
    closePanel();
  });
}

export function init(apiBase) {
  API_BASE = apiBase || '';

  const input = el('search-input');
  if (input) {
    input.addEventListener('input', handleInput);
    input.addEventListener('keydown', handleKeydown);
  }

  // Close on overlay click (not popup click)
  const overlay = el('search-overlay');
  if (overlay) {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeSearch();
    });
  }
}

const searchChatModule = {
  init,
  openSearch,
  closeSearch,
  isOpen,
  bindInlineSearch,
};

export default searchChatModule;
