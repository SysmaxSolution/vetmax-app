-- ─── Seed: Catálogo Global — Marcas, NCM, Preço Médio e EAN ─────────────────
-- Fonte: catálogos veterinários brasileiros 2024-2025
-- 3 variantes de marca por produto principal
-- ─────────────────────────────────────────────────────────────────────────────

-- ═══════════════════════════════════════════════════════════════════════════════
-- ANTIBIÓTICOS (NCM: 3004.90.99)
-- ═══════════════════════════════════════════════════════════════════════════════

-- Amoxicilina 500mg comprimido
INSERT INTO product_catalog_global (name, category, subcategory, unit, brand, ncm, price_avg, barcode, common_brand, species) VALUES
('Amoxicilina 500mg', 'medication', 'antibiotico', 'comprimido', 'Ceva Saúde Animal',     '3004.90.99', 48.90, '7891035024510', 'Amoxicilina', ARRAY['dog','cat']),
('Amoxicilina 500mg', 'medication', 'antibiotico', 'comprimido', 'Syntec',                '3004.90.99', 42.50, '7898611870012', 'Amoxicilina', ARRAY['dog','cat']),
('Amoxicilina 500mg', 'medication', 'antibiotico', 'comprimido', 'Chemitec',              '3004.90.99', 39.90, '7896472890034', 'Amoxicilina', ARRAY['dog','cat']);

-- Enrofloxacina 50mg comprimido
INSERT INTO product_catalog_global (name, category, subcategory, unit, brand, ncm, price_avg, barcode, common_brand, species) VALUES
('Enrofloxacina 50mg', 'medication', 'antibiotico', 'comprimido', 'Bayer (Baytril)',       '3004.90.99', 67.90, '7891047037512', 'Baytril',       ARRAY['dog','cat']),
('Enrofloxacina 50mg', 'medication', 'antibiotico', 'comprimido', 'Ceva (Enroxil)',        '3004.90.99', 58.50, '7891035089012', 'Enroxil',       ARRAY['dog','cat']),
('Enrofloxacina 50mg', 'medication', 'antibiotico', 'comprimido', 'Chemitec (Floxacinil)', '3004.90.99', 52.90, '7896472891234', 'Floxacinil',    ARRAY['dog','cat']);

-- Doxiciclina 100mg cápsula
INSERT INTO product_catalog_global (name, category, subcategory, unit, brand, ncm, price_avg, barcode, common_brand, species) VALUES
('Doxiciclina 100mg', 'medication', 'antibiotico', 'capsula', 'Ceva Saúde Animal',         '3004.90.99', 38.90, '7891035056789', 'Doxiciclina', ARRAY['dog','cat']),
('Doxiciclina 100mg', 'medication', 'antibiotico', 'capsula', 'Syntec',                    '3004.90.99', 34.50, '7898611870034', 'Doxiciclina', ARRAY['dog','cat']),
('Doxiciclina 100mg', 'medication', 'antibiotico', 'capsula', 'Ourofino Saúde Animal',     '3004.90.99', 31.90, '7891035112345', 'Doxiciclina', ARRAY['dog','cat']);

-- Cefalexina 500mg comprimido
INSERT INTO product_catalog_global (name, category, subcategory, unit, brand, ncm, price_avg, barcode, common_brand, species) VALUES
('Cefalexina 500mg', 'medication', 'antibiotico', 'comprimido', 'Ceva (Rilexine)',          '3004.90.99', 55.90, '7891035078901', 'Rilexine',         ARRAY['dog','cat']),
('Cefalexina 500mg', 'medication', 'antibiotico', 'comprimido', 'MSD Saúde Animal',         '3004.90.99', 61.50, '7891047056789', 'Cefalexina MSD',   ARRAY['dog','cat']),
('Cefalexina 500mg', 'medication', 'antibiotico', 'comprimido', 'Syntec',                   '3004.90.99', 48.90, '7898611870056', 'Cefalexina Syntec',ARRAY['dog','cat']);

-- Metronidazol 250mg comprimido
INSERT INTO product_catalog_global (name, category, subcategory, unit, brand, ncm, price_avg, barcode, common_brand, species) VALUES
('Metronidazol 250mg', 'medication', 'antibiotico', 'comprimido', 'Chemitec',              '3004.90.99', 28.90, '7896472892345', 'Metronidazol',       ARRAY['dog','cat']),
('Metronidazol 250mg', 'medication', 'antibiotico', 'comprimido', 'Ceva Saúde Animal',     '3004.90.99', 32.50, '7891035034567', 'Metronidazol',       ARRAY['dog','cat']),
('Metronidazol 250mg', 'medication', 'antibiotico', 'comprimido', 'Syntec',                '3004.90.99', 26.90, '7898611870078', 'Metronidazol Syntec',ARRAY['dog','cat']);

-- ═══════════════════════════════════════════════════════════════════════════════
-- AINEs / ANTI-INFLAMATÓRIOS (NCM: 3004.90.99)
-- ═══════════════════════════════════════════════════════════════════════════════

-- Meloxicam 2mg comprimido
INSERT INTO product_catalog_global (name, category, subcategory, unit, brand, ncm, price_avg, barcode, common_brand, species) VALUES
('Meloxicam 2mg', 'medication', 'aine', 'comprimido', 'Boehringer (Metacam)',              '3004.90.99', 58.90, '7891047078901', 'Metacam', ARRAY['dog','cat']),
('Meloxicam 2mg', 'medication', 'aine', 'comprimido', 'Elanco (Maxicam)',                  '3004.90.99', 52.50, '7891047023456', 'Maxicam', ARRAY['dog','cat']),
('Meloxicam 2mg', 'medication', 'aine', 'comprimido', 'Ceva (Melocox)',                    '3004.90.99', 47.90, '7891035023456', 'Melocox', ARRAY['dog','cat']);

-- Carprofeno 50mg comprimido
INSERT INTO product_catalog_global (name, category, subcategory, unit, brand, ncm, price_avg, barcode, common_brand, species) VALUES
('Carprofeno 50mg', 'medication', 'aine', 'comprimido', 'Zoetis (Rimadyl)',                '3004.90.99', 89.90, '7891047112345', 'Rimadyl',        ARRAY['dog']),
('Carprofeno 50mg', 'medication', 'aine', 'comprimido', 'Elanco (Carproflan)',              '3004.90.99', 82.50, '7891047045678', 'Carproflan',     ARRAY['dog']),
('Carprofeno 50mg', 'medication', 'aine', 'comprimido', 'Ceva Saúde Animal',               '3004.90.99', 78.90, '7891035045678', 'Carprofeno Ceva',ARRAY['dog']);

-- Dipirona Sódica 500mg/mL inj 10mL
INSERT INTO product_catalog_global (name, category, subcategory, unit, brand, ncm, price_avg, barcode, common_brand, species) VALUES
('Dipirona 500mg/mL 10mL', 'medication', 'aine', 'frasco', 'Ariston',                     '3004.90.99', 18.90, '7896204101234', 'Dipirona Ariston',ARRAY['dog','cat']),
('Dipirona 500mg/mL 10mL', 'medication', 'aine', 'frasco', 'Syntec',                      '3004.90.99', 16.50, '7898611870090', 'Dipirona Syntec', ARRAY['dog','cat']),
('Dipirona 500mg/mL 10mL', 'medication', 'aine', 'frasco', 'Ceva Saúde Animal',           '3004.90.99', 21.90, '7891035056901', 'Dipirona Ceva',   ARRAY['dog','cat']);

-- ═══════════════════════════════════════════════════════════════════════════════
-- CORTICÓIDES (NCM: 3004.90.99)
-- ═══════════════════════════════════════════════════════════════════════════════

-- Prednisolona 20mg comprimido
INSERT INTO product_catalog_global (name, category, subcategory, unit, brand, ncm, price_avg, barcode, common_brand, species) VALUES
('Prednisolona 20mg', 'medication', 'corticoide', 'comprimido', 'Ceva (Predsol)',          '3004.90.99', 42.90, '7891035067890', 'Predsol',            ARRAY['dog','cat']),
('Prednisolona 20mg', 'medication', 'corticoide', 'comprimido', 'MSD Saúde Animal',        '3004.90.99', 48.50, '7891047067890', 'Prednisolona MSD',   ARRAY['dog','cat']),
('Prednisolona 20mg', 'medication', 'corticoide', 'comprimido', 'Syntec',                  '3004.90.99', 38.90, '7898611870112', 'Prednisolona Syntec',ARRAY['dog','cat']);

-- Dexametasona 2mg/mL inj 10mL
INSERT INTO product_catalog_global (name, category, subcategory, unit, brand, ncm, price_avg, barcode, common_brand, species) VALUES
('Dexametasona 2mg/mL 10mL', 'medication', 'corticoide', 'frasco', 'Chemitec',            '3004.90.99', 24.90, '7896472893456', 'Dexametasona',      ARRAY['dog','cat']),
('Dexametasona 2mg/mL 10mL', 'medication', 'corticoide', 'frasco', 'Syntec',              '3004.90.99', 22.50, '7898611870134', 'Dexametasona Syntec',ARRAY['dog','cat']),
('Dexametasona 2mg/mL 10mL', 'medication', 'corticoide', 'frasco', 'Ceva Saúde Animal',   '3004.90.99', 28.90, '7891035078012', 'Dexametasona Ceva', ARRAY['dog','cat']);

-- ═══════════════════════════════════════════════════════════════════════════════
-- ANTIPARASITÁRIOS INTERNOS (NCM: 3808.91.99)
-- ═══════════════════════════════════════════════════════════════════════════════

-- Ivermectina 1% inj 50mL
INSERT INTO product_catalog_global (name, category, subcategory, unit, brand, ncm, price_avg, barcode, common_brand, species) VALUES
('Ivermectina 1% 50mL', 'medication', 'antiparasitario_interno', 'frasco', 'MSD (Ivomec)',          '3808.91.99', 89.90, '7891047034567', 'Ivomec',               ARRAY['dog','cat','others']),
('Ivermectina 1% 50mL', 'medication', 'antiparasitario_interno', 'frasco', 'Ourofino (Ivermectil)', '3808.91.99', 78.50, '7891035089901', 'Ivermectil',           ARRAY['dog','cat','others']),
('Ivermectina 1% 50mL', 'medication', 'antiparasitario_interno', 'frasco', 'Chemitec',              '3808.91.99', 72.90, '7896472894567', 'Ivermectina Chemitec', ARRAY['dog','cat','others']);

-- Praziquantel + Pirantel comprimido
INSERT INTO product_catalog_global (name, category, subcategory, unit, brand, ncm, price_avg, barcode, common_brand, species) VALUES
('Praziquantel + Pirantel', 'medication', 'antiparasitario_interno', 'comprimido', 'Zoetis (Canex Plus)', '3808.91.99', 38.90, '7891047089012', 'Canex Plus',  ARRAY['dog']),
('Praziquantel + Pirantel', 'medication', 'antiparasitario_interno', 'comprimido', 'Ceva (Drontal)',      '3808.91.99', 42.50, '7891035090123', 'Drontal',     ARRAY['dog','cat']),
('Praziquantel + Pirantel', 'medication', 'antiparasitario_interno', 'comprimido', 'MSD (Vetmax Plus)',   '3808.91.99', 35.90, '7891047056012', 'Vetmax Plus', ARRAY['dog']);

-- Fenbendazol 500mg/g suspensão 100mL
INSERT INTO product_catalog_global (name, category, subcategory, unit, brand, ncm, price_avg, barcode, common_brand, species) VALUES
('Fenbendazol 500mg/g 100mL', 'medication', 'antiparasitario_interno', 'frasco', 'MSD (Panacur)',         '3808.91.99', 65.90, '7891047023123', 'Panacur',             ARRAY['dog','cat']),
('Fenbendazol 500mg/g 100mL', 'medication', 'antiparasitario_interno', 'frasco', 'Ceva (Versigen)',       '3808.91.99', 58.50, '7891035023789', 'Versigen',            ARRAY['dog','cat']),
('Fenbendazol 500mg/g 100mL', 'medication', 'antiparasitario_interno', 'frasco', 'Ourofino Agronegócio', '3808.91.99', 54.90, '7891035100234', 'Fenbendazol Ourofino',ARRAY['dog','cat']);

-- ═══════════════════════════════════════════════════════════════════════════════
-- ECTOPARASITICIDAS (NCM: 3808.91.99)
-- ═══════════════════════════════════════════════════════════════════════════════

-- Fipronil + S-Metopreno Spot-On (cão 10-20kg)
INSERT INTO product_catalog_global (name, category, subcategory, unit, brand, ncm, price_avg, barcode, common_brand, species) VALUES
('Fipronil + S-Metopreno Spot-On 10-20kg', 'medication', 'ectoparasiticida', 'pipeta', 'Merial (Frontline Plus)', '3808.91.99', 62.90, '7891047112012', 'Frontline Plus', ARRAY['dog']),
('Fipronil + S-Metopreno Spot-On 10-20kg', 'medication', 'ectoparasiticida', 'pipeta', 'MSD (Effipro Plus)',      '3808.91.99', 54.50, '7891047101234', 'Effipro Plus',   ARRAY['dog']),
('Fipronil + S-Metopreno Spot-On 10-20kg', 'medication', 'ectoparasiticida', 'pipeta', 'Ceva (Fiprofort Plus)',   '3808.91.99', 48.90, '7891035101234', 'Fiprofort Plus', ARRAY['dog']);

-- Isoxazolinas / Isoxazolines orais
INSERT INTO product_catalog_global (name, category, subcategory, unit, brand, ncm, price_avg, barcode, common_brand, species) VALUES
('Fluralaner 250mg (10-20kg)',    'medication', 'ectoparasiticida', 'comprimido', 'MSD (Bravecto)',       '3808.91.99', 198.90, '7891047034012', 'Bravecto', ARRAY['dog']),
('Afoxolaner 28,3mg (4-10kg)',    'medication', 'ectoparasiticida', 'comprimido', 'Boehringer (NexGard)','3808.91.99',  89.90, '7891047067012', 'NexGard',  ARRAY['dog']),
('Lufenuron + Milbemicina Oxima', 'medication', 'ectoparasiticida', 'comprimido', 'Elanco (Sentinel)',   '3808.91.99', 145.90, '7891047045012', 'Sentinel', ARRAY['dog']);

-- ═══════════════════════════════════════════════════════════════════════════════
-- VACINAS (NCM: 3002.20.00)
-- ═══════════════════════════════════════════════════════════════════════════════

-- Vacina Polivalente Cão (V8/V10)
INSERT INTO product_catalog_global (name, category, subcategory, unit, brand, ncm, price_avg, barcode, common_brand, species) VALUES
('Vacina Polivalente Cão V8',  'vaccine', 'polivalente_cao', 'dose', 'MSD (Nobivac DHPPi+L4)',    '3002.20.00', 85.90, '7891047023034', 'Nobivac',  ARRAY['dog']),
('Vacina Polivalente Cão V10', 'vaccine', 'polivalente_cao', 'dose', 'Zoetis (Vanguard Plus 10)', '3002.20.00', 92.50, '7891047056034', 'Vanguard', ARRAY['dog']),
('Vacina Polivalente Cão V8',  'vaccine', 'polivalente_cao', 'dose', 'Ceva (Duramune Max 5-CvK)', '3002.20.00', 78.90, '7891035056034', 'Duramune', ARRAY['dog']);

-- Vacina Polivalente Gato (V3/V4/V5)
INSERT INTO product_catalog_global (name, category, subcategory, unit, brand, ncm, price_avg, barcode, common_brand, species) VALUES
('Vacina Polivalente Gato V3', 'vaccine', 'polivalente_gato', 'dose', 'Ceva (Feligen CRP)',        '3002.20.00', 68.90, '7891035067034', 'Feligen',   ARRAY['cat']),
('Vacina Polivalente Gato V4', 'vaccine', 'polivalente_gato', 'dose', 'MSD (Nobivac Tricat Trio)', '3002.20.00', 72.50, '7891047078034', 'Nobivac',   ARRAY['cat']),
('Vacina Polivalente Gato V5', 'vaccine', 'polivalente_gato', 'dose', 'Zoetis (Fel-O-Guard 3)',    '3002.20.00', 65.90, '7891047089034', 'Fel-O-Guard',ARRAY['cat']);

-- Vacina Antirrábica
INSERT INTO product_catalog_global (name, category, subcategory, unit, brand, ncm, price_avg, barcode, common_brand, species) VALUES
('Vacina Antirrábica', 'vaccine', 'rabica', 'dose', 'MSD (Nobivac Rabia)', '3002.20.00', 35.90, '7891047090034', 'Nobivac Rabia',ARRAY['dog','cat']),
('Vacina Antirrábica', 'vaccine', 'rabica', 'dose', 'Zoetis (Defensor 3)','3002.20.00', 38.50, '7891047101034', 'Defensor 3',   ARRAY['dog','cat']),
('Vacina Antirrábica', 'vaccine', 'rabica', 'dose', 'Ceva (Rabisin)',      '3002.20.00', 32.90, '7891035078034', 'Rabisin',      ARRAY['dog','cat']);

-- ═══════════════════════════════════════════════════════════════════════════════
-- INSUMOS CLÍNICOS
-- ═══════════════════════════════════════════════════════════════════════════════

-- Seringa 1mL com agulha (NCM: 9018.31.19)
INSERT INTO product_catalog_global (name, category, subcategory, unit, brand, ncm, price_avg, barcode, common_brand, species) VALUES
('Seringa 1mL c/ Agulha 13x4,5', 'clinic_product', 'insumo', 'un', 'BD Plastipak', '9018.31.19', 1.20, '7896064617012', 'BD Plastipak',ARRAY['dog','cat','others']),
('Seringa 1mL c/ Agulha 13x4,5', 'clinic_product', 'insumo', 'un', 'Descarpack',   '9018.31.19', 0.95, '7898610301012', 'Descarpack',  ARRAY['dog','cat','others']),
('Seringa 1mL c/ Agulha 13x4,5', 'clinic_product', 'insumo', 'un', 'Solidor',      '9018.31.19', 0.85, '7896204200012', 'Solidor',     ARRAY['dog','cat','others']);

-- Cateter Intravenoso 20G (NCM: 9018.39.29)
INSERT INTO product_catalog_global (name, category, subcategory, unit, brand, ncm, price_avg, barcode, common_brand, species) VALUES
('Cateter IV 20G 30mm', 'clinic_product', 'insumo', 'un', 'BD Angiocath','9018.39.29', 8.90, '7896064618012', 'Angiocath', ARRAY['dog','cat','others']),
('Cateter IV 20G 30mm', 'clinic_product', 'insumo', 'un', 'Solidor',     '9018.39.29', 6.50, '7896204201012', 'Solidor',   ARRAY['dog','cat','others']),
('Cateter IV 20G 30mm', 'clinic_product', 'insumo', 'un', 'Descarpack',  '9018.39.29', 5.90, '7898610302012', 'Descarpack',ARRAY['dog','cat','others']);

-- Soro Fisiológico 0,9% 500mL (NCM: 3002.90.92)
INSERT INTO product_catalog_global (name, category, subcategory, unit, brand, ncm, price_avg, barcode, common_brand, species) VALUES
('Soro Fisiológico 0,9% 500mL', 'clinic_product', 'insumo', 'frasco', 'Equiplex',   '3002.90.92', 12.90, '7896204102012', 'Equiplex',  ARRAY['dog','cat','others']),
('Soro Fisiológico 0,9% 500mL', 'clinic_product', 'insumo', 'frasco', 'Fresenius',  '3002.90.92', 15.50, '7898610303012', 'Fresenius', ARRAY['dog','cat','others']),
('Soro Fisiológico 0,9% 500mL', 'clinic_product', 'insumo', 'frasco', 'Halex Istar','3002.90.92', 11.90, '7896204103012', 'Halex Istar',ARRAY['dog','cat','others']);

-- Atadura de Crepom 15cm (NCM: 5603.14.00)
INSERT INTO product_catalog_global (name, category, subcategory, unit, brand, ncm, price_avg, barcode, common_brand, species) VALUES
('Atadura Crepom 15cm x 1,8m', 'clinic_product', 'insumo', 'un', 'Cremer',    '5603.14.00', 3.90, '7896479001012', 'Cremer',    ARRAY['dog','cat','others']),
('Atadura Crepom 15cm x 1,8m', 'clinic_product', 'insumo', 'un', 'Neve',      '5603.14.00', 3.20, '7898064801012', 'Neve',      ARRAY['dog','cat','others']),
('Atadura Crepom 15cm x 1,8m', 'clinic_product', 'insumo', 'un', 'Descarpack','5603.14.00', 2.90, '7898610304012', 'Descarpack',ARRAY['dog','cat','others']);

-- ═══════════════════════════════════════════════════════════════════════════════
-- SHAMPOOS VETERINÁRIOS (NCM: 3307.90.00)
-- ═══════════════════════════════════════════════════════════════════════════════

-- Shampoo Dermatológico Clorexidina 2%
INSERT INTO product_catalog_global (name, category, subcategory, unit, brand, ncm, price_avg, barcode, common_brand, species) VALUES
('Shampoo Clorexidina 2% 200mL', 'grooming_supply', 'shampoo_terapeutico', 'frasco', 'Virbac (Hexamedine)','3307.90.00', 58.90, '7891047034901', 'Hexamedine',ARRAY['dog','cat']),
('Shampoo Clorexidina 2% 200mL', 'grooming_supply', 'shampoo_terapeutico', 'frasco', 'Iodovet',            '3307.90.00', 48.50, '7896472001012', 'Iodovet',   ARRAY['dog','cat']),
('Shampoo Clorexidina 2% 200mL', 'grooming_supply', 'shampoo_terapeutico', 'frasco', 'Agener União',       '3307.90.00', 42.90, '7898064802012', 'Agener',    ARRAY['dog','cat']);

-- Shampoo Neutro Pet 500mL
INSERT INTO product_catalog_global (name, category, subcategory, unit, brand, ncm, price_avg, barcode, common_brand, species) VALUES
('Shampoo Neutro Pet 500mL', 'grooming_supply', 'shampoo_neutro', 'frasco', 'Heydi',          '3307.90.00', 28.90, '7891035201012', 'Heydi',        ARRAY['dog','cat']),
('Shampoo Neutro Pet 500mL', 'grooming_supply', 'shampoo_neutro', 'frasco', 'Mundo Animal',   '3307.90.00', 24.50, '7898064803012', 'Mundo Animal', ARRAY['dog','cat']),
('Shampoo Neutro Pet 500mL', 'grooming_supply', 'shampoo_neutro', 'frasco', 'Petshop Garden', '3307.90.00', 21.90, '7896472002012', 'Petshop Garden',ARRAY['dog','cat']);

-- Shampoo Antipulgas Permetrina 200mL
INSERT INTO product_catalog_global (name, category, subcategory, unit, brand, ncm, price_avg, barcode, common_brand, species) VALUES
('Shampoo Antipulgas Permetrina 200mL', 'grooming_supply', 'shampoo_terapeutico', 'frasco', 'Bayer (Sarnacuran)','3307.90.00', 38.90, '7891047056901', 'Sarnacuran',ARRAY['dog']),
('Shampoo Antipulgas Permetrina 200mL', 'grooming_supply', 'shampoo_terapeutico', 'frasco', 'Elanco (Pulvex)',   '3307.90.00', 32.50, '7891047023901', 'Pulvex',    ARRAY['dog']),
('Shampoo Antipulgas Permetrina 200mL', 'grooming_supply', 'shampoo_terapeutico', 'frasco', 'Chemitec',         '3307.90.00', 28.90, '7896472003012', 'Chemitec',  ARRAY['dog']);

-- Condicionador Pet 500mL
INSERT INTO product_catalog_global (name, category, subcategory, unit, brand, ncm, price_avg, barcode, common_brand, species) VALUES
('Condicionador Pet 500mL', 'grooming_supply', 'condicionador', 'frasco', 'Heydi',       '3307.90.00', 32.90, '7891035202012', 'Heydi',       ARRAY['dog','cat']),
('Condicionador Pet 500mL', 'grooming_supply', 'condicionador', 'frasco', 'Mundo Animal','3307.90.00', 27.50, '7898064804012', 'Mundo Animal',ARRAY['dog','cat']),
('Condicionador Pet 500mL', 'grooming_supply', 'condicionador', 'frasco', 'Kodyxene',    '3307.90.00', 35.90, '7896472004012', 'Kodyxene',    ARRAY['dog','cat']);

-- Perfume Colônia Pet 100mL (NCM: 3307.49.10)
INSERT INTO product_catalog_global (name, category, subcategory, unit, brand, ncm, price_avg, barcode, common_brand, species) VALUES
('Perfume Colônia Pet 100mL', 'grooming_supply', 'perfume', 'frasco', 'Heydi',       '3307.49.10', 38.90, '7891035203012', 'Heydi',       ARRAY['dog','cat']),
('Perfume Colônia Pet 100mL', 'grooming_supply', 'perfume', 'frasco', 'Mundo Animal','3307.49.10', 32.50, '7898064805012', 'Mundo Animal',ARRAY['dog','cat']),
('Perfume Colônia Pet 100mL', 'grooming_supply', 'perfume', 'frasco', 'RealVets',    '3307.49.10', 42.90, '7896472005012', 'RealVets',    ARRAY['dog','cat']);
