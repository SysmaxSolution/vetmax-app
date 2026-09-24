-- 0435: 1.11 F1 — matriz de CUSTO por laboratório parceiro × exame do catálogo.
-- O valor a pagar a cada lab por exame. clinic_catalog.item_type='exam' = catálogo
-- de exames (preço ao tutor no clinic_catalog.price; custo aqui). Aditiva.
CREATE TABLE IF NOT EXISTS partner_clinic_exam_costs (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id         uuid NOT NULL,
  partner_clinic_id uuid NOT NULL REFERENCES partner_clinics(id) ON DELETE CASCADE,
  catalog_item_id   uuid NOT NULL REFERENCES clinic_catalog(id) ON DELETE CASCADE,
  cost              numeric NOT NULL DEFAULT 0,
  is_active         boolean NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (partner_clinic_id, catalog_item_id)
);
CREATE INDEX IF NOT EXISTS idx_pcec_partner ON partner_clinic_exam_costs(partner_clinic_id);
CREATE INDEX IF NOT EXISTS idx_pcec_clinic  ON partner_clinic_exam_costs(clinic_id);
