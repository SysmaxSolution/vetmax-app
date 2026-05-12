-- Migration: add ui_preferences column to profiles
-- Stores per-user appearance settings (intensity, custom background color)

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS ui_preferences JSONB
  NOT NULL DEFAULT '{"intensity":"normal","custom_bg":null}'::jsonb;
