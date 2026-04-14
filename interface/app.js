// ─── Agent switching ──────────────────────────────────────────────────────────
document.querySelectorAll('.agent-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const id = btn.dataset.agent;
    document.querySelectorAll('.agent-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.querySelectorAll('.agent-view').forEach(v => v.classList.remove('active'));
    document.getElementById(`agent-${id}`).classList.add('active');
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
  } catch (err) {
    resultText.textContent = `Erreur : impossible de contacter le serveur.\n\nDétail : ${err.message}`;
    resultText.className   = 'result-text';
  } finally {
    if (submitBtn) submitBtn.disabled = false;
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

// ─── Init ─────────────────────────────────────────────────────────────────────
checkOllamaStatus();
setInterval(checkOllamaStatus, 30000);
