
import React, { useRef, useCallback } from 'react';

/** 이미지 리사이즈+압축 (413 Payload Too Large 방지, Vercel 4.5MB 제한) */
function compressImage(dataUrl: string, maxDim = 768, quality = 0.5): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      if (width > maxDim || height > maxDim) {
        const ratio = Math.min(maxDim / width, maxDim / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => resolve(dataUrl); // 실패 시 원본 반환
    img.src = dataUrl;
  });
}

export interface ReferenceImageSelectorProps {
  characterRefImages: string[];
  styleRefImages: string[];
  characterStrength: number;
  styleStrength: number;
  onCharacterImagesChange: (images: string[]) => void;
  onStyleImagesChange: (images: string[]) => void;
  onCharacterStrengthChange: (v: number) => void;
  onStyleStrengthChange: (v: number) => void;
  isDisabled: boolean;
}

const ReferenceImageSelector: React.FC<ReferenceImageSelectorProps> = ({
  characterRefImages,
  styleRefImages,
  characterStrength,
  styleStrength,
  onCharacterImagesChange,
  onStyleImagesChange,
  onCharacterStrengthChange,
  onStyleStrengthChange,
  isDisabled,
}) => {
  const characterFileInputRef = useRef<HTMLInputElement>(null);
  const styleFileInputRef = useRef<HTMLInputElement>(null);

  // 캐릭터 참조 이미지 업로드 핸들러 (자동 압축)
  const handleCharacterImageChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const remainingSlots = 2 - characterRefImages.length;
      const filesToProcess = (Array.from(files) as File[]).slice(0, remainingSlots);
      filesToProcess.forEach(file => {
        const reader = new FileReader();
        reader.onloadend = async () => {
          const compressed = await compressImage(reader.result as string);
          onCharacterImagesChange([...characterRefImages, compressed].slice(0, 2));
        };
        reader.readAsDataURL(file);
      });
    }
    if (characterFileInputRef.current) characterFileInputRef.current.value = '';
  }, [characterRefImages, onCharacterImagesChange]);

  // 스타일 참조 이미지 업로드 핸들러 (자동 압축)
  const handleStyleImageChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const remainingSlots = 2 - styleRefImages.length;
      const filesToProcess = (Array.from(files) as File[]).slice(0, remainingSlots);
      filesToProcess.forEach(file => {
        const reader = new FileReader();
        reader.onloadend = async () => {
          const compressed = await compressImage(reader.result as string);
          onStyleImagesChange([...styleRefImages, compressed].slice(0, 2));
        };
        reader.readAsDataURL(file);
      });
    }
    if (styleFileInputRef.current) styleFileInputRef.current.value = '';
  }, [styleRefImages, onStyleImagesChange]);

  // 캐릭터 이미지 제거 핸들러
  const removeCharacterImage = useCallback((index: number) => {
    onCharacterImagesChange(characterRefImages.filter((_, i) => i !== index));
  }, [characterRefImages, onCharacterImagesChange]);

  // 스타일 이미지 제거 핸들러
  const removeStyleImage = useCallback((index: number) => {
    onStyleImagesChange(styleRefImages.filter((_, i) => i !== index));
  }, [styleRefImages, onStyleImagesChange]);

  return (
    <div className="p-6 border rounded-3xl backdrop-blur-sm shadow-xl" style={{ backgroundColor: 'color-mix(in srgb, var(--bg-surface) 50%, transparent)', borderColor: 'var(--border-default)' }}>
      <div className="flex items-center gap-3 mb-5">
        <div className="w-8 h-8 bg-gradient-to-br from-violet-500 to-fuchsia-600 rounded-lg flex items-center justify-center">
          <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        </div>
        <div>
          <h3 className="font-bold text-lg" style={{ color: 'var(--text-primary)' }}>참조 이미지 설정</h3>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>참조 이미지가 있으면 고정 프롬프트보다 우선 적용됩니다</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* 캐릭터 참조 영역 */}
        <div className="p-4 rounded-2xl" style={{ backgroundColor: 'color-mix(in srgb, var(--bg-elevated) 50%, transparent)', borderWidth: '1px', borderStyle: 'solid', borderColor: 'var(--border-subtle)' }}>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xl">🧑</span>
            <div>
              <h4 className="font-bold text-sm" style={{ color: 'var(--text-primary)' }}>캐릭터 참조</h4>
              <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>캐릭터의 외모/스타일 참조 (최대 2장)</p>
            </div>
          </div>

          {/* 캐릭터 참조 이미지가 있을 때 안내 메시지 */}
          {characterRefImages.length > 0 && (
            <div className="mb-3 px-2 py-1.5 bg-amber-500/10 border border-amber-500/30 rounded-lg">
              <p className="text-amber-400 text-[10px] font-medium">
                ⚠️ 캐릭터 참조 이미지 우선 → 고정 캐릭터 프롬프트 제외
              </p>
            </div>
          )}

          <div className="flex flex-wrap gap-2 items-center mb-3">
            {characterRefImages.map((img, idx) => (
              <div key={idx} className="relative group">
                <div className="w-20 h-14 rounded-lg overflow-hidden border border-violet-500/50">
                  <img src={img} alt={`Character Ref ${idx}`} className="w-full h-full object-cover" />
                </div>
                <button
                  onClick={() => removeCharacterImage(idx)}
                  className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
            {characterRefImages.length < 2 && (
              <button
                type="button"
                onClick={() => characterFileInputRef.current?.click()}
                className="w-20 h-14 border-2 border-dashed rounded-lg flex items-center justify-center hover:border-violet-500 hover:text-violet-400 transition-all"
                style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-muted)' }}
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </button>
            )}
            <input
              type="file"
              ref={characterFileInputRef}
              onChange={handleCharacterImageChange}
              accept="image/*"
              className="hidden"
              multiple
            />
          </div>

          {/* 캐릭터 참조 강도 슬라이더 */}
          {characterRefImages.length > 0 && (
            <div className="pt-3" style={{ borderTop: '1px solid var(--border-subtle)' }}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-bold" style={{ color: 'var(--text-secondary)' }}>참조 강도</span>
                <span className="text-[10px] font-bold text-violet-400">{characterStrength}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={characterStrength}
                onChange={(e) => onCharacterStrengthChange(Number(e.target.value))}
                className="w-full h-1.5 rounded-lg appearance-none cursor-pointer accent-violet-500"
                style={{ backgroundColor: 'var(--bg-hover)' }}
              />
              <div className="flex justify-between text-[9px] mt-1" style={{ color: 'var(--text-muted)' }}>
                <span>약하게 (참고만)</span>
                <span>강하게 (정확히)</span>
              </div>
            </div>
          )}
        </div>

        {/* 스타일 참조 영역 */}
        <div className="p-4 rounded-2xl" style={{ backgroundColor: 'color-mix(in srgb, var(--bg-elevated) 50%, transparent)', borderWidth: '1px', borderStyle: 'solid', borderColor: 'var(--border-subtle)' }}>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xl">🎨</span>
            <div>
              <h4 className="font-bold text-sm" style={{ color: 'var(--text-primary)' }}>화풍/스타일 참조</h4>
              <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>전체적인 화풍과 분위기 참조 (최대 2장)</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 items-center mb-3">
            {styleRefImages.map((img, idx) => (
              <div key={idx} className="relative group">
                <div className="w-20 h-14 rounded-lg overflow-hidden border border-fuchsia-500/50">
                  <img src={img} alt={`Style Ref ${idx}`} className="w-full h-full object-cover" />
                </div>
                <button
                  onClick={() => removeStyleImage(idx)}
                  className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
            {styleRefImages.length < 2 && (
              <button
                type="button"
                onClick={() => styleFileInputRef.current?.click()}
                className="w-20 h-14 border-2 border-dashed rounded-lg flex items-center justify-center hover:border-fuchsia-500 hover:text-fuchsia-400 transition-all"
                style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-muted)' }}
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </button>
            )}
            <input
              type="file"
              ref={styleFileInputRef}
              onChange={handleStyleImageChange}
              accept="image/*"
              className="hidden"
              multiple
            />
          </div>

          {/* 스타일 참조 강도 슬라이더 */}
          {styleRefImages.length > 0 && (
            <div className="pt-3" style={{ borderTop: '1px solid var(--border-subtle)' }}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-bold" style={{ color: 'var(--text-secondary)' }}>참조 강도</span>
                <span className="text-[10px] font-bold text-fuchsia-400">{styleStrength}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={styleStrength}
                onChange={(e) => onStyleStrengthChange(Number(e.target.value))}
                className="w-full h-1.5 rounded-lg appearance-none cursor-pointer accent-fuchsia-500"
                style={{ backgroundColor: 'var(--bg-hover)' }}
              />
              <div className="flex justify-between text-[9px] mt-1" style={{ color: 'var(--text-muted)' }}>
                <span>약하게 (참고만)</span>
                <span>강하게 (정확히)</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ReferenceImageSelector;
