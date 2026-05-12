-- G-04: rastreabilidade de admission_reason preenchido por transcrição de voz
ALTER TABLE hospitalizations
  ADD COLUMN IF NOT EXISTS admission_reason_from_transcription BOOLEAN DEFAULT false;
