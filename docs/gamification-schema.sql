-- ============================================================
-- C2 GEN RPG Gamification System - Database Schema
-- Supabase SQL Editor에서 실행
-- ============================================================

-- 1. 동적 설정 Key-Value 저장소
CREATE TABLE IF NOT EXISTS c2gen_game_config (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  description TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by TEXT
);

-- 2. 업적 정의
CREATE TABLE IF NOT EXISTS c2gen_achievements (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  icon TEXT NOT NULL DEFAULT '🏆',
  category TEXT NOT NULL DEFAULT 'creation',
  condition_type TEXT NOT NULL,
  condition_target INTEGER NOT NULL,
  reward_xp INTEGER DEFAULT 0,
  reward_credits INTEGER DEFAULT 0,
  reward_title TEXT,
  reward_badge TEXT,
  reward_gacha_tickets INTEGER DEFAULT 0,
  is_hidden BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. 유저별 업적 진행
CREATE TABLE IF NOT EXISTS c2gen_user_achievements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  achievement_id TEXT NOT NULL REFERENCES c2gen_achievements(id) ON DELETE CASCADE,
  progress INTEGER DEFAULT 0,
  unlocked BOOLEAN DEFAULT false,
  unlocked_at TIMESTAMPTZ,
  notified BOOLEAN DEFAULT false,
  UNIQUE(email, achievement_id)
);
CREATE INDEX IF NOT EXISTS idx_user_achievements_email ON c2gen_user_achievements(email);

-- 4. 일일 퀘스트 풀
CREATE TABLE IF NOT EXISTS c2gen_quest_pool (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  icon TEXT DEFAULT '📋',
  quest_type TEXT NOT NULL,
  target INTEGER NOT NULL,
  reward_xp INTEGER DEFAULT 10,
  reward_credits INTEGER DEFAULT 5,
  min_level INTEGER DEFAULT 1,
  max_level INTEGER,
  weight INTEGER DEFAULT 10,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. 유저별 일일 퀘스트
CREATE TABLE IF NOT EXISTS c2gen_user_quests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  quest_id TEXT NOT NULL REFERENCES c2gen_quest_pool(id) ON DELETE CASCADE,
  assigned_date DATE DEFAULT CURRENT_DATE,
  progress INTEGER DEFAULT 0,
  completed BOOLEAN DEFAULT false,
  completed_at TIMESTAMPTZ,
  reward_claimed BOOLEAN DEFAULT false,
  UNIQUE(email, quest_id, assigned_date)
);
CREATE INDEX IF NOT EXISTS idx_user_quests_email_date ON c2gen_user_quests(email, assigned_date);

-- 6. 뽑기 아이템 풀
CREATE TABLE IF NOT EXISTS c2gen_gacha_pool (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  item_type TEXT NOT NULL,
  rarity TEXT DEFAULT 'common',
  emoji TEXT DEFAULT '🎁',
  effect_value JSONB,
  is_active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. 유저 인벤토리
CREATE TABLE IF NOT EXISTS c2gen_user_inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  item_id TEXT NOT NULL REFERENCES c2gen_gacha_pool(id) ON DELETE CASCADE,
  quantity INTEGER DEFAULT 1,
  obtained_at TIMESTAMPTZ DEFAULT NOW(),
  obtained_via TEXT DEFAULT 'gacha',
  is_active BOOLEAN DEFAULT false,
  active_until TIMESTAMPTZ,
  is_equipped BOOLEAN DEFAULT false
);
CREATE INDEX IF NOT EXISTS idx_inventory_email ON c2gen_user_inventory(email);

-- 8. 장착 정보
CREATE TABLE IF NOT EXISTS c2gen_user_equipped (
  email TEXT PRIMARY KEY,
  equipped_title TEXT,
  equipped_badges JSONB DEFAULT '[]',
  equipped_frame TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 9. 리더보드 스냅샷
CREATE TABLE IF NOT EXISTS c2gen_leaderboard_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period_type TEXT NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  category TEXT NOT NULL,
  rankings JSONB NOT NULL,
  rewards_distributed BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_leaderboard_period ON c2gen_leaderboard_snapshots(period_type, period_start);

-- 10. 이벤트
CREATE TABLE IF NOT EXISTS c2gen_events (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  icon TEXT DEFAULT '🎪',
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ NOT NULL,
  xp_multiplier NUMERIC DEFAULT 1.0,
  drop_rate_multiplier NUMERIC DEFAULT 1.0,
  special_gacha_items JSONB DEFAULT '[]',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 11. c2gen_users 확장 칼럼
ALTER TABLE c2gen_users ADD COLUMN IF NOT EXISTS prestige_level INTEGER DEFAULT 0;
ALTER TABLE c2gen_users ADD COLUMN IF NOT EXISTS prestige_xp_bonus NUMERIC DEFAULT 0;
ALTER TABLE c2gen_users ADD COLUMN IF NOT EXISTS gacha_pity_epic INTEGER DEFAULT 0;
ALTER TABLE c2gen_users ADD COLUMN IF NOT EXISTS gacha_pity_legendary INTEGER DEFAULT 0;
ALTER TABLE c2gen_users ADD COLUMN IF NOT EXISTS total_images INTEGER DEFAULT 0;
ALTER TABLE c2gen_users ADD COLUMN IF NOT EXISTS total_audio INTEGER DEFAULT 0;
ALTER TABLE c2gen_users ADD COLUMN IF NOT EXISTS total_videos INTEGER DEFAULT 0;
ALTER TABLE c2gen_users ADD COLUMN IF NOT EXISTS total_gacha_pulls INTEGER DEFAULT 0;
ALTER TABLE c2gen_users ADD COLUMN IF NOT EXISTS max_combo INTEGER DEFAULT 0;
ALTER TABLE c2gen_users ADD COLUMN IF NOT EXISTS login_days INTEGER DEFAULT 0;
ALTER TABLE c2gen_users ADD COLUMN IF NOT EXISTS gacha_tickets INTEGER DEFAULT 0;
ALTER TABLE c2gen_users ADD COLUMN IF NOT EXISTS sound_enabled BOOLEAN DEFAULT false;

-- ============================================================
-- SEED DATA
-- ============================================================

-- 게임 설정
INSERT INTO c2gen_game_config (key, value, description) VALUES
('levels', '{
  "thresholds": [0,50,120,200,350,500,750,1000,1500,2500,3500,5000,7000,9500,12500,16000,20000,25000,31000,38000,46000,55000,65000,76000,88000,101000,115000,130000,150000,175000],
  "titles": ["초보 크리에이터","아이디어 탐험가","스토리 위버","아이디어 뱅크","비주얼 아키텍트","영감의 마법사","AI 파트너","마스터 크리에이터","레전드 프로듀서","다이아몬드 아티스트","플래티넘 디렉터","전설의 아키텍트","신화의 스토리텔러","우주적 크리에이터","차원의 마에스트로","초월 프로듀서","영겁의 아티스트","무한의 디렉터","절대 크리에이터","궁극의 마스터","에테르 아키텍트","시간의 지배자","공간의 창조자","빛의 예술가","그림자의 마에스트로","별의 스토리텔러","은하의 프로듀서","세계의 아티스트","차원의 조각가","태초의 크리에이터"],
  "emojis": ["🌱","🔍","🕸️","🏦","🏛️","🪄","🤖","🎓","🏆","💎","⚜️","🗿","📜","🌌","🔮","⭐","♾️","🌀","👑","🏅","✨","⏳","🌐","💡","🌑","⭐","🌌","🌍","🗡️","🔥"],
  "colors": ["#94a3b8","#60a5fa","#34d399","#fbbf24","#f97316","#ec4899","#8b5cf6","#14b8a6","#eab308","#06b6d4","#a855f7","#e11d48","#f43f5e","#6366f1","#d946ef","#10b981","#f59e0b","#3b82f6","#ef4444","#22d3ee","#c084fc","#facc15","#4ade80","#fde68a","#64748b","#818cf8","#a78bfa","#67e8f9","#fb923c","#dc2626"],
  "rewards": [
    {"credits":0,"xp_multiplier":1.0,"gacha_tickets":0},
    {"credits":0,"xp_multiplier":1.0,"gacha_tickets":0},
    {"credits":5,"xp_multiplier":1.0,"gacha_tickets":1},
    {"credits":5,"xp_multiplier":1.0,"gacha_tickets":1},
    {"credits":10,"xp_multiplier":1.05,"gacha_tickets":1},
    {"credits":10,"xp_multiplier":1.1,"gacha_tickets":2},
    {"credits":15,"xp_multiplier":1.1,"gacha_tickets":2},
    {"credits":20,"xp_multiplier":1.15,"gacha_tickets":2},
    {"credits":25,"xp_multiplier":1.2,"gacha_tickets":3},
    {"credits":50,"xp_multiplier":1.25,"gacha_tickets":3},
    {"credits":50,"xp_multiplier":1.3,"gacha_tickets":3},
    {"credits":60,"xp_multiplier":1.3,"gacha_tickets":4},
    {"credits":70,"xp_multiplier":1.35,"gacha_tickets":4},
    {"credits":80,"xp_multiplier":1.35,"gacha_tickets":4},
    {"credits":90,"xp_multiplier":1.4,"gacha_tickets":5},
    {"credits":100,"xp_multiplier":1.4,"gacha_tickets":5},
    {"credits":120,"xp_multiplier":1.45,"gacha_tickets":5},
    {"credits":140,"xp_multiplier":1.45,"gacha_tickets":6},
    {"credits":160,"xp_multiplier":1.5,"gacha_tickets":6},
    {"credits":200,"xp_multiplier":1.5,"gacha_tickets":7},
    {"credits":200,"xp_multiplier":1.55,"gacha_tickets":7},
    {"credits":250,"xp_multiplier":1.55,"gacha_tickets":8},
    {"credits":250,"xp_multiplier":1.6,"gacha_tickets":8},
    {"credits":300,"xp_multiplier":1.6,"gacha_tickets":9},
    {"credits":300,"xp_multiplier":1.65,"gacha_tickets":9},
    {"credits":350,"xp_multiplier":1.65,"gacha_tickets":10},
    {"credits":400,"xp_multiplier":1.7,"gacha_tickets":10},
    {"credits":450,"xp_multiplier":1.7,"gacha_tickets":11},
    {"credits":500,"xp_multiplier":1.75,"gacha_tickets":12},
    {"credits":1000,"xp_multiplier":2.0,"gacha_tickets":20}
  ]
}', '레벨 시스템 설정')
ON CONFLICT (key) DO NOTHING;

INSERT INTO c2gen_game_config (key, value, description) VALUES
('xp_rates', '{
  "script": 10,
  "image_per": 5,
  "audio_per": 3,
  "video_per": 8,
  "daily_bonus": 5,
  "streak_multiplier": 0.1,
  "combo_multiplier": 0.05,
  "max_combo_multiplier": 2.0
}', 'XP 적립 비율')
ON CONFLICT (key) DO NOTHING;

INSERT INTO c2gen_game_config (key, value, description) VALUES
('gacha_settings', '{
  "pull_interval": 5,
  "rarities": {
    "common":    {"rate": 0.50, "color": "#94a3b8", "label": "COMMON"},
    "uncommon":  {"rate": 0.25, "color": "#22c55e", "label": "UNCOMMON"},
    "rare":      {"rate": 0.15, "color": "#8b5cf6", "label": "★ RARE"},
    "epic":      {"rate": 0.08, "color": "#f59e0b", "label": "★★ EPIC ★★"},
    "legendary": {"rate": 0.02, "color": "#ef4444", "label": "★★★ LEGENDARY ★★★"}
  },
  "pity": {
    "epic_guarantee": 30,
    "legendary_guarantee": 100
  }
}', '뽑기 시스템 설정')
ON CONFLICT (key) DO NOTHING;

INSERT INTO c2gen_game_config (key, value, description) VALUES
('streak_settings', '{
  "milestones": [3, 7, 14, 30, 60, 100, 365],
  "milestone_rewards": [
    {"xp": 20, "credits": 5},
    {"xp": 50, "credits": 10},
    {"xp": 100, "credits": 20},
    {"xp": 200, "credits": 50},
    {"xp": 500, "credits": 100},
    {"xp": 1000, "credits": 200},
    {"xp": 5000, "credits": 500}
  ]
}', '연속 접속 보너스')
ON CONFLICT (key) DO NOTHING;

INSERT INTO c2gen_game_config (key, value, description) VALUES
('milestone_settings', '{
  "generation_milestones": [
    {"count": 1,   "emoji": "🎉", "title": "첫 작품 탄생!",           "xp": 20,  "credits": 5},
    {"count": 5,   "emoji": "🚀", "title": "크리에이터의 길로!",       "xp": 30,  "credits": 5},
    {"count": 10,  "emoji": "🏆", "title": "프로 크리에이터 등극!",     "xp": 50,  "credits": 10},
    {"count": 25,  "emoji": "👑", "title": "마스터 크리에이터!",        "xp": 100, "credits": 20},
    {"count": 50,  "emoji": "🌟", "title": "레전드!",                 "xp": 200, "credits": 50},
    {"count": 100, "emoji": "💎", "title": "다이아몬드 크리에이터!",    "xp": 500, "credits": 100},
    {"count": 250, "emoji": "🔥", "title": "불꽃의 장인!",            "xp": 1000,"credits": 200},
    {"count": 500, "emoji": "⚡", "title": "번개의 마에스트로!",       "xp": 2000,"credits": 500},
    {"count": 1000,"emoji": "♾️", "title": "무한 크리에이터!",         "xp": 5000,"credits": 1000}
  ]
}', '생성 마일스톤')
ON CONFLICT (key) DO NOTHING;

INSERT INTO c2gen_game_config (key, value, description) VALUES
('prestige_settings', '{
  "enabled": false,
  "xp_multiplier_per_prestige": 0.1,
  "max_prestige": 10,
  "badge_emojis": ["⭐","🌟","💫","✨","🔥","💎","👑","🏆","🎖️","🏅"]
}', '프레스티지 시스템')
ON CONFLICT (key) DO NOTHING;

-- 업적 시드
INSERT INTO c2gen_achievements (id, name, description, icon, category, condition_type, condition_target, reward_xp, reward_credits, sort_order) VALUES
('ach_first_gen',   '첫 발걸음',         '첫 번째 콘텐츠를 생성하세요',     '🎉', 'creation',    'total_generations', 1,   20,  5,   1),
('ach_gen_10',      '꾸준한 창작자',      '콘텐츠 10개를 생성하세요',       '📝', 'creation',    'total_generations', 10,  50,  10,  2),
('ach_gen_50',      '다작 아티스트',      '콘텐츠 50개를 생성하세요',       '🎨', 'creation',    'total_generations', 50,  200, 50,  3),
('ach_gen_100',     '백전백승',          '콘텐츠 100개를 생성하세요',       '💯', 'creation',    'total_generations', 100, 500, 100, 4),
('ach_gen_500',     '전설의 기록',       '콘텐츠 500개를 생성하세요',       '📚', 'creation',    'total_generations', 500, 2000,500, 5),
('ach_img_100',     '이미지 마스터',     '이미지 100장을 생성하세요',       '🖼️', 'creation',    'total_images',      100, 100, 20,  10),
('ach_img_500',     '비주얼 레전드',     '이미지 500장을 생성하세요',       '🎭', 'creation',    'total_images',      500, 500, 100, 11),
('ach_streak_7',    '일주일 전사',       '7일 연속 접속하세요',            '🔥', 'dedication',  'streak_days',       7,   50,  10,  20),
('ach_streak_30',   '한 달의 헌신',      '30일 연속 접속하세요',           '💪', 'dedication',  'streak_days',       30,  200, 50,  21),
('ach_streak_100',  '100일의 기적',      '100일 연속 접속하세요',          '🏅', 'dedication',  'streak_days',       100, 1000,200, 22),
('ach_level_5',     '성장하는 나무',      'Lv.5에 도달하세요',             '🌳', 'mastery',     'level_reached',     5,   30,  5,   30),
('ach_level_10',    '정상의 전망',       'Lv.10에 도달하세요',             '🏔️', 'mastery',     'level_reached',     10,  100, 20,  31),
('ach_level_20',    '구름 위의 존재',     'Lv.20에 도달하세요',             '☁️', 'mastery',     'level_reached',     20,  300, 50,  32),
('ach_level_30',    '태초의 경지',       'Lv.30에 도달하세요',             '🔥', 'mastery',     'level_reached',     30,  1000,200, 33),
('ach_combo_5',     '콤보 마스터',       '한 세션에서 5연속 생성하세요',     '⚡', 'exploration', 'combo_count',       5,   30,  5,   40),
('ach_combo_10',    '멈출 수 없는 열정',  '한 세션에서 10연속 생성하세요',    '🌋', 'exploration', 'combo_count',       10,  100, 20,  41),
('ach_gacha_50',    '수집광',            '뽑기를 50번 하세요',             '🎰', 'exploration', 'gacha_pulls',       50,  50,  10,  50),
('ach_gacha_100',   '행운의 도전자',     '뽑기를 100번 하세요',            '🍀', 'exploration', 'gacha_pulls',       100, 200, 50,  51),
('ach_secret_konami','비밀 코드',        '히든 커맨드를 발견하세요',        '🕹️', 'hidden',      'special_konami',    1,   100, 20,  100),
('ach_secret_logo5','로고의 비밀',       '로고에 숨겨진 비밀을 찾으세요',    '🌈', 'hidden',      'special_logo_click',1,   50,  10,  101)
ON CONFLICT (id) DO NOTHING;

-- 퀘스트 시드
INSERT INTO c2gen_quest_pool (id, name, description, icon, quest_type, target, reward_xp, reward_credits, min_level, weight) VALUES
('quest_gen_1',     '일일 창작',          '오늘 콘텐츠 1개를 생성하세요',     '📝', 'generate_content', 1,  15, 5,  1, 30),
('quest_gen_3',     '삼중 창작',          '오늘 콘텐츠 3개를 생성하세요',     '📝', 'generate_content', 3,  40, 15, 3, 20),
('quest_img_5',     '이미지 5장',         '오늘 이미지 5장을 생성하세요',     '🖼️', 'generate_images',  5,  20, 5,  1, 25),
('quest_img_20',    '이미지 대량 생산',    '오늘 이미지 20장을 생성하세요',    '🖼️', 'generate_images',  20, 60, 20, 5, 10),
('quest_audio_3',   '목소리의 힘',        '오늘 TTS 3개를 생성하세요',       '🎙️', 'generate_audio',   3,  15, 5,  1, 25),
('quest_video_1',   '영상 크리에이터',     '오늘 영상 1개를 변환하세요',       '🎬', 'create_video',     1,  30, 10, 3, 15),
('quest_combo_3',   '연속 도전',          '3연속 생성을 달성하세요',          '⚡', 'combo_reach',      3,  25, 10, 2, 20)
ON CONFLICT (id) DO NOTHING;

-- 뽑기 아이템 시드
INSERT INTO c2gen_gacha_pool (id, name, description, item_type, rarity, emoji, effect_value, sort_order) VALUES
-- Common 칭호
('gacha_title_storyteller',   '이야기꾼',        '이야기를 풀어내는 재능',  'title', 'common',    '📖', NULL, 1),
('gacha_title_pixel_artist',  '픽셀 아티스트',    '디지털 세계의 화가',     'title', 'common',    '🎮', NULL, 2),
('gacha_title_night_creator', '밤의 크리에이터',   '밤을 불태우는 창작자',    'title', 'common',    '🦉', NULL, 3),
('gacha_title_speed_runner',  '스피드 러너',      '빠른 창작의 달인',       'title', 'common',    '⚡', NULL, 4),
-- Uncommon 칭호
('gacha_title_dawn_painter',  '여명의 화가',      '새벽을 그리는 자',       'title', 'uncommon',  '🌅', NULL, 5),
('gacha_title_cloud_dancer',  '구름 위의 춤꾼',   '하늘을 나는 예술가',     'title', 'uncommon',  '☁️', NULL, 6),
('gacha_title_storm_writer',  '폭풍의 작가',      '영감의 폭풍 속 작가',    'title', 'uncommon',  '⛈️', NULL, 7),
-- Rare 칭호
('gacha_title_color_wizard',  '색채의 마법사',    '무지개 너머의 마법사',    'title', 'rare',      '🌈', NULL, 10),
('gacha_title_vision_arch',   '비전 아키텍트',    '미래를 설계하는 자',      'title', 'rare',      '🔮', NULL, 11),
('gacha_title_golden_hand',   '황금손',           '모든 것을 금으로',       'title', 'rare',      '✋', NULL, 12),
-- Epic 칭호
('gacha_title_ai_whisperer',  'AI 위스퍼러',     'AI와 대화하는 자',       'title', 'epic',      '🤖', NULL, 20),
('gacha_title_dim_creator',   '차원 창조자',      '차원을 넘나드는 창조자',  'title', 'epic',      '🌌', NULL, 21),
('gacha_title_legend',        '전설의 크리에이터', '전설로 남을 자',         'title', 'epic',      '👑', NULL, 22),
-- Legendary 칭호
('gacha_title_genesis',       '태초의 창조자',    '모든 것의 시작',         'title', 'legendary', '🔥', NULL, 30),
('gacha_title_eternal',       '영원의 예술가',    '시간을 초월한 예술',      'title', 'legendary', '♾️', NULL, 31),
-- 뱃지
('gacha_badge_flame',         '불꽃 배지',       '열정의 증표',            'badge', 'uncommon',  '🔥', NULL, 40),
('gacha_badge_star',          '별 배지',         '빛나는 존재의 증표',      'badge', 'rare',      '⭐', NULL, 41),
('gacha_badge_crown',         '왕관 배지',       '왕의 증표',              'badge', 'epic',      '👑', NULL, 42),
('gacha_badge_diamond',       '다이아몬드 배지',  '최고의 증표',            'badge', 'legendary', '💎', NULL, 43),
-- 프레임
('gacha_frame_basic',         '기본 프레임',     '깔끔한 프로필 테두리',    'avatar_frame', 'common',    '🖼️', NULL, 70),
('gacha_frame_golden',        '황금 프레임',     '황금빛 프로필 테두리',    'avatar_frame', 'rare',      '🏆', NULL, 71),
('gacha_frame_neon',          '네온 프레임',     '빛나는 네온 테두리',      'avatar_frame', 'epic',      '✨', NULL, 72),
('gacha_frame_legendary',     '전설의 프레임',   '전설적인 프로필 테두리',   'avatar_frame', 'legendary', '💠', NULL, 73),
-- 소모품: XP 부스터
('gacha_xp_boost_2h',         'XP 부스터 (2시간)',  '2시간 동안 XP 1.5배', 'xp_booster',     'uncommon', '⏱️', '{"xp_multiplier":1.5,"duration_hours":2}', 50),
('gacha_xp_boost_24h',        'XP 부스터 (24시간)', '24시간 동안 XP 1.5배','xp_booster',     'rare',     '⏰', '{"xp_multiplier":1.5,"duration_hours":24}', 51),
-- 소모품: 크레딧 바우처
('gacha_credit_10',           '크레딧 바우처 10',  '크레딧 10 즉시 지급',   'credit_voucher', 'common',   '🎟️', '{"credits":10}', 60),
('gacha_credit_50',           '크레딧 바우처 50',  '크레딧 50 즉시 지급',   'credit_voucher', 'rare',     '🎫', '{"credits":50}', 61),
('gacha_credit_200',          '크레딧 바우처 200', '크레딧 200 즉시 지급',  'credit_voucher', 'epic',     '💳', '{"credits":200}', 62)
ON CONFLICT (id) DO NOTHING;
