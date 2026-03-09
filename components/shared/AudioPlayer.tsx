import React, { useState, useRef, useEffect, memo } from 'react';
import { decodeAudio } from './audioUtils';

const AudioPlayer: React.FC<{ base64: string }> = memo(({ base64 }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);

  const stopAudio = () => {
    if (sourceRef.current) { try { sourceRef.current.stop(); } catch {} sourceRef.current = null; }
    setIsPlaying(false);
  };

  const playAudio = async () => {
    if (isPlaying) { stopAudio(); return; }
    try {
      setIsPlaying(true);
      if (!audioContextRef.current) {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        audioContextRef.current = new AudioContextClass();
      }
      const ctx = audioContextRef.current;
      if (ctx.state === 'suspended') await ctx.resume();
      const audioBuffer = await decodeAudio(base64, ctx);
      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(ctx.destination);
      source.onended = () => setIsPlaying(false);
      source.start();
      sourceRef.current = source;
    } catch (error) { console.error(error); setIsPlaying(false); }
  };

  useEffect(() => {
    return () => {
      stopAudio();
      audioContextRef.current?.close();
      audioContextRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <button onClick={playAudio} className={`p-2.5 rounded-full border transition-all ${isPlaying ? 'bg-brand-600 border-brand-500 text-white animate-pulse' : 'hover:text-[var(--text-primary)]'}`} style={isPlaying ? undefined : { backgroundColor: 'var(--bg-elevated)', borderColor: 'var(--border-subtle)', color: 'var(--text-secondary)' }}>
      {isPlaying
        ? <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
        : <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>}
    </button>
  );
});
AudioPlayer.displayName = 'AudioPlayer';

export default AudioPlayer;
