# Builds Ollama prompts server-side from agent ID and input data.
# All user-visible text (prompt content) stays in French.

AGENT_LABELS = {
    "rag":     "Interroger mes dossiers",
    "letter":  "Rédiger un courrier",
    "summary": "Résumer un document",
    "invoice": "Générer une facture",
    "hearing": "Préparer une audience",
    "content": "Créer du contenu",
}


def build_prompt(agent_id: str, body: dict) -> str:
    if agent_id == "rag":
        return (
            "Tu es l'assistant juridique du cabinet Le Play Avocats. "
            "Réponds en français à la question suivante en t'appuyant sur les documents disponibles. "
            "Cite les sources si possible.\n\n"
            f"Question : {body.get('input', '')}"
        )

    if agent_id == "letter":
        f = body.get("fields", {})
        return (
            "Tu es un avocat expert en droit des sociétés. "
            f"Rédige en français un courrier de type '{f.get('letter_type', '')}' "
            f"adressé à {f.get('recipient', '')}. "
            f"Objet : {f.get('subject', '')}. "
            f"Faits et éléments clés : {f.get('facts', '')}. "
            "Respecte les conventions formelles françaises (lieu, date, formules de politesse)."
        )

    if agent_id == "summary":
        return (
            "Tu es un assistant juridique. "
            "Résume le document suivant en français en 5 points clés structurés avec des titres clairs.\n\n"
            f"Document :\n{body.get('input', '')}"
        )

    if agent_id == "invoice":
        f = body.get("fields", {})
        hours = float(f.get("hours", 0) or 0)
        rate = float(f.get("rate", 0) or 0)
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

    if agent_id == "hearing":
        f = body.get("fields", {})
        return (
            "Tu es un avocat préparant une audience. "
            "Rédige en français une fiche d'audience structurée avec : "
            "résumé du litige, arguments principaux, points de droit à soulever, "
            "réponses aux contre-arguments prévisibles.\n\n"
            f"Dossier : {f.get('case_name', '')}\n"
            f"Date d'audience : {f.get('hearing_date', '')}\n"
            f"Parties : {f.get('parties', '')}\n"
            f"Arguments et faits : {f.get('arguments', '')}"
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

    return body.get("input", "")


def build_input_summary(agent_id: str, body: dict) -> str:
    """Returns a short human-readable summary of the request for history display."""
    f = body.get("fields", {})
    if agent_id == "invoice":
        return f"{f.get('description', '')} — {f.get('client', '')}"
    if agent_id == "letter":
        return f"{f.get('letter_type', '')} — {f.get('recipient', '')}"
    if agent_id == "hearing":
        return f.get("case_name", "")
    return (body.get("input") or "")[:200]
