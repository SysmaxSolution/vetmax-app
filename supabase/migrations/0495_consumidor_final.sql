-- 0495 — Cliente avulso ("CONSUMIDOR FINAL") por clínica.
--
-- Por quê: o título a receber passou a exigir o dono (quem é o cliente), para
-- se saber a quem o título pertence e poder emitir boleto. Mas 360 dos 453
-- títulos de produção vêm de venda no caixa para consumidor avulso, que
-- legitimamente não tem tutor cadastrado. Sem um cliente padrão, o PDV ficaria
-- sem como satisfazer a obrigatoriedade.
--
-- Cidade, CEP, estado e bairro saem da PRÓPRIA CLÍNICA: o endereço do
-- consumidor avulso é o do estabelecimento, que é o que a nota fiscal espera.
--
-- ATENÇÃO ao CPF 11111111111: é a convenção de NF-e para consumidor anônimo,
-- mas é sequência repetida e NÃO passa no dígito verificador. Isso é
-- proposital e correto — não se emite boleto para consumidor anônimo, e a
-- validação do pagador vai avisar isso antes de qualquer tentativa. Ver
-- src/lib/financial/pagador-boleto.ts.

ALTER TABLE tutors
  ADD COLUMN IF NOT EXISTS is_walk_in boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN tutors.is_walk_in IS
  'Cliente avulso da clinica (CONSUMIDOR FINAL). Marca por flag e nao por nome, para o codigo nao depender de texto.';

-- Um avulso por clínica. O índice único (clinic_id, cpf) já garante que não
-- duplica; o ON CONFLICT deixa a migration repetível.
INSERT INTO tutors (clinic_id, name, cpf, email, address, address_number, neighborhood, city, state, cep, is_walk_in)
SELECT
  c.id,
  'CONSUMIDOR FINAL',
  '11111111111',
  'consumidor@email.com',
  'RUA',
  '1',
  COALESCE(NULLIF(c.neighborhood, ''), 'BAIRRO'),
  c.city,
  c.state,
  c.cep,
  true
FROM clinics c
ON CONFLICT (clinic_id, cpf) DO UPDATE
  -- NUNCA sequestra um tutor que já existe com esse CPF.
  --
  -- Aconteceu no banco de testes: havia uma tutora de teste cadastrada com
  -- 11111111111 e o UPDATE a transformou na consumidora avulsa, sobrescrevendo
  -- o endereço dela. O CPF do consumidor anônimo é comum em base de teste e
  -- pode aparecer por digitação em base real.
  --
  -- Com a condição abaixo, o UPDATE só mexe no registro que JÁ É o avulso —
  -- aí serve para manter cidade/CEP/estado/bairro em sincronia com a clínica.
  -- Se o CPF estiver ocupado por outra pessoa, a clínica fica sem avulso e a
  -- tela avisa; é melhor que corromper um cadastro.
  SET is_walk_in = true,
      neighborhood = COALESCE(NULLIF(EXCLUDED.neighborhood, ''), tutors.neighborhood),
      city         = COALESCE(EXCLUDED.city, tutors.city),
      state        = COALESCE(EXCLUDED.state, tutors.state),
      cep          = COALESCE(EXCLUDED.cep, tutors.cep)
  WHERE tutors.is_walk_in OR upper(trim(tutors.name)) = 'CONSUMIDOR FINAL';

-- Busca do seletor de cliente no título.
CREATE INDEX IF NOT EXISTS idx_tutors_walk_in
  ON tutors (clinic_id) WHERE is_walk_in;
