-- ============================================================
-- C2 PILOT: Supabase Storage 버킷 생성
-- 실행: Supabase SQL Editor에서 실행
-- ============================================================

-- 브랜드 프리셋 이미지 저장용 버킷 (public access)
INSERT INTO storage.buckets (id, name, public)
VALUES ('preset-images', 'preset-images', true)
ON CONFLICT (id) DO NOTHING;

-- 누구나 읽기 가능 (public)
CREATE POLICY "Public read access for preset images"
ON storage.objects FOR SELECT
USING (bucket_id = 'preset-images');

-- 인증된 사용자만 업로드/삭제
CREATE POLICY "Authenticated upload for preset images"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'preset-images');

CREATE POLICY "Authenticated delete for preset images"
ON storage.objects FOR DELETE
USING (bucket_id = 'preset-images');
