-- Seed: Vacinas mais comuns em clínicas veterinárias (~100 itens)
INSERT INTO product_catalog_global (name, category, subcategory, unit, description, common_brand, species) VALUES

-- ═══════════════════════════════════════════════════════════
-- VACINAS PARA CÃES
-- ═══════════════════════════════════════════════════════════
('Vacina Antirrábica inativada cão 1ml','vaccine','raiva','fr','Raiva. Dose única IM/SC. Reforço anual.',NULL,'{dog}'),
('Vacina V8 (Distemper+Parvo+Adeno+Para+Lepto 4)','vaccine','polivalente','fr','Cães — 8 valências. Reforço anual.','Nobivac DHPPi+L','{dog}'),
('Vacina V10 (8v + Lepto 2 sorotipos adicionais)','vaccine','polivalente','fr','Cães — 10 valências. Máxima cobertura.','Vanguard Plus 10','{dog}'),
('Vacina V5 (Distemper+Parvo+Adeno+Para)','vaccine','polivalente','fr','Cães sem leptospirose. Filhotes em protocolos especiais.',NULL,'{dog}'),
('Vacina Múltipla canina D+P+A2+Ci 4ml','vaccine','polivalente','fr','Tetravalente canina.',NULL,'{dog}'),
('Vacina contra Leptospirose bivalente','vaccine','leptospirose','fr','Leptospira canicola + icterohaemorrhagiae.',NULL,'{dog}'),
('Vacina contra Leptospirose tetravalente','vaccine','leptospirose','fr','4 sorotipos. Maior cobertura.',NULL,'{dog}'),
('Vacina contra Coronavírus canino','vaccine','coronavirus','fr','Coronavírus entérico canino. Filhotes.',NULL,'{dog}'),
('Vacina contra Bordetella bronchiseptica intranasal','vaccine','bordetella','fr','Tosse dos canis. Intrabucal + intranasal.',NULL,'{dog}'),
('Vacina contra Bordetella + Parainfluenza SC','vaccine','bordetella','fr','Combinada. SC.',NULL,'{dog}'),
('Vacina contra Giardia','vaccine','giardia','fr','Giardia duodenalis. 2 doses IM + reforço anual.',NULL,'{dog}'),
('Vacina contra Leishmaniose Leishmune','vaccine','leishmaniose','fr','Leishmania donovani. 3 doses IM.','Leishmune','{dog}'),
('Vacina contra Leishmaniose Leish-Tec','vaccine','leishmaniose','fr','Vacina recombinante. 3 doses SC.','Leish-Tec','{dog}'),
('Vacina contra Leishmaniose CaniLeish','vaccine','leishmaniose','fr','Excreto-secretado. 3 doses SC.','CaniLeish','{dog}'),
('Vacina anti-raiva oral cão (campo)','vaccine','raiva','fr','Administração via isca oral. Uso em campo.',NULL,'{dog}'),
('Vacina polivalente cão V8 + Raiva combo','vaccine','combo','fr','V8 associada à raiva inativada. Protocolo simplificado.',NULL,'{dog}'),
('Vacina contra Erliquiose (experimental)','vaccine','erliquiose','fr','Em fase avançada no Brasil.',NULL,'{dog}'),
('Vacina Canina filhote V8 1ª dose','vaccine','polivalente','fr','1ª dose do protocolo neonatal (6 semanas).',NULL,'{dog}'),
('Vacina Canina filhote V8 2ª dose','vaccine','polivalente','fr','2ª dose (10 semanas).',NULL,'{dog}'),
('Vacina Canina filhote V8 3ª dose + raiva','vaccine','polivalente','fr','3ª dose + antirrábica (14 semanas).',NULL,'{dog}'),
('Vacina Canina filhote V10 protocolo especial','vaccine','polivalente','fr','Para raças de risco (Rottweiler, Pit Bull).',NULL,'{dog}'),
('Vacina Canine Parvovirus monovalente','vaccine','parvovirus','fr','Parvovirose isolada. Alta titulagem.',NULL,'{dog}'),
('Vacina Adenovírus tipo 2 (hepatite)','vaccine','hepatite','fr','Hepatite infecciosa canina.',NULL,'{dog}'),
('Vacina contra Distemper (Cinomose) monovalente','vaccine','cinomose','fr','Cinomose. Para reforço específico.',NULL,'{dog}'),
('Vacina Leptospirose + Coronavírus bivalente','vaccine','combo','fr','Protocolo combinado enteroproprotegido.',NULL,'{dog}'),
('Vacina Polivalente importada V7','vaccine','polivalente','fr','DHPP + Lepto + Para. Importada.',NULL,'{dog}'),

-- ═══════════════════════════════════════════════════════════
-- VACINAS PARA GATOS
-- ═══════════════════════════════════════════════════════════
('Vacina Tríplice felina V3 (HCPi)','vaccine','polivalente','fr','Herpes + Calicivírus + Panleucopenia.','Purevax','{cat}'),
('Vacina Tríplice felina V3 + Clamídia (V4)','vaccine','polivalente','fr','Quadrivalente felina.',NULL,'{cat}'),
('Vacina Antirrábica felina inativada 1ml','vaccine','raiva','fr','Raiva. Anual.',NULL,'{cat}'),
('Vacina Leucemia Felina FeLV recombinante','vaccine','felv','fr','Leucemia viral felina. 2 doses SC.','Purevax FeLV','{cat}'),
('Vacina Leucemia Felina FeLV adjuvada','vaccine','felv','fr','FeLV. Anual.',NULL,'{cat}'),
('Vacina Panleucopenia felina monovalente','vaccine','panleucopenia','fr','Panleucopenia. Dose única de reforço.',NULL,'{cat}'),
('Vacina Herpesvírus felino HVF-1 intranasal','vaccine','herpes','fr','Herpesvírus 1. Intranasal.',NULL,'{cat}'),
('Vacina Calicivírus felino monovalente','vaccine','calicivirus','fr','Calicivírus. Para surtos em gatérios.',NULL,'{cat}'),
('Vacina Tríplice felina + Raiva combo (V4R)','vaccine','combo','fr','Protocolo anual simplificado.',NULL,'{cat}'),
('Vacina Clamídia monovalente felina','vaccine','clamidia','fr','Chlamydophila felis. Conjuntivite gatérios.',NULL,'{cat}'),
('Vacina Tríplice felina filhote 1ª dose','vaccine','polivalente','fr','Protocolo filhotes (8 semanas).',NULL,'{cat}'),
('Vacina Tríplice felina filhote 2ª dose','vaccine','polivalente','fr','12 semanas.',NULL,'{cat}'),
('Vacina Tríplice felina filhote 3ª dose + FeLV + raiva','vaccine','combo','fr','16 semanas. Protocolo completo.',NULL,'{cat}'),
('Vacina Panleucopenia + Herpes + Calici + FeLV (V4)','vaccine','polivalente','fr','Mais proteção em 1 dose.',NULL,'{cat}'),
('Vacina FIV (AIDS felina — uso veterinário)','vaccine','fiv','fr','Imunodeficiência felina. 3 doses IM.','Fel-O-Guard FIV','{cat}'),
('Vacina Peritonite Infecciosa Felina (PIF) oral','vaccine','pif','fr','Coronavírus felino. Intranasal.',NULL,'{cat}'),
('Vacina Bordetella felina intranasal','vaccine','bordetella','fr','Tosse dos gatérios.',NULL,'{cat}'),
('Vacina antirrábica felina recombinante','vaccine','raiva','fr','Recombinante. Sem adjuvante.',NULL,'{cat}'),

-- ═══════════════════════════════════════════════════════════
-- VACINAS PARA COELHOS
-- ═══════════════════════════════════════════════════════════
('Vacina Mixomatose + VHD coelho','vaccine','exotico','fr','Mixomatose + doença hemorrágica viral.','Nobivac Myxo-RHD','{rabbit}'),
('Vacina VHD2 coelho (variante RHDV2)','vaccine','exotico','fr','Variante 2 da doença hemorrágica viral.',NULL,'{rabbit}'),
('Vacina Mixomatose coelho monovalente','vaccine','exotico','fr','Mixomatose. Anual.',NULL,'{rabbit}'),

-- ═══════════════════════════════════════════════════════════
-- VACINAS PARA AVES E OUTROS
-- ═══════════════════════════════════════════════════════════
('Vacina Polyomavirus Psittacídeos','vaccine','exotico','fr','Poliomavírus em periquitos e araras.',NULL,'{bird}'),
('Vacina Newcastle aves domésticas','vaccine','exotico','fr','Doença de Newcastle.',NULL,'{bird}'),
('Vacina Influenza Aviária H5N1','vaccine','exotico','fr','Gripe aviária. Uso em aves de coleção.',NULL,'{bird}'),
('Vacina Marek aves ornamentais','vaccine','exotico','fr','Doença de Marek. Galinhas e faisões.',NULL,'{bird}'),

-- ═══════════════════════════════════════════════════════════
-- VACINAS PARA RÉPTEIS E ANFÍBIOS (raras, mas existem)
-- ═══════════════════════════════════════════════════════════
('Vacina contra Septicemia hemorrágica répteis','vaccine','exotico','fr','Aeromonas. Répteis aquáticos.',NULL,'{others}'),

-- ═══════════════════════════════════════════════════════════
-- VACINAS PARA ANIMAIS DE PRODUÇÃO (atendimentos rurais)
-- ═══════════════════════════════════════════════════════════
('Vacina Antiaftosa bovina','vaccine','producao','fr','Febre aftosa. Obrigatória em muitos estados.',NULL,'{others}'),
('Vacina Brucelose B19 bovina','vaccine','producao','fr','Brucelose. Bezerras 3-8 meses. Notificação obrigatória.',NULL,'{others}'),
('Vacina Raiva bovina','vaccine','producao','fr','Raiva herbívoros. Regiões de risco.',NULL,'{others}'),
('Vacina Clostridial bovinos 9 valências','vaccine','producao','fr','Carbúnculo, gangrena, tétano e botulismo.',NULL,'{others}'),
('Vacina Leptospirose bovina 6 sorotipos','vaccine','producao','fr','Leptospirose bovina gestante.',NULL,'{others}'),
('Vacina IBR+DVB+PI3+BRSV bovina','vaccine','producao','fr','Respiratória bovina polivalente.',NULL,'{others}'),
('Vacina Cinomose canino rural','vaccine','cinomose','fr','Uso em propriedades rurais.',NULL,'{dog}'),
('Vacina Parvovirose canino rural','vaccine','parvovirus','fr','Uso em canis e propriedades.',NULL,'{dog}'),
('Vacina Raiva equídeos','vaccine','producao','fr','Cavalos, éguas e muares.',NULL,'{others}'),
('Vacina Tétano equídeos','vaccine','producao','fr','Clostridium tetani. Reforço anual.',NULL,'{others}'),
('Vacina Encefalomielite equina leste/oeste','vaccine','producao','fr','EEE + WEE. Équidos.',NULL,'{others}'),
('Vacina Gripe equina H3N8','vaccine','producao','fr','Influenza equina.',NULL,'{others}'),
('Vacina Herpesvírus equino EHV1+4','vaccine','producao','fr','Rinotraqueíte + aborto. Éguas gestantes.',NULL,'{others}'),
('Vacina Antraz (Carbúnculo hemático) bovino','vaccine','producao','fr','Bacillus anthracis. Áreas de risco.',NULL,'{others}'),

-- ═══════════════════════════════════════════════════════════
-- INSUMOS RELACIONADOS A VACINAÇÃO
-- ═══════════════════════════════════════════════════════════
('Diluente para vacinas liofilizadas 1ml','clinic_product','vacina_insumo','amp','Diluição de vacinas liofilizadas.',NULL,NULL),
('Diluente para vacinas liofilizadas 5ml','clinic_product','vacina_insumo','amp','Volume padrão.',NULL,NULL),
('Agulha para vacinas 25x8mm','clinic_product','vacina_insumo','un','SC e IM em cães e gatos.',NULL,NULL),
('Caderneta de vacinação pet','clinic_product','vacina_insumo','un','Registro oficial das vacinas.',NULL,NULL),
('Caixa de descarte para seringas (13L)','clinic_product','vacina_insumo','un','Descarte correto de perfurocortantes.',NULL,NULL),
('Termômetro digital de geladeira de vacinas','clinic_product','vacina_insumo','un','Controle de temperatura (2-8°C).',NULL,NULL),
('Isopor caixa transporte de vacinas','clinic_product','vacina_insumo','un','Transporte com gelo.',NULL,NULL),
('Gelo reutilizável para transporte','clinic_product','vacina_insumo','un','Mantém temperatura durante transporte.',NULL,NULL);
