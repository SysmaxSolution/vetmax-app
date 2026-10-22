-- 0436: 1.11 — comissão da clínica parceira/laboratório por serviço/produto/pacote,
-- em % OU valor fixo (substitui a matriz só-exame 0435). Fonte dos itens =
-- stock_items (produto/serviço) + catalog_packages (pacote), igual à comissão de
-- usuário. Aditiva.
DROP TABLE IF EXISTS partner_clinic_exam_costs;
CREATE TABLE IF NOT EXISTS partner_clinic_commissions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id         uuid NOT NULL,
  partner_clinic_id uuid NOT NULL REFERENCES partner_clinics(id) ON DELETE CASCADE,
  item_type         text NOT NULL,   -- 'all' | 'product' | 'service' | 'package'
  item_id           uuid,            -- null para 'all'
  item_name         text,
  commission_type   text NOT NULL,   -- 'percent' | 'fixed'
  value             numeric NOT NULL DEFAULT 0,
  is_active         boolean NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pcc_type_chk  CHECK (commission_type IN ('percent','fixed')),
  CONSTRAINT pcc_scope_chk CHECK (item_type IN ('all','product','service','package'))
);
CREATE INDEX IF NOT EXISTS idx_pcc_partner ON partner_clinic_commissions(partner_clinic_id);
CREATE UNIQUE INDEX IF NOT EXISTS uidx_pcc_item ON partner_clinic_commissions(partner_clinic_id, item_id) WHERE item_id IS NOT NULL;
