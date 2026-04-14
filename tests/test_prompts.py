from prompts import build_prompt, build_input_summary


def test_rag_prompt_contains_question():
    result = build_prompt("rag", {"input": "Quelles sont les obligations ?"})
    assert "Quelles sont les obligations ?" in result
    assert "français" in result


def test_invoice_prompt_computes_totals():
    result = build_prompt("invoice", {"fields": {
        "client": "Société ABC", "date": "14/04/2026",
        "hours": "3", "rate": "350", "description": "Conseil"
    }})
    assert "1050.00 €" in result
    assert "210.00 €" in result
    assert "1260.00 €" in result


def test_letter_prompt_includes_fields():
    result = build_prompt("letter", {"fields": {
        "recipient": "Société Martin",
        "letter_type": "mise en demeure",
        "subject": "Non-respect des statuts",
        "facts": "Réunion non tenue",
    }})
    assert "Société Martin" in result
    assert "mise en demeure" in result


def test_hearing_prompt_includes_case():
    result = build_prompt("hearing", {"fields": {
        "case_name": "Dossier Legrand",
        "hearing_date": "15/04/2026",
        "parties": "Legrand vs Martin",
        "arguments": "Clause nulle",
    }})
    assert "Dossier Legrand" in result


def test_content_linkedin_prompt():
    result = build_prompt("content", {"input": "Obligations 2025", "content_type": "linkedin"})
    assert "LinkedIn" in result
    assert "Obligations 2025" in result


def test_content_article_prompt():
    result = build_prompt("content", {"input": "Obligations 2025", "content_type": "article"})
    assert "article" in result.lower()


def test_build_input_summary_invoice():
    result = build_input_summary("invoice", {"fields": {"description": "Conseil", "client": "ABC"}})
    assert result == "Conseil — ABC"


def test_build_input_summary_freetext():
    result = build_input_summary("rag", {"input": "Ma question"})
    assert result == "Ma question"
