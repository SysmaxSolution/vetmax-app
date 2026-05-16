-- =============================================================================
-- VetMax — Migration 0159: Seed Global de Raças + Backfill por Clínica
-- 1) Popula catálogo global enxuto (~80 cães, ~30 gatos, aves/exóticos básicos).
-- 2) Backfill: para cada (clinic_id, species, breed) já existente em patients,
--    insere a raça no escopo da própria clínica caso ainda não exista.
--    Preserva o histórico de autocomplete de cada tenant.
-- =============================================================================

-- ─── 1. SEED GLOBAL (clinic_id = NULL) ───────────────────────────────────────
-- Inserção idempotente: ON CONFLICT contra o índice único parcial de globais.

INSERT INTO public.breeds (species, name, clinic_id) VALUES
  -- ── Cães (SRD + ~80 raças mais comuns no Brasil) ────────────────────────
  ('dog', 'SRD (Sem Raça Definida)', NULL),
  ('dog', 'Vira-lata Caramelo', NULL),
  ('dog', 'Akita', NULL),
  ('dog', 'American Bully', NULL),
  ('dog', 'American Pit Bull Terrier', NULL),
  ('dog', 'American Staffordshire Terrier', NULL),
  ('dog', 'Basset Hound', NULL),
  ('dog', 'Beagle', NULL),
  ('dog', 'Bernese Mountain Dog', NULL),
  ('dog', 'Bichon Frisé', NULL),
  ('dog', 'Border Collie', NULL),
  ('dog', 'Boston Terrier', NULL),
  ('dog', 'Boxer', NULL),
  ('dog', 'Buldogue Americano', NULL),
  ('dog', 'Buldogue Francês', NULL),
  ('dog', 'Buldogue Inglês', NULL),
  ('dog', 'Cane Corso', NULL),
  ('dog', 'Cavalier King Charles Spaniel', NULL),
  ('dog', 'Chihuahua', NULL),
  ('dog', 'Chow Chow', NULL),
  ('dog', 'Cocker Spaniel Americano', NULL),
  ('dog', 'Cocker Spaniel Inglês', NULL),
  ('dog', 'Collie', NULL),
  ('dog', 'Dachshund (Salsicha)', NULL),
  ('dog', 'Dálmata', NULL),
  ('dog', 'Doberman', NULL),
  ('dog', 'Dogo Argentino', NULL),
  ('dog', 'Dogue Alemão', NULL),
  ('dog', 'Fila Brasileiro', NULL),
  ('dog', 'Fox Paulistinha (Terrier Brasileiro)', NULL),
  ('dog', 'Galgo Inglês', NULL),
  ('dog', 'Golden Retriever', NULL),
  ('dog', 'Husky Siberiano', NULL),
  ('dog', 'Jack Russell Terrier', NULL),
  ('dog', 'Labrador Retriever', NULL),
  ('dog', 'Lhasa Apso', NULL),
  ('dog', 'Maltês', NULL),
  ('dog', 'Mastiff Inglês', NULL),
  ('dog', 'Mastim Tibetano', NULL),
  ('dog', 'Pastor Alemão', NULL),
  ('dog', 'Pastor Australiano', NULL),
  ('dog', 'Pastor Belga Malinois', NULL),
  ('dog', 'Pastor de Shetland', NULL),
  ('dog', 'Pequinês', NULL),
  ('dog', 'Pinscher Miniatura', NULL),
  ('dog', 'Pit Bull', NULL),
  ('dog', 'Podengo Português', NULL),
  ('dog', 'Pointer Inglês', NULL),
  ('dog', 'Poodle Anão', NULL),
  ('dog', 'Poodle Médio', NULL),
  ('dog', 'Poodle Standard', NULL),
  ('dog', 'Poodle Toy', NULL),
  ('dog', 'Pug', NULL),
  ('dog', 'Rhodesian Ridgeback', NULL),
  ('dog', 'Rottweiler', NULL),
  ('dog', 'Samoieda', NULL),
  ('dog', 'São Bernardo', NULL),
  ('dog', 'Schnauzer Gigante', NULL),
  ('dog', 'Schnauzer Miniatura', NULL),
  ('dog', 'Schnauzer Standard', NULL),
  ('dog', 'Shar Pei', NULL),
  ('dog', 'Shiba Inu', NULL),
  ('dog', 'Shih Tzu', NULL),
  ('dog', 'Spitz Alemão (Lulu da Pomerânia)', NULL),
  ('dog', 'Staffordshire Bull Terrier', NULL),
  ('dog', 'Terra Nova', NULL),
  ('dog', 'Vizsla', NULL),
  ('dog', 'Weimaraner', NULL),
  ('dog', 'Welsh Corgi Cardigan', NULL),
  ('dog', 'Welsh Corgi Pembroke', NULL),
  ('dog', 'West Highland White Terrier', NULL),
  ('dog', 'Whippet', NULL),
  ('dog', 'Yorkshire Terrier', NULL),
  ('dog', 'Bull Terrier', NULL),
  ('dog', 'Bull Terrier Miniatura', NULL),
  ('dog', 'Greyhound', NULL),
  ('dog', 'Galgo Espanhol', NULL),
  ('dog', 'Old English Sheepdog', NULL),
  ('dog', 'Pequeno Lebrel Italiano', NULL),
  ('dog', 'Setter Irlandês', NULL),
  ('dog', 'Setter Inglês', NULL),
  ('dog', 'Australian Cattle Dog (Blue Heeler)', NULL),

  -- ── Gatos (SRD + ~30 raças) ─────────────────────────────────────────────
  ('cat', 'SRD (Sem Raça Definida)', NULL),
  ('cat', 'Abissínio', NULL),
  ('cat', 'American Curl', NULL),
  ('cat', 'American Shorthair', NULL),
  ('cat', 'Angorá Turco', NULL),
  ('cat', 'Bengal', NULL),
  ('cat', 'Birmanês (Sagrado da Birmânia)', NULL),
  ('cat', 'Bombaim', NULL),
  ('cat', 'British Longhair', NULL),
  ('cat', 'British Shorthair', NULL),
  ('cat', 'Burmês', NULL),
  ('cat', 'Chartreux', NULL),
  ('cat', 'Cornish Rex', NULL),
  ('cat', 'Devon Rex', NULL),
  ('cat', 'Exótico de Pelo Curto', NULL),
  ('cat', 'Himalaio', NULL),
  ('cat', 'Korat', NULL),
  ('cat', 'Maine Coon', NULL),
  ('cat', 'Manx', NULL),
  ('cat', 'Munchkin', NULL),
  ('cat', 'Norueguês da Floresta', NULL),
  ('cat', 'Oriental', NULL),
  ('cat', 'Persa', NULL),
  ('cat', 'Pixie-Bob', NULL),
  ('cat', 'Ragamuffin', NULL),
  ('cat', 'Ragdoll', NULL),
  ('cat', 'Russo Azul', NULL),
  ('cat', 'Savannah', NULL),
  ('cat', 'Scottish Fold', NULL),
  ('cat', 'Selkirk Rex', NULL),
  ('cat', 'Siamês', NULL),
  ('cat', 'Siberiano', NULL),
  ('cat', 'Singapura', NULL),
  ('cat', 'Somali', NULL),
  ('cat', 'Sphynx', NULL),
  ('cat', 'Tonkinês', NULL),
  ('cat', 'Van Turco', NULL),

  -- ── Aves ────────────────────────────────────────────────────────────────
  ('bird', 'Agapornis (Inseparável)', NULL),
  ('bird', 'Arara Azul', NULL),
  ('bird', 'Arara Canindé', NULL),
  ('bird', 'Cacatua', NULL),
  ('bird', 'Calopsita', NULL),
  ('bird', 'Canário-Belga', NULL),
  ('bird', 'Canário-da-Terra', NULL),
  ('bird', 'Cardeal', NULL),
  ('bird', 'Coleirinha', NULL),
  ('bird', 'Diamante de Gould', NULL),
  ('bird', 'Diamante Mandarim', NULL),
  ('bird', 'Galinha Caipira', NULL),
  ('bird', 'Galinha Silkie', NULL),
  ('bird', 'Mainá', NULL),
  ('bird', 'Pato Doméstico', NULL),
  ('bird', 'Papagaio Verdadeiro', NULL),
  ('bird', 'Periquito Australiano', NULL),
  ('bird', 'Pombo Doméstico', NULL),
  ('bird', 'Ring Neck (Periquito-de-Colar)', NULL),
  ('bird', 'Trinca-Ferro', NULL),

  -- ── Coelhos ─────────────────────────────────────────────────────────────
  ('rabbit', 'Angorá Inglês', NULL),
  ('rabbit', 'Belier (Holland Lop)', NULL),
  ('rabbit', 'Cabeça de Leão', NULL),
  ('rabbit', 'Fuzzy Lop', NULL),
  ('rabbit', 'Gigante de Flandres', NULL),
  ('rabbit', 'Holandês', NULL),
  ('rabbit', 'Mini Lop', NULL),
  ('rabbit', 'Mini Rex', NULL),
  ('rabbit', 'Netherland Dwarf', NULL),
  ('rabbit', 'Nova Zelândia', NULL),
  ('rabbit', 'Rex', NULL),
  ('rabbit', 'SRD (Sem Raça Definida)', NULL),

  -- ── Roedores ────────────────────────────────────────────────────────────
  ('rodent', 'Chinchila', NULL),
  ('rodent', 'Esquilo da Mongólia (Gerbil)', NULL),
  ('rodent', 'Hamster Anão Russo', NULL),
  ('rodent', 'Hamster Chinês', NULL),
  ('rodent', 'Hamster Roborovski', NULL),
  ('rodent', 'Hamster Sírio', NULL),
  ('rodent', 'Porquinho-da-Índia (Cobaia)', NULL),
  ('rodent', 'Rato Twister', NULL),
  ('rodent', 'Rato Doméstico', NULL),
  ('rodent', 'Camundongo', NULL),
  ('rodent', 'Esquilo Coreano', NULL),

  -- ── Répteis ─────────────────────────────────────────────────────────────
  ('reptile', 'Cágado Brasileiro', NULL),
  ('reptile', 'Camaleão', NULL),
  ('reptile', 'Dragão Barbado (Pogona)', NULL),
  ('reptile', 'Gecko Leopardo', NULL),
  ('reptile', 'Iguana', NULL),
  ('reptile', 'Jabuti-Piranga', NULL),
  ('reptile', 'Jabuti-Tinga', NULL),
  ('reptile', 'Píton Real (Ball Python)', NULL),
  ('reptile', 'Tartaruga Tigre d''Água', NULL),
  ('reptile', 'Teiú', NULL),

  -- ── Peixes ──────────────────────────────────────────────────────────────
  ('fish', 'Acará Bandeira', NULL),
  ('fish', 'Acará Disco', NULL),
  ('fish', 'Beta', NULL),
  ('fish', 'Carpa Koi', NULL),
  ('fish', 'Kinguio (Goldfish)', NULL),
  ('fish', 'Molinésia', NULL),
  ('fish', 'Neon', NULL),
  ('fish', 'Oscar', NULL),
  ('fish', 'Platy', NULL),
  ('fish', 'Tetra Negro', NULL),

  -- ── Exóticos ────────────────────────────────────────────────────────────
  ('exotic', 'Furão (Ferret)', NULL),
  ('exotic', 'Mico-Estrela', NULL),
  ('exotic', 'Mini-Pig', NULL),
  ('exotic', 'Ouriço Pigmeu Africano', NULL),
  ('exotic', 'Sagui', NULL),
  ('exotic', 'Sugar Glider (Petauro)', NULL)
ON CONFLICT DO NOTHING;

-- ─── 2. BACKFILL POR CLÍNICA ─────────────────────────────────────────────────
-- Para cada (clinic_id, species, breed) já existente em patients, garante uma
-- entrada na tabela breeds para que o autocomplete recupere o histórico.
-- Filtra:
--   • breed não-nulo e não-vazio
--   • não duplica caso já exista no escopo global ou na própria clínica
-- created_by fica NULL (registro herdado do histórico).

INSERT INTO public.breeds (species, name, clinic_id)
SELECT DISTINCT
  p.species,
  trim(p.breed) AS name,
  p.clinic_id
FROM public.patients p
WHERE p.breed IS NOT NULL
  AND trim(p.breed) <> ''
  AND NOT EXISTS (
    SELECT 1
    FROM public.breeds b
    WHERE b.species = p.species
      AND b.name_norm = lower(public.f_unaccent(trim(p.breed)))
      AND (b.clinic_id IS NULL OR b.clinic_id = p.clinic_id)
  )
ON CONFLICT DO NOTHING;
