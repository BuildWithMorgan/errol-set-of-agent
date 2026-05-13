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
