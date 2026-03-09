import { SceneDirectives } from '../types';
import { DIRECTIVE_KEY_MAP, COMPOSITION_VALUE_MAP, MOOD_VALUE_MAP } from '../config';

export interface ParseResult {
  cleanNarration: string;       // 디렉티브 제거된 나레이션
  directives: SceneDirectives;  // 파싱된 디렉티브
  rawDirectives: string[];      // 원본 괄호 텍스트 (디버그용)
}

/**
 * 나레이션에서 디렉티브를 파싱하고 정제된 텍스트를 반환
 * - 패턴: (키: 값) 또는 (플래그)
 * - 다국어 키를 DIRECTIVE_KEY_MAP으로 내부 키로 정규화
 * - COMPOSITION/MOOD 값은 각각의 VALUE_MAP으로 매핑
 * - 매핑되지 않는 괄호 텍스트는 일반 텍스트로 간주 (제거하지 않음)
 */
export function parseDirectives(narration: string): ParseResult {
  const directives: SceneDirectives = {};
  const rawDirectives: string[] = [];

  // 괄호 패턴 매칭: (내용)
  const DIRECTIVE_REGEX = /\(([^)]+)\)/g;

  let cleanNarration = narration;
  const matches = [...narration.matchAll(DIRECTIVE_REGEX)];

  // 뒤에서부터 제거 (인덱스 밀림 방지)
  const toRemove: { start: number; end: number }[] = [];

  for (const match of matches) {
    const fullMatch = match[0];    // "(배경: 어두운 사무실)"
    const inner = match[1].trim(); // "배경: 어두운 사무실"

    // 콜론으로 key:value 분리
    const colonIdx = inner.indexOf(':');
    let key: string;
    let value: string;

    if (colonIdx !== -1) {
      key = inner.slice(0, colonIdx).trim().toLowerCase();
      value = inner.slice(colonIdx + 1).trim();
      // value에서 따옴표 제거
      value = value.replace(/^["']|["']$/g, '');
    } else {
      // 플래그 (값 없음): (이전씬유지), (같은장소), (시간경과)
      key = inner.trim();
      value = '';
    }

    // DIRECTIVE_KEY_MAP에서 내부 키 조회 (대소문자 무시용으로 lowercase 시도)
    const internalKey = DIRECTIVE_KEY_MAP[key] || DIRECTIVE_KEY_MAP[inner.trim()];

    if (!internalKey) {
      // 매핑 키가 아니면 일반 괄호 텍스트 -> 건드리지 않음
      continue;
    }

    rawDirectives.push(fullMatch);
    toRemove.push({ start: match.index!, end: match.index! + fullMatch.length });

    // 플래그 타입 디렉티브
    if (internalKey === 'KEEP_PREV' || internalKey === 'SAME_PLACE' || internalKey === 'TIME_PASS') {
      (directives as any)[internalKey] = true;
      continue;
    }

    // 값 매핑
    if (internalKey === 'COMPOSITION') {
      const mapped = COMPOSITION_VALUE_MAP[value] || COMPOSITION_VALUE_MAP[value.toLowerCase()];
      (directives as any)[internalKey] = mapped || value.toUpperCase();
    } else if (internalKey === 'MOOD') {
      const mapped = MOOD_VALUE_MAP[value] || MOOD_VALUE_MAP[value.toLowerCase()];
      (directives as any)[internalKey] = mapped || value.toUpperCase();
    } else {
      // BACKGROUND, STYLE, TEXT, CAMERA, COLOR, SPEAKER — 자유 텍스트
      (directives as any)[internalKey] = value;
    }
  }

  // 뒤에서부터 제거하여 인덱스 밀림 방지
  for (let i = toRemove.length - 1; i >= 0; i--) {
    const { start, end } = toRemove[i];
    cleanNarration = cleanNarration.slice(0, start) + cleanNarration.slice(end);
  }

  // 연속 공백 정리
  cleanNarration = cleanNarration.replace(/\s{2,}/g, ' ').trim();

  return { cleanNarration, directives, rawDirectives };
}

/**
 * 연결 디렉티브(KEEP_PREV, SAME_PLACE, TIME_PASS)를 처리하여
 * 이전 씬의 배경 정보를 현재 씬의 visualPrompt에 전파
 */
export function propagateSceneContext(scenes: Array<{ visualPrompt: string; analysis?: { directives?: SceneDirectives }; [key: string]: any }>): typeof scenes {
  let prevBackground = '';

  return scenes.map((scene, idx) => {
    const directives = scene.analysis?.directives;

    // 현재 씬에 BACKGROUND 디렉티브가 있으면 배경 정보 업데이트
    if (directives?.BACKGROUND) {
      prevBackground = directives.BACKGROUND;
    } else if (idx === 0 || (!directives?.KEEP_PREV && !directives?.SAME_PLACE && !directives?.TIME_PASS)) {
      // 첫 씬이거나 연결 디렉티브 없으면 visualPrompt에서 배경 추출 시도
      // 간단한 휴리스틱: visualPrompt 전체를 배경 컨텍스트로 보존
      prevBackground = scene.visualPrompt || '';
    }

    if (idx === 0) return scene;

    // 연결 디렉티브 처리
    if (directives?.KEEP_PREV && prevBackground) {
      return {
        ...scene,
        visualPrompt: `${scene.visualPrompt}\n[CONTINUITY] Same setting as previous scene: ${prevBackground}`,
      };
    }

    if (directives?.SAME_PLACE && prevBackground) {
      return {
        ...scene,
        visualPrompt: `${scene.visualPrompt}\n[CONTINUITY] Same location: ${prevBackground}`,
      };
    }

    if (directives?.TIME_PASS && prevBackground) {
      return {
        ...scene,
        visualPrompt: `${scene.visualPrompt}\n[CONTINUITY] Same location but different time/lighting: ${prevBackground}. Show passage of time with changed lighting and atmosphere.`,
      };
    }

    return scene;
  });
}
