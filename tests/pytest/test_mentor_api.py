"""
MENTOR-API — Testes do endpoint /api/mentor-chat e da lógica de Intent Map.

Cobre:
  1. Unauthenticated → 401
  2. Payload inválido → 400
  3. Keyword → TOUR_ID correto (mapeamento INTENT_MAP do MentorContext.tsx)
  4. Resposta em PT-BR
  5. Não inventa tours inexistentes
"""

import re
import pytest
import requests

# ─── Constantes ───────────────────────────────────────────────────────────────

ENDPOINT = "/api/mentor-chat"

# Mapeamento espelho de MentorContext.tsx INTENT_MAP
INTENT_MAP = [
    {
        "keywords": ["alta", "liberar", "finalizar consulta", "encerrar"],
        "expected_tour": "alta",
    },
    {
        "keywords": ["triagem", "sinais vitais", "peso", "temperatura", "enfermagem", "medir"],
        "expected_tour": "triagem",
    },
    {
        "keywords": ["recepção", "check-in", "chegou", "registrar animal", "entrada", "fila"],
        "expected_tour": "recepcao",
    },
    {
        "keywords": ["consulta", "veterinário", "consultório", "prontuário", "soap", "diagnóstico"],
        "expected_tour": "consulta",
    },
    {
        "keywords": ["exame", "laboratório", "laudo", "resultado", "exames"],
        "expected_tour": "exames",
    },
    {
        "keywords": ["internação", "internado", "internar", "hospitalizar", "uti"],
        "expected_tour": "internacao",
    },
    {
        "keywords": ["banho", "tosa", "grooming", "pet shop", "tosador"],
        "expected_tour": "grooming",
    },
    {
        "keywords": ["cadastrar pet", "cadastrar animal", "novo pet", "novo cadastro", "microchip"],
        "expected_tour": "cadastro-pet",
    },
]

VALID_TOUR_IDS = {
    "recepcao", "sala-espera", "triagem", "consulta",
    "exames", "internacao", "grooming", "alta", "cadastro-pet",
}

# ─── MNT-API-001: Autenticação ────────────────────────────────────────────────

class TestMentorApiAuth:
    def test_unauthenticated_returns_401(self, base_url: str):
        """Chamada sem token deve retornar 401."""
        resp = requests.post(
            f"{base_url}{ENDPOINT}",
            json={"question": "como fazer triagem?"},
            timeout=10,
        )
        assert resp.status_code == 401, (
            f"Esperado 401 sem auth, recebido {resp.status_code}: {resp.text[:200]}"
        )

    def test_unauthenticated_returns_json(self, base_url: str):
        """Resposta de erro deve ser JSON."""
        resp = requests.post(
            f"{base_url}{ENDPOINT}",
            json={"question": "teste"},
            timeout=10,
        )
        assert resp.headers.get("content-type", "").startswith("application/json"), (
            f"Content-Type inesperado: {resp.headers.get('content-type')}"
        )


# ─── MNT-API-002: Payload inválido ───────────────────────────────────────────

class TestMentorApiValidation:
    def test_empty_question_returns_400(self, base_url: str, web_session):
        """Pergunta vazia deve retornar 400."""
        resp = web_session.post(
            f"{base_url}{ENDPOINT}",
            json={"question": ""},
            timeout=15,
        )
        assert resp.status_code == 400, (
            f"Esperado 400 para pergunta vazia, recebido {resp.status_code}"
        )

    def test_whitespace_only_question_returns_400(self, base_url: str, web_session):
        """Pergunta com só espaços deve retornar 400."""
        resp = web_session.post(
            f"{base_url}{ENDPOINT}",
            json={"question": "   "},
            timeout=15,
        )
        assert resp.status_code == 400

    def test_missing_question_field(self, base_url: str, web_session):
        """Payload sem campo 'question' deve retornar 400."""
        resp = web_session.post(
            f"{base_url}{ENDPOINT}",
            json={"msg": "sem campo question"},
            timeout=15,
        )
        assert resp.status_code == 400


# ─── MNT-API-003: Resposta válida ────────────────────────────────────────────

class TestMentorApiResponse:
    def test_response_has_answer_field(self, base_url: str, web_session):
        """Resposta deve conter campo 'answer' (string)."""
        resp = web_session.post(
            f"{base_url}{ENDPOINT}",
            json={"question": "como funciona a triagem?"},
            timeout=30,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "answer" in data, f"Resposta sem campo 'answer': {data}"
        assert isinstance(data["answer"], str)
        assert len(data["answer"]) > 10, "Resposta muito curta"

    def test_response_in_portuguese(self, base_url: str, web_session):
        """Resposta deve estar em português (palavras PT-BR comuns)."""
        resp = web_session.post(
            f"{base_url}{ENDPOINT}",
            json={"question": "como fazer o check-in de um animal?"},
            timeout=30,
        )
        assert resp.status_code == 200
        answer = resp.json().get("answer", "")
        if "temporariamente indispon" in answer:
            pytest.skip("Anthropic indisponível — Mentor retornou fallback (PT-BR válido)")
        # Palavras muito comuns em PT-BR que não aparecem em inglês
        pt_markers = ["de", "do", "da", "para", "com", "que", "em", "uma", "um", "não", "como"]
        found = [w for w in pt_markers if f" {w} " in answer.lower() or answer.lower().startswith(w)]
        assert len(found) >= 3, (
            f"Resposta pode não estar em PT-BR (poucas palavras PT encontradas): {answer[:200]}"
        )

    def test_tour_id_when_present_is_valid(self, base_url: str, web_session):
        """Se tourId for retornado, deve ser um ID válido."""
        resp = web_session.post(
            f"{base_url}{ENDPOINT}",
            json={"question": "como registrar um pet novo com microchip?"},
            timeout=30,
        )
        assert resp.status_code == 200
        data = resp.json()
        tour_id = data.get("tourId")
        if tour_id is not None:
            assert tour_id in VALID_TOUR_IDS, (
                f"tourId inválido: '{tour_id}'. Válidos: {VALID_TOUR_IDS}"
            )

    def test_answer_does_not_contain_tour_id_marker(self, base_url: str, web_session):
        """A string TOUR_ID: não deve aparecer na resposta exibida ao usuário."""
        resp = web_session.post(
            f"{base_url}{ENDPOINT}",
            json={"question": "como dar alta a um animal?"},
            timeout=30,
        )
        assert resp.status_code == 200
        answer = resp.json().get("answer", "")
        assert "TOUR_ID:" not in answer, (
            "O marcador TOUR_ID: não foi removido da resposta: "
            + answer[:300]
        )


# ─── MNT-API-004: Keyword → TOUR_ID ──────────────────────────────────────────

class TestMentorIntentMapping:
    """
    Verifica que perguntas com keywords específicas retornam o TOUR_ID esperado.
    Estes testes fazem chamadas reais ao LLM e podem ser mais lentos.
    Marcados como 'slow' para excluir de pipelines rápidos: pytest -m "not slow"
    """

    @pytest.mark.slow
    @pytest.mark.parametrize("question,expected_tour", [
        ("como fazer triagem de um animal?",         "triagem"),
        ("quero registrar sinais vitais do pet",      "triagem"),
        ("como realizar check-in na recepção?",       "recepcao"),
        ("como abrir uma consulta veterinária?",      "consulta"),
        ("como registrar resultado de exame?",        "exames"),
        ("como ver animais internados?",              "internacao"),
        ("como agendar banho e tosa?",                "grooming"),
        ("como dar alta a um paciente?",              "alta"),
        ("como cadastrar um pet novo com microchip?", "cadastro-pet"),
    ])
    def test_keyword_maps_to_expected_tour(
        self, base_url: str, web_session, question: str, expected_tour: str
    ):
        resp = web_session.post(
            f"{base_url}{ENDPOINT}",
            json={"question": question},
            timeout=40,
        )
        assert resp.status_code == 200
        data = resp.json()
        answer = data.get("answer", "")
        # Mentor pode retornar fallback quando Anthropic está indisponível —
        # nesses casos não há tourId; skipar é correto.
        if "temporariamente indispon" in answer:
            import pytest as _pt
            _pt.skip("Anthropic indisponível — Mentor retornou fallback")
        tour_id = data.get("tourId")
        assert tour_id == expected_tour, (
            f"Pergunta: '{question}'\n"
            f"Esperado tourId='{expected_tour}', recebido='{tour_id}'\n"
            f"Resposta: {answer[:300]}"
        )


# ─── MNT-API-005: Integridade do INTENT_MAP local (sem HTTP) ─────────────────

class TestIntentMapPurity:
    """
    Testes puramente locais — verifica a consistência do INTENT_MAP
    sem fazer chamadas HTTP. Garante que o mapa de intenções cobre todos os tours.
    """

    def test_all_expected_tours_covered_in_intent_map(self):
        """Todo tour do sistema deve ter ao menos uma entrada no INTENT_MAP."""
        covered_tours = {entry["expected_tour"] for entry in INTENT_MAP}
        for tour_id in VALID_TOUR_IDS - {"sala-espera"}:  # sala-espera usa mesmas keywords de recepcao
            assert tour_id in covered_tours, (
                f"Tour '{tour_id}' não tem entrada no INTENT_MAP"
            )

    def test_intent_map_tour_ids_are_valid(self):
        """Todos os tourIds no INTENT_MAP devem ser IDs válidos do sistema."""
        for entry in INTENT_MAP:
            assert entry["expected_tour"] in VALID_TOUR_IDS, (
                f"INTENT_MAP aponta para tour inválido: '{entry['expected_tour']}'"
            )

    def test_keywords_are_non_empty(self):
        """Cada entrada do INTENT_MAP deve ter pelo menos 1 keyword."""
        for entry in INTENT_MAP:
            assert len(entry["keywords"]) > 0, (
                f"Tour '{entry['expected_tour']}' sem keywords"
            )

    def test_no_duplicate_keywords_across_tours(self):
        """Keywords não devem ser idênticas em tours diferentes (causaria ambiguidade)."""
        seen: dict = {}
        for entry in INTENT_MAP:
            for kw in entry["keywords"]:
                if kw in seen:
                    pytest.fail(
                        f"Keyword duplicada '{kw}' nos tours '{seen[kw]}' e '{entry['expected_tour']}'"
                    )
                seen[kw] = entry["expected_tour"]
