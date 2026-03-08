import React, { useState } from 'react';
import { ProjectSettings } from '../../types';

interface PresetGroupProps {
  projects: ProjectSettings[];
  onSave: () => void;
  onLoad: (project: ProjectSettings) => void;
  onUpdate: (project: ProjectSettings) => void;
  onDelete: (id: string) => void;
  newProjectName: string;
  onNewProjectNameChange: (name: string) => void;
}

const PresetGroup: React.FC<PresetGroupProps> = ({
  projects,
  onSave,
  onLoad,
  onUpdate,
  onDelete,
  newProjectName,
  onNewProjectNameChange,
}) => {
  const [showSaveInput, setShowSaveInput] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {/* Preset chips - horizontal wrap */}
      {projects.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {projects.map((project) => (
            <div
              key={project.id}
              style={{
                position: 'relative',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '5px 10px',
                borderRadius: 8,
                background: expandedId === project.id
                  ? 'rgba(96,165,250,0.15)'
                  : 'var(--bg-elevated)',
                border: `1px solid ${
                  expandedId === project.id
                    ? 'rgba(96,165,250,0.4)'
                    : 'var(--border-subtle)'
                }`,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                fontSize: 12,
              }}
              onClick={() => setExpandedId(expandedId === project.id ? null : project.id)}
            >
              <span
                style={{
                  fontWeight: 600,
                  color: 'var(--text-primary)',
                  maxWidth: 120,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {project.name}
              </span>
              <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                {project.imageModel === 'gpt-image-1' ? 'GPT' : 'Gemini'}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Expanded preset actions */}
      {expandedId && (() => {
        const project = projects.find(p => p.id === expandedId);
        if (!project) return null;
        return (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 10px',
              borderRadius: 8,
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border-subtle)',
            }}
          >
            <span
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: 'var(--text-primary)',
                marginRight: 'auto',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {project.name}
            </span>
            <button
              type="button"
              onClick={() => { onLoad(project); setExpandedId(null); }}
              style={{
                padding: '3px 10px',
                fontSize: 11,
                fontWeight: 700,
                color: '#fff',
                background: 'rgba(96,165,250,0.85)',
                border: 'none',
                borderRadius: 6,
                cursor: 'pointer',
              }}
            >
              적용
            </button>
            <button
              type="button"
              onClick={() => { onUpdate(project); setExpandedId(null); }}
              style={{
                padding: '3px 8px',
                fontSize: 11,
                fontWeight: 600,
                color: 'var(--text-secondary)',
                background: 'var(--bg-hover)',
                border: 'none',
                borderRadius: 6,
                cursor: 'pointer',
              }}
            >
              덮어쓰기
            </button>
            <button
              type="button"
              onClick={() => { onDelete(project.id); setExpandedId(null); }}
              style={{
                padding: '3px 8px',
                fontSize: 11,
                fontWeight: 600,
                color: '#f87171',
                background: 'rgba(239,68,68,0.15)',
                border: 'none',
                borderRadius: 6,
                cursor: 'pointer',
              }}
            >
              삭제
            </button>
          </div>
        );
      })()}

      {/* Save row */}
      {!showSaveInput ? (
        <button
          type="button"
          onClick={() => setShowSaveInput(true)}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            width: '100%',
            padding: '7px 0',
            fontSize: 12,
            fontWeight: 600,
            color: 'var(--text-muted)',
            background: 'transparent',
            border: '1px dashed var(--border-subtle)',
            borderRadius: 8,
            cursor: 'pointer',
            transition: 'border-color 0.15s, color 0.15s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = 'rgba(96,165,250,0.4)';
            e.currentTarget.style.color = 'var(--text-secondary)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = 'var(--border-subtle)';
            e.currentTarget.style.color = 'var(--text-muted)';
          }}
        >
          <span style={{ fontSize: 14 }}>+</span>
          현재 설정 저장
        </button>
      ) : (
        <div
          style={{
            display: 'flex',
            gap: 6,
            alignItems: 'center',
          }}
        >
          <input
            type="text"
            value={newProjectName}
            onChange={(e) => onNewProjectNameChange(e.target.value)}
            placeholder="프리셋 이름..."
            onKeyDown={(e) => {
              if (e.key === 'Enter' && newProjectName.trim()) {
                onSave();
                setShowSaveInput(false);
              }
              if (e.key === 'Escape') {
                setShowSaveInput(false);
              }
            }}
            autoFocus
            style={{
              flex: 1,
              padding: '6px 10px',
              fontSize: 12,
              borderRadius: 6,
              border: '1px solid var(--border-subtle)',
              background: 'var(--bg-surface)',
              color: 'var(--text-primary)',
              outline: 'none',
              minWidth: 0,
            }}
          />
          <button
            type="button"
            onClick={() => {
              if (newProjectName.trim()) {
                onSave();
                setShowSaveInput(false);
              }
            }}
            disabled={!newProjectName.trim()}
            style={{
              padding: '6px 14px',
              fontSize: 12,
              fontWeight: 700,
              color: '#fff',
              background: newProjectName.trim()
                ? 'rgba(96,165,250,0.85)'
                : 'rgba(96,165,250,0.3)',
              border: 'none',
              borderRadius: 6,
              cursor: newProjectName.trim() ? 'pointer' : 'default',
            }}
          >
            저장
          </button>
          <button
            type="button"
            onClick={() => setShowSaveInput(false)}
            style={{
              padding: '6px 10px',
              fontSize: 12,
              fontWeight: 600,
              color: 'var(--text-muted)',
              background: 'var(--bg-hover)',
              border: 'none',
              borderRadius: 6,
              cursor: 'pointer',
            }}
          >
            취소
          </button>
        </div>
      )}
    </div>
  );
};

export default PresetGroup;
