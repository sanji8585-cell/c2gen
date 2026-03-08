import React from 'react';
import type { BrandPreset } from '../../types';

interface Step1Props {
  data: Partial<BrandPreset>;
  onUpdate: (data: Partial<BrandPreset>) => void;
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 14px',
  background: 'var(--bg-surface)',
  border: '1px solid var(--border-subtle)',
  borderRadius: 8,
  color: 'var(--text-primary)',
  fontSize: 14,
  outline: 'none',
  transition: 'border-color 0.2s',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  marginBottom: 6,
  fontSize: 13,
  fontWeight: 600,
  color: 'var(--text-secondary)',
};

export default function Step1BasicInfo({ data, onUpdate }: Step1Props) {
  const handleChange = (field: keyof BrandPreset, value: string) => {
    onUpdate({ [field]: value });
  };

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2
          className="text-lg font-bold mb-1"
          style={{ color: 'var(--text-primary)' }}
        >
          기본 정보
        </h2>
        <p className="text-[12px]" style={{ color: 'var(--text-muted)' }}>
          브랜드의 기본 정보를 입력해주세요.
        </p>
      </div>

      {/* 브랜드 이름 */}
      <div>
        <label style={labelStyle}>
          브랜드 이름 <span style={{ color: '#f87171' }}>*</span>
        </label>
        <input
          type="text"
          value={data.name || ''}
          onChange={(e) => handleChange('name', e.target.value)}
          placeholder="예: 댕댕이월드"
          style={inputStyle}
          onFocus={(e) =>
            (e.currentTarget.style.borderColor = 'var(--border-default)')
          }
          onBlur={(e) =>
            (e.currentTarget.style.borderColor = 'var(--border-subtle)')
          }
        />
      </div>

      {/* 브랜드 한줄 설명 */}
      <div>
        <label style={labelStyle}>브랜드 한줄 설명</label>
        <input
          type="text"
          value={data.description || ''}
          onChange={(e) => handleChange('description', e.target.value)}
          placeholder="예: 반려견과 함께하는 일상 이야기"
          style={inputStyle}
          onFocus={(e) =>
            (e.currentTarget.style.borderColor = 'var(--border-default)')
          }
          onBlur={(e) =>
            (e.currentTarget.style.borderColor = 'var(--border-subtle)')
          }
        />
      </div>

      {/* 타겟 오디언스 */}
      <div>
        <label style={labelStyle}>타겟 오디언스</label>
        <input
          type="text"
          value={data.target_audience || ''}
          onChange={(e) => handleChange('target_audience', e.target.value)}
          placeholder="예: 20-30대 반려동물 애호가"
          style={inputStyle}
          onFocus={(e) =>
            (e.currentTarget.style.borderColor = 'var(--border-default)')
          }
          onBlur={(e) =>
            (e.currentTarget.style.borderColor = 'var(--border-subtle)')
          }
        />
      </div>

      {/* 세계관 설명 */}
      <div>
        <label style={labelStyle}>세계관 설명</label>
        <textarea
          rows={4}
          value={data.world_view || ''}
          onChange={(e) => handleChange('world_view', e.target.value)}
          placeholder="브랜드가 그리는 세계관을 설명해주세요..."
          style={{
            ...inputStyle,
            resize: 'vertical',
            minHeight: 100,
          }}
          onFocus={(e) =>
            (e.currentTarget.style.borderColor = 'var(--border-default)')
          }
          onBlur={(e) =>
            (e.currentTarget.style.borderColor = 'var(--border-subtle)')
          }
        />
        <p
          className="text-[12px] mt-1"
          style={{ color: 'var(--text-muted)' }}
        >
          캐릭터가 살고 있는 배경, 시대, 분위기 등을 자유롭게 적어주세요.
        </p>
      </div>
    </div>
  );
}
