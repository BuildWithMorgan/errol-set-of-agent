# Navigation Visual Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a fade+slide panel transition animation, replace the active nav state with a solid blue fill, and replace emoji sidebar icons with thin-stroke SVG icons.

**Architecture:** Pure frontend changes — CSS keyframes for animation, a rewritten `switchAgent()` in app.js, and inline SVGs in index.html. No backend, no new dependencies, no structural HTML changes.

**Tech Stack:** Vanilla CSS animations, vanilla JS, inline SVG (no icon library)

---

## Files

| File | Change |
|---|---|
| `interface/style.css` | Add `fadeSlideIn`/`fadeOut` keyframes; add `.entering`/`.leaving` classes; update `.agent-btn.active` to solid blue fill; add `border-radius` to `.agent-btn`; adjust sidebar padding |
| `interface/app.js` | Replace `switchAgent()` with animation-aware version |
| `interface/index.html` | Replace all `<span class="agent-icon">emoji</span>` with inline SVG elements |

---

## Task 1: CSS — animation keyframes and transition classes

**Files:**
- Modify: `interface/style.css`

- [ ] **Step 1: Add keyframes and transition classes**

Open `interface/style.css`. Locate the `.agent-view` block (around line 158) and add the following immediately after it:

```css
/* ─── Panel transition animation ────────────────────────── */
@keyframes fadeSlideIn {
  from { opacity: 0; transform: translateY(18px); }
  to   { opacity: 1; transform: translateY(0); }
}

@keyframes fadeOut {
  from { opacity: 1; }
  to   { opacity: 0; }
}

.agent-view.entering {
  display: block;
  animation: fadeSlideIn 0.45s cubic-bezier(0.22, 1, 0.36, 1) forwards;
}

.agent-view.leaving {
  display: block;
  animation: fadeOut 0.22s ease forwards;
  pointer-events: none;
}
```

- [ ] **Step 2: Update active nav state — solid blue fill**

Find the `.agent-btn.active` rule in `style.css` and replace it entirely:

```css
.agent-btn.active {
  background: var(--blue);
  color: var(--white);
  border-left-color: transparent;
  font-weight: 500;
}

.agent-btn.active:hover {
  background: var(--blue-dark);
  color: var(--white);
}
```

- [ ] **Step 3: Add border-radius to nav buttons and adjust sidebar padding**

Find the `.agent-btn` rule and make two changes:
1. Add `border-radius: 6px;`
2. Change `padding` from `11px 20px` to `10px 12px`

Also find the `.sidebar` rule and change `padding: 20px 0;` to `padding: 16px 10px;`.

The result should look like:

```css
.sidebar {
  width: var(--sidebar-w);
  background: var(--white);
  flex-shrink: 0;
  padding: 16px 10px;
  overflow-y: auto;
  border-right: 1px solid var(--gray-3);
}

.agent-btn {
  display: flex;
  align-items: center;
  gap: 11px;
  width: 100%;
  padding: 10px 12px;
  background: none;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  color: var(--gray-5);
  font-family: var(--font);
  font-size: 13.5px;
  text-align: left;
  transition: background 0.15s, color 0.15s;
  border-left: 3px solid transparent;
  line-height: 1.3;
}
```

- [ ] **Step 4: Verify visually**

Open `http://localhost:3000` in the browser. Check:
- Sidebar nav items have visible rounded corners when hovered
- Active item (Tableau de bord on load) shows solid blue background with white text
- No other layout shifts or regressions

- [ ] **Step 5: Commit**

```bash
git add interface/style.css
git commit -m "feat: add panel transition animation and solid active nav state"
```

---

## Task 2: JS — animation-aware agent switching

**Files:**
- Modify: `interface/app.js`

- [ ] **Step 1: Locate the existing agent-switching block**

Open `interface/app.js`. The current switching logic is an anonymous event listener block at the top of the file (lines 1–12):

```js
document.querySelectorAll('.agent-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const id = btn.dataset.agent;
    document.querySelectorAll('.agent-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.querySelectorAll('.agent-view').forEach(v => v.classList.remove('active'));
    document.getElementById(`agent-${id}`).classList.add('active');
    if (id === 'dashboard') loadDashboard();
    else loadTemplates(id);
  });
});
```

- [ ] **Step 2: Replace the block with an animation-aware version**

Replace those 12 lines with:

```js
let currentAgent = 'dashboard';

document.querySelectorAll('.agent-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const id = btn.dataset.agent;
    if (id === currentAgent) return;

    const currentEl = document.getElementById('agent-' + currentAgent);
    const nextEl    = document.getElementById('agent-' + id);

    // Update sidebar button states immediately
    document.querySelectorAll('.agent-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    // Fade out current panel
    currentEl.classList.remove('active', 'entering');
    currentEl.classList.add('leaving');

    setTimeout(() => {
      currentEl.classList.remove('leaving');
      currentEl.style.display = 'none';

      nextEl.style.display = 'block';
      nextEl.classList.remove('active', 'leaving');
      nextEl.classList.add('entering');

      nextEl.addEventListener('animationend', () => {
        nextEl.classList.remove('entering');
        nextEl.classList.add('active');
      }, { once: true });

      currentAgent = id;

      // Preserve existing post-switch logic
      if (id === 'dashboard') loadDashboard();
      else loadTemplates(id);
    }, 220); // matches fadeOut duration in CSS
  });
});
```

- [ ] **Step 3: Confirm initialisation is consistent**

`let currentAgent = 'dashboard'` is at module scope (top of file). Confirm `#agent-dashboard` has `class="agent-view active"` in `index.html` — this is the initial visible panel that `currentAgent` points to.

- [ ] **Step 4: Verify the animation end-to-end**

Open `http://localhost:3000`. Click through every agent in the sidebar:
- Each switch: current panel fades out (~0.22s), then new panel slides up (~0.45s)
- Active sidebar button turns solid blue immediately on click
- Rapid clicking does not break the state (the `if (name === currentAgent) return` guard handles this)
- After switching, the old panel is fully hidden (`display: none`) and the new one is visible

- [ ] **Step 5: Commit**

```bash
git add interface/app.js
git commit -m "feat: animate panel transitions with fade+slide in switchAgent"
```

---

## Task 3: HTML — replace emoji icons with inline SVG

**Files:**
- Modify: `interface/index.html`

- [ ] **Step 1: Add SVG CSS to style.css**

Open `interface/style.css`. Find `.agent-icon` and replace it with:

```css
.agent-icon {
  width: 17px;
  height: 17px;
  flex-shrink: 0;
}

.agent-btn svg {
  width: 17px;
  height: 17px;
  flex-shrink: 0;
  stroke: currentColor;
  fill: none;
  stroke-width: 1.7;
  stroke-linecap: round;
  stroke-linejoin: round;
  transition: stroke 0.15s;
}
```

- [ ] **Step 2: Replace the dashboard icon**

In `index.html`, find:
```html
<button class="agent-btn active" data-agent="dashboard" id="btn-dashboard">
  <span class="agent-icon">🏠</span>
  Tableau de bord
</button>
```

Replace with:
```html
<button class="agent-btn active" data-agent="dashboard" id="btn-dashboard">
  <svg viewBox="0 0 24 24" class="agent-icon"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
  Tableau de bord
</button>
```

- [ ] **Step 3: Replace the RAG icon**

Find:
```html
<button class="agent-btn" data-agent="rag">
  <span class="agent-icon">🗂</span>
  Interroger mes dossiers
</button>
```

Replace with:
```html
<button class="agent-btn" data-agent="rag">
  <svg viewBox="0 0 24 24" class="agent-icon"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z"/><circle cx="11" cy="13" r="2.5"/><path d="m14.5 16.5 2 2"/></svg>
  Interroger mes dossiers
</button>
```

- [ ] **Step 4: Replace the letter icon**

Find:
```html
<button class="agent-btn" data-agent="letter">
  <span class="agent-icon">✉️</span>
  Rédiger un courrier
</button>
```

Replace with:
```html
<button class="agent-btn" data-agent="letter">
  <svg viewBox="0 0 24 24" class="agent-icon"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14,2 14,8 20,8"/><path d="M10 13h4M10 17h4M10 9h1"/></svg>
  Rédiger un courrier
</button>
```

- [ ] **Step 5: Replace the summary icon**

Find:
```html
<button class="agent-btn" data-agent="summary">
  <span class="agent-icon">📄</span>
  Résumer un document
</button>
```

Replace with:
```html
<button class="agent-btn" data-agent="summary">
  <svg viewBox="0 0 24 24" class="agent-icon"><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M8 9h8M8 13h6M8 17h4"/></svg>
  Résumer un document
</button>
```

- [ ] **Step 6: Replace the invoice icon**

Find:
```html
<button class="agent-btn" data-agent="invoice">
  <span class="agent-icon">🧾</span>
  Générer une facture
</button>
```

Replace with:
```html
<button class="agent-btn" data-agent="invoice">
  <svg viewBox="0 0 24 24" class="agent-icon"><path d="M6 2h12a1 1 0 0 1 1 1v18l-3-2-2 2-2-2-2 2-2-2-2 2V3a1 1 0 0 1 1-1z"/><path d="M9 7h6M9 11h6M9 15h4"/></svg>
  Générer une facture
</button>
```

- [ ] **Step 7: Replace the hearing icon**

Find:
```html
<button class="agent-btn" data-agent="hearing">
  <span class="agent-icon">⚖️</span>
  Préparer une audience
</button>
```

Replace with:
```html
<button class="agent-btn" data-agent="hearing">
  <svg viewBox="0 0 24 24" class="agent-icon"><path d="M12 3v4M6.3 6.3l2.8 2.8M17.7 6.3l-2.8 2.8"/><path d="M3 12h18"/><path d="M5 12l2 5h10l2-5"/><path d="M12 17v4M10 21h4"/></svg>
  Préparer une audience
</button>
```

- [ ] **Step 8: Replace the content icon**

Find:
```html
<button class="agent-btn" data-agent="content">
  <span class="agent-icon">✍️</span>
  Créer du contenu
</button>
```

Replace with:
```html
<button class="agent-btn" data-agent="content">
  <svg viewBox="0 0 24 24" class="agent-icon"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
  Créer du contenu
</button>
```

- [ ] **Step 9: Verify icons visually**

Open `http://localhost:3000`. Check:
- All 7 sidebar items show thin-stroke SVG icons (no emoji)
- Inactive items: icon is gray, same color as the label
- Active item: icon is white, same color as the white label text
- Icons are 17px, vertically aligned with the label text
- No layout shifts

- [ ] **Step 10: Commit**

```bash
git add interface/index.html interface/style.css
git commit -m "feat: replace emoji sidebar icons with SVG outline icons"
```

---

## Final verification

- [ ] Open `http://localhost:3000` and click through all 7 agents
- [ ] Confirm: smooth fade+slide transition on every switch
- [ ] Confirm: active item shows solid blue fill + white icon + white text
- [ ] Confirm: all SVG icons display correctly in both active and inactive states
- [ ] Confirm: no console errors in browser devtools
