AGENT_LABELS = {
    "rag":     "Interroger mes dossiers",
    "invoice": "Générer une facture",
    "content": "Créer du contenu",
    "cleaner": "Nettoyer mes fichiers",
}


def _safe_float(value, default: float = 0.0) -> float:
    try:
        return float(value or default)
    except (ValueError, TypeError):
        return default


def build_prompt(agent_id: str, body: dict) -> str:
    if agent_id == "rag":
        return (
            "Tu es l'assistant juridique du cabinet Le Play Avocats. "
            "Réponds en français à la question suivante en t'appuyant sur les documents disponibles. "
            "Cite les sources si possible.\n\n"
            f"Question : {body.get('input', '')}"
        )

    if agent_id == "invoice":
        f = body.get("fields", {})
        hours = _safe_float(f.get("hours", 0))
        rate = _safe_float(f.get("rate", 0))
        total_ht = hours * rate
        tva = total_ht * 0.20
        total_ttc = total_ht + tva
        return (
            "Tu es l'assistant du cabinet Le Play Avocats. "
            "Génère une facture complète en français avec tous les champs légaux requis "
            "(numéro de facture, date, émetteur, destinataire, détail des prestations, montants, TVA, total TTC).\n\n"
            f"Client : {f.get('client', '')}\n"
            f"Date de la prestation : {f.get('date', '')}\n"
            f"Prestation : {f.get('description', '')}\n"
            f"Durée : {f.get('hours', '')}h à {f.get('rate', '')} €/h\n"
            f"Total HT : {total_ht:.2f} €\n"
            f"TVA 20 % : {tva:.2f} €\n"
            f"Total TTC : {total_ttc:.2f} €"
        )

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

    raise ValueError(f"Unknown agent_id: {agent_id!r}")


def build_input_summary(agent_id: str, body: dict) -> str:
    f = body.get("fields", {})
    if agent_id == "invoice":
        return f"{f.get('description', '')} — {f.get('client', '')}"
    if agent_id == "content" and body.get("mode") == "refine":
        return (body.get("instruction") or "")[:200]
    return (body.get("input") or "")[:200]
