import { MASTER_PROMPT } from './prompt.js';

// ── State ──
const state = {
  apiKey: localStorage.getItem('ace_api_key') || '',
  selectedDialects: new Set(['gulf', 'egyptian', 'levantine', 'maghrebi']),
  result: null,
  loading: false,
};

const DIALECT_LABELS = {
  gulf: 'خليجي',
  egyptian: 'مصري',
  levantine: 'شامي',
  maghrebi: 'مغربي',
};

const PLATFORM_LABELS = {
  tiktok_hook: { name: 'TikTok', platform: 'tiktok', icon: '▶' },
  tweet: { name: 'Twitter / X', platform: 'twitter', icon: '𝕏' },
  instagram_caption: { name: 'Instagram', platform: 'instagram', icon: '◎' },
  linkedin_post: { name: 'LinkedIn', platform: 'linkedin', icon: 'in' },
};

// ── DOM Refs ──
const $ = (sel) => document.querySelector(sel);
const apiKeyInput = $('#apiKeyInput');
const keyStatus = $('#keyStatus');
const contentInput = $('#contentInput');
const charCount = $('#charCount');
const dialectSelector = $('#dialectSelector');
const btnGenerate = $('#btnGenerate');
const loadingOverlay = $('#loadingOverlay');
const errorBanner = $('#errorBanner');
const errorMessage = $('#errorMessage');
const errorDismiss = $('#errorDismiss');
const resultsSection = $('#resultsSection');
const analysisGrid = $('#analysisGrid');
const dialectTabs = $('#dialectTabs');
const dialectPanels = $('#dialectPanels');
const repurposingText = $('#repurposingText');
const btnExportJSON = $('#btnExportJSON');
const btnExportText = $('#btnExportText');

// ── Init ──
function init() {
  // Restore API key
  if (state.apiKey) {
    apiKeyInput.value = state.apiKey;
    keyStatus.classList.add('active');
  }

  // API key handling
  apiKeyInput.addEventListener('input', () => {
    state.apiKey = apiKeyInput.value.trim();
    localStorage.setItem('ace_api_key', state.apiKey);
    keyStatus.classList.toggle('active', state.apiKey.length > 10);
    validateForm();
  });

  // Content input
  contentInput.addEventListener('input', () => {
    const len = contentInput.value.length;
    charCount.textContent = `${len.toLocaleString()} chars`;
    validateForm();
  });

  // Dialect chips
  dialectSelector.querySelectorAll('.dialect-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      const dialect = chip.dataset.dialect;
      chip.classList.toggle('selected');
      if (chip.classList.contains('selected')) {
        state.selectedDialects.add(dialect);
      } else {
        state.selectedDialects.delete(dialect);
      }
      validateForm();
    });
  });

  // Generate
  btnGenerate.addEventListener('click', handleGenerate);

  // Error dismiss
  errorDismiss.addEventListener('click', () => {
    errorBanner.classList.remove('visible');
  });

  // Export
  btnExportJSON.addEventListener('click', exportJSON);
  btnExportText.addEventListener('click', exportText);

  // Keyboard shortcut
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && !btnGenerate.disabled) {
      handleGenerate();
    }
  });

  validateForm();
}

function validateForm() {
  const hasKey = state.apiKey.length > 10;
  const hasContent = contentInput.value.trim().length > 10;
  const hasDialects = state.selectedDialects.size > 0;
  btnGenerate.disabled = !(hasKey && hasContent && hasDialects && !state.loading);
}

// ── API Call ──
async function handleGenerate() {
  const userContent = contentInput.value.trim();
  if (!userContent) return;

  state.loading = true;
  validateForm();
  showLoading(true);
  hideError();
  resultsSection.classList.remove('visible');

  const selectedDialects = [...state.selectedDialects];

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': state.apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 8000,
        system: MASTER_PROMPT,
        messages: [
          {
            role: 'user',
            content: `Transform this content:\n\n${userContent}\n\nDialects requested: ${selectedDialects.join(', ')}`,
          },
        ],
      }),
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(
        errData?.error?.message || `API returned ${response.status}: ${response.statusText}`
      );
    }

    const data = await response.json();

    // Extract text blocks (skip thinking blocks if any)
    const jsonText = data.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('');

    // Try to parse JSON — handle possible markdown fences
    let cleaned = jsonText.trim();
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    }

    state.result = JSON.parse(cleaned);
    renderResults(state.result);
  } catch (err) {
    console.error('Generation error:', err);
    showError(err.message || 'Unknown error occurred');
  } finally {
    state.loading = false;
    validateForm();
    showLoading(false);
  }
}

// ── Render ──
function renderResults(result) {
  // Analysis
  const { analysis, outputs, repurposing_notes } = result;

  analysisGrid.innerHTML = `
    <div class="analysis-item">
      <div class="analysis-item-label">Core Message</div>
      <div class="analysis-item-value">${escHtml(analysis.core_message)}</div>
    </div>
    <div class="analysis-item">
      <div class="analysis-item-label">Emotion</div>
      <div class="analysis-item-value">${escHtml(analysis.emotion)}</div>
    </div>
    <div class="analysis-item">
      <div class="analysis-item-label">Target Persona</div>
      <div class="analysis-item-value">${escHtml(analysis.target_persona)}</div>
    </div>
    <div class="analysis-item hook-angles">
      <div class="analysis-item-label">Hook Angles</div>
      <div class="analysis-item-value">
        ${(analysis.hook_angles || [])
          .map((a) => `<span class="hook-angle-tag">${escHtml(a)}</span>`)
          .join('')}
      </div>
    </div>
  `;

  // Dialect tabs
  const availableDialects = Object.keys(outputs);
  dialectTabs.innerHTML = availableDialects
    .map(
      (d, i) =>
        `<button class="dialect-tab ${i === 0 ? 'active' : ''}" data-dialect="${d}">${DIALECT_LABELS[d] || d}</button>`
    )
    .join('');

  // Panels
  dialectPanels.innerHTML = availableDialects
    .map(
      (d, i) => `
      <div class="dialect-panel ${i === 0 ? 'active' : ''}" data-dialect="${d}">
        <div class="platform-grid">
          ${Object.entries(PLATFORM_LABELS)
            .filter(([key]) => outputs[d]?.[key])
            .map(
              ([key, meta]) => `
            <div class="platform-card">
              <div class="platform-card-header">
                <span class="platform-name" data-platform="${meta.platform}">
                  <span>${meta.icon}</span> ${meta.name}
                </span>
                <button class="btn-copy" data-copy-target="${d}-${key}">Copy</button>
              </div>
              <div class="platform-card-body" id="content-${d}-${key}">${escHtml(outputs[d][key])}</div>
            </div>
          `
            )
            .join('')}
        </div>
      </div>
    `
    )
    .join('');

  // Tab switching
  dialectTabs.querySelectorAll('.dialect-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      dialectTabs.querySelectorAll('.dialect-tab').forEach((t) => t.classList.remove('active'));
      dialectPanels
        .querySelectorAll('.dialect-panel')
        .forEach((p) => p.classList.remove('active'));
      tab.classList.add('active');
      dialectPanels
        .querySelector(`.dialect-panel[data-dialect="${tab.dataset.dialect}"]`)
        ?.classList.add('active');
    });
  });

  // Copy buttons
  dialectPanels.querySelectorAll('.btn-copy').forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.copyTarget;
      const el = document.getElementById(`content-${target}`);
      if (el) {
        navigator.clipboard.writeText(el.textContent).then(() => {
          btn.textContent = 'Copied ✓';
          btn.classList.add('copied');
          setTimeout(() => {
            btn.textContent = 'Copy';
            btn.classList.remove('copied');
          }, 2000);
        });
      }
    });
  });

  // Repurposing
  repurposingText.textContent = repurposing_notes || '';

  // Show
  resultsSection.classList.add('visible');
  resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ── Export ──
function exportJSON() {
  if (!state.result) return;
  const blob = new Blob([JSON.stringify(state.result, null, 2)], {
    type: 'application/json',
  });
  downloadBlob(blob, `arabic-content-${Date.now()}.json`);
}

function exportText() {
  if (!state.result) return;
  const { analysis, outputs, repurposing_notes } = state.result;

  let text = `═══ STRATEGIC ANALYSIS ═══\n`;
  text += `Core Message: ${analysis.core_message}\n`;
  text += `Emotion: ${analysis.emotion}\n`;
  text += `Target Persona: ${analysis.target_persona}\n`;
  text += `Hook Angles:\n${(analysis.hook_angles || []).map((a) => `  → ${a}`).join('\n')}\n\n`;

  for (const [dialect, content] of Object.entries(outputs)) {
    text += `═══ ${(DIALECT_LABELS[dialect] || dialect).toUpperCase()} ═══\n\n`;
    for (const [platform, value] of Object.entries(content)) {
      const meta = PLATFORM_LABELS[platform];
      text += `── ${meta?.name || platform} ──\n${value}\n\n`;
    }
  }

  text += `═══ REPURPOSING STRATEGY ═══\n${repurposing_notes}\n`;

  navigator.clipboard.writeText(text).then(() => {
    btnExportText.innerHTML = '<span>✓</span> Copied!';
    setTimeout(() => {
      btnExportText.innerHTML = '<span>📋</span> Copy All';
    }, 2000);
  });
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ── UI Helpers ──
function showLoading(show) {
  loadingOverlay.classList.toggle('visible', show);
}

function showError(msg) {
  errorMessage.textContent = msg;
  errorBanner.classList.add('visible');
}

function hideError() {
  errorBanner.classList.remove('visible');
}

function escHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ── Boot ──
init();
