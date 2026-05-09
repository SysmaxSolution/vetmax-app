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
        "user_id":       data.get("user", {}).get("id", ""),
    }


@pytest.fixture(scope="session")
def auth_headers(anon_session) -> dict:
    """Headers HTTP com Bearer token para chamar APIs protegidas."""
    return {
        "Authorization": f"Bearer {anon_session['access_token']}",
        "Content-Type":  "application/json",
    }
