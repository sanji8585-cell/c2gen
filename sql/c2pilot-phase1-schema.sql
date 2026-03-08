-- ============================================================
-- C2 PILOT Phase 1: 채널 + 브랜드 프리셋 + 캐릭터 레퍼런스
-- 실행: Supabase SQL Editor에서 실행
-- ============================================================

-- 1) 채널 워크스페이스
CREATE TABLE IF NOT EXISTS c2gen_channels (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_email TEXT NOT NULL REFERENCES c2gen_users(email) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  assigned_operators TEXT[] DEFAULT '{}',
  brand_preset_id UUID,
  platform_accounts JSONB DEFAULT '{}',
  settings JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2) 브랜드 프리셋
CREATE TABLE IF NOT EXISTS c2gen_brand_presets (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_email TEXT NOT NULL REFERENCES c2gen_users(email) ON DELETE CASCADE,
  channel_id UUID,
  name TEXT NOT NULL,
  description TEXT,
  world_view TEXT,
  target_audience TEXT,
  tone_voice JSONB DEFAULT '{}',
  tone_reference_texts TEXT[] DEFAULT '{}',
  tone_learned_patterns JSONB,
  art_style JSONB DEFAULT '{}',
  style_preview_images TEXT[] DEFAULT '{}',
  character_profiles JSONB DEFAULT '[]',
  bgm_preferences JSONB DEFAULT '{}',
  seed_values JSONB,
  negative_prompts TEXT[] DEFAULT '{}',
  platform_configs JSONB DEFAULT '{}',
  wizard_step INTEGER DEFAULT 1,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3) 캐릭터 레퍼런스
CREATE TABLE IF NOT EXISTS c2gen_character_references (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  brand_preset_id UUID NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('mascot', 'photo', 'sketch')),
  char_role TEXT DEFAULT 'main' CHECK (char_role IN ('main', 'supporting', 'extra')),
  species TEXT,
  personality TEXT,
  appearance_description TEXT,
  distinction_tags TEXT[] DEFAULT '{}',
  speech_style TEXT,
  voice_id TEXT,
  original_upload_url TEXT,
  reference_sheet JSONB DEFAULT '{}',
  style_analysis JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- FK 추가
ALTER TABLE c2gen_channels
  ADD CONSTRAINT fk_channels_brand_preset
  FOREIGN KEY (brand_preset_id) REFERENCES c2gen_brand_presets(id) ON DELETE SET NULL;

ALTER TABLE c2gen_brand_presets
  ADD CONSTRAINT fk_brand_presets_channel
  FOREIGN KEY (channel_id) REFERENCES c2gen_channels(id) ON DELETE SET NULL;

ALTER TABLE c2gen_character_references
  ADD CONSTRAINT fk_char_refs_preset
  FOREIGN KEY (brand_preset_id) REFERENCES c2gen_brand_presets(id) ON DELETE CASCADE;

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_channels_owner ON c2gen_channels(owner_email);
CREATE INDEX IF NOT EXISTS idx_brand_presets_owner ON c2gen_brand_presets(owner_email);
CREATE INDEX IF NOT EXISTS idx_brand_presets_channel ON c2gen_brand_presets(channel_id);
CREATE INDEX IF NOT EXISTS idx_char_refs_preset ON c2gen_character_references(brand_preset_id);
