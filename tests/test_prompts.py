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


def test_build_prompt_content_linkedin():
    prompt = build_prompt("content", {"input": "Sociétés à mission", "content_type": "linkedin"})
    assert "LinkedIn" in prompt
    assert "Errol Cohen" in prompt


def test_build_prompt_content_article():
    prompt = build_prompt("content", {"input": "Sujet test", "content_type": "article"})
    assert "article" in prompt.lower()


def test_build_prompt_raises_for_removed_agents():
    for agent in ("letter", "summary", "hearing"):
        with pytest.raises(ValueError):
            build_prompt(agent, {})


def test_build_input_summary_invoice():
    body = {"fields": {"description": "Conseil", "client": "ABC"}}
    assert build_input_summary("invoice", body) == "Conseil — ABC"


def test_build_input_summary_rag():
    assert build_input_summary("rag", {"input": "Question ?"}) == "Question ?"
