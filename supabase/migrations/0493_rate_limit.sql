-- 0493 — Rate limit com lastro no banco.
--
-- Nenhuma das 42 rotas de API tinha limite. Só o do Supabase, que cobre
-- autenticação — webhooks e rotas públicas aceitavam volume ilimitado.
--
-- Por que no banco e não em memória: a aplicação roda em serverless. Cada
-- instância teria o próprio contador, e o limite viraria "N × número de
-- instâncias" — ou seja, nenhum. Uma tabela pequena com janela deslizante é
-- barata (um UPSERT por chamada) e vale para todas as instâncias.
--
-- A tabela é interna da plataforma, não tem clinic_id: a chave é o
-- identificador do chamador (IP, token do webhook, rota). RLS ligada SEM
-- policy — só o service role toca nela.

CREATE TABLE IF NOT EXISTS api_rate_limits (
  bucket      text        NOT NULL,
  window_start timestamptz NOT NULL,
  hits        integer     NOT NULL DEFAULT 0,
  PRIMARY KEY (bucket, window_start)
);

CREATE INDEX IF NOT EXISTS idx_api_rate_limits_janela
  ON api_rate_limits (window_start);

ALTER TABLE api_rate_limits ENABLE ROW LEVEL SECURITY;

/**
 * Conta mais um acesso e diz se passou do teto.
 *
 * Janela deslizante por blocos: a janela é o início do bloco de
 * `p_window_seconds`, então o contador zera sozinho e não precisa de limpeza
 * no caminho quente. O UPSERT é atômico — duas instâncias simultâneas não
 * perdem contagem.
 *
 * Devolve TRUE quando a chamada deve ser RECUSADA.
 */
CREATE OR REPLACE FUNCTION rate_limit_exceeded(
  p_bucket         text,
  p_limit          integer,
  p_window_seconds integer DEFAULT 60
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_window timestamptz;
  v_hits   integer;
BEGIN
  IF p_bucket IS NULL OR p_bucket = '' THEN RETURN false; END IF;

  v_window := to_timestamp(floor(extract(epoch FROM now()) / p_window_seconds) * p_window_seconds);

  INSERT INTO api_rate_limits (bucket, window_start, hits)
  VALUES (p_bucket, v_window, 1)
  ON CONFLICT (bucket, window_start)
  DO UPDATE SET hits = api_rate_limits.hits + 1
  RETURNING hits INTO v_hits;

  -- Faxina barata e oportunista: 1 chamada em 200 limpa janelas vencidas.
  IF random() < 0.005 THEN
    DELETE FROM api_rate_limits WHERE window_start < now() - interval '1 hour';
  END IF;

  RETURN v_hits > p_limit;
END $$;

REVOKE EXECUTE ON FUNCTION rate_limit_exceeded(text, integer, integer) FROM public, anon;
GRANT  EXECUTE ON FUNCTION rate_limit_exceeded(text, integer, integer) TO service_role;
