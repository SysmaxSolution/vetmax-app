"""
Fixtures globais para os testes Pytest do VetMax.

Lê .env.local para obter credenciais do Supabase e URL base.
Provê:
  - base_url: URL do servidor Next.js
  - supabase_url / supabase_anon_key: para chamadas diretas ao Supabase
  - web_session: requests.Session autenticada via Next.js login
"""

import os
import re
import pytest
import requests
from pathlib import Path


def _server_is_up(base_url: str, timeout: int = 3) -> bool:
    """Retorna True se o servidor Next.js está respondendo em base_url."""
    try:
        r = requests.get(f"{base_url}/login", allow_redirects=False, timeout=timeout)
        return r.status_code < 600
    except Exception:
        return False

# ─── Carregar .env.local ──────────────────────────────────────────────────────

def _load_dotenv(path: Path) -> dict:
    env: dict = {}
    if not path.exists():
        return env
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        match = re.match(r'^([A-Z_][A-Z0-9_]*)=(.*)$', line)
        if match:
            key, value = match.groups()
            value = value.strip('"').strip("'")
            env[key] = value
    return env


_repo_root = Path(__file__).parent.parent.parent
_env = _load_dotenv(_repo_root / ".env.local")
if not _env:
    _env = _load_dotenv(_repo_root / "vetmax-app" / ".env.local")

BASE_URL         = _env.get("TEST_BASE_URL", "http://localhost:4000")
SUPABASE_URL     = _env.get("NEXT_PUBLIC_SUPABASE_URL", "")
SUPABASE_ANON    = _env.get("NEXT_PUBLIC_SUPABASE_ANON_KEY", "")
SUPABASE_SERVICE = _env.get("SUPABASE_SERVICE_ROLE_KEY", "")

ADMIN_EMAIL    = "admin@clinica-alfa.test"
ADMIN_PASSWORD = "TestPassword@123"

# ─── Fixtures ────────────────────────────────────────────────────────────────

@pytest.fixture(scope="session")
def base_url() -> str:
    if not _server_is_up(BASE_URL):
        pytest.skip(
            f"Servidor Next.js não está disponível em {BASE_URL}. "
            "Inicie o servidor com `npm run dev` antes de executar testes HTTP."
        )
    return BASE_URL


@pytest.fixture(scope="session")
def supabase_url() -> str:
    return SUPABASE_URL


@pytest.fixture(scope="session")
def supabase_anon_key() -> str:
    return SUPABASE_ANON


@pytest.fixture(scope="session")
def supabase_service_key() -> str:
    return SUPABASE_SERVICE


@pytest.fixture(scope="session")
def anon_session(supabase_url, supabase_anon_key) -> dict:
    """Token de acesso obtido diretamente do Supabase Auth (sem Next.js)."""
    if not supabase_url or not supabase_anon_key:
        pytest.skip("Variáveis de ambiente Supabase não configuradas")

    resp = requests.post(
        f"{supabase_url}/auth/v1/token?grant_type=password",
        headers={
            "apikey":       supabase_anon_key,
            "Content-Type": "application/json",
        },
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        timeout=15,
    )
    if resp.status_code != 200:
        pytest.skip(f"Login Supabase falhou: {resp.status_code} — {resp.text[:200]}")

    data = resp.json()
    return {
        "access_token":  data["access_token"],
        "refresh_token": data.get("refresh_token", ""),
        "expires_in":    data.get("expires_in", 3600),
        "expires_at":    data.get("expires_at", 0),
        "user":          data.get("user", {}),
        "user_id":       data.get("user", {}).get("id", ""),
    }


@pytest.fixture(scope="session")
def auth_headers(anon_session) -> dict:
    """Headers HTTP com Bearer token para chamar APIs protegidas.

    Mantido por compat. — preferir `web_session` para rotas Next.js que
    validam cookie de sessão (Supabase SSR client).
    """
    return {
        "Authorization": f"Bearer {anon_session['access_token']}",
        "Content-Type":  "application/json",
    }


def _supabase_project_ref(url: str) -> str:
    """Extrai o ref do projeto Supabase da URL (https://<ref>.supabase.co)."""
    import re as _re
    m = _re.match(r"https?://([a-z0-9-]+)\.supabase\.co", url)
    return m.group(1) if m else ""


_COOKIE_CACHE: dict = {"name": None, "value": None, "expires_at": 0}

def _build_session_cookie(supabase_url: str, supabase_anon_key: str) -> tuple[str, str]:
    """Retorna (cookie_name, cookie_value) com sessão Supabase válida.

    Faz cache em nível de processo: se o cookie em cache ainda tem >5min de
    validade, reusa. Evita rate-limit (429) no Supabase Auth ao rodar suítes
    grandes (76 testes × 1 login = ban).
    """
    import base64 as _b64
    import json as _json
    import time as _time

    now = int(_time.time())
    if _COOKIE_CACHE["value"] and _COOKIE_CACHE["expires_at"] > now + 300:
        return _COOKIE_CACHE["name"], _COOKIE_CACHE["value"]

    resp = requests.post(
        f"{supabase_url}/auth/v1/token?grant_type=password",
        headers={"apikey": supabase_anon_key, "Content-Type": "application/json"},
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        timeout=15,
    )
    if resp.status_code != 200:
        raise RuntimeError(f"Login Supabase falhou: {resp.status_code} — {resp.text[:200]}")
    data = resp.json()
    session_payload = {
        "access_token":  data["access_token"],
        "token_type":    "bearer",
        "expires_in":    data.get("expires_in", 3600),
        "expires_at":    data.get("expires_at"),
        "refresh_token": data.get("refresh_token", ""),
        "user":          data.get("user", {}),
    }
    b64_payload = _b64.urlsafe_b64encode(_json.dumps(session_payload).encode()).decode().rstrip("=")
    cookie_value = f"base64-{b64_payload}"
    ref = _supabase_project_ref(supabase_url)
    cookie_name = f"sb-{ref}-auth-token"

    _COOKIE_CACHE.update({
        "name":       cookie_name,
        "value":      cookie_value,
        "expires_at": data.get("expires_at", now + 3600),
    })
    return cookie_name, cookie_value


_LAST_LLM_CALL_AT: list = [0.0]  # mutable singleton p/ throttle entre testes


@pytest.fixture
def web_session(base_url: str, supabase_url: str, supabase_anon_key: str) -> requests.Session:
    """Session HTTP autenticada via cookie SSR do Supabase (scope=function).

    Necessária para chamar APIs que usam `createClient()` (Supabase SSR) —
    elas validam o cookie sb-<ref>-auth-token e não Bearer tokens.
    Inclui throttle global de 1.2s entre chamadas para evitar rate-limit
    do Anthropic (mentor-chat usa o Claude API).
    """
    import time as _t
    ref = _supabase_project_ref(supabase_url)
    if not ref:
        pytest.skip(f"Não foi possível extrair project ref de {supabase_url}")

    # Throttle entre testes: garante 1.2s de gap entre chamadas LLM consecutivas
    elapsed = _t.time() - _LAST_LLM_CALL_AT[0]
    if elapsed < 1.2:
        _t.sleep(1.2 - elapsed)
    _LAST_LLM_CALL_AT[0] = _t.time()

    try:
        cookie_name, cookie_value = _build_session_cookie(supabase_url, supabase_anon_key)
    except RuntimeError as e:
        pytest.skip(str(e))
    sess = requests.Session()
    sess.cookies.set(cookie_name, cookie_value)
    return sess
