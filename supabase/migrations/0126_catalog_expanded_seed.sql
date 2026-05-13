-- Seed expandido: Estética/acessórios, Insumos clínicos e Higiene/grooming
-- 180+ produtos com UUIDs estáticos, multi-marca e metadados NCM/preço
-- Idempotente via ON CONFLICT (id) DO NOTHING

-- Garante colunas opcionais (adicionadas progressivamente após 0119)
ALTER TABLE product_catalog_global
  ADD COLUMN IF NOT EXISTS brand       text,
  ADD COLUMN IF NOT EXISTS ncm         text,
  ADD COLUMN IF NOT EXISTS price_avg   numeric,
  ADD COLUMN IF NOT EXISTS barcode     text;

-- ══════════════════════════════════════════════════════════════════════════════
-- 1. ESTÉTICA / ACESSÓRIOS  (category = 'aesthetics')
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO product_catalog_global (id, name, category, subcategory, unit, species, common_brand, brand, ncm, price_avg) VALUES

-- Bandana pet
('a1000001-0000-0000-0000-000000000001','Bandana pet estampada P','aesthetics','acessorio','un','{dog,cat}','Furacão Pet','Furacão Pet','6307.90.10',10.00),
('a1000001-0000-0000-0000-000000000002','Bandana pet estampada P','aesthetics','acessorio','un','{dog,cat}','Chalesco','Chalesco','6307.90.10',9.00),
('a1000001-0000-0000-0000-000000000003','Bandana pet estampada P','aesthetics','acessorio','un','{dog,cat}','Ibáñez Pet','Ibáñez Pet','6307.90.10',11.00),
('a1000001-0000-0000-0000-000000000004','Bandana pet estampada M','aesthetics','acessorio','un','{dog}','Mundo Animal','Mundo Animal','6307.90.10',12.00),
('a1000001-0000-0000-0000-000000000005','Bandana pet estampada M','aesthetics','acessorio','un','{dog}','Pet Brink','Pet Brink','6307.90.10',11.00),
('a1000001-0000-0000-0000-000000000006','Bandana pet estampada G','aesthetics','acessorio','un','{dog}','Furacão Pet','Furacão Pet','6307.90.10',14.00),

-- Coleira nylon
('a1000002-0000-0000-0000-000000000001','Coleira nylon ajustável P','aesthetics','coleira','un','{dog,cat}','Furacão Pet','Furacão Pet','3926.90.90',15.00),
('a1000002-0000-0000-0000-000000000002','Coleira nylon ajustável P','aesthetics','coleira','un','{dog,cat}','Chalesco','Chalesco','3926.90.90',14.00),
('a1000002-0000-0000-0000-000000000003','Coleira nylon ajustável P','aesthetics','coleira','un','{dog,cat}','PetStyle','PetStyle','3926.90.90',13.00),
('a1000002-0000-0000-0000-000000000004','Coleira nylon ajustável M','aesthetics','coleira','un','{dog}','Furacão Pet','Furacão Pet','3926.90.90',20.00),
('a1000002-0000-0000-0000-000000000005','Coleira nylon ajustável M','aesthetics','coleira','un','{dog}','Mundo Animal','Mundo Animal','3926.90.90',18.00),
('a1000002-0000-0000-0000-000000000006','Coleira nylon ajustável G','aesthetics','coleira','un','{dog}','Chalesco','Chalesco','3926.90.90',28.00),
('a1000002-0000-0000-0000-000000000007','Coleira nylon ajustável G','aesthetics','coleira','un','{dog}','Ibáñez Pet','Ibáñez Pet','3926.90.90',30.00),

-- Coleira couro
('a1000003-0000-0000-0000-000000000001','Coleira couro legítimo P','aesthetics','coleira','un','{dog,cat}','Furacão Pet','Furacão Pet','4205.00.90',35.00),
('a1000003-0000-0000-0000-000000000002','Coleira couro legítimo P','aesthetics','coleira','un','{dog,cat}','Chalesco','Chalesco','4205.00.90',32.00),
('a1000003-0000-0000-0000-000000000003','Coleira couro legítimo P','aesthetics','coleira','un','{dog,cat}','Savana','Savana','4205.00.90',38.00),
('a1000003-0000-0000-0000-000000000004','Coleira couro legítimo M','aesthetics','coleira','un','{dog}','Furacão Pet','Furacão Pet','4205.00.90',45.00),
('a1000003-0000-0000-0000-000000000005','Coleira couro legítimo G','aesthetics','coleira','un','{dog}','Savana','Savana','4205.00.90',60.00),

-- Gravata borboleta
('a1000004-0000-0000-0000-000000000001','Gravata borboleta pet velcro P','aesthetics','acessorio','un','{dog,cat}','Furacão Pet','Furacão Pet','6307.90.10',8.00),
('a1000004-0000-0000-0000-000000000002','Gravata borboleta pet velcro P','aesthetics','acessorio','un','{dog,cat}','Heydi','Heydi','6307.90.10',9.00),
('a1000004-0000-0000-0000-000000000003','Gravata borboleta pet velcro P','aesthetics','acessorio','un','{dog,cat}','Plush Pet','Plush Pet','6307.90.10',7.00),
('a1000004-0000-0000-0000-000000000004','Gravata borboleta pet velcro M','aesthetics','acessorio','un','{dog}','Furacão Pet','Furacão Pet','6307.90.10',10.00),
('a1000004-0000-0000-0000-000000000005','Gravata borboleta pet velcro M','aesthetics','acessorio','un','{dog}','Mundo Animal','Mundo Animal','6307.90.10',11.00),

-- Laço cabelo
('a1000005-0000-0000-0000-000000000001','Laço de fita para cabelo pet P (pct12)','aesthetics','acessorio','cx','{dog,cat}','Furacão Pet','Furacão Pet','6307.90.10',8.00),
('a1000005-0000-0000-0000-000000000002','Laço de fita para cabelo pet P (pct12)','aesthetics','acessorio','cx','{dog,cat}','Heydi','Heydi','6307.90.10',7.00),
('a1000005-0000-0000-0000-000000000003','Laço de elástico colorido pet (pct50)','aesthetics','acessorio','cx','{dog,cat}','Plush Pet','Plush Pet','6307.90.10',6.00),
('a1000005-0000-0000-0000-000000000004','Laço de elástico colorido pet (pct50)','aesthetics','acessorio','cx','{dog,cat}','PetStyle','PetStyle','6307.90.10',5.00),

-- Roupinha/camiseta
('a1000006-0000-0000-0000-000000000001','Camiseta pet algodão PP','aesthetics','roupa','un','{dog,cat}','Furacão Pet','Furacão Pet','6307.90.10',28.00),
('a1000006-0000-0000-0000-000000000002','Camiseta pet algodão PP','aesthetics','roupa','un','{dog,cat}','Chalesco','Chalesco','6307.90.10',25.00),
('a1000006-0000-0000-0000-000000000003','Camiseta pet algodão PP','aesthetics','roupa','un','{dog,cat}','Mundo Animal','Mundo Animal','6307.90.10',30.00),
('a1000006-0000-0000-0000-000000000004','Camiseta pet algodão P','aesthetics','roupa','un','{dog,cat}','Furacão Pet','Furacão Pet','6307.90.10',32.00),
('a1000006-0000-0000-0000-000000000005','Camiseta pet algodão M','aesthetics','roupa','un','{dog}','Chalesco','Chalesco','6307.90.10',38.00),
('a1000006-0000-0000-0000-000000000006','Camiseta pet algodão G','aesthetics','roupa','un','{dog}','Mundo Animal','Mundo Animal','6307.90.10',55.00),

-- Peitoral coleira
('a1000007-0000-0000-0000-000000000001','Peitoral coleira nylon P','aesthetics','peitoral','un','{dog,cat}','Furacão Pet','Furacão Pet','3926.90.90',25.00),
('a1000007-0000-0000-0000-000000000002','Peitoral coleira nylon P','aesthetics','peitoral','un','{dog,cat}','Chalesco','Chalesco','3926.90.90',22.00),
('a1000007-0000-0000-0000-000000000003','Peitoral coleira nylon P','aesthetics','peitoral','un','{dog,cat}','Ibáñez Pet','Ibáñez Pet','3926.90.90',28.00),
('a1000007-0000-0000-0000-000000000004','Peitoral coleira nylon M','aesthetics','peitoral','un','{dog}','Furacão Pet','Furacão Pet','3926.90.90',35.00),
('a1000007-0000-0000-0000-000000000005','Peitoral coleira nylon G','aesthetics','peitoral','un','{dog}','Gooby','Gooby','3926.90.90',55.00),

-- Peitoral colete
('a1000008-0000-0000-0000-000000000001','Peitoral colete malha PP','aesthetics','peitoral','un','{dog,cat}','Furacão Pet','Furacão Pet','6307.90.10',38.00),
('a1000008-0000-0000-0000-000000000002','Peitoral colete malha PP','aesthetics','peitoral','un','{dog,cat}','Gooby','Gooby','6307.90.10',42.00),
('a1000008-0000-0000-0000-000000000003','Peitoral colete malha PP','aesthetics','peitoral','un','{dog,cat}','Kong','Kong','6307.90.10',45.00),
('a1000008-0000-0000-0000-000000000004','Peitoral colete malha P','aesthetics','peitoral','un','{dog,cat}','Furacão Pet','Furacão Pet','6307.90.10',45.00),
('a1000008-0000-0000-0000-000000000005','Peitoral colete malha M','aesthetics','peitoral','un','{dog}','Gooby','Gooby','6307.90.10',60.00),
('a1000008-0000-0000-0000-000000000006','Peitoral colete malha G','aesthetics','peitoral','un','{dog}','Kong','Kong','6307.90.10',85.00),

-- Guia retrátil
('a1000009-0000-0000-0000-000000000001','Guia retrátil 3m até 8kg','aesthetics','guia','un','{dog,cat}','Furacão Pet','Furacão Pet','3926.90.90',38.00),
('a1000009-0000-0000-0000-000000000002','Guia retrátil 3m até 8kg','aesthetics','guia','un','{dog,cat}','Chalesco','Chalesco','3926.90.90',35.00),
('a1000009-0000-0000-0000-000000000003','Guia retrátil 3m até 8kg','aesthetics','guia','un','{dog,cat}','Kong','Kong','3926.90.90',55.00),
('a1000009-0000-0000-0000-000000000004','Guia retrátil 5m até 25kg','aesthetics','guia','un','{dog}','Furacão Pet','Furacão Pet','3926.90.90',65.00),
('a1000009-0000-0000-0000-000000000005','Guia retrátil 5m até 50kg','aesthetics','guia','un','{dog}','Chalesco','Chalesco','3926.90.90',95.00),
('a1000009-0000-0000-0000-000000000006','Guia retrátil 8m até 50kg','aesthetics','guia','un','{dog}','Kong','Kong','3926.90.90',120.00),

-- Mochila transporte
('a1000010-0000-0000-0000-000000000001','Mochila transporte pet até 6kg','aesthetics','transporte','un','{dog,cat}','Furacão Pet','Furacão Pet','4202.12.00',95.00),
('a1000010-0000-0000-0000-000000000002','Mochila transporte pet até 6kg','aesthetics','transporte','un','{dog,cat}','Pet Brink','Pet Brink','4202.12.00',85.00),
('a1000010-0000-0000-0000-000000000003','Mochila transporte pet até 6kg','aesthetics','transporte','un','{dog,cat}','Kong','Kong','4202.12.00',140.00),
('a1000010-0000-0000-0000-000000000004','Mochila cápsula transparente pet até 8kg','aesthetics','transporte','un','{dog,cat}','Furacão Pet','Furacão Pet','4202.12.00',180.00),
('a1000010-0000-0000-0000-000000000005','Mochila cápsula transparente pet até 8kg','aesthetics','transporte','un','{dog,cat}','Pet Brink','Pet Brink','4202.12.00',200.00),

-- Caixa transporte
('a1000011-0000-0000-0000-000000000001','Caixa transporte plástica P (até 8kg)','aesthetics','transporte','un','{dog,cat}','Furacão Pet','Furacão Pet','3926.90.90',95.00),
('a1000011-0000-0000-0000-000000000002','Caixa transporte plástica P (até 8kg)','aesthetics','transporte','un','{dog,cat}','Chalesco','Chalesco','3926.90.90',90.00),
('a1000011-0000-0000-0000-000000000003','Caixa transporte plástica P (até 8kg)','aesthetics','transporte','un','{dog,cat}','Ibáñez Pet','Ibáñez Pet','3926.90.90',110.00),
('a1000011-0000-0000-0000-000000000004','Caixa transporte plástica M (até 15kg)','aesthetics','transporte','un','{dog}','Furacão Pet','Furacão Pet','3926.90.90',150.00),
('a1000011-0000-0000-0000-000000000005','Caixa transporte plástica G (até 30kg)','aesthetics','transporte','un','{dog}','Chalesco','Chalesco','3926.90.90',220.00),
('a1000011-0000-0000-0000-000000000006','Caixa transporte plástica G (até 30kg)','aesthetics','transporte','un','{dog}','Ibáñez Pet','Ibáñez Pet','3926.90.90',250.00),

-- Tapete absorvente
('a1000012-0000-0000-0000-000000000001','Tapete absorvente higiênico 60x60cm (cx30)','aesthetics','higiene','cx','{dog,cat}','Furacão Pet','Furacão Pet','5603.11.00',28.00),
('a1000012-0000-0000-0000-000000000002','Tapete absorvente higiênico 60x60cm (cx30)','aesthetics','higiene','cx','{dog,cat}','Mundo Animal','Mundo Animal','5603.11.00',25.00),
('a1000012-0000-0000-0000-000000000003','Tapete absorvente higiênico 60x60cm (cx30)','aesthetics','higiene','cx','{dog,cat}','Plush Pet','Plush Pet','5603.11.00',30.00),
('a1000012-0000-0000-0000-000000000004','Tapete absorvente higiênico 80x60cm (cx20)','aesthetics','higiene','cx','{dog}','Furacão Pet','Furacão Pet','5603.11.00',32.00),
('a1000012-0000-0000-0000-000000000005','Tapete absorvente higiênico 80x60cm (cx20)','aesthetics','higiene','cx','{dog}','Mundo Animal','Mundo Animal','5603.11.00',30.00),

-- Cama pet
('a1000013-0000-0000-0000-000000000001','Cama pet redonda pelúcia P','aesthetics','cama','un','{dog,cat}','Furacão Pet','Furacão Pet','9404.90.00',65.00),
('a1000013-0000-0000-0000-000000000002','Cama pet redonda pelúcia P','aesthetics','cama','un','{dog,cat}','Plush Pet','Plush Pet','9404.90.00',72.00),
('a1000013-0000-0000-0000-000000000003','Cama pet redonda pelúcia P','aesthetics','cama','un','{dog,cat}','Mundo Animal','Mundo Animal','9404.90.00',60.00),
('a1000013-0000-0000-0000-000000000004','Cama pet quadrada espuma M','aesthetics','cama','un','{dog}','Furacão Pet','Furacão Pet','9404.90.00',110.00),
('a1000013-0000-0000-0000-000000000005','Cama pet quadrada espuma G','aesthetics','cama','un','{dog}','Plush Pet','Plush Pet','9404.90.00',165.00),
('a1000013-0000-0000-0000-000000000006','Cama pet impermeável M','aesthetics','cama','un','{dog,cat}','Chalesco','Chalesco','9404.90.00',130.00),

-- Bolsa transporte
('a1000014-0000-0000-0000-000000000001','Bolsa transporte soft pet P','aesthetics','transporte','un','{dog,cat}','Furacão Pet','Furacão Pet','4202.12.00',88.00),
('a1000014-0000-0000-0000-000000000002','Bolsa transporte soft pet P','aesthetics','transporte','un','{dog,cat}','Chalesco','Chalesco','4202.12.00',82.00),
('a1000014-0000-0000-0000-000000000003','Bolsa transporte soft pet P','aesthetics','transporte','un','{dog,cat}','Pet Brink','Pet Brink','4202.12.00',95.00),
('a1000014-0000-0000-0000-000000000004','Bolsa transporte soft pet M','aesthetics','transporte','un','{dog}','Furacão Pet','Furacão Pet','4202.12.00',125.00),
('a1000014-0000-0000-0000-000000000005','Bolsa transporte soft pet M','aesthetics','transporte','un','{dog}','Kong','Kong','4202.12.00',160.00)

ON CONFLICT (id) DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- 2. INSUMOS CLÍNICOS / PROCEDIMENTOS  (category = 'clinic_product')
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO product_catalog_global (id, name, category, subcategory, unit, species, common_brand, brand, ncm, price_avg) VALUES

-- Seringas
('b1000001-0000-0000-0000-000000000001','Seringa 1mL insulina agulha acoplada','clinic_product','insumo','un',NULL,'BD','BD','9018.31.19',0.80),
('b1000001-0000-0000-0000-000000000002','Seringa 1mL insulina agulha acoplada','clinic_product','insumo','un',NULL,'Descarpack','Descarpack','9018.31.19',0.75),
('b1000001-0000-0000-0000-000000000003','Seringa 1mL insulina agulha acoplada','clinic_product','insumo','un',NULL,'Solidor','Solidor','9018.31.19',0.78),
('b1000002-0000-0000-0000-000000000001','Seringa 3mL sem agulha','clinic_product','insumo','un',NULL,'BD','BD','9018.31.19',0.90),
('b1000002-0000-0000-0000-000000000002','Seringa 3mL sem agulha','clinic_product','insumo','un',NULL,'Descarpack','Descarpack','9018.31.19',0.85),
('b1000002-0000-0000-0000-000000000003','Seringa 3mL sem agulha','clinic_product','insumo','un',NULL,'Injetomed','Injetomed','9018.31.19',0.88),
('b1000003-0000-0000-0000-000000000001','Seringa 5mL sem agulha','clinic_product','insumo','un',NULL,'BD','BD','9018.31.19',1.00),
('b1000003-0000-0000-0000-000000000002','Seringa 5mL sem agulha','clinic_product','insumo','un',NULL,'Descarpack','Descarpack','9018.31.19',0.95),
('b1000003-0000-0000-0000-000000000003','Seringa 5mL sem agulha','clinic_product','insumo','un',NULL,'Solidor','Solidor','9018.31.19',0.98),
('b1000004-0000-0000-0000-000000000001','Seringa 10mL sem agulha','clinic_product','insumo','un',NULL,'BD','BD','9018.31.19',1.20),
('b1000004-0000-0000-0000-000000000002','Seringa 10mL sem agulha','clinic_product','insumo','un',NULL,'Descarpack','Descarpack','9018.31.19',1.15),
('b1000004-0000-0000-0000-000000000003','Seringa 10mL sem agulha','clinic_product','insumo','un',NULL,'CML','CML','9018.31.19',1.18),
('b1000005-0000-0000-0000-000000000001','Seringa 20mL sem agulha','clinic_product','insumo','un',NULL,'BD','BD','9018.31.19',1.50),
('b1000005-0000-0000-0000-000000000002','Seringa 20mL sem agulha','clinic_product','insumo','un',NULL,'Descarpack','Descarpack','9018.31.19',1.45),
('b1000005-0000-0000-0000-000000000003','Seringa 20mL sem agulha','clinic_product','insumo','un',NULL,'Injetomed','Injetomed','9018.31.19',1.48),
('b1000006-0000-0000-0000-000000000001','Seringa 60mL sem agulha','clinic_product','insumo','un',NULL,'BD','BD','9018.31.19',2.50),
('b1000006-0000-0000-0000-000000000002','Seringa 60mL sem agulha','clinic_product','insumo','un',NULL,'Descarpack','Descarpack','9018.31.19',2.40),
('b1000006-0000-0000-0000-000000000003','Seringa 60mL sem agulha','clinic_product','insumo','un',NULL,'Solidor','Solidor','9018.31.19',2.45),

-- Agulhas (cx50)
('b1000007-0000-0000-0000-000000000001','Agulha hipodérmica 25x7mm (cx50)','clinic_product','insumo','cx',NULL,'BD','BD','9018.32.19',12.00),
('b1000007-0000-0000-0000-000000000002','Agulha hipodérmica 25x7mm (cx50)','clinic_product','insumo','cx',NULL,'Descarpack','Descarpack','9018.32.19',10.00),
('b1000007-0000-0000-0000-000000000003','Agulha hipodérmica 25x7mm (cx50)','clinic_product','insumo','cx',NULL,'Solidor','Solidor','9018.32.19',11.00),
('b1000008-0000-0000-0000-000000000001','Agulha hipodérmica 30x7mm (cx50)','clinic_product','insumo','cx',NULL,'BD','BD','9018.32.19',12.00),
('b1000008-0000-0000-0000-000000000002','Agulha hipodérmica 30x7mm (cx50)','clinic_product','insumo','cx',NULL,'Descarpack','Descarpack','9018.32.19',11.00),
('b1000008-0000-0000-0000-000000000003','Agulha hipodérmica 30x7mm (cx50)','clinic_product','insumo','cx',NULL,'Injetomed','Injetomed','9018.32.19',11.50),
('b1000009-0000-0000-0000-000000000001','Agulha hipodérmica 40x12mm (cx50)','clinic_product','insumo','cx',NULL,'BD','BD','9018.32.19',13.00),
('b1000009-0000-0000-0000-000000000002','Agulha hipodérmica 40x12mm (cx50)','clinic_product','insumo','cx',NULL,'Descarpack','Descarpack','9018.32.19',12.00),
('b1000009-0000-0000-0000-000000000003','Agulha hipodérmica 40x12mm (cx50)','clinic_product','insumo','cx',NULL,'CML','CML','9018.32.19',12.50),

-- Cateteres IV
('b1000010-0000-0000-0000-000000000001','Cateter intravenoso 18G','clinic_product','insumo','un',NULL,'BD','BD','9018.39.29',2.50),
('b1000010-0000-0000-0000-000000000002','Cateter intravenoso 18G','clinic_product','insumo','un',NULL,'Advantive','Advantive','9018.39.29',2.40),
('b1000010-0000-0000-0000-000000000003','Cateter intravenoso 18G','clinic_product','insumo','un',NULL,'Esterilmax','Esterilmax','9018.39.29',2.45),
('b1000011-0000-0000-0000-000000000001','Cateter intravenoso 20G','clinic_product','insumo','un',NULL,'BD','BD','9018.39.29',2.20),
('b1000011-0000-0000-0000-000000000002','Cateter intravenoso 20G','clinic_product','insumo','un',NULL,'Advantive','Advantive','9018.39.29',2.10),
('b1000011-0000-0000-0000-000000000003','Cateter intravenoso 20G','clinic_product','insumo','un',NULL,'Medcure','Medcure','9018.39.29',2.15),
('b1000012-0000-0000-0000-000000000001','Cateter intravenoso 22G','clinic_product','insumo','un',NULL,'BD','BD','9018.39.29',2.00),
('b1000012-0000-0000-0000-000000000002','Cateter intravenoso 22G','clinic_product','insumo','un',NULL,'Advantive','Advantive','9018.39.29',1.95),
('b1000012-0000-0000-0000-000000000003','Cateter intravenoso 22G','clinic_product','insumo','un',NULL,'Esterilmax','Esterilmax','9018.39.29',1.98),
('b1000013-0000-0000-0000-000000000001','Cateter intravenoso 24G','clinic_product','insumo','un',NULL,'BD','BD','9018.39.29',2.00),
('b1000013-0000-0000-0000-000000000002','Cateter intravenoso 24G','clinic_product','insumo','un',NULL,'Medcure','Medcure','9018.39.29',1.95),
('b1000013-0000-0000-0000-000000000003','Cateter intravenoso 24G','clinic_product','insumo','un',NULL,'Advantive','Advantive','9018.39.29',1.98),

-- Equipos
('b1000014-0000-0000-0000-000000000001','Equipo macrogotas','clinic_product','insumo','un',NULL,'BD','BD','9018.39.99',2.80),
('b1000014-0000-0000-0000-000000000002','Equipo macrogotas','clinic_product','insumo','un',NULL,'Descarpack','Descarpack','9018.39.99',2.60),
('b1000014-0000-0000-0000-000000000003','Equipo macrogotas','clinic_product','insumo','un',NULL,'Medcure','Medcure','9018.39.99',2.70),
('b1000015-0000-0000-0000-000000000001','Equipo microgotas','clinic_product','insumo','un',NULL,'BD','BD','9018.39.99',3.20),
('b1000015-0000-0000-0000-000000000002','Equipo microgotas','clinic_product','insumo','un',NULL,'Descarpack','Descarpack','9018.39.99',3.00),
('b1000015-0000-0000-0000-000000000003','Equipo microgotas','clinic_product','insumo','un',NULL,'Esterilmax','Esterilmax','9018.39.99',3.10),

-- Luvas procedimento
('b1000016-0000-0000-0000-000000000001','Luva procedimento nitrila M (cx100)','clinic_product','insumo','cx',NULL,'Supermax','Supermax','3926.20.00',42.00),
('b1000016-0000-0000-0000-000000000002','Luva procedimento nitrila M (cx100)','clinic_product','insumo','cx',NULL,'Nugard','Nugard','3926.20.00',44.00),
('b1000016-0000-0000-0000-000000000003','Luva procedimento nitrila M (cx100)','clinic_product','insumo','cx',NULL,'Ansell','Ansell','3926.20.00',48.00),
('b1000017-0000-0000-0000-000000000001','Luva procedimento nitrila G (cx100)','clinic_product','insumo','cx',NULL,'Supermax','Supermax','3926.20.00',45.00),
('b1000017-0000-0000-0000-000000000002','Luva procedimento nitrila G (cx100)','clinic_product','insumo','cx',NULL,'Nugard','Nugard','3926.20.00',47.00),
('b1000017-0000-0000-0000-000000000003','Luva procedimento nitrila G (cx100)','clinic_product','insumo','cx',NULL,'Ansell','Ansell','3926.20.00',50.00),

-- Luvas cirúrgicas
('b1000018-0000-0000-0000-000000000001','Luva cirúrgica estéril 7.0 (par)','clinic_product','insumo','un',NULL,'Ansell','Ansell','4015.11.00',4.50),
('b1000018-0000-0000-0000-000000000002','Luva cirúrgica estéril 7.0 (par)','clinic_product','insumo','un',NULL,'Supermax','Supermax','4015.11.00',4.20),
('b1000018-0000-0000-0000-000000000003','Luva cirúrgica estéril 7.0 (par)','clinic_product','insumo','un',NULL,'Medcure','Medcure','4015.11.00',4.35),
('b1000019-0000-0000-0000-000000000001','Luva cirúrgica estéril 7.5 (par)','clinic_product','insumo','un',NULL,'Ansell','Ansell','4015.11.00',4.50),
('b1000019-0000-0000-0000-000000000002','Luva cirúrgica estéril 7.5 (par)','clinic_product','insumo','un',NULL,'Supermax','Supermax','4015.11.00',4.20),
('b1000019-0000-0000-0000-000000000003','Luva cirúrgica estéril 7.5 (par)','clinic_product','insumo','un',NULL,'Nugard','Nugard','4015.11.00',4.40),
('b1000020-0000-0000-0000-000000000001','Luva cirúrgica estéril 8.0 (par)','clinic_product','insumo','un',NULL,'Ansell','Ansell','4015.11.00',4.50),
('b1000020-0000-0000-0000-000000000002','Luva cirúrgica estéril 8.0 (par)','clinic_product','insumo','un',NULL,'Supermax','Supermax','4015.11.00',4.20),
('b1000020-0000-0000-0000-000000000003','Luva cirúrgica estéril 8.0 (par)','clinic_product','insumo','un',NULL,'Medcure','Medcure','4015.11.00',4.35),

-- Esparadrapo / gaze / curativo
('b1000021-0000-0000-0000-000000000001','Esparadrapo microporoso 10cm x 4,5m','clinic_product','insumo','un',NULL,'3M','3M','3005.10.00',15.00),
('b1000021-0000-0000-0000-000000000002','Esparadrapo microporoso 10cm x 4,5m','clinic_product','insumo','un',NULL,'Cremer','Cremer','3005.10.00',13.00),
('b1000021-0000-0000-0000-000000000003','Esparadrapo microporoso 10cm x 4,5m','clinic_product','insumo','un',NULL,'Missner','Missner','3005.10.00',14.00),
('b1000022-0000-0000-0000-000000000001','Gaze estéril 7,5x7,5cm (cx200)','clinic_product','insumo','cx',NULL,'Cremer','Cremer','3005.90.19',28.00),
('b1000022-0000-0000-0000-000000000002','Gaze estéril 7,5x7,5cm (cx200)','clinic_product','insumo','cx',NULL,'Neve','Neve','3005.90.19',26.00),
('b1000022-0000-0000-0000-000000000003','Gaze estéril 7,5x7,5cm (cx200)','clinic_product','insumo','cx',NULL,'Missner','Missner','3005.90.19',27.00),
('b1000023-0000-0000-0000-000000000001','Curativo adesivo estéril (cx100)','clinic_product','insumo','cx',NULL,'3M','3M','3005.90.19',22.00),
('b1000023-0000-0000-0000-000000000002','Curativo adesivo estéril (cx100)','clinic_product','insumo','cx',NULL,'Cremer','Cremer','3005.90.19',20.00),
('b1000023-0000-0000-0000-000000000003','Curativo adesivo estéril (cx100)','clinic_product','insumo','cx',NULL,'Johnson & Johnson','Johnson & Johnson','3005.90.19',24.00),

-- Ataduras
('b1000024-0000-0000-0000-000000000001','Atadura de crepom 10cm x 4,5m','clinic_product','insumo','un',NULL,'Cremer','Cremer','5603.14.00',4.50),
('b1000024-0000-0000-0000-000000000002','Atadura de crepom 10cm x 4,5m','clinic_product','insumo','un',NULL,'Neve','Neve','5603.14.00',4.20),
('b1000024-0000-0000-0000-000000000003','Atadura de crepom 10cm x 4,5m','clinic_product','insumo','un',NULL,'Missner','Missner','5603.14.00',4.30),
('b1000025-0000-0000-0000-000000000001','Atadura de crepom 15cm x 4,5m','clinic_product','insumo','un',NULL,'Cremer','Cremer','5603.14.00',6.50),
('b1000025-0000-0000-0000-000000000002','Atadura de crepom 15cm x 4,5m','clinic_product','insumo','un',NULL,'Neve','Neve','5603.14.00',6.20),
('b1000025-0000-0000-0000-000000000003','Atadura de crepom 15cm x 4,5m','clinic_product','insumo','un',NULL,'Missner','Missner','5603.14.00',6.30),

-- Antissépticos
('b1000026-0000-0000-0000-000000000001','Álcool 70% 1L','clinic_product','insumo','un',NULL,'Farmax','Farmax','3603.00.90',12.00),
('b1000026-0000-0000-0000-000000000002','Álcool 70% 1L','clinic_product','insumo','un',NULL,'Rioquímica','Rioquímica','3603.00.90',11.00),
('b1000026-0000-0000-0000-000000000003','Álcool 70% 1L','clinic_product','insumo','un',NULL,'Eurofarma','Eurofarma','3603.00.90',13.00),
('b1000027-0000-0000-0000-000000000001','Iodopovidona PVPI 10% 1L','clinic_product','insumo','un',NULL,'Rioquímica','Rioquímica','3808.94.30',28.00),
('b1000027-0000-0000-0000-000000000002','Iodopovidona PVPI 10% 1L','clinic_product','insumo','un',NULL,'Farmax','Farmax','3808.94.30',26.00),
('b1000027-0000-0000-0000-000000000003','Iodopovidona PVPI 10% 1L','clinic_product','insumo','un',NULL,'Eurofarma','Eurofarma','3808.94.30',30.00),
('b1000028-0000-0000-0000-000000000001','Clorexidina 2% solução 1L','clinic_product','insumo','un',NULL,'Rioquímica','Rioquímica','3808.94.30',35.00),
('b1000028-0000-0000-0000-000000000002','Clorexidina 2% solução 1L','clinic_product','insumo','un',NULL,'Farmax','Farmax','3808.94.30',32.00),
('b1000028-0000-0000-0000-000000000003','Clorexidina 2% solução 1L','clinic_product','insumo','un',NULL,'Eurofarma','Eurofarma','3808.94.30',38.00),
('b1000029-0000-0000-0000-000000000001','Clorexidina 0,5% 500mL','clinic_product','insumo','un',NULL,'Rioquímica','Rioquímica','3808.94.30',18.00),
('b1000029-0000-0000-0000-000000000002','Clorexidina 0,5% 500mL','clinic_product','insumo','un',NULL,'Farmax','Farmax','3808.94.30',16.00),
('b1000029-0000-0000-0000-000000000003','Clorexidina 0,5% 500mL','clinic_product','insumo','un',NULL,'Eurofarma','Eurofarma','3808.94.30',20.00),

-- Fios cirúrgicos
('b1000030-0000-0000-0000-000000000001','Fio nylon 3-0 agulhado','clinic_product','insumo','un',NULL,'Ethicon','Ethicon','3006.10.10',12.00),
('b1000030-0000-0000-0000-000000000002','Fio nylon 3-0 agulhado','clinic_product','insumo','un',NULL,'Technofio','Technofio','3006.10.10',10.00),
('b1000030-0000-0000-0000-000000000003','Fio nylon 3-0 agulhado','clinic_product','insumo','un',NULL,'Bpsuture','Bpsuture','3006.10.10',11.00),
('b1000031-0000-0000-0000-000000000001','Fio nylon 2-0 agulhado','clinic_product','insumo','un',NULL,'Ethicon','Ethicon','3006.10.10',12.00),
('b1000031-0000-0000-0000-000000000002','Fio nylon 2-0 agulhado','clinic_product','insumo','un',NULL,'Technofio','Technofio','3006.10.10',10.00),
('b1000031-0000-0000-0000-000000000003','Fio nylon 2-0 agulhado','clinic_product','insumo','un',NULL,'Biosyn','Biosyn','3006.10.10',11.00),
('b1000032-0000-0000-0000-000000000001','Fio vicryl 2-0 agulhado','clinic_product','insumo','un',NULL,'Ethicon','Ethicon','3006.10.10',18.00),
('b1000032-0000-0000-0000-000000000002','Fio vicryl 2-0 agulhado','clinic_product','insumo','un',NULL,'Technofio','Technofio','3006.10.10',16.00),
('b1000032-0000-0000-0000-000000000003','Fio vicryl 2-0 agulhado','clinic_product','insumo','un',NULL,'Bpsuture','Bpsuture','3006.10.10',17.00),
('b1000033-0000-0000-0000-000000000001','Fio mononylon 4-0 agulhado','clinic_product','insumo','un',NULL,'Ethicon','Ethicon','3006.10.10',15.00),
('b1000033-0000-0000-0000-000000000002','Fio mononylon 4-0 agulhado','clinic_product','insumo','un',NULL,'Technofio','Technofio','3006.10.10',13.00),
('b1000033-0000-0000-0000-000000000003','Fio mononylon 4-0 agulhado','clinic_product','insumo','un',NULL,'Biosyn','Biosyn','3006.10.10',14.00),

-- EPI descartável
('b1000034-0000-0000-0000-000000000001','Campo cirúrgico descartável','clinic_product','insumo','un',NULL,'Cremer','Cremer','6210.10.00',8.00),
('b1000034-0000-0000-0000-000000000002','Campo cirúrgico descartável','clinic_product','insumo','un',NULL,'Esterilmax','Esterilmax','6210.10.00',7.50),
('b1000034-0000-0000-0000-000000000003','Campo cirúrgico descartável','clinic_product','insumo','un',NULL,'Maquira','Maquira','6210.10.00',8.50),
('b1000035-0000-0000-0000-000000000001','Máscara cirúrgica descartável (cx50)','clinic_product','insumo','cx',NULL,'Cremer','Cremer','6307.90.90',22.00),
('b1000035-0000-0000-0000-000000000002','Máscara cirúrgica descartável (cx50)','clinic_product','insumo','cx',NULL,'Esterilmax','Esterilmax','6307.90.90',20.00),
('b1000035-0000-0000-0000-000000000003','Máscara cirúrgica descartável (cx50)','clinic_product','insumo','cx',NULL,'Neve','Neve','6307.90.90',21.00),
('b1000036-0000-0000-0000-000000000001','Touca descartável (cx50)','clinic_product','insumo','cx',NULL,'Cremer','Cremer','6307.90.90',16.00),
('b1000036-0000-0000-0000-000000000002','Touca descartável (cx50)','clinic_product','insumo','cx',NULL,'Esterilmax','Esterilmax','6307.90.90',15.00),
('b1000036-0000-0000-0000-000000000003','Touca descartável (cx50)','clinic_product','insumo','cx',NULL,'Neve','Neve','6307.90.90',15.50),
('b1000037-0000-0000-0000-000000000001','Propé descartável (cx50 pares)','clinic_product','insumo','cx',NULL,'Cremer','Cremer','6307.90.90',18.00),
('b1000037-0000-0000-0000-000000000002','Propé descartável (cx50 pares)','clinic_product','insumo','cx',NULL,'Esterilmax','Esterilmax','6307.90.90',17.00),
('b1000037-0000-0000-0000-000000000003','Propé descartável (cx50 pares)','clinic_product','insumo','cx',NULL,'Neve','Neve','6307.90.90',17.50),

-- Bisturi / lâminas
('b1000038-0000-0000-0000-000000000001','Bisturi cabo n°3','clinic_product','insumo','un',NULL,'Maquira','Maquira','9018.90.99',18.00),
('b1000038-0000-0000-0000-000000000002','Bisturi cabo n°3','clinic_product','insumo','un',NULL,'Cremer','Cremer','9018.90.99',16.00),
('b1000038-0000-0000-0000-000000000003','Bisturi cabo n°3','clinic_product','insumo','un',NULL,'Medcure','Medcure','9018.90.99',17.00),
('b1000039-0000-0000-0000-000000000001','Lâmina bisturi n°22 (cx100)','clinic_product','insumo','cx',NULL,'Maquira','Maquira','9018.90.99',48.00),
('b1000039-0000-0000-0000-000000000002','Lâmina bisturi n°22 (cx100)','clinic_product','insumo','cx',NULL,'Cremer','Cremer','9018.90.99',45.00),
('b1000039-0000-0000-0000-000000000003','Lâmina bisturi n°22 (cx100)','clinic_product','insumo','cx',NULL,'Medcure','Medcure','9018.90.99',46.00),

-- Equipamentos básicos
('b1000040-0000-0000-0000-000000000001','Termômetro digital veterinário','clinic_product','equipamento','un',NULL,'Incoterm','Incoterm','9025.11.10',28.00),
('b1000040-0000-0000-0000-000000000002','Termômetro digital veterinário','clinic_product','equipamento','un',NULL,'Medcure','Medcure','9025.11.10',32.00),
('b1000040-0000-0000-0000-000000000003','Termômetro digital veterinário','clinic_product','equipamento','un',NULL,'Missner','Missner','9025.11.10',30.00),
('b1000041-0000-0000-0000-000000000001','Estetoscópio pediátrico veterinário','clinic_product','equipamento','un',NULL,'Littmann','Littmann','9018.90.99',180.00),
('b1000041-0000-0000-0000-000000000002','Estetoscópio pediátrico veterinário','clinic_product','equipamento','un',NULL,'Medcure','Medcure','9018.90.99',85.00),
('b1000041-0000-0000-0000-000000000003','Estetoscópio pediátrico veterinário','clinic_product','equipamento','un',NULL,'Missner','Missner','9018.90.99',95.00),
('b1000042-0000-0000-0000-000000000001','Seringa injetora 2,5mL (tipo caneta)','clinic_product','insumo','un',NULL,'BD','BD','9018.31.19',2.80),
('b1000042-0000-0000-0000-000000000002','Seringa injetora 2,5mL (tipo caneta)','clinic_product','insumo','un',NULL,'Descarpack','Descarpack','9018.31.19',2.60),
('b1000042-0000-0000-0000-000000000003','Seringa injetora 2,5mL (tipo caneta)','clinic_product','insumo','un',NULL,'Injetomed','Injetomed','9018.31.19',2.70)

ON CONFLICT (id) DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- 3. HIGIENE E ESTÉTICA ANIMAL / GROOMING  (category = 'grooming_supply')
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO product_catalog_global (id, name, category, subcategory, unit, species, common_brand, brand, ncm, price_avg) VALUES

-- Shampoos com marca explícita (complementar ao 0121 que não tinha brand/ncm)
('c1000001-0000-0000-0000-000000000001','Shampoo neutro cão 500ml — Virbac','grooming_supply','shampoo','fr','{dog,cat}','Virbac','Virbac','3305.10.00',42.00),
('c1000001-0000-0000-0000-000000000002','Shampoo neutro cão 500ml — Heydi','grooming_supply','shampoo','fr','{dog,cat}','Heydi','Heydi','3305.10.00',28.00),
('c1000001-0000-0000-0000-000000000003','Shampoo neutro cão 500ml — Mundo Animal','grooming_supply','shampoo','fr','{dog,cat}','Mundo Animal','Mundo Animal','3305.10.00',24.00),
('c1000002-0000-0000-0000-000000000001','Shampoo antipulgas 500ml — Kodyxene','grooming_supply','shampoo','fr','{dog,cat}','Kodyxene','Kodyxene','3305.10.00',32.00),
('c1000002-0000-0000-0000-000000000002','Shampoo antipulgas 500ml — RealVets','grooming_supply','shampoo','fr','{dog,cat}','RealVets','RealVets','3305.10.00',30.00),
('c1000002-0000-0000-0000-000000000003','Shampoo antipulgas 500ml — Agener União','grooming_supply','shampoo','fr','{dog,cat}','Agener União','Agener União','3305.10.00',28.00),
('c1000003-0000-0000-0000-000000000001','Shampoo hipoalergênico 500ml — Virbac','grooming_supply','shampoo','fr','{dog,cat}','Virbac','Virbac','3305.10.00',48.00),
('c1000003-0000-0000-0000-000000000002','Shampoo hipoalergênico 500ml — Propoline','grooming_supply','shampoo','fr','{dog,cat}','Propoline','Propoline','3305.10.00',35.00),
('c1000003-0000-0000-0000-000000000003','Shampoo hipoalergênico 500ml — Granado Pet','grooming_supply','shampoo','fr','{dog,cat}','Granado Pet','Granado Pet','3305.10.00',32.00),
('c1000004-0000-0000-0000-000000000001','Shampoo clareador pelo branco 500ml — Pet Imperial','grooming_supply','shampoo','fr','{dog,cat}','Pet Imperial','Pet Imperial','3305.10.00',28.00),
('c1000004-0000-0000-0000-000000000002','Shampoo clareador pelo branco 500ml — Heydi','grooming_supply','shampoo','fr','{dog,cat}','Heydi','Heydi','3305.10.00',26.00),
('c1000004-0000-0000-0000-000000000003','Shampoo clareador pelo branco 500ml — Plush Pet','grooming_supply','shampoo','fr','{dog,cat}','Plush Pet','Plush Pet','3305.10.00',24.00),
('c1000005-0000-0000-0000-000000000001','Shampoo para pelo escuro 500ml — Pet Clean','grooming_supply','shampoo','fr','{dog,cat}','Pet Clean','Pet Clean','3305.10.00',26.00),
('c1000005-0000-0000-0000-000000000002','Shampoo para pelo escuro 500ml — Petshamp','grooming_supply','shampoo','fr','{dog,cat}','Petshamp','Petshamp','3305.10.00',24.00),
('c1000005-0000-0000-0000-000000000003','Shampoo para pelo escuro 500ml — Mundo Animal','grooming_supply','shampoo','fr','{dog,cat}','Mundo Animal','Mundo Animal','3305.10.00',22.00),
('c1000006-0000-0000-0000-000000000001','Shampoo 2 em 1 shampoo+condicionador 500ml — Heydi','grooming_supply','shampoo','fr','{dog,cat}','Heydi','Heydi','3305.10.00',30.00),
('c1000006-0000-0000-0000-000000000002','Shampoo 2 em 1 shampoo+condicionador 500ml — Pet Clean','grooming_supply','shampoo','fr','{dog,cat}','Pet Clean','Pet Clean','3305.10.00',28.00),
('c1000006-0000-0000-0000-000000000003','Shampoo 2 em 1 shampoo+condicionador 500ml — Petshamp','grooming_supply','shampoo','fr','{dog,cat}','Petshamp','Petshamp','3305.10.00',26.00),
('c1000007-0000-0000-0000-000000000001','Shampoo a seco spray 200ml — Heydi','grooming_supply','shampoo','fr','{dog,cat}','Heydi','Heydi','3305.10.00',28.00),
('c1000007-0000-0000-0000-000000000002','Shampoo a seco spray 200ml — Pet Clean','grooming_supply','shampoo','fr','{dog,cat}','Pet Clean','Pet Clean','3305.10.00',25.00),
('c1000007-0000-0000-0000-000000000003','Shampoo a seco spray 200ml — Granado Pet','grooming_supply','shampoo','fr','{dog,cat}','Granado Pet','Granado Pet','3305.10.00',22.00),

-- Condicionadores
('c1000008-0000-0000-0000-000000000001','Condicionador hidratante 500ml — Virbac','grooming_supply','condicionador','fr','{dog,cat}','Virbac','Virbac','3305.90.00',38.00),
('c1000008-0000-0000-0000-000000000002','Condicionador hidratante 500ml — Heydi','grooming_supply','condicionador','fr','{dog,cat}','Heydi','Heydi','3305.90.00',28.00),
('c1000008-0000-0000-0000-000000000003','Condicionador hidratante 500ml — Petshamp','grooming_supply','condicionador','fr','{dog,cat}','Petshamp','Petshamp','3305.90.00',24.00),
('c1000009-0000-0000-0000-000000000001','Condicionador leave-in spray 300ml — Heydi','grooming_supply','condicionador','fr','{dog,cat}','Heydi','Heydi','3305.90.00',32.00),
('c1000009-0000-0000-0000-000000000002','Condicionador leave-in spray 300ml — Pet Clean','grooming_supply','condicionador','fr','{dog,cat}','Pet Clean','Pet Clean','3305.90.00',28.00),
('c1000009-0000-0000-0000-000000000003','Condicionador leave-in spray 300ml — Propoline','grooming_supply','condicionador','fr','{dog,cat}','Propoline','Propoline','3305.90.00',30.00),

-- Óleos
('c1000010-0000-0000-0000-000000000001','Óleo de banho hidratante 100ml — Virbac','grooming_supply','oleo','fr','{dog,cat}','Virbac','Virbac','3305.90.00',48.00),
('c1000010-0000-0000-0000-000000000002','Óleo de banho hidratante 100ml — Heydi','grooming_supply','oleo','fr','{dog,cat}','Heydi','Heydi','3305.90.00',32.00),
('c1000010-0000-0000-0000-000000000003','Óleo de banho hidratante 100ml — Petshamp','grooming_supply','oleo','fr','{dog,cat}','Petshamp','Petshamp','3305.90.00',28.00),
('c1000011-0000-0000-0000-000000000001','Óleo de amêndoa para pelo pet 100ml — Granado Pet','grooming_supply','oleo','fr','{dog,cat}','Granado Pet','Granado Pet','3305.90.00',35.00),
('c1000011-0000-0000-0000-000000000002','Óleo de amêndoa para pelo pet 100ml — Heydi','grooming_supply','oleo','fr','{dog,cat}','Heydi','Heydi','3305.90.00',30.00),
('c1000011-0000-0000-0000-000000000003','Óleo de amêndoa para pelo pet 100ml — Petshamp','grooming_supply','oleo','fr','{dog,cat}','Petshamp','Petshamp','3305.90.00',25.00),
('c1000012-0000-0000-0000-000000000001','Sérum brilho e antifrizz 100ml — Heydi','grooming_supply','oleo','fr','{dog,cat}','Heydi','Heydi','3305.90.00',40.00),
('c1000012-0000-0000-0000-000000000002','Sérum brilho e antifrizz 100ml — Pet Clean','grooming_supply','oleo','fr','{dog,cat}','Pet Clean','Pet Clean','3305.90.00',35.00),
('c1000012-0000-0000-0000-000000000003','Sérum brilho e antifrizz 100ml — Propoline','grooming_supply','oleo','fr','{dog,cat}','Propoline','Propoline','3305.90.00',38.00),

-- Perfumes / colônias
('c1000013-0000-0000-0000-000000000001','Perfume/colônia pet 100ml — Heydi','grooming_supply','perfume','fr','{dog,cat}','Heydi','Heydi','3303.00.10',22.00),
('c1000013-0000-0000-0000-000000000002','Perfume/colônia pet 100ml — Pet Imperial','grooming_supply','perfume','fr','{dog,cat}','Pet Imperial','Pet Imperial','3303.00.10',28.00),
('c1000013-0000-0000-0000-000000000003','Perfume/colônia pet 100ml — Farmax Pet','grooming_supply','perfume','fr','{dog,cat}','Farmax Pet','Farmax Pet','3303.00.10',20.00),
('c1000014-0000-0000-0000-000000000001','Body splash pet 250ml — Heydi','grooming_supply','perfume','fr','{dog,cat}','Heydi','Heydi','3307.49.10',18.00),
('c1000014-0000-0000-0000-000000000002','Body splash pet 250ml — Pet Imperial','grooming_supply','perfume','fr','{dog,cat}','Pet Imperial','Pet Imperial','3307.49.10',22.00),
('c1000014-0000-0000-0000-000000000003','Body splash pet 250ml — Granado Pet','grooming_supply','perfume','fr','{dog,cat}','Granado Pet','Granado Pet','3307.49.10',16.00),

-- Talco / desodorante
('c1000015-0000-0000-0000-000000000001','Talco higiênico pet 100g — Granado Pet','grooming_supply','higiene','un','{dog,cat}','Granado Pet','Granado Pet','3307.90.10',12.00),
('c1000015-0000-0000-0000-000000000002','Talco higiênico pet 100g — Heydi','grooming_supply','higiene','un','{dog,cat}','Heydi','Heydi','3307.90.10',10.00),
('c1000015-0000-0000-0000-000000000003','Talco higiênico pet 100g — Farmax Pet','grooming_supply','higiene','un','{dog,cat}','Farmax Pet','Farmax Pet','3307.90.10',11.00),
('c1000016-0000-0000-0000-000000000001','Desodorante spray pet 200ml — Heydi','grooming_supply','higiene','fr','{dog,cat}','Heydi','Heydi','3307.49.10',18.00),
('c1000016-0000-0000-0000-000000000002','Desodorante spray pet 200ml — Pet Imperial','grooming_supply','higiene','fr','{dog,cat}','Pet Imperial','Pet Imperial','3307.49.10',20.00),
('c1000016-0000-0000-0000-000000000003','Desodorante spray pet 200ml — Petshamp','grooming_supply','higiene','fr','{dog,cat}','Petshamp','Petshamp','3307.49.10',16.00),

-- Máscara hidratante
('c1000017-0000-0000-0000-000000000001','Máscara hidratante pelo 300g — Heydi','grooming_supply','condicionador','fr','{dog,cat}','Heydi','Heydi','3305.90.00',45.00),
('c1000017-0000-0000-0000-000000000002','Máscara hidratante pelo 300g — Petshamp','grooming_supply','condicionador','fr','{dog,cat}','Petshamp','Petshamp','3305.90.00',38.00),
('c1000017-0000-0000-0000-000000000003','Máscara hidratante pelo 300g — Propoline','grooming_supply','condicionador','fr','{dog,cat}','Propoline','Propoline','3305.90.00',42.00),

-- Spray anti-embaraço
('c1000018-0000-0000-0000-000000000001','Spray anti-embaraço desembaraçador 200ml — Heydi','grooming_supply','condicionador','fr','{dog,cat}','Heydi','Heydi','3305.90.00',28.00),
('c1000018-0000-0000-0000-000000000002','Spray anti-embaraço desembaraçador 200ml — Pet Clean','grooming_supply','condicionador','fr','{dog,cat}','Pet Clean','Pet Clean','3305.90.00',25.00),
('c1000018-0000-0000-0000-000000000003','Spray anti-embaraço desembaraçador 200ml — Propoline','grooming_supply','condicionador','fr','{dog,cat}','Propoline','Propoline','3305.90.00',30.00),

-- Higiene bucal
('c1000019-0000-0000-0000-000000000001','Removedor de tártaro spray 100ml — Virbac','grooming_supply','higiene_bucal','fr','{dog,cat}','Virbac','Virbac','3306.10.00',38.00),
('c1000019-0000-0000-0000-000000000002','Removedor de tártaro spray 100ml — Granado Pet','grooming_supply','higiene_bucal','fr','{dog,cat}','Granado Pet','Granado Pet','3306.10.00',28.00),
('c1000019-0000-0000-0000-000000000003','Removedor de tártaro spray 100ml — Pet Clean','grooming_supply','higiene_bucal','fr','{dog,cat}','Pet Clean','Pet Clean','3306.10.00',25.00),
('c1000020-0000-0000-0000-000000000001','Creme dental sabor frango 60g — Virbac','grooming_supply','higiene_bucal','un','{dog,cat}','Virbac','Virbac','3306.10.00',22.00),
('c1000020-0000-0000-0000-000000000002','Creme dental sabor frango 60g — Hartz','grooming_supply','higiene_bucal','un','{dog,cat}','Hartz','Hartz','3306.10.00',18.00),
('c1000020-0000-0000-0000-000000000003','Creme dental sabor frango 60g — Granado Pet','grooming_supply','higiene_bucal','un','{dog,cat}','Granado Pet','Granado Pet','3306.10.00',15.00),
('c1000021-0000-0000-0000-000000000001','Escova de dente pet dupla face — Virbac','grooming_supply','higiene_bucal','un','{dog,cat}','Virbac','Virbac','9603.29.00',14.00),
('c1000021-0000-0000-0000-000000000002','Escova de dente pet dupla face — Hartz','grooming_supply','higiene_bucal','un','{dog,cat}','Hartz','Hartz','9603.29.00',10.00),
('c1000021-0000-0000-0000-000000000003','Escova de dente pet dupla face — Granado Pet','grooming_supply','higiene_bucal','un','{dog,cat}','Granado Pet','Granado Pet','9603.29.00',9.00),

-- Pentes e escovas
('c1000022-0000-0000-0000-000000000001','Pente anti-nó aço inox — Oster','grooming_supply','ferramenta_tosa','un','{dog,cat}','Oster','Oster','9603.29.00',38.00),
('c1000022-0000-0000-0000-000000000002','Pente anti-nó aço inox — Andis','grooming_supply','ferramenta_tosa','un','{dog,cat}','Andis','Andis','9603.29.00',32.00),
('c1000022-0000-0000-0000-000000000003','Pente anti-nó aço inox — Wahl','grooming_supply','ferramenta_tosa','un','{dog,cat}','Wahl','Wahl','9603.29.00',28.00),
('c1000023-0000-0000-0000-000000000001','Pente de pulgas aço fino — Oster','grooming_supply','ferramenta_tosa','un','{dog,cat}','Oster','Oster','9603.29.00',16.00),
('c1000023-0000-0000-0000-000000000002','Pente de pulgas aço fino — Andis','grooming_supply','ferramenta_tosa','un','{dog,cat}','Andis','Andis','9603.29.00',14.00),
('c1000023-0000-0000-0000-000000000003','Pente de pulgas aço fino — Wahl','grooming_supply','ferramenta_tosa','un','{dog,cat}','Wahl','Wahl','9603.29.00',12.00),
('c1000024-0000-0000-0000-000000000001','Escova de cerdas naturais — Oster','grooming_supply','ferramenta_tosa','un','{dog,cat}','Oster','Oster','9603.29.00',28.00),
('c1000024-0000-0000-0000-000000000002','Escova de cerdas naturais — Andis','grooming_supply','ferramenta_tosa','un','{dog,cat}','Andis','Andis','9603.29.00',25.00),
('c1000024-0000-0000-0000-000000000003','Escova de cerdas naturais — Wahl','grooming_supply','ferramenta_tosa','un','{dog,cat}','Wahl','Wahl','9603.29.00',22.00),
('c1000025-0000-0000-0000-000000000001','Escova de borracha massagem — Hartz','grooming_supply','ferramenta_tosa','un','{dog,cat}','Hartz','Hartz','9603.29.00',20.00),
('c1000025-0000-0000-0000-000000000002','Escova de borracha massagem — Bissell','grooming_supply','ferramenta_tosa','un','{dog,cat}','Bissell','Bissell','9603.29.00',22.00),
('c1000025-0000-0000-0000-000000000003','Escova de borracha massagem — Wahl','grooming_supply','ferramenta_tosa','un','{dog,cat}','Wahl','Wahl','9603.29.00',18.00),
('c1000026-0000-0000-0000-000000000001','Luva de tosa silicone massagem — Hartz','grooming_supply','ferramenta_tosa','un','{dog,cat}','Hartz','Hartz','9603.29.00',22.00),
('c1000026-0000-0000-0000-000000000002','Luva de tosa silicone massagem — Bissell','grooming_supply','ferramenta_tosa','un','{dog,cat}','Bissell','Bissell','9603.29.00',25.00),
('c1000026-0000-0000-0000-000000000003','Luva de tosa silicone massagem — Wahl','grooming_supply','ferramenta_tosa','un','{dog,cat}','Wahl','Wahl','9603.29.00',20.00),

-- Lima / cortador de unhas
('c1000027-0000-0000-0000-000000000001','Lima de unhas pet elétrica — Andis','grooming_supply','ferramenta_tosa','un','{dog,cat}','Andis','Andis','8214.20.00',42.00),
('c1000027-0000-0000-0000-000000000002','Lima de unhas pet elétrica — Wahl','grooming_supply','ferramenta_tosa','un','{dog,cat}','Wahl','Wahl','8214.20.00',38.00),
('c1000027-0000-0000-0000-000000000003','Lima de unhas pet elétrica — Hartz','grooming_supply','ferramenta_tosa','un','{dog,cat}','Hartz','Hartz','8214.20.00',35.00),
('c1000028-0000-0000-0000-000000000001','Cortador de unhas guilhotina P — Oster','grooming_supply','ferramenta_tosa','un','{dog,cat}','Oster','Oster','8214.20.00',22.00),
('c1000028-0000-0000-0000-000000000002','Cortador de unhas guilhotina P — Andis','grooming_supply','ferramenta_tosa','un','{dog,cat}','Andis','Andis','8214.20.00',25.00),
('c1000028-0000-0000-0000-000000000003','Cortador de unhas guilhotina P — Wahl','grooming_supply','ferramenta_tosa','un','{dog,cat}','Wahl','Wahl','8214.20.00',20.00),

-- Tesoura grooming arredondada
('c1000029-0000-0000-0000-000000000001','Tesoura grooming ponta arredondada 5pol — Oster','grooming_supply','ferramenta_tosa','un','{dog,cat}','Oster','Oster','8213.00.00',68.00),
('c1000029-0000-0000-0000-000000000002','Tesoura grooming ponta arredondada 5pol — Andis','grooming_supply','ferramenta_tosa','un','{dog,cat}','Andis','Andis','8213.00.00',75.00),
('c1000029-0000-0000-0000-000000000003','Tesoura grooming ponta arredondada 5pol — Wahl','grooming_supply','ferramenta_tosa','un','{dog,cat}','Wahl','Wahl','8213.00.00',55.00),

-- Máquinas de tosa
('c1000030-0000-0000-0000-000000000001','Máquina de tosa profissional 220V — Oster','grooming_supply','ferramenta_tosa','un','{dog,cat}','Oster','Oster','8214.90.90',380.00),
('c1000030-0000-0000-0000-000000000002','Máquina de tosa profissional 220V — Andis','grooming_supply','ferramenta_tosa','un','{dog,cat}','Andis','Andis','8214.90.90',520.00),
('c1000030-0000-0000-0000-000000000003','Máquina de tosa profissional 220V — Wahl','grooming_supply','ferramenta_tosa','un','{dog,cat}','Wahl','Wahl','8214.90.90',420.00),

-- Lâmina máquina tosa
('c1000031-0000-0000-0000-000000000001','Lâmina máquina tosa 7F 3mm — Oster','grooming_supply','ferramenta_tosa','un','{dog,cat}','Oster','Oster','8214.90.90',85.00),
('c1000031-0000-0000-0000-000000000002','Lâmina máquina tosa 7F 3mm — Andis','grooming_supply','ferramenta_tosa','un','{dog,cat}','Andis','Andis','8214.90.90',95.00),
('c1000031-0000-0000-0000-000000000003','Lâmina máquina tosa 7F 3mm — Wahl','grooming_supply','ferramenta_tosa','un','{dog,cat}','Wahl','Wahl','8214.90.90',78.00),
('c1000032-0000-0000-0000-000000000001','Lâmina máquina tosa 10 1,6mm — Oster','grooming_supply','ferramenta_tosa','un','{dog,cat}','Oster','Oster','8214.90.90',90.00),
('c1000032-0000-0000-0000-000000000002','Lâmina máquina tosa 10 1,6mm — Andis','grooming_supply','ferramenta_tosa','un','{dog,cat}','Andis','Andis','8214.90.90',98.00),
('c1000032-0000-0000-0000-000000000003','Lâmina máquina tosa 30 0,5mm — Wahl','grooming_supply','ferramenta_tosa','un','{dog,cat}','Wahl','Wahl','8214.90.90',102.00),

-- Depilatório ouvido / cera protetora / pomada
('c1000033-0000-0000-0000-000000000001','Depilatório pó ouvido pet 30g — Hartz','grooming_supply','higiene','un','{dog,cat}','Hartz','Hartz','3307.90.00',18.00),
('c1000033-0000-0000-0000-000000000002','Depilatório pó ouvido pet 30g — Pet Clean','grooming_supply','higiene','un','{dog,cat}','Pet Clean','Pet Clean','3307.90.00',15.00),
('c1000033-0000-0000-0000-000000000003','Depilatório pó ouvido pet 30g — Granado Pet','grooming_supply','higiene','un','{dog,cat}','Granado Pet','Granado Pet','3307.90.00',16.00),
('c1000034-0000-0000-0000-000000000001','Cera protetora coxins pet 50g — Hartz','grooming_supply','higiene','un','{dog,cat}','Hartz','Hartz','3304.99.90',22.00),
('c1000034-0000-0000-0000-000000000002','Cera protetora coxins pet 50g — Granado Pet','grooming_supply','higiene','un','{dog,cat}','Granado Pet','Granado Pet','3304.99.90',20.00),
('c1000034-0000-0000-0000-000000000003','Cera protetora coxins pet 50g — Petshamp','grooming_supply','higiene','un','{dog,cat}','Petshamp','Petshamp','3304.99.90',18.00),
('c1000035-0000-0000-0000-000000000001','Pomada protetora coxins pet 50g — Hartz','grooming_supply','higiene','un','{dog,cat}','Hartz','Hartz','3304.99.90',20.00),
('c1000035-0000-0000-0000-000000000002','Pomada protetora coxins pet 50g — Granado Pet','grooming_supply','higiene','un','{dog,cat}','Granado Pet','Granado Pet','3304.99.90',18.00),
('c1000035-0000-0000-0000-000000000003','Pomada protetora coxins pet 50g — Virbac','grooming_supply','higiene','un','{dog,cat}','Virbac','Virbac','3304.99.90',28.00),

-- Cotonete / lenço / spray repelente / sabonete
('c1000036-0000-0000-0000-000000000001','Cotonete pet (cx75) — Granado Pet','grooming_supply','higiene','cx','{dog,cat}','Granado Pet','Granado Pet','3307.90.00',8.00),
('c1000036-0000-0000-0000-000000000002','Cotonete pet (cx75) — Hartz','grooming_supply','higiene','cx','{dog,cat}','Hartz','Hartz','3307.90.00',7.00),
('c1000036-0000-0000-0000-000000000003','Cotonete pet (cx75) — Pet Clean','grooming_supply','higiene','cx','{dog,cat}','Pet Clean','Pet Clean','3307.90.00',7.50),
('c1000037-0000-0000-0000-000000000001','Lenço umedecido higiênico pet (cx100) — Hartz','grooming_supply','higiene','cx','{dog,cat}','Hartz','Hartz','3307.90.00',22.00),
('c1000037-0000-0000-0000-000000000002','Lenço umedecido higiênico pet (cx100) — Granado Pet','grooming_supply','higiene','cx','{dog,cat}','Granado Pet','Granado Pet','3307.90.00',20.00),
('c1000037-0000-0000-0000-000000000003','Lenço umedecido higiênico pet (cx100) — Pet Clean','grooming_supply','higiene','cx','{dog,cat}','Pet Clean','Pet Clean','3307.90.00',18.00),
('c1000038-0000-0000-0000-000000000001','Spray repelente natural pet 200ml — Kodyxene','grooming_supply','higiene','fr','{dog,cat}','Kodyxene','Kodyxene','3808.91.10',28.00),
('c1000038-0000-0000-0000-000000000002','Spray repelente natural pet 200ml — Agener União','grooming_supply','higiene','fr','{dog,cat}','Agener União','Agener União','3808.91.10',24.00),
('c1000038-0000-0000-0000-000000000003','Spray repelente natural pet 200ml — RealVets','grooming_supply','higiene','fr','{dog,cat}','RealVets','RealVets','3808.91.10',26.00),
('c1000039-0000-0000-0000-000000000001','Sabonete antibacteriano pet 90g — Granado Pet','grooming_supply','higiene','un','{dog,cat}','Granado Pet','Granado Pet','3401.11.90',12.00),
('c1000039-0000-0000-0000-000000000002','Sabonete antibacteriano pet 90g — Iodovet','grooming_supply','higiene','un','{dog,cat}','Iodovet','Iodovet','3401.11.90',14.00),
('c1000039-0000-0000-0000-000000000003','Sabonete antibacteriano pet 90g — Virbac','grooming_supply','higiene','un','{dog,cat}','Virbac','Virbac','3401.11.90',18.00)

ON CONFLICT (id) DO NOTHING;
