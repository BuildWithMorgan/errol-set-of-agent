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
        content_type = body.get("content_type", "linkedin")
        if content_type == "linkedin":
            return (
                "Tu es Errol Cohen, avocat spécialisé en sociétés à mission. "
                "Rédige en français un post LinkedIn engageant dans ton style : "
                "ton d'expert accessible, phrases courtes, appel à l'action final.\n\n"
                f"Sujet : {body.get('input', '')}"
            )
        return (
            "Tu es Errol Cohen, avocat spécialisé en sociétés à mission. "
            "Rédige en français un article juridique structuré "
            "(introduction, développement en 3 points, conclusion) sur le sujet suivant.\n\n"
            f"Sujet : {body.get('input', '')}"
        )

    raise ValueError(f"Unknown agent_id: {agent_id!r}")


def build_input_summary(agent_id: str, body: dict) -> str:
    f = body.get("fields", {})
    if agent_id == "invoice":
        return f"{f.get('description', '')} — {f.get('client', '')}"
    return (body.get("input") or "")[:200]
