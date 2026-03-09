import React, { useRef, useState, useEffect, memo } from 'react';

const LazyImage: React.FC<{ src: string; alt: string; className?: string }> = memo(({ src, alt, className }) => {
  const imgRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setIsVisible(true); observer.disconnect(); } },
      { rootMargin: '100px' }
    );
    if (imgRef.current) observer.observe(imgRef.current);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={imgRef} className="w-full h-full">
      {isVisible ? (
        <img src={src} alt={alt}
          className={`${className} ${isLoaded ? 'opacity-100' : 'opacity-0'} transition-opacity duration-300`}
          onLoad={() => setIsLoaded(true)} loading="lazy" />
      ) : (
        <div className="w-full h-full animate-pulse" style={{ backgroundColor: 'var(--bg-elevated)' }} />
      )}
    </div>
  );
});
LazyImage.displayName = 'LazyImage';

export default LazyImage;
