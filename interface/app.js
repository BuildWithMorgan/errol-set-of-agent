// ─── Agent switching ──────────────────────────────────────────────────────────
let currentAgent = 'dashboard';


function navigateTo(agentId) {
  if (agentId === currentAgent) return;
  const previousAgent = currentAgent;
  currentAgent = agentId;

  const currentEl = document.getElementById('agent-' + previousAgent);
  const nextEl    = document.getElementById('agent-' + agentId);

  document.querySelectorAll('.agent-btn').forEach(b => b.classList.remove('active'));
  const targetBtn = document.querySelector(`[data-agent="${agentId}"]`);
  if (targetBtn) targetBtn.classList.add('active');

  currentEl.classList.remove('active', 'entering');
  currentEl.classList.add('leaving');

  setTimeout(() => {
    currentEl.classList.remove('leaving');
    currentEl.style.display = 'none';

    nextEl.style.display = 'block';
    nextEl.classList.remove('active', 'leaving');
    nextEl.classList.add('entering');

    const fallback = setTimeout(() => {
      nextEl.classList.remove('entering');
      nextEl.classList.add('active');
    }, 600);

    nextEl.addEventListener('animationend', () => {
      clearTimeout(fallback);
      nextEl.classList.remove('entering');
      nextEl.classList.add('active');
    }, { once: true });

    if (agentId === 'dashboard') loadDashboard();
    else if (agentId !== 'cleaner') loadTemplates(agentId);
  }, 220);
}

document.querySelectorAll('.agent-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    navigateTo(btn.dataset.agent);
  });
});

// ─── Ollama status (via server) ───────────────────────────────────────────────
async function checkOllamaStatus() {
  const dot   = document.getElementById('status-dot');
  const label = document.getElementById('status-label');
  try {
    const res = await fetch('/api/status');
    const data = await res.json();
    if (data.online) {
      dot.className     = 'status-dot online';
      label.textContent = 'Ollama actif';
    } else {
      throw new Error('offline');
    }
  } catch {
    dot.className     = 'status-dot offline';
    label.textContent = 'Ollama hors ligne';
  }
}

// ─── Collect input for each agent ────────────────────────────────────────────
function collectInput(agentId) {
  if (agentId === 'invoice') {
    return {
      agent: 'invoice',
      fields: {
        client:      document.getElementById('invoice-client')?.value.trim() || '',
        date:        document.getElementById('invoice-date')?.value.trim() || '',
        hours:       document.getElementById('invoice-hours')?.value.trim() || '',
        rate:        document.getElementById('invoice-rate')?.value.trim() || '',
        description: document.getElementById('invoice-description')?.value.trim() || '',
      }
    };
  }
  if (agentId === 'content') {
    return {
      agent:          'content',
      mode:           'generate',
      input:          document.getElementById('content-input')?.value.trim() || '',
      starting_point: _contentStartingPoint,
    };
  }
  return {
    agent: agentId,
    input: document.getElementById(`${agentId}-input`)?.value.trim() || '',
  };
}

// ─── Run agent ────────────────────────────────────────────────────────────────
async function runAgent(agentId) {
  const resultBox  = document.getElementById(`${agentId}-result`);
  const resultText = document.getElementById(`${agentId}-result-text`);
  const submitBtn  = document.querySelector(`#agent-${agentId} .btn-primary`);

  // Hide refinement strip when starting a new generation
  if (agentId === 'content') {
    const strip = document.getElementById('content-refine-strip');
    if (strip) strip.style.display = 'none';
  }

  // For summary: if a file is staged, upload and extract text first
  if (agentId === 'summary' && summaryPendingFile) {
    resultBox.style.display = 'block';
    resultText.textContent  = 'Extraction du document en cours…';
    resultText.className    = 'result-text loading';
    if (submitBtn) submitBtn.disabled = true;

    try {
      const fd = new FormData();
      fd.append('file', summaryPendingFile);
      const res = await fetch('/api/upload', { method: 'POST', body: fd });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        resultText.textContent = `Erreur : ${err.detail || 'Impossible d\'extraire le texte du document.'}`;
        resultText.className   = 'result-text';
        if (submitBtn) submitBtn.disabled = false;
        return;
      }
      const { text } = await res.json();
      summaryExtractedText = text;
    } catch (e) {
      resultText.textContent = `Erreur : ${e.message}`;
      resultText.className   = 'result-text';
      if (submitBtn) submitBtn.disabled = false;
      return;
    }
    // Button stays disabled — falls through directly into generation below
  }

  const body = collectInput(agentId);
  const hasInput = body.input
    ? body.input.length > 0
    : Object.values(body.fields || {}).some(v => v.length > 0);
  if (!hasInput) return;

  resultBox.style.display = 'block';
  resultText.textContent  = 'Génération en cours…';
  resultText.className    = 'result-text loading';

  if (submitBtn) submitBtn.disabled = true;

  try {
    const response = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) throw new Error(`Erreur serveur : ${response.status}`);

    resultText.textContent = '';
    resultText.className   = 'result-text';

    const reader  = response.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      for (const line of chunk.split('\n').filter(l => l.trim())) {
        try {
          const data = JSON.parse(line);
          if (data.error) {
            const errDetail = data.message || data.error;
            resultText.textContent = `Erreur : Ollama est inaccessible. Vérifiez que le service est actif.\n\nDétail : ${errDetail}`;
            resultText.className = 'result-text';
            break;
          }
          if (data.response) resultText.textContent += data.response;
        } catch { /* partial chunk */ }
      }
    }
    // Show save-template button
    const footer = document.getElementById(`${agentId}-result-footer`);
    if (footer) footer.style.display = 'block';

    // Show refinement strip for content agent
    if (agentId === 'content') {
      const strip = document.getElementById('content-refine-strip');
      if (strip) strip.style.display = 'flex';
    }

    // Show feedback row and reset thumbs
    const feedbackRow = document.getElementById(`${agentId}-feedback-row`);
    if (feedbackRow) {
      feedbackRow.style.display = 'flex';
      document.getElementById(`${agentId}-thumb-up`)?.classList.remove('active');
      document.getElementById(`${agentId}-thumb-down`)?.classList.remove('active');
    }
  } catch (err) {
    resultText.textContent = `Erreur : impossible de contacter le serveur.\n\nDétail : ${err.message}`;
    resultText.className   = 'result-text';
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
}

// ─── Export ───────────────────────────────────────────────────────────────────
async function exportResult(agentId, format) {
  const content = document.getElementById(`${agentId}-result-text`)?.textContent?.trim();
  if (!content) return;

  try {
    const response = await fetch('/api/export', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ content, agent: agentId, format }),
    });
    if (!response.ok) throw new Error(`Export error: ${response.status}`);

    const blob     = await response.blob();
    const url      = URL.createObjectURL(blob);
    const a        = document.createElement('a');
    const filename = response.headers.get('Content-Disposition')
                      ?.match(/filename="(.+)"/)?.[1]
                      || `leplay-export.${format}`;
    a.href     = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (e) {
    alert(`Erreur lors de l'export : ${e.message}`);
  }
}

// ─── Feedback ─────────────────────────────────────────────────────────────────
async function sendFeedback(agentId, rating) {
  const thumbUp   = document.getElementById(`${agentId}-thumb-up`);
  const thumbDown = document.getElementById(`${agentId}-thumb-down`);
  if (thumbUp)   thumbUp.classList.remove('active');
  if (thumbDown) thumbDown.classList.remove('active');
  const activeBtn = rating === 'up' ? thumbUp : thumbDown;
  if (activeBtn) activeBtn.classList.add('active');
  try {
    await fetch('/api/feedback', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ agent: agentId, rating }),
    });
  } catch (e) {
    console.error('Feedback error:', e);
  }
}

// ─── Copy result ──────────────────────────────────────────────────────────────
function copyResult(elementId) {
  const el = document.getElementById(elementId);
  if (!el?.textContent) return;
  navigator.clipboard.writeText(el.textContent).then(() => {
    const btn = el.closest('.result-area').querySelector('.btn-copy');
    const original = btn.textContent;
    btn.textContent = 'Copié ✓';
    setTimeout(() => { btn.textContent = original; }, 2000);
  });
}

// ─── File drop / upload ───────────────────────────────────────────────────────
let summaryPendingFile   = null;
let summaryExtractedText = null;

function setSummaryFile(file) {
  summaryPendingFile = file;
  const zone = document.getElementById('summary-drop');
  zone.innerHTML = `
    <span class="drop-file-name">📄 ${escapeHtml(file.name)}</span>
    <button class="drop-file-remove" onclick="removeSummaryFile(event)">×</button>
  `;
  zone.classList.add('has-file');
}

function removeSummaryFile(event) {
  event.stopPropagation();
  summaryPendingFile = null;
  const zone = document.getElementById('summary-drop');
  zone.innerHTML = `Glissez un fichier ici ou
    <label class="btn-file">parcourir<input type="file" id="summary-file" accept=".pdf,.doc,.docx,.txt" onchange="handleFile(event,'summary')" /></label>`;
  zone.classList.remove('has-file');
}

function handleDrop(event, agentId) {
  event.preventDefault();
  const file = event.dataTransfer.files[0];
  if (!file) return;
  if (agentId === 'summary') setSummaryFile(file);
  else readFileToTextarea(file, agentId);
}
function handleFile(event, agentId) {
  const file = event.target.files[0];
  if (!file) return;
  if (agentId === 'summary') setSummaryFile(file);
  else readFileToTextarea(file, agentId);
}
async function readFileToTextarea(file, agentId) {
  const textarea = document.getElementById(`${agentId}-input`);

  if (file.type === 'text/plain') {
    const reader = new FileReader();
    reader.onload = e => { textarea.value = e.target.result; };
    reader.readAsText(file);
    return;
  }

  textarea.value    = 'Extraction du texte en cours…';
  textarea.disabled = true;

  try {
    const formData = new FormData();
    formData.append('file', file);
    const response = await fetch('/api/upload', { method: 'POST', body: formData });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      textarea.value = `Erreur : ${err.detail || 'Impossible d\'extraire le texte du document.'}`;
      return;
    }
    const data = await response.json();
    textarea.value = data.text;
  } catch (e) {
    textarea.value = `Erreur : ${e.message}`;
  } finally {
    textarea.disabled = false;
  }
}

document.querySelectorAll('.drop-zone').forEach(zone => {
  zone.addEventListener('dragover',  () => zone.classList.add('drag-over'));
  zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
  zone.addEventListener('drop',      () => zone.classList.remove('drag-over'));
});

// ─── Templates ────────────────────────────────────────────────────────────────
async function loadTemplates(agentId) {
  const container = document.getElementById(`${agentId}-templates`);
  if (!container) return;
  try {
    const res       = await fetch(`/api/templates?agent=${agentId}`);
    const templates = await res.json();
    container.innerHTML = templates.map(t => `
      <span class="template-pill" onclick="applyTemplate('${agentId}', ${JSON.stringify(JSON.stringify(t.prompt))})">
        📌 ${escapeHtml(t.label)}
        <button class="template-pill-delete" onclick="deleteTemplate(event, '${escapeHtml(t.id)}', '${agentId}')">✕</button>
      </span>
    `).join('');
  } catch (e) {
    console.error('loadTemplates error:', e);
  }
}

function applyTemplate(agentId, promptJson) {
  const prompt  = JSON.parse(promptJson);
  const inputEl = document.getElementById(`${agentId}-input`);
  if (inputEl) inputEl.value = prompt;
}

async function deleteTemplate(event, id, agentId) {
  event.stopPropagation();
  await fetch(`/api/templates/${id}`, { method: 'DELETE' });
  loadTemplates(agentId);
}

async function promptSaveTemplate(agentId) {
  // For guided-form agents, serialize the current field values as a JSON string
  const guidedAgents = ['letter', 'invoice', 'hearing'];
  let prompt;
  if (guidedAgents.includes(agentId)) {
    const body = collectInput(agentId);
    const hasInput = Object.values(body.fields || {}).some(v => v.length > 0);
    if (!hasInput) return;
    prompt = JSON.stringify(body.fields);
  } else {
    const inputEl = document.getElementById(`${agentId}-input`);
    prompt = inputEl?.value?.trim();
    if (!prompt) return;
  }
  const label = window.prompt('Nom du modèle :', prompt.slice(0, 40));
  if (!label) return;
  await fetch('/api/templates', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ agent: agentId, label, prompt }),
  });
  loadTemplates(agentId);
}

// ─── Dashboard ────────────────────────────────────────────────────────────────
function relativeTime(isoString) {
  const diff   = Date.now() - new Date(isoString).getTime();
  const mins   = Math.floor(diff / 60000);
  const hours  = Math.floor(diff / 3600000);
  const days   = Math.floor(diff / 86400000);
  const weeks  = Math.floor(days / 7);
  const months = Math.floor(days / 30);
  if (mins < 1)    return "à l'instant";
  if (mins < 60)   return `il y a ${mins} min`;
  if (hours < 24)  return `il y a ${hours}h`;
  if (days === 1)  return 'hier';
  if (days < 7)    return `il y a ${days}j`;
  if (days < 30)   return `il y a ${weeks} sem.`;
  return `il y a ${months} mois`;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ─── Agent config & stats ──────────────────────────────────────────────────────
const AGENT_CONFIG = [
  { key: 'rag',     label: 'Interroger mes dossiers', svgPath: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z"/><circle cx="11" cy="13" r="2.5"/><path d="m14.5 16.5 2 2"/>' },
  { key: 'letter',  label: 'Rédiger un courrier',      svgPath: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14,2 14,8 20,8"/><path d="M10 13h4M10 17h4M10 9h1"/>' },
  { key: 'summary', label: 'Résumer un document',      svgPath: '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M8 9h8M8 13h6M8 17h4"/>' },
  { key: 'invoice', label: 'Générer une facture',      svgPath: '<path d="M6 2h12a1 1 0 0 1 1 1v18l-3-2-2 2-2-2-2 2-2-2-2 2V3a1 1 0 0 1 1-1z"/><path d="M9 7h6M9 11h6M9 15h4"/>' },
  { key: 'hearing', label: 'Préparer une audience',    svgPath: '<path d="M12 3v4M6.3 6.3l2.8 2.8M17.7 6.3l-2.8 2.8"/><path d="M3 12h18"/><path d="M5 12l2 5h10l2-5"/><path d="M12 17v4M10 21h4"/>' },
  { key: 'content', label: 'Créer du contenu',         svgPath: '<path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>' },
];

function getAgentStats(history) {
  const counts = AGENT_CONFIG.map(({ key }) =>
    history.filter(h => h.agent === key).length
  );
  const maxCount = Math.max(1, ...counts);

  return AGENT_CONFIG.map(({ key, label, svgPath }) => {
    const entries = history
      .filter(h => h.agent === key)
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    const count    = entries.length;
    const lastUsed = entries[0]?.created_at ?? null;
    const barWidth = Math.round((count / maxCount) * 100);
    return { key, label, svgPath, count, lastUsed, barWidth };
  }).sort((a, b) => b.count - a.count);
}

function renderAgentCards(stats) {
  const container = document.getElementById('dashboard-agent-cards');
  if (!container) return;
  container.innerHTML = stats.map(({ label, svgPath, count, lastUsed, barWidth }) => `
    <div class="agent-card">
      <div class="agent-card-header">
        <div class="agent-card-icon">
          <svg viewBox="0 0 24 24" aria-hidden="true">${svgPath}</svg>
        </div>
        <div class="agent-card-name">${escapeHtml(label)}</div>
      </div>
      <div class="agent-card-count">${count}</div>
      <div class="agent-card-count-label">utilisation${count !== 1 ? 's' : ''}</div>
      <div class="agent-card-bar-track">
        <div class="agent-card-bar-fill" style="width:${barWidth}%"></div>
      </div>
      <div class="agent-card-last">${lastUsed ? 'Dernière utilisation : ' + relativeTime(lastUsed) : 'Jamais utilisé'}</div>
    </div>
  `).join('');
}

async function loadDashboard() {
  try {
    const [historyRes, templatesRes, statusRes] = await Promise.all([
      fetch('/api/history'),
      fetch('/api/templates'),
      fetch('/api/status'),
    ]);
    const history   = await historyRes.json();
    const templates = await templatesRes.json();
    const status    = await statusRes.json();

    // Tiles
    const now = new Date();
    const thisMonth = history.filter(h => {
      const d = new Date(h.created_at);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    });
    document.getElementById('tile-count').textContent     = thisMonth.length;
    document.getElementById('tile-templates').textContent = templates.length;

    const statusIcon  = document.getElementById('tile-status-icon');
    const statusLabel = document.getElementById('tile-status-label');
    if (status.online) {
      statusIcon.style.color  = '#16A34A';
      statusLabel.textContent = 'Ollama actif';
    } else {
      statusIcon.style.color  = '#EF4444';
      statusLabel.textContent = 'Ollama hors ligne';
    }

    // Agent cards
    renderAgentCards(getAgentStats(history));

    // History table
    const container = document.getElementById('dashboard-history');
    if (history.length === 0) {
      container.innerHTML = '<div class="history-empty">Aucune génération pour l\'instant.</div>';
      return;
    }
    container.innerHTML = history.slice(0, 10).map(h => `
      <div class="history-row">
        <div class="history-input">
          <span class="history-badge">${escapeHtml(h.agent_label.split(' ')[0].toUpperCase())}</span>${escapeHtml(h.input)}
        </div>
        <div class="history-meta">
          <span class="history-time">${relativeTime(h.created_at)}</span>
          <button class="history-reuse" onclick="reuseHistory('${escapeHtml(h.agent)}', ${JSON.stringify(JSON.stringify({ input: h.input, fields: h.fields || null }))})">Réutiliser →</button>
          <button class="template-pill-delete" onclick="deleteHistoryEntry(event, '${escapeHtml(h.id)}')">✕</button>
        </div>
      </div>
    `).join('');
  } catch (e) {
    console.error('Dashboard load error:', e);
  }
}

async function deleteHistoryEntry(event, id) {
  event.stopPropagation();
  const res = await fetch(`/api/history/${id}`, { method: 'DELETE' });
  if (!res.ok) {
    alert('Erreur lors de la suppression de cette entrée.');
    return;
  }
  await loadDashboard();
}

async function clearAllHistory() {
  if (!window.confirm('Effacer tout l\'historique ?')) return;
  const res = await fetch('/api/history', { method: 'DELETE' });
  if (!res.ok) {
    alert('Erreur lors de la suppression de l\'historique.');
    return;
  }
  await loadDashboard();
}

const FIELD_ID_MAP = {
  letter:  { recipient: 'letter-recipient', letter_type: 'letter-type', subject: 'letter-subject', facts: 'letter-facts' },
  invoice: { client: 'invoice-client', date: 'invoice-date', hours: 'invoice-hours', rate: 'invoice-rate', description: 'invoice-description' },
  hearing: { case_name: 'hearing-case', hearing_date: 'hearing-date', parties: 'hearing-parties', arguments: 'hearing-arguments' },
};

function reuseHistory(agentId, dataJson) {
  const data = JSON.parse(dataJson);
  // Switch to agent view via the shared animation helper
  navigateTo(agentId);

  // Restore fields or free-text input after the panel becomes visible (wait for animation)
  setTimeout(() => {
    if (data.fields && FIELD_ID_MAP[agentId]) {
      const idMap = FIELD_ID_MAP[agentId];
      Object.entries(data.fields).forEach(([key, value]) => {
        const elId = idMap[key];
        if (elId) {
          const el = document.getElementById(elId);
          if (el) el.value = value || '';
        }
      });
    } else {
      const inputEl = document.getElementById(`${agentId}-input`);
      if (inputEl) inputEl.value = data.input || '';
    }
  }, 280); // slightly after the 220ms fadeOut + panel swap
}

// ─── Init ─────────────────────────────────────────────────────────────────────
checkOllamaStatus();
setInterval(checkOllamaStatus, 30000);
loadDashboard();

// ─── Content agent ────────────────────────────────────────────────────────────
let _contentStartingPoint = 'sujet';

function contentSetType(type) {
  _contentStartingPoint = type;
  document.querySelectorAll('.content-pill').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.type === type);
  });
  const placeholders = {
    sujet:     'Ex : Les nouvelles obligations du comité de mission en 2025',
    brouillon: "Collez votre brouillon ici, l'IA va le reformuler dans votre style",
    evenement: 'Ex : Conférence sur les sociétés à mission le 15 mai à Paris',
    article:   "Ex : La raison d'être : définition, enjeux et obligations légales",
  };
  const ta = document.getElementById('content-input');
  if (ta) ta.placeholder = placeholders[type] || '';
}

async function contentRefine(instruction) {
  const strip      = document.getElementById('content-refine-strip');
  const resultText = document.getElementById('content-result-text');
  const originalPost = resultText?.textContent?.trim() || '';
  if (!originalPost || !instruction) return;

  if (strip) strip.style.display = 'none';
  resultText.className = 'result-text loading';

  try {
    const response = await fetch('/api/generate', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agent:         'content',
        mode:          'refine',
        original_post: originalPost,
        instruction,
      }),
    });
    if (!response.ok) throw new Error(`Erreur serveur : ${response.status}`);

    resultText.textContent = '';
    resultText.className   = 'result-text';

    const reader  = response.body.getReader();
    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      for (const line of chunk.split('\n').filter(l => l.trim())) {
        try {
          const data = JSON.parse(line);
          if (data.error) {
            resultText.textContent = `Erreur : ${data.message || data.error}`;
            resultText.className   = 'result-text';
            break;
          }
          if (data.response) resultText.textContent += data.response;
        } catch { /* partial chunk */ }
      }
    }
  } catch (err) {
    resultText.textContent = `Erreur : ${err.message}`;
    resultText.className   = 'result-text';
  } finally {
    if (strip) strip.style.display = 'flex';
  }
}

function contentRefineCustom() {
  const input = document.getElementById('content-refine-input');
  const instruction = input?.value.trim();
  if (!instruction) return;
  if (input) input.value = '';
  contentRefine(instruction);
}

// ─── Cleaner ──────────────────────────────────────────────────────────────────

let _cleanerProposals = [];
let _cleanerTotalScanned = 0;
let _cleanerTotalSize = 0;

async function cleanerScan() {
  const btn = document.getElementById('cleaner-scan-btn');
  const spinner = document.getElementById('cleaner-scanning');
  btn.disabled = true;
  spinner.style.display = 'inline';
  document.getElementById('cleaner-banner').style.display = 'none';
  document.getElementById('cleaner-list').style.display = 'none';
  document.getElementById('cleaner-empty').style.display = 'none';
  document.getElementById('cleaner-footer').style.display = 'none';

  try {
    const r = await fetch('/api/cleaner/scan', { method: 'POST' });
    const data = await r.json();
    _cleanerProposals = data.proposals.map(p => ({ ...p, selected: true }));
    _cleanerTotalScanned = data.total_scanned;
    _cleanerTotalSize = data.total_size_bytes;
    cleanerRender();
  } catch (e) {
    console.error('Scan error', e);
  } finally {
    btn.disabled = false;
    spinner.style.display = 'none';
  }
}

function cleanerRender() {
  const selected = _cleanerProposals.filter(p => p.selected);
  const count = selected.length;

  document.getElementById('cleaner-count').textContent = count;
  document.getElementById('cleaner-stat-total').textContent = _cleanerTotalScanned;
  document.getElementById('cleaner-stat-size').textContent = cleanerFormatBytes(_cleanerTotalSize);
  document.getElementById('cleaner-sel-count-top').textContent = count;
  document.getElementById('cleaner-sel-count-bottom').textContent = count;

  if (_cleanerProposals.length === 0) {
    document.getElementById('cleaner-empty').style.display = 'block';
    document.getElementById('cleaner-banner').style.display = 'none';
    document.getElementById('cleaner-list').style.display = 'none';
    document.getElementById('cleaner-footer').style.display = 'none';
    return;
  }

  document.getElementById('cleaner-banner').style.display = 'flex';
  document.getElementById('cleaner-list').style.display = 'block';
  document.getElementById('cleaner-footer').style.display = 'flex';
  document.getElementById('cleaner-empty').style.display = 'none';

  const list = document.getElementById('cleaner-list');
  list.innerHTML = _cleanerProposals.map((p, i) => {
    const ext = p.type.toLowerCase();
    const badgeClass = ['pdf', 'docx', 'doc'].includes(ext) ? 'badge-blue'
                     : ['png', 'jpg', 'jpeg'].includes(ext) ? 'badge-green'
                     : 'badge-grey';
    return `
      <div class="cleaner-row${p.selected ? '' : ' cleaner-row-unchecked'}" id="cleaner-row-${i}">
        <div class="cleaner-check${p.selected ? ' checked' : ''}" onclick="cleanerToggle(${i})">
          ${p.selected ? '✓' : ''}
        </div>
        <span class="file-type-badge ${badgeClass}">${escapeHtml(p.type)}</span>
        <div class="cleaner-file-info">
          <div class="cleaner-filename${p.selected ? '' : ' cleaner-filename-struck'}">${escapeHtml(p.filename)}</div>
          <div class="cleaner-path">${escapeHtml(p.path)}</div>
        </div>
        <div class="cleaner-reason">${escapeHtml(p.reason)}</div>
        <div class="cleaner-size">${cleanerFormatBytes(p.size_bytes)}</div>
      </div>`;
  }).join('');
}

function cleanerToggle(i) {
  _cleanerProposals[i].selected = !_cleanerProposals[i].selected;
  cleanerRender();
}

async function cleanerConfirm() {
  const paths = _cleanerProposals.filter(p => p.selected).map(p => p.path);
  if (paths.length === 0) return;

  const r = await fetch('/api/cleaner/apply', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ paths }),
  });
  const result = await r.json();

  const deletedSet = new Set(result.deleted);
  _cleanerProposals = _cleanerProposals.filter(p => !deletedSet.has(p.path));
  cleanerRender();

  const msg = result.errors.length > 0
    ? `${result.deleted.length} supprimé(s). ${result.errors.length} introuvable(s).`
    : `${result.deleted.length} fichier(s) supprimé(s) avec succès.`;
  cleanerShowToast(msg);
}

function cleanerShowToast(msg) {
  let toast = document.getElementById('cleaner-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'cleaner-toast';
    toast.style.cssText = 'position:fixed;bottom:24px;right:24px;background:#0D0D0D;color:#fff;padding:12px 20px;border-radius:8px;font-size:13px;font-weight:600;z-index:9999;transition:opacity 0.3s;';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.style.opacity = '1';
  setTimeout(() => { toast.style.opacity = '0'; }, 3000);
}

function cleanerFormatBytes(bytes) {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}
