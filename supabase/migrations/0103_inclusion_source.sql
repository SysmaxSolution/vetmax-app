-- C-02 / E-02: rastrear origem de inclusão direta no consultório
ALTER TABLE consultations
  ADD COLUMN IF NOT EXISTS inclusion_source TEXT
    CHECK (inclusion_source IN ('direct_inclusion', 'reception_checkin', 'triage_referral'));
