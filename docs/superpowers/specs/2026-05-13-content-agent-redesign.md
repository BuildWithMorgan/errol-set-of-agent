# Spec — Redesign agent Créer du contenu

**Date:** 2026-05-13
**Branche:** feature/interface-enhancements

---

## Objectif

Transformer l'agent "Créer du contenu" en un outil vraiment utile pour Errol : génération de posts LinkedIn dans son style réel, avec plusieurs points d'entrée possibles et une boucle de raffinement intégrée.

---

## 1. Style d'Errol (règles hardcodées)

Ces règles sont encodées dans le prompt de `prompts.py` et ne changent jamais :

- Paragraphes courts (max 3-4 phrases chacun)
- MAJUSCULES pour les concepts juridiques clés : SOCIÉTÉ À MISSION, COMITÉ DE MISSION, RAISON D'ÊTRE, OBJET SOCIAL, etc.
- Listes avec le format " - " (pas de puces, pas de numéros)
- Se termine par 3-5 hashtags — toujours `#sociétéamission`, puis contextuels : `#RSE #ESG #droitdessociétés #durable #entreprise`
- Vouvoiement ("vous") tout au long
- Pas d'emojis
- Structure : accroche/annonce → explication → ce que ça signifie pour le lecteur → appel à l'action
- 150-300 mots
- Ne commence jamais par "Bonjour" ni "Je suis ravi de"

---

## 2. Points d'entrée (starting points)

L'agent accepte 4 types d'entrée, sélectionnés via des boutons pill dans l'UI :

| Type | Label UI | Comportement du prompt |
|---|---|---|
| `sujet` | Sujet | Génère un post à partir d'un sujet libre |
| `brouillon` | Brouillon | Reformule un brouillon existant dans le style d'Errol |
| `evenement` | Événement | Génère un post autour d'un événement (conférence, publication, loi) |
| `article` | Article juridique | Génère un article structuré (intro + 3 points + conclusion) |

`sujet` est le type par défaut.

---

## 3. Flux de génération

```
Errol sélectionne un type → saisit son texte → clique "Générer"
→ Ollama streame le post
→ Le résultat s'affiche
→ La bande de raffinement apparaît sous le résultat
→ Errol clique un bouton rapide OU saisit une instruction libre → clique "Raffiner"
→ Ollama génère une version révisée (in-place, même zone de résultat)
→ La bande de raffinement réapparaît (possibilité de raffiner à nouveau)
```

---

## 4. UI — section `#agent-content`

### 4.1 Sélecteur de type

Remplace les radio buttons actuels par 4 boutons pill horizontaux :

```
[ Sujet ]  [ Brouillon ]  [ Événement ]  [ Article juridique ]
```

- Un seul actif à la fois, style `pill-active`
- Le placeholder du textarea s'adapte au type sélectionné :
  - Sujet → "Ex : Les nouvelles obligations du comité de mission en 2025"
  - Brouillon → "Collez votre brouillon ici, l'IA va le reformuler dans votre style"
  - Événement → "Ex : Conférence sur les sociétés à mission le 15 mai à Paris"
  - Article → "Ex : La raison d'être : définition, enjeux et obligations légales"

### 4.2 Bande de raffinement (apparaît après génération)

Affichée sous la zone de résultat, cachée par défaut :

```
[ Plus court ]  [ Plus long ]  [ Reformuler l'intro ]  [ Ajouter un CTA ]  [ Changer le ton ]
[ Ou dis-moi quoi changer…                                           ] [ Raffiner ]
```

- Clic sur un bouton rapide → remplit le champ texte avec l'instruction → envoie automatiquement
- Champ texte libre → instruction personnalisée → bouton "Raffiner"
- Pendant le raffinement : bande masquée, spinner sur la zone résultat
- Après raffinement : bande réapparaît (itération possible)
- La bande disparaît si Errol clique "Générer" avec un nouveau sujet

### 4.3 Éléments conservés

- Bouton "Copier"
- Export DOCX / PDF
- Feedback 👍 / 👎
- Sauvegarde de modèles

---

## 5. Backend

### 5.1 Aucun nouvel endpoint

Le raffinement passe par `/api/generate` existant, avec un champ `mode` ajouté au body :

- `mode: "generate"` (défaut) — génération initiale
- `mode: "refine"` — raffinement : fournit `original_post` + `instruction`

`build_prompt` dans `prompts.py` gère les deux modes.

### 5.2 Prompts par mode et par type

**Mode `generate` :**

- `sujet` :
  ```
  Tu es Errol Cohen, avocat spécialisé en sociétés à mission au cabinet Le Play Avocats.
  Rédige un post LinkedIn en français sur le sujet suivant, en respectant strictement ton style :
  - Paragraphes courts (3-4 phrases max)
  - MAJUSCULES pour les concepts juridiques clés (SOCIÉTÉ À MISSION, COMITÉ DE MISSION, RAISON D'ÊTRE, etc.)
  - Listes avec " - " si nécessaire
  - Vouvoiement
  - Pas d'emojis
  - Structure : accroche → explication → enjeu pour le lecteur → appel à l'action
  - 150-300 mots
  - Terminer par 3-5 hashtags dont #sociétéamission
  - Ne jamais commencer par "Bonjour" ou "Je suis ravi"

  Sujet : {input}
  ```

- `brouillon` : même règles de style, instruction = "Reformule et améliore ce brouillon"
- `evenement` : même règles, instruction = "Rédige un post autour de cet événement"
- `article` : prompt adapté pour un article structuré (intro + 3 points numérotés + conclusion), 400-600 mots

**Mode `refine` :**
```
Tu es Errol Cohen, avocat spécialisé en sociétés à mission.
Voici un post LinkedIn que tu as rédigé :

---
{original_post}
---

Instruction : {instruction}

Conserve ton style (paragraphes courts, MAJUSCULES pour les concepts clés, vouvoiement, pas d'emojis, hashtags en fin de post). Retourne uniquement le post révisé, sans commentaire.
```

### 5.3 Historique

Les deux modes (`generate` et `refine`) sauvegardent dans l'historique via le mécanisme existant. Pour `refine`, `build_input_summary` retourne l'instruction (tronquée à 200 caractères).

---

## 6. Fichiers impactés

| Fichier | Action |
|---|---|
| `prompts.py` | Réécriture du bloc `content` : 4 types × 2 modes |
| `interface/index.html` | Remplacer radio par pills, ajouter bande de raffinement |
| `interface/app.js` | `collectInput` mis à jour, ajout `contentRefine()` |
| `interface/style.css` | Styles pills, bande de raffinement |
| `tests/test_prompts.py` | Tests pour les 4 types × 2 modes |

**Non modifiés :** `server.py`, `tools/generate_content.py`, `workflows/generate_content.md`

---

## 7. Tests

- `test_prompts.py` : 8 tests — `build_prompt` pour chaque type en mode `generate` + mode `refine` (vérifie que les règles de style sont dans le prompt, que `original_post` et `instruction` sont injectés)
- `test_server.py` : 1 test — POST `/api/generate` avec `mode: "refine"` retourne un stream

---

## Hors scope

- Génération d'images pour accompagner les posts
- Bibliothèque de posts passés d'Errol
- Planification / publication directe sur LinkedIn
- Autres réseaux sociaux
