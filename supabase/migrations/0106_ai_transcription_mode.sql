-- Comportamento da IA nas gravações de áudio (configurável por clínica)
ALTER TABLE clinics
  ADD COLUMN IF NOT EXISTS ai_transcription_mode TEXT DEFAULT 'ai_assisted'
    CHECK (ai_transcription_mode IN ('transcribe_only', 'ai_assisted'));
