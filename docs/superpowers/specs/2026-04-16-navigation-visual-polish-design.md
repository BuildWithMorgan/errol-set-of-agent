# Navigation Visual Polish — Le Play Avocats AI Platform
**Date:** 2026-04-16  
**Status:** Approved  

---

## Context

The interface features (dashboard, agents, templates, history, export) are built and working per the 2026-04-14 spec. This spec covers three purely visual improvements to the sidebar navigation and panel transitions, inspired by the societeamission.com dashboard design.

No backend changes. No HTML structure changes. Changes are confined to `interface/style.css` and `interface/app.js`.

---

## Changes

### 1. Panel transition animation

**What:** When the user clicks a sidebar nav item, the current agent panel fades out and the incoming panel fades in while sliding up from below.

**Timing:**
- Outgoing panel: fade out over **0.22s**, `ease` easing
- Incoming panel: fade in + translate from `translateY(18px)` to `translateY(0)` over **0.45s**, `cubic-bezier(0.22, 1, 0.36, 1)` (spring easing — smooth deceleration)

**Implementation:**
- Two CSS keyframes: `fadeOut` and `fadeSlideIn`
- Two CSS classes applied by JS: `.leaving` (outgoing) and `.entering` (incoming)
- JS `switchAgent()` function: applies `.leaving` to current panel, waits 220ms, then sets the next panel to `.entering`. On `animationend`, swaps to `.active`.
- The existing `display: none / block` toggle is preserved — `.leaving` and `.entering` temporarily override it during the transition.

**CSS additions to `style.css`:**
```css
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

---

### 2. Active nav state — solid blue fill

**What:** Replace the current `border-left: 3px solid blue + light blue background` active state with a solid filled blue block matching the societeamission.com sidebar style.

**Before:**
```css
.agent-btn.active {
  background: var(--blue-lt);   /* light blue */
  color: var(--blue);
  border-left-color: var(--blue);
  font-weight: 500;
}
```

**After:**
```css
.agent-btn.active {
  background: var(--blue);      /* solid blue fill */
  color: var(--white);          /* white text */
  font-weight: 500;
  /* border-left: none — removed */
}
.agent-btn.active:hover {
  background: var(--blue-dark);
}
```

**Layout change:** The sidebar nav items gain `border-radius: 6px` and are padded within the sidebar (horizontal padding on the sidebar nav container reduces to `10px` with `10px` item padding) so the filled pill has breathing room on both sides — identical to the societeamission.com treatment.

---

### 3. SVG outline icons in sidebar

**What:** Replace the emoji icons (`🗂`, `✉️`, `📄`, `🧾`, `⚖️`, `✍️`, `🏠`) with 17px thin-stroke SVG icons. Icons inherit `currentColor` so they automatically turn white when the button is in the active (blue) state.

**SVG spec:**
- `width: 17px`, `height: 17px`
- `stroke: currentColor`, `fill: none`
- `stroke-width: 1.7`
- `stroke-linecap: round`, `stroke-linejoin: round`
- `viewBox="0 0 24 24"`

**Icon assignments:**

| Agent | Icon description |
|---|---|
| Tableau de bord | 2×2 grid of squares |
| Interroger mes dossiers | Folder with magnifying glass |
| Rédiger un courrier | Document with lines and folded corner |
| Résumer un document | Rectangle with horizontal lines |
| Générer une facture | Receipt with torn bottom edge |
| Préparer une audience | Scales of justice |
| Créer du contenu | Pencil / edit stroke |

SVG paths are inlined directly in `index.html` — no external icon library dependency.

---

## File changes summary

| File | Change |
|---|---|
| `interface/style.css` | Add `fadeSlideIn` / `fadeOut` keyframes; add `.entering` / `.leaving` classes; update `.agent-btn.active` to solid blue fill; add `border-radius` to `.agent-btn`; adjust sidebar padding |
| `interface/app.js` | Replace `switchAgent()` function with animation-aware version using `.leaving` / `.entering` classes and a 220ms timeout |
| `interface/index.html` | Replace emoji `<span class="agent-icon">` with inline SVG for all 7 nav items |

---

## Out of scope

- Any changes to agent panel content or form layouts
- Backend or API changes
- Color theme changes (blue remains primary — gold theme is a separate future decision)
- Mobile/responsive adjustments
