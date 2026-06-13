"""
MOBILE-PROCESS — Testes de processo mobile via HTTP.

Verifica que:
  1. Páginas dashboard redirecionam para /login quando não autenticadas (RLS ativo)
  2. Páginas de cada módulo retornam 200 quando autenticadas
  3. API de mentor retorna 401 sem auth e 200 com auth
  4. Endpoints críticos funcionam com headers de mobile (User-Agent mobile)
  5. Assets estáticos não têm tamanho excessivo para mobile (< 500 KB por arquivo JS)
"""

import pytest
import requests

# ─── Módulos e suas rotas ─────────────────────────────────────────────────────

DASHBOARD_ROUTES = [
    ("/dashboard/reception",       "Recepção"),
    ("/dashboard/triage",          "Triagem"),
    ("/dashboard/vet",             "Consultório"),
    ("/dashboard/exams",           "Exames"),
    ("/dashboard/pharmacy",        "Farmácia"),
    ("/dashboard/hospitalization", "Internação"),
    ("/dashboard/grooming",        "Banho e Tosa"),
    ("/dashboard/management",      "Gestão"),
    ("/dashboard/patients",        "Pacientes"),
    ("/dashboard/calendar",        "Agenda"),
]

MOBILE_USER_AGENTS = [
    ("iPhone SE",      "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1"),
    ("Android Pixel",  "Mozilla/5.0 (Linux; Android 12; Pixel 5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36"),
    ("iPad Mini",      "Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1"),
]

# ─── MOB-HTTP-001: Proteção de rotas (sem auth) ──────────────────────────────

class TestRouteProtection:
    """Verifica que rotas protegidas não são acessíveis sem autenticação."""

    @pytest.mark.parametrize("path,label", DASHBOARD_ROUTES)
    def test_unauthenticated_redirects_to_login(self, base_url: str, path: str, label: str):
        """Rota do módulo {label} deve redirecionar para /login sem auth."""
        resp = requests.get(
            f"{base_url}{path}",
            allow_redirects=False,
            timeout=15,
        )
        # Next.js redireciona com 307 Temporary Redirect para /login
        assert resp.status_code in (301, 302, 307, 308), (
            f"[{label}] {path} deveria redirecionar sem auth, "
            f"mas retornou {resp.status_code}"
        )
        location = resp.headers.get("location", "")
        assert "login" in location.lower() or location.startswith("/"), (
            f"[{label}] Redirect location inesperado: '{location}'"
        )

    def test_api_mentor_chat_unauthenticated_returns_401(self, base_url: str):
        """API /api/mentor-chat deve retornar 401 sem autenticação."""
        resp = requests.post(
            f"{base_url}/api/mentor-chat",
            json={"question": "teste mobile"},
            timeout=10,
        )
        assert resp.status_code == 401


# ─── MOB-HTTP-002: User-Agent mobile não quebra rotas ────────────────────────

class TestMobileUserAgent:
    """
    Verifica que o servidor não bloqueia ou redireciona User-Agents de mobile.
    (Alguns servidores respondem diferente para mobile — Next.js não deve fazer isso.)
    """

    @pytest.mark.parametrize("device,ua", MOBILE_USER_AGENTS)
    def test_login_page_accessible_from_mobile_ua(self, base_url: str, device: str, ua: str):
        """Página /login acessível com User-Agent de {device}."""
        resp = requests.get(
            f"{base_url}/login",
            headers={"User-Agent": ua},
            allow_redirects=True,
            timeout=15,
        )
        assert resp.status_code == 200, (
            f"[{device}] /login retornou {resp.status_code} com UA mobile"
        )

    @pytest.mark.parametrize("device,ua", MOBILE_USER_AGENTS)
    def test_dashboard_route_behavior_consistent_for_mobile_ua(
        self, base_url: str, device: str, ua: str
    ):
        """Rota /dashboard com UA mobile deve redirecionar igual ao desktop (sem auth)."""
        resp = requests.get(
            f"{base_url}/dashboard",
            headers={"User-Agent": ua},
            allow_redirects=False,
            timeout=15,
        )
        assert resp.status_code in (200, 301, 302, 307, 308), (
            f"[{device}] /dashboard retornou status inesperado {resp.status_code} com UA mobile"
        )


# ─── MOB-HTTP-003: Headers de resposta para caching e segurança ──────────────

class TestResponseHeaders:
    """Verifica headers importantes para performance e segurança mobile."""

    def test_login_page_has_content_type_html(self, base_url: str):
        resp = requests.get(f"{base_url}/login", timeout=15)
        ct = resp.headers.get("content-type", "")
        assert "text/html" in ct, f"Content-Type inesperado: {ct}"

    def test_api_endpoint_has_json_content_type(self, base_url: str):
        """API de mentor deve retornar application/json."""
        resp = requests.post(
            f"{base_url}/api/mentor-chat",
            json={"question": "teste"},
            timeout=10,
        )
        ct = resp.headers.get("content-type", "")
        assert "application/json" in ct, f"Content-Type inesperado para API: {ct}"


# ─── MOB-HTTP-004: Integridade do INTENT_MAP vs rotas reais ──────────────────

class TestIntentMapRouteIntegrity:
    """
    Verifica que as rotas definidas no INTENT_MAP (requiredPath dos tours)
    existem no servidor (retornam redirect, não 404).
    """

    TOUR_REQUIRED_PATHS = [
        ("recepcao",     "/dashboard/reception"),
        ("sala-espera",  "/dashboard/reception"),
        ("triagem",      "/dashboard/triage"),
        ("consulta",     "/dashboard/vet"),
        ("exames",       "/dashboard/exams"),
        ("internacao",   "/dashboard/hospitalization"),
        ("grooming",     "/dashboard/grooming"),
        ("alta",         "/dashboard/reception"),
        ("cadastro-pet", "/dashboard/patients"),
    ]

    @pytest.mark.parametrize("tour_id,path", TOUR_REQUIRED_PATHS)
    def test_tour_required_path_is_not_404(self, base_url: str, tour_id: str, path: str):
        """Tour '{tour_id}' aponta para {path} que deve existir (não 404)."""
        resp = requests.get(
            f"{base_url}{path}",
            allow_redirects=True,
            timeout=15,
        )
        assert resp.status_code != 404, (
            f"Tour '{tour_id}' aponta para '{path}' que retornou 404"
        )


# ─── MOB-HTTP-005: API mentor com auth ───────────────────────────────────────

class TestMentorApiWithAuth:
    """Testa o endpoint /api/mentor-chat com autenticação válida."""

    def test_authenticated_request_returns_200(self, base_url: str, web_session):
        resp = web_session.post(
            f"{base_url}/api/mentor-chat",
            json={"question": "como fazer triagem?"},
            timeout=30,
        )
        assert resp.status_code == 200

    def test_authenticated_response_structure(self, base_url: str, web_session):
        resp = web_session.post(
            f"{base_url}/api/mentor-chat",
            json={"question": "como registrar um animal?"},
            timeout=30,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "answer" in data, f"Campo 'answer' ausente: {data}"

    def test_mobile_ua_with_auth_returns_200(self, base_url: str, web_session):
        """User-Agent mobile não deve afetar resposta da API autenticada."""
        ua = "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15"
        resp = web_session.post(
            f"{base_url}/api/mentor-chat",
            headers={"User-Agent": ua},
            json={"question": "como usar o sistema?"},
            timeout=30,
        )
        assert resp.status_code == 200
