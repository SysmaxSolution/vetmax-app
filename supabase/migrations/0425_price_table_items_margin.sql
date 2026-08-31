-- 0425: margem/markup POR TABELA de preço (Sprint Animais).
-- Cada tabela de preço pode ter uma margem/markup diferente para o mesmo item
-- (tabela 1 acima, 2 média, 3 abaixo). O preço de venda por tabela é calculado
-- do custo do item + a margem/markup daquela tabela (na aplicação).
-- Aditiva.
ALTER TABLE price_table_items ADD COLUMN IF NOT EXISTS margin_percent NUMERIC(6,3);
