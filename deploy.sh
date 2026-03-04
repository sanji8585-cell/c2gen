#!/bin/bash
# TubeGen AI 배포 스크립트
# 사용법: bash deploy.sh

set -e

SRC="c:/Users/USER/Desktop/자동화컨텐츠AI/자동화컨텐츠"
TMP="/tmp/tubegen-deploy"

echo "🔨 빌드 확인 중..."
cd "$SRC"
npm run build --silent 2>&1 | tail -1

echo "📦 배포 준비 중..."
rm -rf "$TMP"
mkdir -p "$TMP/.vercel"

# .git, node_modules 제외하고 전체 복사
for item in $(ls -A "$SRC" | grep -v '^\.\(git\)$' | grep -v '^node_modules$' | grep -v '^\.\(vercel\)$'); do
  cp -r "$SRC/$item" "$TMP/" 2>/dev/null
done

# .vercel 프로젝트 링크 복사
cp "$SRC/.vercel/project.json" "$TMP/.vercel/"

# 의존성 설치
cd "$TMP"
npm install --silent 2>&1 | tail -1

echo "🚀 Vercel 배포 중..."
npx vercel --prod --yes 2>&1 | grep -E "Production:|Aliased:|Error"

echo "✅ 배포 완료!"
