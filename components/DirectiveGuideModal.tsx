import React, { useEffect, useRef } from 'react';

interface DirectiveGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface DirectiveItem {
  syntax: string;
  description: string;
  example?: string;
}

const KEY_VALUE_DIRECTIVES: DirectiveItem[] = [
  { syntax: '(구도: 클로즈업)', description: '카메라 구도 지정', example: '클로즈업 / 미디엄샷 / 와이드샷 / 캐릭터없음' },
  { syntax: '(분위기: 밝음)', description: '이미지 전체 톤 설정', example: '밝음 / 어두움 / 중립' },
  { syntax: '(배경: 설명)', description: '배경 장면 직접 지정', example: '(배경: 어두운 트레이딩룸)' },
  { syntax: '(스타일: 설명)', description: '화풍 오버라이드', example: '(스타일: 수채화 느낌)' },
  { syntax: '(텍스트: "내용")', description: '이미지 내 텍스트 삽입', example: '(텍스트: "KOSPI -3.2%")' },
  { syntax: '(카메라: 설명)', description: '카메라 앵글 세부 지정', example: '(카메라: 하이앵글 조감도)' },
  { syntax: '(색상: 설명)', description: '색상 톤 강조', example: '(색상: 파랑 계열 차가운 톤)' },
  { syntax: '(화자: 이름)', description: 'TTS 화자 지정 (대화형)', example: '(화자: 남자) / (화자: 여자)' },
];

const FLAG_DIRECTIVES: DirectiveItem[] = [
  { syntax: '(이전씬유지)', description: '이전 씬의 배경을 그대로 유지' },
  { syntax: '(같은장소)', description: '같은 장소에서 진행' },
  { syntax: '(시간경과)', description: '같은 장소 + 시간이 흐른 느낌' },
];

const EXAMPLE_SCRIPT = `오늘 시장 분위기가 심상치 않은데. (화자: 남자)(배경: 어두운 트레이딩룸)(분위기: 어두움)
맞아, KOSPI가 벌써 3% 빠졌어. (화자: 여자)(이전씬유지)(텍스트: "KOSPI -3.2%")
데이터를 보면 아직 저점이 아닐 수 있어. (구도: 캐릭터없음)(색상: 파랑)
일단 관망하면서 기회를 노리자. (화자: 여자)(배경: 밝은 사무실)(분위기: 밝음)`;

const DirectiveGuideModal: React.FC<DirectiveGuideModalProps> = ({ isOpen, onClose }) => {
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
      onClose();
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).catch(() => {});
  };

  return (
    <div
      onClick={handleOverlayClick}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0, 0, 0, 0.5)',
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
        padding: 20,
      }}
    >
      <div
        ref={modalRef}
        style={{
          background: 'var(--bg-surface)',
          borderRadius: 16,
          border: '1px solid var(--border-default)',
          maxWidth: 640,
          width: '100%',
          maxHeight: '85vh',
          overflowY: 'auto',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '20px 24px 16px',
          borderBottom: '1px solid var(--border-default)',
          position: 'sticky',
          top: 0,
          background: 'var(--bg-surface)',
          borderRadius: '16px 16px 0 0',
          zIndex: 1,
        }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>
              디렉티브 가이드
            </h2>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>
              고급 모드에서 사용할 수 있는 연출 명령어
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border-default)',
              borderRadius: 8,
              width: 32,
              height: 32,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              fontSize: 16,
              color: 'var(--text-secondary)',
              transition: 'all 0.15s',
              flexShrink: 0,
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-hover)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'var(--bg-elevated)'; }}
          >
            ✕
          </button>
        </div>

        <div style={{ padding: '16px 24px 24px' }}>
          {/* Section: Key-Value Directives */}
          <SectionHeader title="연출 디렉티브" subtitle="Key: Value 형식으로 값을 지정합니다" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1, marginBottom: 24 }}>
            {KEY_VALUE_DIRECTIVES.map((d, i) => (
              <DirectiveRow key={i} directive={d} onCopy={copyToClipboard} />
            ))}
          </div>

          {/* Section: Flag Directives */}
          <SectionHeader title="연결 디렉티브" subtitle="플래그 형식으로 씬 간 연결을 제어합니다" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1, marginBottom: 24 }}>
            {FLAG_DIRECTIVES.map((d, i) => (
              <DirectiveRow key={i} directive={d} onCopy={copyToClipboard} />
            ))}
          </div>

          {/* Example Script */}
          <SectionHeader title="사용 예시" subtitle="디렉티브를 조합한 대본 예시" />
          <div style={{
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border-default)',
            borderRadius: 10,
            padding: 16,
            position: 'relative',
          }}>
            <pre style={{
              margin: 0,
              fontSize: 13,
              lineHeight: 1.8,
              color: 'var(--text-primary)',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              fontFamily: 'inherit',
            }}>
              {EXAMPLE_SCRIPT.split('\n').map((line, i) => (
                <ExampleLine key={i} line={line} />
              ))}
            </pre>
            <button
              onClick={() => copyToClipboard(EXAMPLE_SCRIPT)}
              title="예시 복사"
              style={{
                position: 'absolute',
                top: 10,
                right: 10,
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-default)',
                borderRadius: 6,
                padding: '4px 8px',
                fontSize: 11,
                color: 'var(--text-muted)',
                cursor: 'pointer',
                transition: 'all 0.15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-primary)'; }}
              onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; }}
            >
              복사
            </button>
          </div>

          {/* Multi-language note */}
          <div style={{
            marginTop: 16,
            padding: '12px 14px',
            background: 'linear-gradient(135deg, rgba(96,165,250,0.08), rgba(129,140,248,0.06))',
            border: '1px solid rgba(96,165,250,0.2)',
            borderRadius: 10,
            fontSize: 12,
            lineHeight: 1.6,
            color: 'var(--text-secondary)',
          }}>
            <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>다국어 지원</span>
            <span style={{ margin: '0 6px', opacity: 0.4 }}>|</span>
            영어: <code style={codeStyle}>(background: dark office)</code>
            <span style={{ margin: '0 4px', opacity: 0.3 }}>/</span>
            일본어: <code style={codeStyle}>(背景: 暗いオフィス)</code>
            <span style={{ margin: '0 4px', opacity: 0.3 }}>/</span>
            한국어: <code style={codeStyle}>(배경: 어두운 사무실)</code>
          </div>
        </div>
      </div>
    </div>
  );
};

const codeStyle: React.CSSProperties = {
  background: 'var(--bg-elevated)',
  padding: '2px 6px',
  borderRadius: 4,
  fontSize: 11,
  fontFamily: 'monospace',
  color: '#60a5fa',
};

const SectionHeader: React.FC<{ title: string; subtitle: string }> = ({ title, subtitle }) => (
  <div style={{ marginBottom: 8 }}>
    <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>{title}</h3>
    <p style={{ margin: '2px 0 0', fontSize: 11, color: 'var(--text-muted)' }}>{subtitle}</p>
  </div>
);

const DirectiveRow: React.FC<{ directive: DirectiveItem; onCopy: (t: string) => void }> = ({ directive, onCopy }) => {
  const syntaxOnly = directive.syntax;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '8px 10px',
        borderRadius: 8,
        transition: 'background 0.15s',
        cursor: 'default',
      }}
      onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-elevated)'; }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
    >
      <code style={{
        background: 'var(--bg-elevated)',
        padding: '3px 8px',
        borderRadius: 5,
        fontSize: 12,
        fontFamily: 'monospace',
        color: '#818cf8',
        fontWeight: 600,
        whiteSpace: 'nowrap',
        flexShrink: 0,
        border: '1px solid rgba(129,140,248,0.15)',
      }}>
        {syntaxOnly}
      </code>
      <span style={{ fontSize: 12, color: 'var(--text-secondary)', flex: 1, lineHeight: 1.4 }}>
        {directive.description}
        {directive.example && (
          <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>
            {' '} — {directive.example}
          </span>
        )}
      </span>
      <button
        onClick={() => onCopy(syntaxOnly)}
        title="복사"
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          fontSize: 13,
          color: 'var(--text-muted)',
          padding: '2px 4px',
          borderRadius: 4,
          opacity: 0.5,
          transition: 'opacity 0.15s',
          flexShrink: 0,
        }}
        onMouseEnter={e => { e.currentTarget.style.opacity = '1'; }}
        onMouseLeave={e => { e.currentTarget.style.opacity = '0.5'; }}
      >
        📋
      </button>
    </div>
  );
};

const ExampleLine: React.FC<{ line: string }> = ({ line }) => {
  // Split line into text parts and directive parts
  const parts: React.ReactNode[] = [];
  let remaining = line;
  let keyIndex = 0;

  while (remaining.length > 0) {
    const match = remaining.match(/\([^)]+\)/);
    if (!match || match.index === undefined) {
      parts.push(<span key={`t-${keyIndex++}`}>{remaining}</span>);
      break;
    }
    if (match.index > 0) {
      parts.push(<span key={`t-${keyIndex++}`}>{remaining.slice(0, match.index)}</span>);
    }
    parts.push(
      <span key={`d-${keyIndex++}`} style={{ color: '#818cf8', fontWeight: 600 }}>
        {match[0]}
      </span>
    );
    remaining = remaining.slice(match.index + match[0].length);
  }

  return <div>{parts}</div>;
};

export default DirectiveGuideModal;
