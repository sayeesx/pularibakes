import React, { useEffect, useState } from 'react';

interface BatchSuccessAnimationProps {
  isVisible: boolean;
  message?: string;
  subMessage?: string;
  onComplete?: () => void;
  duration?: number;
}

/**
 * A beautiful, themed CSS-only "Lottie-like" success animation overlay.
 * Shows an animated checkmark with ripple effects, particle bursts, and confetti.
 * Uses the app's EPSO orange/amber theme colors.
 */
export const BatchSuccessAnimation: React.FC<BatchSuccessAnimationProps> = ({
  isVisible,
  message = 'വിജയകരമായി സേവ് ചെയ്തു!',
  subMessage = 'Successfully saved',
  onComplete,
  duration = 2200,
}) => {
  const [show, setShow] = useState(false);
  const [fadeOut, setFadeOut] = useState(false);

  useEffect(() => {
    if (isVisible) {
      setShow(true);
      setFadeOut(false);

      const fadeTimer = setTimeout(() => {
        setFadeOut(true);
      }, duration - 400);

      const hideTimer = setTimeout(() => {
        setShow(false);
        setFadeOut(false);
        onComplete?.();
      }, duration);

      return () => {
        clearTimeout(fadeTimer);
        clearTimeout(hideTimer);
      };
    } else {
      setShow(false);
      setFadeOut(false);
    }
  }, [isVisible, duration, onComplete]);

  if (!show) return null;

  return (
    <div
      className={`fixed inset-0 z-[100] flex items-center justify-center pointer-events-none transition-opacity duration-300 ${
        fadeOut ? 'opacity-0' : 'opacity-100'
      }`}
    >
      {/* Backdrop glow */}
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm batch-success-backdrop" />

      {/* Center content */}
      <div className="relative flex flex-col items-center gap-4 z-10 batch-success-container">
        {/* Animated ring + checkmark */}
        <div className="relative w-24 h-24">
          {/* Outer ripple rings */}
          <div className="absolute inset-0 batch-ripple-1 rounded-full border-2 border-epso-orange/40" />
          <div className="absolute inset-[-8px] batch-ripple-2 rounded-full border border-amber-400/30" />
          <div className="absolute inset-[-16px] batch-ripple-3 rounded-full border border-amber-500/20" />

          {/* Main circle */}
          <div className="absolute inset-0 rounded-full batch-success-circle flex items-center justify-center">
            {/* Background fill */}
            <div className="absolute inset-0 rounded-full bg-gradient-to-br from-epso-orange via-amber-500 to-amber-400 batch-circle-fill" />

            {/* Checkmark SVG */}
            <svg
              className="relative z-10 w-12 h-12 text-white batch-checkmark"
              viewBox="0 0 52 52"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                className="batch-checkmark-path"
                d="M14 27L22 35L38 17"
                stroke="currentColor"
                strokeWidth="4.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
              />
            </svg>
          </div>

          {/* Particle bursts */}
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="absolute left-1/2 top-1/2 batch-particle"
              style={{
                '--particle-angle': `${i * 45}deg`,
                '--particle-delay': `${0.3 + i * 0.05}s`,
                '--particle-color': i % 2 === 0 ? '#EA580C' : '#F59E0B',
              } as React.CSSProperties}
            />
          ))}

          {/* Mini confetti dots */}
          {Array.from({ length: 12 }).map((_, i) => (
            <div
              key={`confetti-${i}`}
              className="absolute left-1/2 top-1/2 batch-confetti"
              style={{
                '--confetti-angle': `${i * 30}deg`,
                '--confetti-delay': `${0.35 + i * 0.04}s`,
                '--confetti-distance': `${48 + (i % 3) * 12}px`,
                '--confetti-color': ['#EA580C', '#F59E0B', '#10B981', '#8B5CF6', '#C6382B'][i % 5],
              } as React.CSSProperties}
            />
          ))}
        </div>

        {/* Text */}
        <div className="text-center batch-success-text">
          <p className="text-base font-black text-white font-malayalam drop-shadow-lg">
            {message}
          </p>
          <p className="text-xs font-bold text-white/80 mt-0.5 drop-shadow-md">
            {subMessage}
          </p>
        </div>
      </div>
    </div>
  );
};
