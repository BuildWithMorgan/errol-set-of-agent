// ─── Config ──────────────────────────────────────────────────────────────────
const OLLAMA_URL   = 'http://localhost:11434';
const OLLAMA_MODEL = 'gemma4:e4b';

// ─── Agent config ─────────────────────────────────────────────────────────────
const AGENTS = {
  rag: {
    endpoint: '/api/generate',
    buildPrompt: (input) =>
      `Tu es l'assistant juridique du cabinet Le Play Avocats. Réponds en français à la question suivante en t'appuyant sur les documents disponibles. Cite les sources si possible.\n\nQuestion : ${input}`,
  },
  letter: {
    endpoint: '/api/generate',
    buildPrompt: (input) =>
      `Tu es un avocat expert en droit des sociétés. Rédige en français un courrier juridique professionnel basé sur la description suivante. Respecte les conventions formelles françaises.\n\nDemande : ${input}`,
  },
  summary: {
    endpoint: '/api/generate',
    buildPrompt: (input) =>
      `Tu es un assistant juridique. Résume le document suivant en français en 5 points clés structurés avec des titres clairs.\n\nDocument :\n${input}`,
  },
  invoice: {
    endpoint: '/api/generate',
    buildPrompt: (input) =>
      `Tu es l'assistant du cabinet Le Play Avocats. Génère une facture complète en français avec tous les champs légaux requis (numéro, date, émetteur, destinataire, détail des prestations, TVA, total TTC) à partir de la description suivante.\n\nDescription : ${input}`,
  },
  hearing: {
    endpoint: '/api/generate',
    buildPrompt: (input) =>
      `Tu es un avocat préparant une audience. Rédige en français une fiche d'audience structurée avec : résumé du litige, arguments principaux, points de droit à soulever, réponses aux contre-arguments prévisibles.\n\nDemande : ${input}`,
  },
  content: {
    endpoint: '/api/generate',
    buildPrompt: (input, type) => {
      if (type === 'linkedin') {
        return `Tu es Errol Cohen, avocat spécialisé en sociétés à mission. Rédige en français un post LinkedIn engageant dans ton style : ton d'expert accessible, phrases courtes, appel à l'action final. Sujet : ${input}`;
      }
      return `Tu es Errol Cohen, avocat spécialisé en sociétés à mission. Rédige en français un article juridique structuré (introduction, développement, conclusion) sur le sujet suivant : ${input}`;
    },
  },
};

// ─── Ollama status check ──────────────────────────────────────────────────────
async function checkOllamaStatus() {
  const dot   = document.getElementById('status-dot');
  const label = document.getElementById('status-label');
  try {
    const res = await fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(3000) });
    if (res.ok) {
      dot.className   = 'status-dot online';
      label.textContent = 'Ollama actif';
    } else {
      throw new Error();
    }
  } catch {
    dot.className   = 'status-dot offline';
    label.textContent = 'Ollama hors ligne';
  }
}

// ─── Agent switching ──────────────────────────────────────────────────────────
document.querySelectorAll('.agent-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const id = btn.dataset.agent;

    // Update sidebar active state
    document.querySelectorAll('.agent-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    // Show the correct view
    document.querySelectorAll('.agent-view').forEach(v => v.classList.remove('active'));
    document.getElementById(`agent-${id}`).classList.add('active');
  });
});

// ─── Run agent ────────────────────────────────────────────────────────────────
async function runAgent(agentId) {
  const input     = document.getElementById(`${agentId}-input`).value.trim();
  const resultBox = document.getElementById(`${agentId}-result`);
  const resultText = document.getElementById(`${agentId}-result-text`);

  if (!input) return;

  // Extra param for content type
  let contentType = 'linkedin';
  if (agentId === 'content') {
    contentType = document.querySelector('input[name="content-type"]:checked').value;
  }

  const agent  = AGENTS[agentId];
  const prompt = agent.buildPrompt(input, contentType);

  // Show loading state
  resultBox.style.display  = 'block';
  resultText.textContent   = 'Génération en cours…';
  resultText.className     = 'result-text loading';

  // Disable button while generating
  const btn = resultBox.previousElementSibling.querySelector('.btn-primary');
  if (btn) btn.disabled = true;

  try {
    const response = await fetch(`${OLLAMA_URL}${agent.endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model:  OLLAMA_MODEL,
        prompt: prompt,
        stream: true,
      }),
    });

    if (!response.ok) throw new Error(`Ollama error: ${response.status}`);

    // Stream response
    resultText.textContent = '';
    resultText.className   = 'result-text';

    const reader  = response.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n').filter(l => l.trim());

      for (const line of lines) {
        try {
          const data = JSON.parse(line);
          if (data.response) {
            resultText.textContent += data.response;
            // Auto-scroll to bottom of result
            resultText.scrollTop = resultText.scrollHeight;
          }
        } catch { /* partial JSON chunk, skip */ }
      }
    }
  } catch (err) {
    resultText.textContent = `Erreur : impossible de contacter Ollama. Vérifiez que le service est actif.\n\nDétail : ${err.message}`;
    resultText.className   = 'result-text';
  } finally {
    if (btn) btn.disabled = false;
  }
}

// ─── Copy result ──────────────────────────────────────────────────────────────
function copyResult(elementId) {
  const el = document.getElementById(elementId);
  if (!el || !el.textContent) return;

  navigator.clipboard.writeText(el.textContent).then(() => {
    const btn = el.closest('.result-area').querySelector('.btn-copy');
    const original = btn.textContent;
    btn.textContent = 'Copié ✓';
    setTimeout(() => { btn.textContent = original; }, 2000);
  });
}

// ─── File drop / upload (summary agent) ──────────────────────────────────────
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
    reader.onload = (e) => { textarea.value = e.target.result; };
    reader.readAsText(file);
  } else {
    // For PDF/Word, show the filename — actual parsing requires the Python tool
    textarea.value = `[Fichier chargé : ${file.name}]\n\nLe traitement des fichiers PDF et Word nécessite l'outil Python. Collez le texte extrait ici en attendant l'intégration complète.`;
  }
}

// ─── Drag-over highlight ──────────────────────────────────────────────────────
document.querySelectorAll('.drop-zone').forEach(zone => {
  zone.addEventListener('dragover', () => zone.classList.add('drag-over'));
  zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
  zone.addEventListener('drop', () => zone.classList.remove('drag-over'));
});

// ─── Init ─────────────────────────────────────────────────────────────────────
checkOllamaStatus();
setInterval(checkOllamaStatus, 30000); // re-check every 30s
