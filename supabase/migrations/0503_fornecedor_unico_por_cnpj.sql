-- 0503: o fornecedor passa a ser único pelo DOCUMENTO, não pelo nome.
--
-- Hoje a única trava de `suppliers` é `suppliers_unique_per_clinic (clinic_id,
-- name)`. Nome é chave ruim para fornecedor por dois motivos que já batem na
-- porta agora que o DDA do Sicoob está liberado:
--
--  1. O DDA devolve a razão social **truncada em 40 caracteres** — medido na
--     resposta real: "SAPRA LANDAUER SERVICO DE ASSESSORIA E P", cortado no
--     meio da palavra. Cadastrar por esse nome e depois alguém digitar o nome
--     completo cria DOIS fornecedores para o mesmo CNPJ, e o histórico de
--     compras se parte em dois.
--  2. A mesma empresa aparece escrita de formas diferentes conforme a origem
--     (boleto, XML de NF-e, digitação). O CNPJ não varia.
--
-- Por que AGORA: produção tem **zero** fornecedores cadastrados e o banco de
-- testes tem 7, nenhum com documento repetido — conferido antes de escrever
-- esta migration. A janela para criar a trava sem limpeza prévia está aberta
-- hoje; depois que a clínica cadastrar algumas centenas, fecha.
--
-- O índice normaliza o documento (só dígitos), porque o mesmo CNPJ entra ora
-- mascarado, ora limpo — e duas grafias do mesmo número não podem passar.
-- Parcial: fornecedor sem documento continua permitido (prestador informal,
-- cadastro iniciado pela tela), e vários deles convivem sem colidir.
--
-- A trava por nome NÃO é removida. Migration do projeto é aditiva, e ela ainda
-- serve para quem não tem CNPJ. O código resolve na ordem certa: procura por
-- documento, depois adota um cadastro de mesmo nome que esteja sem documento,
-- e só então cria.

CREATE UNIQUE INDEX IF NOT EXISTS uidx_suppliers_documento_por_clinica
  ON suppliers (clinic_id, regexp_replace(document, '\D', '', 'g'))
  WHERE document IS NOT NULL AND btrim(document) <> '';

COMMENT ON INDEX uidx_suppliers_documento_por_clinica IS
  'Fornecedor é único pelo CNPJ/CPF dentro da clínica, comparado só por dígitos. '
  'Parcial: quem não tem documento fica de fora e continua valendo a trava por nome.';
