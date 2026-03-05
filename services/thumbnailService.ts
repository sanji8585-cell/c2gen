import { THUMBNAIL_PLATFORMS, LANGUAGE_CONFIG, type ThumbnailPlatform, type Language } from '../config';

// ── 텍스트 스타일 프리셋 시스템 ──

export interface ThumbnailTextStyle {
  id: string;
  name: string;
  nameKo: string;
  // 텍스트
  fontWeight: number;
  fontSize: number;             // 캔버스 폭 대비 비율
  textColor: string | string[]; // 단색 또는 그라데이션 색상 배열
  // 외곽선
  strokeColor: string;
  strokeWidth: number;
  // 그림자
  shadowColor: string;
  shadowBlur: number;
  shadowOffsetX: number;
  shadowOffsetY: number;
  // 글로우 (선택적 — 네온 효과용)
  glowColor?: string;
  glowBlur?: number;
  // 배경
  bgType: 'none' | 'gradient' | 'solid' | 'blur-box';
  bgColor?: string;
  bgGradient?: string[];        // 그라데이션 배경 색상
  // 오버레이 어두움 강도 (0~1)
  overlayOpacity: number;
  overlayDirection: 'bottom' | 'full' | 'none';
  // 위치
  position: 'bottom' | 'center' | 'top';
  // 서브텍스트 스타일
  subtitleColor: string;
  subtitleFontSize: number;     // 캔버스 폭 대비 비율
}

export const TEXT_STYLE_PRESETS: ThumbnailTextStyle[] = [
  {
    id: 'bold-white',
    name: 'Bold White',
    nameKo: '볼드 화이트',
    fontWeight: 900,
    fontSize: 0.055,
    textColor: '#FFFFFF',
    strokeColor: '#000000',
    strokeWidth: 6,
    shadowColor: 'rgba(0,0,0,0.9)',
    shadowBlur: 15,
    shadowOffsetX: 4,
    shadowOffsetY: 4,
    bgType: 'none',
    overlayOpacity: 0.75,
    overlayDirection: 'bottom',
    position: 'bottom',
    subtitleColor: 'rgba(255,255,255,0.8)',
    subtitleFontSize: 0.03,
  },
  {
    id: 'gradient-fire',
    name: 'Fire Gradient',
    nameKo: '파이어',
    fontWeight: 900,
    fontSize: 0.06,
    textColor: ['#FF4500', '#FF8C00', '#FFD700'],
    strokeColor: '#000000',
    strokeWidth: 5,
    shadowColor: 'rgba(255,69,0,0.6)',
    shadowBlur: 20,
    shadowOffsetX: 0,
    shadowOffsetY: 0,
    bgType: 'none',
    overlayOpacity: 0.8,
    overlayDirection: 'bottom',
    position: 'bottom',
    subtitleColor: '#FFD700',
    subtitleFontSize: 0.028,
  },
  {
    id: 'neon-glow',
    name: 'Neon Glow',
    nameKo: '네온',
    fontWeight: 800,
    fontSize: 0.055,
    textColor: '#00FFFF',
    strokeColor: 'rgba(0,255,255,0.3)',
    strokeWidth: 3,
    shadowColor: 'rgba(0,255,255,0.8)',
    shadowBlur: 30,
    shadowOffsetX: 0,
    shadowOffsetY: 0,
    glowColor: 'rgba(0,255,255,0.4)',
    glowBlur: 60,
    bgType: 'none',
    overlayOpacity: 0.85,
    overlayDirection: 'full',
    position: 'center',
    subtitleColor: 'rgba(0,255,255,0.7)',
    subtitleFontSize: 0.028,
  },
  {
    id: 'minimal-dark',
    name: 'Minimal Dark',
    nameKo: '미니멀',
    fontWeight: 700,
    fontSize: 0.045,
    textColor: '#FFFFFF',
    strokeColor: 'transparent',
    strokeWidth: 0,
    shadowColor: 'transparent',
    shadowBlur: 0,
    shadowOffsetX: 0,
    shadowOffsetY: 0,
    bgType: 'blur-box',
    bgColor: 'rgba(0,0,0,0.65)',
    overlayOpacity: 0.3,
    overlayDirection: 'full',
    position: 'center',
    subtitleColor: 'rgba(255,255,255,0.6)',
    subtitleFontSize: 0.025,
  },
  {
    id: 'editorial',
    name: 'Editorial',
    nameKo: '에디토리얼',
    fontWeight: 700,
    fontSize: 0.05,
    textColor: '#FFFFFF',
    strokeColor: 'transparent',
    strokeWidth: 0,
    shadowColor: 'rgba(0,0,0,0.5)',
    shadowBlur: 8,
    shadowOffsetX: 2,
    shadowOffsetY: 2,
    bgType: 'none',
    overlayOpacity: 0.6,
    overlayDirection: 'bottom',
    position: 'bottom',
    subtitleColor: '#F59E0B',
    subtitleFontSize: 0.028,
  },
  {
    id: 'impact',
    name: 'Impact',
    nameKo: '임팩트',
    fontWeight: 900,
    fontSize: 0.07,
    textColor: '#FFFF00',
    strokeColor: '#FF0000',
    strokeWidth: 7,
    shadowColor: 'rgba(0,0,0,0.9)',
    shadowBlur: 12,
    shadowOffsetX: 5,
    shadowOffsetY: 5,
    bgType: 'none',
    overlayOpacity: 0.7,
    overlayDirection: 'bottom',
    position: 'bottom',
    subtitleColor: '#FFFFFF',
    subtitleFontSize: 0.032,
  },
  {
    id: 'ocean-gradient',
    name: 'Ocean',
    nameKo: '오션',
    fontWeight: 800,
    fontSize: 0.055,
    textColor: ['#00D2FF', '#3A7BD5', '#6DD5FA'],
    strokeColor: '#000000',
    strokeWidth: 4,
    shadowColor: 'rgba(0,100,255,0.5)',
    shadowBlur: 20,
    shadowOffsetX: 0,
    shadowOffsetY: 3,
    bgType: 'none',
    overlayOpacity: 0.75,
    overlayDirection: 'bottom',
    position: 'bottom',
    subtitleColor: 'rgba(109,213,250,0.9)',
    subtitleFontSize: 0.028,
  },
  {
    id: 'cinematic',
    name: 'Cinematic',
    nameKo: '시네마틱',
    fontWeight: 700,
    fontSize: 0.048,
    textColor: '#F5F5DC',
    strokeColor: 'transparent',
    strokeWidth: 0,
    shadowColor: 'rgba(0,0,0,0.7)',
    shadowBlur: 20,
    shadowOffsetX: 0,
    shadowOffsetY: 4,
    bgType: 'gradient',
    bgGradient: ['rgba(0,0,0,0)', 'rgba(0,0,0,0.85)'],
    overlayOpacity: 0,
    overlayDirection: 'none',
    position: 'bottom',
    subtitleColor: 'rgba(245,245,220,0.7)',
    subtitleFontSize: 0.026,
  },
];

// ── 오버레이 렌더링 엔진 ──

export interface OverlayOptions {
  style: ThumbnailTextStyle;
  title: string;
  subtitle?: string;
  platform: ThumbnailPlatform;
  language: Language;
  fontSizeMultiplier?: number; // 1.0 = 기본, 0.7~1.5 범위
  positionOverride?: 'top' | 'center' | 'bottom';
}

export function overlayTitleOnImage(
  imageBase64: string,
  options: OverlayOptions
): Promise<string> {
  return new Promise((resolve, reject) => {
    const { style, title, subtitle, platform, language, fontSizeMultiplier = 1, positionOverride } = options;
    const dims = THUMBNAIL_PLATFORMS[platform];
    const canvas = document.createElement('canvas');
    canvas.width = dims.width;
    canvas.height = dims.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return reject(new Error('Canvas context not available'));

    const img = new Image();
    img.onload = () => {
      // 이미지 cover fit
      const scale = Math.max(dims.width / img.width, dims.height / img.height);
      const x = (dims.width - img.width * scale) / 2;
      const y = (dims.height - img.height * scale) / 2;
      ctx.drawImage(img, x, y, img.width * scale, img.height * scale);

      // 오버레이 렌더링
      renderOverlay(ctx, dims.width, dims.height, style);

      // 배경 박스 (blur-box / solid)
      const position = positionOverride || style.position;
      if (style.bgType === 'blur-box' || style.bgType === 'solid') {
        renderBgBox(ctx, dims.width, dims.height, style, title, subtitle, platform, language, fontSizeMultiplier, position);
      }

      // 시네마틱 등 gradient 배경
      if (style.bgType === 'gradient' && style.bgGradient) {
        renderGradientBg(ctx, dims.width, dims.height, style.bgGradient);
      }

      // 텍스트 렌더링
      if (title.trim()) {
        renderTitle(ctx, dims.width, dims.height, style, title, language, fontSizeMultiplier, position);
      }

      // 서브타이틀
      if (subtitle?.trim()) {
        renderSubtitle(ctx, dims.width, dims.height, style, title, subtitle, language, fontSizeMultiplier, position);
      }

      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
      resolve(canvas.toDataURL('image/jpeg', 0.92).split(',')[1]);
    };
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = `data:image/png;base64,${imageBase64}`;
  });
}

// 레거시 호환용 (기존 코드에서 호출 시)
export function overlayTitleOnImageLegacy(
  imageBase64: string,
  title: string,
  platform: ThumbnailPlatform,
  language: Language = 'ko'
): Promise<string> {
  return overlayTitleOnImage(imageBase64, {
    style: TEXT_STYLE_PRESETS[0],
    title,
    platform,
    language,
  });
}

// ── 내부 렌더링 함수들 ──

function renderOverlay(ctx: CanvasRenderingContext2D, w: number, h: number, style: ThumbnailTextStyle) {
  if (style.overlayDirection === 'none' || style.overlayOpacity === 0) return;

  if (style.overlayDirection === 'full') {
    ctx.fillStyle = `rgba(0,0,0,${style.overlayOpacity})`;
    ctx.fillRect(0, 0, w, h);
  } else {
    // bottom gradient
    const gradient = ctx.createLinearGradient(0, h * 0.35, 0, h);
    gradient.addColorStop(0, 'rgba(0,0,0,0)');
    gradient.addColorStop(1, `rgba(0,0,0,${style.overlayOpacity})`);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);
  }
}

function renderGradientBg(ctx: CanvasRenderingContext2D, w: number, h: number, colors: string[]) {
  const gradient = ctx.createLinearGradient(0, h * 0.5, 0, h);
  colors.forEach((color, i) => {
    gradient.addColorStop(i / (colors.length - 1), color);
  });
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, w, h);
}

function renderBgBox(
  ctx: CanvasRenderingContext2D, w: number, h: number,
  style: ThumbnailTextStyle,
  title: string, subtitle: string | undefined,
  platform: ThumbnailPlatform, language: Language,
  fontSizeMultiplier: number, position: string
) {
  const fontFamily = LANGUAGE_CONFIG[language].subtitleFont;
  const fontSize = Math.round(w * style.fontSize * fontSizeMultiplier);
  ctx.font = `${style.fontWeight} ${fontSize}px ${fontFamily}`;
  const maxWidth = w * 0.85;
  const lines = wrapText(ctx, title, maxWidth);
  const lineHeight = fontSize * 1.35;

  const subtitleFontSize = Math.round(w * style.subtitleFontSize * fontSizeMultiplier);
  const subtitleLines = subtitle ? (() => {
    ctx.font = `600 ${subtitleFontSize}px ${fontFamily}`;
    return wrapText(ctx, subtitle, maxWidth);
  })() : [];
  const subtitleLineHeight = subtitleFontSize * 1.3;

  const totalTextH = lines.length * lineHeight + subtitleLines.length * subtitleLineHeight + (subtitleLines.length > 0 ? 10 : 0);
  const paddingY = 30;
  const paddingX = 40;
  const boxH = totalTextH + paddingY * 2;

  let boxY: number;
  if (position === 'top') {
    boxY = h * 0.05;
  } else if (position === 'center') {
    boxY = (h - boxH) / 2;
  } else {
    boxY = h - boxH - h * 0.08;
  }

  // 박스 그리기
  const radius = 16;
  ctx.fillStyle = style.bgColor || 'rgba(0,0,0,0.6)';
  ctx.beginPath();
  ctx.roundRect(w * 0.05, boxY, w * 0.9, boxH, radius);
  ctx.fill();
}

function renderTitle(
  ctx: CanvasRenderingContext2D, w: number, h: number,
  style: ThumbnailTextStyle,
  title: string, language: Language,
  fontSizeMultiplier: number, position: string
) {
  const fontFamily = LANGUAGE_CONFIG[language].subtitleFont;
  const fontSize = Math.round(w * style.fontSize * fontSizeMultiplier);
  ctx.font = `${style.fontWeight} ${fontSize}px ${fontFamily}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const maxWidth = w * 0.85;
  const lines = wrapText(ctx, title, maxWidth);
  const lineHeight = fontSize * 1.35;

  // 위치 계산
  let startY: number;
  if (position === 'top') {
    startY = h * 0.12 + lineHeight / 2;
  } else if (position === 'center') {
    startY = (h - (lines.length - 1) * lineHeight) / 2;
  } else {
    startY = h * 0.78 - ((lines.length - 1) * lineHeight) / 2;
  }

  // fillStyle 설정 (단색 or 그라데이션)
  let textFill: string | CanvasGradient;
  if (Array.isArray(style.textColor)) {
    const grad = ctx.createLinearGradient(0, startY - lineHeight, 0, startY + lines.length * lineHeight);
    style.textColor.forEach((c, i) => {
      grad.addColorStop(i / (style.textColor.length - 1), c);
    });
    textFill = grad;
  } else {
    textFill = style.textColor;
  }

  lines.forEach((line, i) => {
    const ly = startY + i * lineHeight;

    // 글로우 효과 (네온)
    if (style.glowColor && style.glowBlur) {
      ctx.save();
      ctx.shadowColor = style.glowColor;
      ctx.shadowBlur = style.glowBlur;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;
      ctx.fillStyle = style.glowColor;
      ctx.globalAlpha = 0.4;
      ctx.fillText(line, w / 2, ly);
      ctx.restore();
    }

    // 그림자
    ctx.shadowColor = style.shadowColor;
    ctx.shadowBlur = style.shadowBlur;
    ctx.shadowOffsetX = style.shadowOffsetX;
    ctx.shadowOffsetY = style.shadowOffsetY;

    // 외곽선
    if (style.strokeWidth > 0 && style.strokeColor !== 'transparent') {
      ctx.strokeStyle = style.strokeColor;
      ctx.lineWidth = style.strokeWidth;
      ctx.lineJoin = 'round';
      ctx.strokeText(line, w / 2, ly);
    }

    // 텍스트
    ctx.fillStyle = textFill;
    ctx.fillText(line, w / 2, ly);
  });

  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
}

function renderSubtitle(
  ctx: CanvasRenderingContext2D, w: number, h: number,
  style: ThumbnailTextStyle,
  title: string, subtitle: string, language: Language,
  fontSizeMultiplier: number, position: string
) {
  const fontFamily = LANGUAGE_CONFIG[language].subtitleFont;
  const titleFontSize = Math.round(w * style.fontSize * fontSizeMultiplier);
  ctx.font = `${style.fontWeight} ${titleFontSize}px ${fontFamily}`;
  const maxWidth = w * 0.85;
  const titleLines = wrapText(ctx, title, maxWidth);
  const titleLineHeight = titleFontSize * 1.35;

  const subtitleFontSize = Math.round(w * style.subtitleFontSize * fontSizeMultiplier);
  ctx.font = `600 ${subtitleFontSize}px ${fontFamily}`;
  const subtitleLines = wrapText(ctx, subtitle, maxWidth);
  const subtitleLineHeight = subtitleFontSize * 1.3;

  // 타이틀 시작 Y 재계산
  let titleStartY: number;
  if (position === 'top') {
    titleStartY = h * 0.12 + titleLineHeight / 2;
  } else if (position === 'center') {
    titleStartY = (h - (titleLines.length - 1) * titleLineHeight) / 2;
  } else {
    titleStartY = h * 0.78 - ((titleLines.length - 1) * titleLineHeight) / 2;
  }

  const subtitleStartY = titleStartY + titleLines.length * titleLineHeight + 10;

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = style.subtitleColor;
  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = 6;
  ctx.shadowOffsetX = 1;
  ctx.shadowOffsetY = 1;

  subtitleLines.forEach((line, i) => {
    ctx.fillText(line, w / 2, subtitleStartY + i * subtitleLineHeight);
  });

  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
}

// ── 텍스트 줄바꿈 ──

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    if (ctx.measureText(testLine).width > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }
  if (currentLine) lines.push(currentLine);

  // 한국어/일본어 — 공백이 적으므로 글자 단위 분리
  if (lines.length === 1 && ctx.measureText(lines[0]).width > maxWidth) {
    const chars = text.split('');
    lines.length = 0;
    currentLine = '';
    for (const char of chars) {
      const testLine = currentLine + char;
      if (ctx.measureText(testLine).width > maxWidth && currentLine) {
        lines.push(currentLine);
        currentLine = char;
      } else {
        currentLine = testLine;
      }
    }
    if (currentLine) lines.push(currentLine);
  }

  return lines.slice(0, 3); // 최대 3줄
}

// ── AI 생성 샘플 프리뷰 이미지 경로 ──

/**
 * 사전 생성된 AI 스타일 샘플 이미지 URL을 반환
 * public/thumbnail-samples/{styleId}.jpg에 저장됨
 */
export function getStyleSampleImageUrl(styleId: string): string {
  return `/thumbnail-samples/${styleId}.jpg`;
}
