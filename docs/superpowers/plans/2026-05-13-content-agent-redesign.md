# Content Agent Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the thin content agent (radio + textarea) with a 4-type starting-point selector, hardcoded Errol style rules, and an in-place refinement strip after generation.

**Architecture:** `prompts.py` gains a full content block (4 starting points × generate + refine modes). `index.html` replaces the radio buttons with pill buttons and adds a refinement strip. `app.js` adds `contentSetType()`, updates `collectInput()`, shows/hides the strip around `runAgent()`, and adds `contentRefine()` / `contentRefineCustom()`. No new endpoints — refinement uses `/api/generate` with `mode: "refine"`.

**Tech Stack:** Python 3.9+, FastAPI, vanilla JS, CSS custom properties. Tests via pytest.

---

## File Map

| File | Change |
|---|---|
| `prompts.py` | Rewrite `content` block: 4 starting points × 2 modes; update `build_input_summary` |
| `tests/test_prompts.py` | Replace 2 content tests with 8 new tests |
| `interface/index.html` | Replace radio with pill buttons; add `#content-refine-strip` |
| `interface/style.css` | Replace `.content-type-selector`; add `.content-pill` + `.content-refine-strip` |
| `interface/app.js` | Add `_contentStartingPoint`, `contentSetType()`, update `collectInput()`, update `runAgent()`, add `contentRefine()`, `contentRefineCustom()` |

---

## Task 1: Update `prompts.py` — style rules, starting points, refine mode

**Context:** `prompts.py` is the single file that maps agent IDs to Ollama prompts. The `content` block currently handles only `linkedin` / `article` via `content_type`. We replace it with 4 starting points (`sujet`, `brouillon`, `evenement`, `article`) and a `mode` field (`generate` / `refine`). `build_input_summary` also needs a `refine` branch so history saves the instruction, not the original post.

**Files:**
- Modify: `prompts.py:45-68`
- Test: `tests/test_prompts.py:22-45`

- [ ] **Step 1: Write the failing tests**

Open `tests/test_prompts.py`. Replace lines 22–30 (the two existing content tests) and append new tests so the file reads:

```python
import pytest
from prompts import build_prompt, build_input_summary, AGENT_LABELS


def test_agent_labels_has_exactly_four_agents():
    assert set(AGENT_LABELS.keys()) == {"rag", "invoice", "content", "cleaner"}


def test_build_prompt_rag():
    prompt = build_prompt("rag", {"input": "Quelles obligations Dupont ?"})
    assert "Dupont" in prompt
    assert "français" in prompt


def test_build_prompt_invoice():
    body = {"fields": {"client": "ABC", "date": "01/01/2026", "hours": "3", "rate": "350", "description": "Conseil"}}
    prompt = build_prompt("invoice", body)
    assert "ABC" in prompt
    assert "1050.00" in prompt


def test_build_prompt_content_sujet():
    prompt = build_prompt("content", {"input": "Sociétés à mission", "starting_point": "sujet"})
    assert "Sociétés à mission" in prompt
    assert "Errol Cohen" in prompt
    assert "#sociétéamission" in prompt
    assert "MAJUSCULES" in prompt


def test_build_prompt_content_brouillon():
    prompt = build_prompt("content", {"input": "Mon brouillon ici", "starting_point": "brouillon"})
    assert "Mon brouillon ici" in prompt
    assert "Reformule" in prompt


def test_build_prompt_content_evenement():
    prompt = build_prompt("content", {"input": "Conférence Paris", "starting_point": "evenement"})
    assert "Conférence Paris" in prompt
    assert "événement" in prompt.lower()


def test_build_prompt_content_article():
    prompt = build_prompt("content", {"input": "Sujet test", "starting_point": "article"})
    assert "article" in prompt.lower()
    assert "introduction" in prompt.lower()


def test_build_prompt_content_default_starting_point():
    prompt = build_prompt("content", {"input": "Sujet test"})
    assert "post LinkedIn" in prompt.lower() or "linkedin" in prompt.lower()


def test_build_prompt_content_refine():
    prompt = build_prompt("content", {
        "mode": "refine",
        "original_post": "Mon post original",
        "instruction": "Rends-le plus court",
    })
    assert "Mon post original" in prompt
    assert "Rends-le plus court" in prompt
    assert "sans commentaire" in prompt


def test_build_prompt_raises_for_removed_agents():
    for agent in ("letter", "summary", "hearing"):
        with pytest.raises(ValueError):
            build_prompt(agent, {})


def test_build_input_summary_invoice():
    body = {"fields": {"description": "Conseil", "client": "ABC"}}
    assert build_input_summary("invoice", body) == "Conseil — ABC"


def test_build_input_summary_rag():
    assert build_input_summary("rag", {"input": "Question ?"}) == "Question ?"


def test_build_input_summary_content_generate():
    body = {"input": "Post sur les sociétés à mission"}
    assert build_input_summary("content", body) == "Post sur les sociétés à mission"


def test_build_input_summary_content_refine():
    body = {"mode": "refine", "instruction": "Rends-le plus court"}
    assert build_input_summary("content", body) == "Rends-le plus court"
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
cd "/Users/morganracon/Errol set of agent " && python -m pytest tests/test_prompts.py -v 2>&1 | tail -20
```

Expected: several FAILED on the new content tests (functions not found or assertions wrong).

- [ ] **Step 3: Rewrite the `content` block in `prompts.py`**

Replace lines 45–59 (the old `if agent_id == "content":` block) with:

```python
    if agent_id == "content":
        mode = body.get("mode", "generate")

        STYLE_RULES = (
            "Respecte strictement ton style :\n"
            "- Paragraphes courts (3-4 phrases max)\n"
            "- MAJUSCULES pour les concepts juridiques clés : SOCIÉTÉ À MISSION, COMITÉ DE MISSION, RAISON D'ÊTRE, OBJET SOCIAL\n"
            '- Listes avec " - " si nécessaire\n'
            '- Vouvoiement ("vous")\n'
            "- Pas d'emojis\n"
            '- Ne commence jamais par "Bonjour" ou "Je suis ravi"\n'
            "- Termine par 3-5 hashtags dont #sociétéamission"
        )

        if mode == "refine":
            return (
                "Tu es Errol Cohen, avocat spécialisé en sociétés à mission au cabinet Le Play Avocats.\n"
                "Voici un post LinkedIn que tu as rédigé :\n\n"
                "---\n"
                f"{body.get('original_post', '')}\n"
                "---\n\n"
                f"Instruction : {body.get('instruction', '')}\n\n"
                + STYLE_RULES + "\n\n"
                "Retourne uniquement le post révisé, sans commentaire ni explication."
            )

        starting_point = body.get("starting_point", "sujet")
        user_input = body.get("input", "")
        base = "Tu es Errol Cohen, avocat spécialisé en sociétés à mission au cabinet Le Play Avocats.\n"

        if starting_point == "article":
            return (
                base
                + "Rédige en français un article juridique structuré sur le sujet suivant.\n"
                "Structure : introduction, 3 points numérotés développés, conclusion.\n"
                "400-600 mots. Ton expert et accessible. Pas d'emojis. Vouvoiement.\n\n"
                f"Sujet : {user_input}"
            )

        instructions = {
            "sujet":     "Rédige un post LinkedIn en français sur le sujet suivant.",
            "brouillon": "Reformule et améliore ce brouillon en respectant ton style.",
            "evenement": "Rédige un post LinkedIn en français autour de cet événement.",
        }
        action = instructions.get(starting_point, instructions["sujet"])

        return (
            base
            + f"{action}\n"
            "150-300 mots. Structure : accroche → explication → enjeu pour le lecteur → appel à l'action.\n\n"
            + STYLE_RULES + "\n\n"
            f"Contenu : {user_input}"
        )
```

- [ ] **Step 4: Update `build_input_summary` in `prompts.py`**

Replace the current `build_input_summary` function (lines 64–68) with:

```python
def build_input_summary(agent_id: str, body: dict) -> str:
    f = body.get("fields", {})
    if agent_id == "invoice":
        return f"{f.get('description', '')} — {f.get('client', '')}"
    if agent_id == "content" and body.get("mode") == "refine":
        return (body.get("instruction") or "")[:200]
    return (body.get("input") or "")[:200]
```

- [ ] **Step 5: Run all tests — verify they pass**

```bash
cd "/Users/morganracon/Errol set of agent " && python -m pytest tests/test_prompts.py -v 2>&1 | tail -20
```

Expected: all 14 tests PASSED.

- [ ] **Step 6: Run full test suite — verify no regressions**

```bash
cd "/Users/morganracon/Errol set of agent " && python -m pytest tests/ -v 2>&1 | tail -20
```

Expected: all tests PASSED.

- [ ] **Step 7: Commit**

```bash
cd "/Users/morganracon/Errol set of agent " && git add prompts.py tests/test_prompts.py && git commit -m "feat: content agent — style rules, 4 starting points, refine mode"
```

---

## Task 2: Update `interface/index.html` — pill selector + refinement strip

**Context:** The `#agent-content` section (lines 184–216) currently has a radio-button type selector. We replace it with pill buttons and add a `#content-refine-strip` div between the result area and the feedback row. No other sections are touched.

**Files:**
- Modify: `interface/index.html:190-215`

- [ ] **Step 1: Replace the `.content-type-selector` div with pills**

In `interface/index.html`, replace the entire `<div class="content-type-selector">…</div>` block (lines 190–193) and the `<textarea>` placeholder text with:

```html
          <div class="content-type-pills" id="content-type-pills">
            <button class="content-pill active" data-type="sujet"     onclick="contentSetType('sujet')">Sujet</button>
            <button class="content-pill"        data-type="brouillon" onclick="contentSetType('brouillon')">Brouillon</button>
            <button class="content-pill"        data-type="evenement" onclick="contentSetType('evenement')">Événement</button>
            <button class="content-pill"        data-type="article"   onclick="contentSetType('article')">Article juridique</button>
          </div>
          <textarea id="content-input" rows="4" placeholder="Ex : Les nouvelles obligations du comité de mission en 2025"></textarea>
          <button class="btn-primary" onclick="runAgent('content')">Générer</button>
```

- [ ] **Step 2: Add the refinement strip after `#content-result`**

After the closing `</div>` of `id="content-result"` (after line 210) and before `<div class="feedback-row" id="content-feedback-row"`, insert:

```html
        <div class="content-refine-strip" id="content-refine-strip" style="display:none">
          <div class="content-refine-quick">
            <button class="content-refine-btn" onclick="contentRefine('Rends ce post plus court')">Plus court</button>
            <button class="content-refine-btn" onclick="contentRefine('Développe ce post, rends-le plus long')">Plus long</button>
            <button class="content-refine-btn" onclick="contentRefine('Reformule uniquement l\'introduction, garde le reste')">Reformuler l'intro</button>
            <button class="content-refine-btn" onclick="contentRefine('Ajoute un appel à l\'action percutant à la fin')">Ajouter un CTA</button>
            <button class="content-refine-btn" onclick="contentRefine('Change le ton, rends-le plus percutant et direct')">Changer le ton</button>
          </div>
          <div class="content-refine-custom">
            <input type="text" id="content-refine-input" placeholder="Ou dis-moi quoi changer…" onkeydown="if(event.key==='Enter') contentRefineCustom()" />
            <button class="btn-primary" onclick="contentRefineCustom()">Raffiner</button>
          </div>
        </div>
```

- [ ] **Step 3: Verify the HTML structure is correct**

```bash
grep -n "content-refine\|content-pill\|content-type" "/Users/morganracon/Errol set of agent /interface/index.html"
```

Expected output shows: `content-type-pills`, `content-pill` (×4), `content-refine-strip`, `content-refine-quick`, `content-refine-btn` (×5), `content-refine-custom`, `content-refine-input`. No `content-type-selector` or `radio` remaining in the content section.

- [ ] **Step 4: Commit**

```bash
cd "/Users/morganracon/Errol set of agent " && git add interface/index.html && git commit -m "feat: content agent HTML — pill selector + refinement strip"
```

---

## Task 3: Update `interface/style.css` — pill and strip styles

**Context:** The `.content-type-selector` styles (lines 381–395) are now dead. We remove them and add styles for `.content-pill`, `.content-refine-strip`, and related elements. All styles use existing CSS variables.

**Files:**
- Modify: `interface/style.css:381-395`

- [ ] **Step 1: Replace `.content-type-selector` block with pill styles**

In `interface/style.css`, replace the entire `.content-type-selector` block (lines 381–395 — from `.content-type-selector {` through the closing `}` of `.content-type-selector input[type="radio"]`) with:

```css
/* ─── Content type pills ─────────────────────────────────── */
.content-type-pills {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
.content-pill {
  padding: 5px 14px;
  border-radius: 20px;
  border: 1px solid var(--gray-3);
  background: var(--white);
  color: var(--gray-5);
  font-size: 12.5px;
  font-family: var(--font);
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s, color 0.15s;
}
.content-pill:hover {
  border-color: var(--blue);
  color: var(--blue);
}
.content-pill.active {
  background: var(--blue-lt);
  border-color: var(--blue);
  color: var(--blue);
  font-weight: 600;
}

/* ─── Content refinement strip ───────────────────────────── */
.content-refine-strip {
  background: var(--white);
  border: 1px solid var(--gray-3);
  border-radius: var(--radius);
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.content-refine-quick {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
.content-refine-btn {
  padding: 5px 12px;
  border-radius: 16px;
  border: 1px solid var(--gray-3);
  background: var(--gray-1);
  color: var(--gray-5);
  font-size: 12px;
  font-family: var(--font);
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s, color 0.15s;
}
.content-refine-btn:hover {
  border-color: var(--blue);
  background: var(--blue-lt);
  color: var(--blue);
}
.content-refine-custom {
  display: flex;
  gap: 8px;
}
.content-refine-custom input {
  flex: 1;
  padding: 8px 12px;
  border: 1px solid var(--gray-3);
  border-radius: var(--radius);
  font-size: 13px;
  font-family: var(--font);
  color: var(--black);
  background: var(--white);
}
.content-refine-custom input:focus {
  outline: none;
  border-color: var(--blue);
}
```

- [ ] **Step 2: Verify old selector is gone and new styles are present**

```bash
grep -n "content-type-selector\|content-pill\|content-refine" "/Users/morganracon/Errol set of agent /interface/style.css"
```

Expected: `content-type-selector` does NOT appear. `content-pill`, `content-refine-strip`, `content-refine-quick`, `content-refine-btn`, `content-refine-custom` all appear.

- [ ] **Step 3: Commit**

```bash
cd "/Users/morganracon/Errol set of agent " && git add interface/style.css && git commit -m "feat: content agent CSS — pill selector + refinement strip styles"
```

---

## Task 4: Update `interface/app.js` — JS functions for pills and refinement

**Context:** `app.js` needs four changes: (1) a module-level variable `_contentStartingPoint` to track which pill is active; (2) `contentSetType()` which switches pills and updates the textarea placeholder; (3) update `collectInput()` for the `content` branch to send `starting_point` and `mode: "generate"` instead of `content_type`; (4) update `runAgent()` to hide the strip at start and show it after generation; (5) `contentRefine(instruction)` which calls `/api/generate` in refine mode and updates the result in-place; (6) `contentRefineCustom()` which reads the free-text field and calls `contentRefine()`.

**Files:**
- Modify: `interface/app.js`

- [ ] **Step 1: Add `_contentStartingPoint` variable**

Find the block of module-level variable declarations near the top of `app.js` (look for `let _cleanerProposals` or similar). Add after those declarations:

```javascript
let _contentStartingPoint = 'sujet';
```

- [ ] **Step 2: Add `contentSetType()` function**

Add this function anywhere before the closing of the file (a good place is just before the `// ─── Cleaner` section):

```javascript
// ─── Content agent ────────────────────────────────────────────────────────────
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
```

- [ ] **Step 3: Update `collectInput()` for the `content` branch**

In `collectInput()`, replace the existing `if (agentId === 'content')` block (lines 83–88):

```javascript
  if (agentId === 'content') {
    return {
      agent:          'content',
      mode:           'generate',
      input:          document.getElementById('content-input')?.value.trim() || '',
      starting_point: _contentStartingPoint,
    };
  }
```

- [ ] **Step 4: Update `runAgent()` — hide strip on start, show strip after generation**

In `runAgent()`, after `const submitBtn = ...` and before `const body = collectInput(agentId)`, add:

```javascript
  // Hide refinement strip when starting a new generation
  if (agentId === 'content') {
    const strip = document.getElementById('content-refine-strip');
    if (strip) strip.style.display = 'none';
  }
```

Then, after the line `if (footer) footer.style.display = 'block';` (inside the `try` block, after the streaming loop), add:

```javascript
    // Show refinement strip for content agent
    if (agentId === 'content') {
      const strip = document.getElementById('content-refine-strip');
      if (strip) strip.style.display = 'flex';
    }
```

- [ ] **Step 5: Add `contentRefine()` function**

Add this function in the `// ─── Content agent` section (after `contentSetType`):

```javascript
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
```

- [ ] **Step 6: Add `contentRefineCustom()` function**

Add immediately after `contentRefine()`:

```javascript
function contentRefineCustom() {
  const input = document.getElementById('content-refine-input');
  const instruction = input?.value.trim();
  if (!instruction) return;
  if (input) input.value = '';
  contentRefine(instruction);
}
```

- [ ] **Step 7: Verify JS is syntactically valid**

```bash
node --check "/Users/morganracon/Errol set of agent /interface/app.js" && echo "OK"
```

Expected: `OK` (no syntax errors).

- [ ] **Step 8: Run full test suite — verify no regressions**

```bash
cd "/Users/morganracon/Errol set of agent " && python -m pytest tests/ -v 2>&1 | tail -10
```

Expected: all tests PASSED.

- [ ] **Step 9: Commit**

```bash
cd "/Users/morganracon/Errol set of agent " && git add interface/app.js && git commit -m "feat: content agent JS — pill switching, starting point, refinement strip"
```

---

## Self-Review Checklist

- [x] Spec §1 style rules → Task 1 encodes all 8 rules in `STYLE_RULES` constant
- [x] Spec §2 4 starting points → Task 1 handles sujet/brouillon/evenement/article; Task 2 adds 4 pills; Task 4 wires `_contentStartingPoint`
- [x] Spec §3 flow → Task 4 hides strip on new generation, shows after; `contentRefine()` updates in-place
- [x] Spec §4.1 pill selector → Task 2 HTML + Task 3 CSS + Task 4 `contentSetType()`
- [x] Spec §4.2 refinement strip → Task 2 HTML (5 quick buttons + custom input) + Task 3 CSS + Task 4 JS
- [x] Spec §4.3 preserved elements → copy/export/feedback/template untouched
- [x] Spec §5.1 no new endpoints → both generate and refine use `/api/generate`
- [x] Spec §5.2 prompt structure → Task 1 implements all 4 types × 2 modes
- [x] Spec §5.3 history → `build_input_summary` returns instruction for refine mode
- [x] Spec §7 tests → 14 test_prompts.py tests covering all starting points × modes
