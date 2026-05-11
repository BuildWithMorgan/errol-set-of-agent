// ─── Agent switching ──────────────────────────────────────────────────────────
let currentAgent = 'dashboard';

// ─── Cleaner state ────────────────────────────────────────────────────────────
let cleanerEventSource = null;
let cleanerBadgeCount  = 0;
let cleanerProposals   = [];
let cleanerSelected    = new Set();

function cleanerUpdateBadge(count) {
  const badge = document.getElementById('cleaner-badge');
  if (!badge) return;
  cleanerBadgeCount = count;
  badge.textContent = count;
  badge.style.display = count > 0 ? 'inline-flex' : 'none';
}

function cleanerInitSSE() {
  if (cleanerEventSource) return;
  cleanerEventSource = new EventSource('/api/cleaner/events');
  cleanerEventSource.onmessage = (e) => {
    const event = JSON.parse(e.data);
    if (event.type === 'new_proposals') {
      cleanerUpdateBadge(cleanerBadgeCount + event.count);
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted' && event.count > 0) {
        new Notification('Le Play Avocats', {
          body: `${event.count} nouvelle${event.count > 1 ? 's' : ''} proposition${event.count > 1 ? 's' : ''} de nettoyage`,
        });
      }
      if (document.getElementById('agent-cleaner')?.classList.contains('active')) {
        cleanerLoadProposals();
      }
    }
    if (event.type === 'scan_progress') {
      const bar = document.getElementById('cleaner-scan-bar');
      const text = document.getElementById('cleaner-monitor-text');
      const pct = event.total > 0 ? Math.round((event.current / event.total) * 100) : 0;
      if (bar)  bar.style.width = pct + '%';
      if (text) text.innerHTML = `Analyse en cours… <strong>${event.current} / ${event.total}</strong>`;
    }
    if (event.type === 'scan_complete') {
      const bar = document.getElementById('cleaner-scan-bar');
      if (bar) { bar.style.width = '100%'; setTimeout(() => { bar.style.width = '0%'; }, 600); }
      cleanerScanDone(event.found);
    }
  };
  cleanerEventSource.onerror = () => {
    cleanerEventSource.close();
    cleanerEventSource = null;
    setTimeout(cleanerInitSSE, 5000);
  };
}


async function cleanerLoadProposals() {
  const r = await fetch('/api/cleaner/proposals');
  cleanerProposals = await r.json();
  const fileProposals  = cleanerProposals.filter(p => p.source === 'file');
  const emailProposals = cleanerProposals.filter(p => p.source === 'email');
  cleanerSelected = new Set(cleanerProposals.map(p => p.id));
  cleanerRenderProposals(fileProposals);
  cleanerRenderEmails(emailProposals);
  cleanerUpdateFooter();
  cleanerUpdateBadge(fileProposals.length + emailProposals.length);
}

function cleanerExtBadge(ext) {
  const e = (ext || '').toLowerCase().replace('.', '');
  return ['pdf','docx','doc','png','jpg','jpeg','txt','xlsx','xls'].includes(e) ? e : 'file';
}

function cleanerRenderProposals(proposals) {
  const list = document.getElementById('cleaner-proposals-list');
  if (!proposals.length) {
    list.innerHTML = '<div class="cleaner-empty">Aucun fichier à traiter.</div>';
    document.getElementById('cleaner-footer').style.display = 'none';
    return;
  }
  document.getElementById('cleaner-footer').style.display = 'flex';
  list.innerHTML = proposals.map(p => {
    const ext  = p.original_path?.split('.').pop() || '';
    const name = p.original_path?.split('/').pop() || '';
    return `
    <div class="triage-card" id="card-${p.id}">
      <div class="triage-card-header">
        <span class="file-type-badge badge-${cleanerExtBadge(ext)}">${escapeHtml(ext.toUpperCase())}</span>
        <span class="file-original-name" title="${escapeHtml(name)}">${escapeHtml(name)}</span>
        <div class="triage-toggle">
          <span class="toggle-label" id="lbl-${p.id}">Actif</span>
          <button class="toggle-switch on" id="tog-${p.id}" onclick="cleanerToggle('${p.id}')"></button>
        </div>
      </div>
      <div class="triage-actions">${cleanerRenderActions(p)}</div>
    </div>`;
  }).join('');
}

function cleanerRenderActions(p) {
  if (p.action === 'delete') {
    return `<div class="action-row">
      <span class="action-tag tag-delete">🗑 Supprimer</span>
      <span class="action-value">${escapeHtml(p.ai_reason)}</span>
    </div>`;
  }
  if (p.action === 'rename_and_move') {
    return `<div class="action-row">
        <span class="action-tag tag-rename">✏ Renommer</span>
        <span class="action-value">→ ${escapeHtml(p.proposed_name || '')}</span>
      </div>
      <div class="action-row">
        <span class="action-tag tag-move">📁 Déplacer</span>
        <span class="action-value">→ ${escapeHtml(p.proposed_destination || '')}</span>
      </div>`;
  }
  return `<div class="action-row">
    <span class="action-tag tag-review">👁 Examiner</span>
    <span class="action-value">${escapeHtml(p.ai_reason)}</span>
  </div>`;
}

function cleanerRenderEmails(emails) {
  const heading = document.getElementById('cleaner-emails-heading');
  const list    = document.getElementById('cleaner-emails-list');
  if (!emails.length) { heading.style.display = 'none'; list.innerHTML = ''; return; }
  heading.style.display = 'block';
  list.innerHTML = emails.map(p => {
    const meta  = p.email_meta || {};
    const count = (meta.attachments || []).length;
    const time  = meta.received_at
      ? new Date(meta.received_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
      : '';
    return `<div class="email-item">
      <span class="email-unread"></span>
      <div class="email-info">
        <div class="email-sender">${escapeHtml(meta.sender || '')}</div>
        <div class="email-subject">${escapeHtml(meta.subject || '')}</div>
      </div>
      <span class="email-attach">📎 ${count} fichier${count > 1 ? 's' : ''}</span>
      <span class="email-time">${time}</span>
    </div>`;
  }).join('');
}

function cleanerUpdateFooter() {
  const count = cleanerSelected.size;
  const summary = document.getElementById('cleaner-summary');
  if (summary) summary.innerHTML = `<strong>${count} action${count > 1 ? 's' : ''}</strong> sélectionnée${count > 1 ? 's' : ''}`;
}

function cleanerToggle(id) {
  const tog = document.getElementById('tog-' + id);
  const lbl = document.getElementById('lbl-' + id);
  if (!tog) return;
  const isOn = tog.classList.toggle('on');
  lbl.textContent = isOn ? 'Actif' : 'Ignoré';
  if (isOn) cleanerSelected.add(id); else cleanerSelected.delete(id);
  cleanerUpdateFooter();
}

function cleanerIgnoreAll() {
  cleanerProposals.forEach(p => {
    const tog = document.getElementById('tog-' + p.id);
    const lbl = document.getElementById('lbl-' + p.id);
    if (tog) { tog.classList.remove('on'); lbl.textContent = 'Ignoré'; }
  });
  cleanerSelected.clear();
  cleanerUpdateFooter();
}

async function cleanerApplySelected() {
  if (!cleanerSelected.size) return;
  const r = await fetch('/api/cleaner/apply', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids: [...cleanerSelected], action: 'apply' }),
  });
  const result = await r.json();
  cleanerAddLog('clean', `${result.applied.length} action(s) appliquée(s)`
    + (result.errors.length ? ` · ${result.errors.length} erreur(s)` : ''));
  cleanerUpdateBadge(0);
  await cleanerLoadProposals();
}

async function cleanerTriggerScan() {
  const dot  = document.getElementById('cleaner-monitor-dot');
  const text = document.getElementById('cleaner-monitor-text');
  const bar  = document.getElementById('cleaner-scan-bar');
  if (dot)  dot.classList.add('scanning');
  if (text) text.innerHTML = 'Analyse en cours… <strong>Bureau + Téléchargements</strong>';
  if (bar)  bar.style.width = '0%';
  await fetch('/api/cleaner/scan', { method: 'POST' });
}

function cleanerScanDone(found) {
  const dot  = document.getElementById('cleaner-monitor-dot');
  const text = document.getElementById('cleaner-monitor-text');
  if (dot)  dot.classList.remove('scanning');
  if (text) text.textContent = 'Prêt à analyser';
  const msg = found > 0 ? `${found} élément(s) détecté(s)` : 'Scan terminé — aucun nouveau fichier';
  cleanerAddLog(found > 0 ? 'found' : 'clean', msg);
  if (found > 0) cleanerLoadProposals();
}

function cleanerAddLog(type, msg) {
  const log = document.getElementById('cleaner-log');
  if (!log) return;
  const time = new Date().toLocaleTimeString('fr-FR');
  const div  = document.createElement('div');
  div.className = 'log-entry';
  div.innerHTML = `<span class="log-time">${time}</span><span class="log-dot ${type}">●</span><span>${escapeHtml(msg)}</span>`;
  log.insertBefore(div, log.firstChild);
  while (log.children.length > 20) log.removeChild(log.lastChild);
}

function cleanerClearLog() {
  const log = document.getElementById('cleaner-log');
  if (log) log.innerHTML = '';
}

function cleanerRequestNotificationPermission() {
  if (typeof Notification === 'undefined') return;
  if (Notification.permission === 'default') Notification.requestPermission();
}

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
    else if (agentId === 'cleaner') cleanerLoadProposals();
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
  if (agentId === 'summary' && summaryExtractedText !== null) {
    const text = summaryExtractedText;
    summaryExtractedText = null;
    return { agent: 'summary', input: text };
  }
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
  const resultBox  = document.getElementById(`${agentId}-result`);
  const resultText = document.getElementById(`${agentId}-result-text`);
  const submitBtn  = document.querySelector(`#agent-${agentId} .btn-primary`);

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
cleanerInitSSE();
cleanerRequestNotificationPermission();
