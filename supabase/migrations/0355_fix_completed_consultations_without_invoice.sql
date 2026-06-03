-- Fix: cria faturas pendentes para consultas 'completed' sem invoice (limbo pós-internação)
WITH orphans AS (
  SELECT c.id AS consultation_id, c.clinic_id, c.patient_id, p.tutor_id
  FROM consultations c
  JOIN patients p ON p.id = c.patient_id
  LEFT JOIN invoices i ON i.consultation_id = c.id
  WHERE c.status = 'completed' AND i.id IS NULL
),
inserted AS (
  INSERT INTO invoices (clinic_id, consultation_id, patient_id, tutor_id,
                        subtotal, discount, total_amount, status)
  SELECT clinic_id, consultation_id, patient_id, tutor_id, 0, 0, 0, 'pending'
  FROM orphans
  RETURNING id
)
INSERT INTO invoice_items (invoice_id, item_type, description, quantity, unit_price, total_price)
SELECT id, 'consultation', 'Consulta Veterinária (internação)', 1, 0, 0
FROM inserted;
