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
    else loadTemplates(agentId);
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
  if (agentId === 'letter') {
    return {
      agent: 'letter',
      fields: {
        recipient:   document.getElementById('letter-recipient')?.value.trim() || '',
        letter_type: document.getElementById('letter-type')?.value || 'mise en demeure',
        subject:     document.getElementById('letter-subject')?.value.trim() || '',
        facts:       document.getElementById('letter-facts')?.value.trim() || '',
      }
    };
  }
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
  if (agentId === 'hearing') {
    return {
      agent: 'hearing',
      fields: {
        case_name:    document.getElementById('hearing-case')?.value.trim() || '',
        hearing_date: document.getElementById('hearing-date')?.value.trim() || '',
        parties:      document.getElementById('hearing-parties')?.value.trim() || '',
        arguments:    document.getElementById('hearing-arguments')?.value.trim() || '',
      }
    };
  }
  if (agentId === 'content') {
    return {
      agent: 'content',
      input:        document.getElementById('content-input')?.value.trim() || '',
      content_type: document.querySelector('input[name="content-type"]:checked')?.value || 'linkedin',
    };
  }
  return {
    agent: agentId,
    input: document.getElementById(`${agentId}-input`)?.value.trim() || '',
  };
}

// ─── Run agent ────────────────────────────────────────────────────────────────
async function runAgent(agentId) {
  const body       = collectInput(agentId);
  const resultBox  = document.getElementById(`${agentId}-result`);
  const resultText = document.getElementById(`${agentId}-result-text`);

  const hasInput = body.input
    ? body.input.length > 0
    : Object.values(body.fields || {}).some(v => v.length > 0);
  if (!hasInput) return;

  resultBox.style.display = 'block';
  resultText.textContent  = 'Génération en cours…';
  resultText.className    = 'result-text loading';

  const submitBtn = document.querySelector(`#agent-${agentId} .btn-primary`);
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
            resultText.textContent = `Erreur : Ollama est inaccessible. Vérifiez que le service est actif.\n\nDétail : ${data.message}`;
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
function handleDrop(event, agentId) {
  event.preventDefault();
  const file = event.dataTransfer.files[0];
  if (file) readFileToTextarea(file, agentId);
}
function handleFile(event, agentId) {
  const file = event.target.files[0];
  if (file) readFileToTextarea(file, agentId);
}
function readFileToTextarea(file, agentId) {
  const textarea = document.getElementById(`${agentId}-input`);
  if (file.type === 'text/plain') {
    const reader = new FileReader();
    reader.onload = e => { textarea.value = e.target.result; };
    reader.readAsText(file);
  } else {
    textarea.value = `[Fichier : ${file.name}]\n\nCollez le texte extrait ici.`;
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
  const months = Math.max(1, Math.floor(days / 30));
  if (mins < 1)    return "à l'instant";
  if (mins < 60)   return `il y a ${mins} min`;
  if (hours < 24)  return `il y a ${hours}h`;
  if (days === 1)  return 'hier';
  if (days < 7)    return `il y a ${days}j`;
  if (weeks < 4)   return `il y a ${weeks} sem.`;
  return `il y a ${months} mois`;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function loadDashboard() {
  try {
    const [historyRes, templatesRes, statusRes] = await Promise.all([
      fetch('/api/history?limit=10'),
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

    // History table
    const container = document.getElementById('dashboard-history');
    if (history.length === 0) {
      container.innerHTML = '<div class="history-empty">Aucune génération pour l\'instant.</div>';
      return;
    }
    container.innerHTML = history.map(h => `
      <div class="history-row">
        <div class="history-input">
          <span class="history-badge">${escapeHtml(h.agent_label.split(' ')[0].toUpperCase())}</span>${escapeHtml(h.input)}
        </div>
        <div class="history-meta">
          <span class="history-time">${relativeTime(h.created_at)}</span>
          <button class="history-reuse" onclick="reuseHistory('${escapeHtml(h.agent)}', ${JSON.stringify(JSON.stringify({ input: h.input, fields: h.fields || null }))})">Réutiliser →</button>
        </div>
      </div>
    `).join('');
  } catch (e) {
    console.error('Dashboard load error:', e);
  }
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
