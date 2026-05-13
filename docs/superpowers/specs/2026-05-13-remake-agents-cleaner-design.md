# Spec — Refonte agents + redesign nettoyage

**Date:** 2026-05-13
**Branche:** feature/interface-enhancements

---

## Objectif

Simplifier la plateforme en supprimant les agents inutilisés et en redesignant l'agent de nettoyage pour qu'Errol puisse valider les propositions en un seul clic.

---

## 1. Agents à supprimer

Supprimer complètement (frontend, backend, tools, workflows, agents/) :

| Agent | data-agent | Route serveur | Fichiers tools/ | Fichier workflow |
|---|---|---|---|---|
| Rédiger un courrier | `letter` | `/api/letter` | `generate_document.py` | `draft_letter.md` |
| Résumer un document | `summary` | `/api/summary` | `summarize_document.py` | `summarize_document.md` |
| Préparer une audience | `hearing` | `/api/hearing` | `prepare_hearing.py` | `prepare_hearing.md` |

**Ce qui doit être nettoyé pour chaque agent supprimé :**
- Bouton sidebar dans `interface/index.html`
- Section `<section id="agent-*">` dans `interface/index.html`
- Fonction JS dans `interface/app.js`
- Route FastAPI dans `server.py`
- Référence dans `prompts.py` (AGENT_LABELS, build_prompt)
- Dossier `agents/<nom>/`
- Fichier `tools/<nom>.py`
- Fichier `workflows/<nom>.md`
- Tests associés dans `tests/`

---

## 2. Agents conservés (inchangés)

- **Interroger mes dossiers** (`rag`) — aucune modification
- **Générer une facture** (`invoice`) — aucune modification
- **Créer du contenu** (`content`) — aucune modification
- **Tableau de bord** (`dashboard`) — mettre à jour les stats pour refléter les 4 agents restants

---

## 3. Redesign — Agent Nettoyage

### 3.1 Problèmes actuels

- Bouton "Examiner" sans signification claire
- Toggle "Actif" sans usage défini
- Classification Ollama en timeout sur tous les fichiers → aucune proposition utile
- Pas de résumé global (combien de fichiers, quelle taille récupérée)
- Errol doit traiter chaque fichier individuellement

### 3.2 Nouveau flux

```
Errol clique "Scanner maintenant"
→ Scan + classification (règles d'abord, Ollama en fallback)
→ Page résultat : bannière résumé + liste cochée
→ Errol décoche ce qu'il veut garder (optionnel)
→ Clic "Confirmer la suppression (N fichiers)"
→ Suppression + confirmation visuelle
```

### 3.3 Types de fichiers scannés

Inchangés par rapport au code existant (`file_cleaner.py:17`) :
`.pdf`, `.doc`, `.docx`, `.txt`, `.xlsx`, `.xls`, `.png`, `.jpg`, `.jpeg`

Aucun autre type n'est remonté dans les propositions.

### 3.4 Logique de classification (fix timeout)

**Règle actuelle :** Ollama appelé pour tous les fichiers → timeout fréquent.

**Nouvelle règle :**
1. **Règle 1 — Doublons** : si un fichier a le même nom de base avec un suffixe `(1)`, `_v2`, `- copie`, `final`, `old` → proposition automatique **Supprimer**, sans Ollama.
2. **Règle 2 — Ancienneté** : fichier non modifié depuis > 12 mois ET taille < 5 Mo → proposition **Supprimer**, sans Ollama.
3. **Règle 3 — Screenshots** : `.png` / `.jpg` dont le nom commence par `Capture d'écran`, `Screenshot`, `IMG_`, `image` → proposition **Supprimer**, sans Ollama.
4. **Fallback Ollama** : uniquement pour les fichiers ambigus non couverts par les règles 1-3. Timeout augmenté à 30s. Si timeout → ignorer le fichier (ne pas afficher d'erreur dans la liste).

### 3.5 Nouveau design UI

**Sidebar :** Badge rouge avec le nombre de propositions en attente sur "Nettoyer mes fichiers".

**Page nettoyage — état vide (avant scan) :**
- Titre + description
- Bouton "Scanner maintenant"
- Message "Aucun scan récent" si pas de données

**Page nettoyage — résultats :**

Bannière résumé en haut :
```
[ 12 ]  fichiers à supprimer        | scannés: 106 | récupérés: 1,2 Go | conservés: 94 |   [ Supprimer les 12 fichiers sélectionnés ]
        Décochez pour exclure
```

Tableau de propositions :
- Colonnes : ☐ | Type (badge coloré) | Nom du fichier + chemin | Pourquoi supprimer ? | Taille
- Toutes les cases cochées par défaut
- Décocher une case → ligne grisée, compteur du bouton décrémenté
- Bouton de confirmation répété en bas du tableau

**Éléments supprimés du design actuel :**
- Bouton "Examiner"
- Toggle "Actif"
- Messages d'erreur "Erreur de classification: timed out" dans la liste

**Sécurité :** Message permanent "Rien ne se supprime sans votre validation" visible sur la page.

### 3.6 Backend — endpoint `/api/cleaner/scan`

**Comportement actuel :** Lance un scan SSE avec progress bar.

**Comportement cible :**
- Scan synchrone (pas de SSE nécessaire pour 106 fichiers, c'est rapide)
- Retourne une liste de propositions : `{ filename, path, type, reason, size_bytes, selected: true }`
- Endpoint `/api/cleaner/apply` reçoit la liste filtrée par Errol et supprime

**Si le scan prend > 5s :** Afficher un spinner simple, pas de progress bar.

---

## 4. Fichiers impactés

### Suppressions
- `interface/index.html` — sections letter, summary, hearing
- `interface/app.js` — handlers letter, summary, hearing
- `interface/style.css` — styles spécifiques si isolés
- `server.py` — routes `/api/letter`, `/api/summary`, `/api/hearing`
- `prompts.py` — AGENT_LABELS et build_prompt pour letter, summary, hearing
- `tools/generate_document.py`, `tools/summarize_document.py`, `tools/prepare_hearing.py`
- `workflows/draft_letter.md`, `workflows/summarize_document.md`, `workflows/prepare_hearing.md`
- `agents/draft-letter/`, `agents/summarize-document/`, `agents/prepare-hearing/`
- `tests/` — supprimer les tests des agents supprimés

### Modifications
- `tools/file_cleaner.py` — nouvelle logique de classification (règles 1-3 + fallback Ollama)
- `server.py` — endpoint `/api/cleaner/scan` retourne propositions structurées ; endpoint `/api/cleaner/apply` accepte liste filtrée
- `interface/index.html` — section `#agent-cleaner` redessinée
- `interface/app.js` — nouveau handler cleaner (bannière + checklist + confirm)
- `interface/style.css` — styles tableau propositions
- `prompts.py` — retirer AGENT_LABELS supprimés, conserver les 4 restants

---

## 5. Tests

- Supprimer les tests des 3 agents retirés
- Mettre à jour `test_file_cleaner.py` : tester les 3 règles de classification sans Ollama
- Mettre à jour `test_server.py` : vérifier que les routes supprimées retournent 404
- Ajouter test pour le format de réponse de `/api/cleaner/scan`

---

## Hors scope

- Modifications fonctionnelles des agents RAG, invoice, content
- Nouvelle fonctionnalité de renommage / déplacement de fichiers
- Indexation OneDrive
