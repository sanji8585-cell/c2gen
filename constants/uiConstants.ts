/**
 * UI 관련 상수/헬퍼 함수 (App.tsx에서 분리)
 */

export const AI_PERSONALITY = {
  SCRIPTING: ["대본 집필 중... 오늘 영감이 넘치네요! ✍️", "이야기의 뼈대를 세우고 있어요... 🏗️", "어떤 서사로 풀어볼까 고민 중이에요 🤔", "스토리 아키텍트 모드 ON! 📐", "창작의 신이 강림했어요... ✨", "이 주제, 흥미로운데요? 기대하세요! 🎭", "플롯 트위스트 고민 중... 🌀", "대본의 리듬감을 잡고 있어요 🎵"],
  ASSETS: ["이 씬은 특별히 신경 써서 그릴게요 🎨", "색을 고르고 있어요... 이 조합 어때요? 🎨", "픽셀 하나하나 정성스럽게... ✨", "AI 아틀리에에서 걸작 제작 중... 🖼️", "이 구도, 프로 감독도 인정할 걸요? 📸", "빛과 그림자의 마법을 부리는 중... 🌓", "세밀한 디테일 작업에 들어갔어요 🔍", "상상을 현실로 바꾸는 마법 시전 중... 🪄", "거의 완성! 마무리 터치 중이에요 ✨", "이 색감, 제가 봐도 예뻐요 💎"],
  ERROR: ["앗, 잠깐 쉬고 올게요! 다시 도전해볼까요? 😊", "AI도 가끔 쉬어야 해요... 잠시만요! 💤", "창작의 길에 작은 돌부리... 다시 가봐요! 💪", "에러도 성장의 일부! 다시 시도해볼게요 🌱", "잠깐의 방해일 뿐, 포기하지 않아요! 🔥", "우주적 간섭이 있었나봐요... 다시! 🌌"],
  COMPLETED: ["와! 이건 제가 봐도 걸작이에요! 🎬", "역시 프로! 이 퀄리티 보세요! ⭐", "당신의 창의력 + AI의 기술 = 완벽! 🤝", "이 작품, 바이럴 갈 것 같은 느낌... 🚀", "AI도 감탄했어요! 대단해요! 👏", "마스터피스 완성! 박수! 🎉", "이거 포트폴리오에 넣어야 해요! 💼", "완벽한 한 편이 탄생했어요! 🌟"],
};

export const PRO_TIPS = [
  { id: 1, text: '참조 이미지를 사용하면 캐릭터의 일관성을 유지할 수 있어요! 📎' },
  { id: 2, text: '화풍을 바꿔보세요 - 크레용, 수채화, 인포그래픽 등 다양한 스타일이 있어요 🎨' },
  { id: 3, text: '대본을 직접 입력하면 더 정확한 영상을 만들 수 있어요 ✍️' },
  { id: 4, text: 'Ken Burns 효과로 정적 이미지에 생동감을 더해보세요 🎬' },
  { id: 5, text: 'BGM 자동 선택 기능이 분위기에 맞는 음악을 골라줘요 🎵' },
  { id: 6, text: '씬 순서를 드래그로 바꿀 수 있어요! ↕️' },
  { id: 7, text: '이미지가 마음에 안 들면 씬별로 재생성할 수 있어요 🔄' },
  { id: 8, text: '다국어 지원! 한국어, 영어, 일본어로 나레이션을 만들어보세요 🌏' },
  { id: 9, text: '자막 위치와 스타일을 커스텀할 수 있어요 💬' },
  { id: 10, text: '프로젝트는 클라우드에 자동 저장돼요. 언제든 불러오세요! ☁️' },
];

export function launchConfetti(customColors?: string[]) {
  const c = customColors || ['#f43f5e', '#8b5cf6', '#3b82f6', '#10b981', '#f59e0b', '#ec4899'];
  for (let i = 0; i < 40; i++) {
    const e = document.createElement('div');
    e.className = 'confetti-piece';
    e.style.left = Math.random() * 100 + 'vw';
    e.style.backgroundColor = c[Math.floor(Math.random() * c.length)];
    e.style.animationDelay = Math.random() * 1 + 's';
    e.style.animationDuration = (2 + Math.random() * 1.5) + 's';
    e.style.width = (6 + Math.random() * 8) + 'px';
    e.style.height = (6 + Math.random() * 8) + 'px';
    document.body.appendChild(e);
    setTimeout(() => e.remove(), 4000);
  }
}

export function getStorytellingPhase(current: number, total: number): { text: string; icon: string } {
  const r = total > 0 ? current / total : 0;
  if (r === 0) return { text: "AI가 캔버스를 펼쳤어요", icon: "✏️" };
  if (r < 0.3) return { text: "색을 고르고 있어요", icon: "🎨" };
  if (r < 0.6) return { text: "세밀한 디테일 작업 중...", icon: "🔍" };
  if (r < 0.9) return { text: "거의 다 됐어요!", icon: "🖌️" };
  return { text: "마무리 터치!", icon: "✨" };
}

export function getTimeGreeting(streak: number): string {
  const h = new Date().getHours();
  let g = '';
  if (h < 6) g = '새벽의 크리에이터시군요! 🌙';
  else if (h < 12) g = '좋은 아침이에요! 오늘도 멋진 작품 만들어볼까요? ☀️';
  else if (h < 18) g = '오후의 창작 시간! 영감이 넘치는 시간이에요 🌤️';
  else g = '밤의 창작이 가장 깊어요... 🌜';
  if (streak >= 3) g += ` (${streak}일 연속 접속 중! 대단해요!)`;
  return g;
}

export const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
