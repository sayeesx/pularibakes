import React, { useEffect, useState } from 'react';

interface BatchSuccessAnimationProps {
  isVisible: boolean;
  message?: string;
  subMessage?: string;
  onComplete?: () => void;
  duration?: number;
}

/**
 * A beautiful, themed CSS "Lottie-like" success animation overlay.
 * Shows an animated checkmark with ripple rings, particle bursts, and confetti.
 * Accented with EPSO red & golden amber theme colors.
 */
export const BatchSuccessAnimation: React.FC<BatchSuccessAnimationProps> = ({
  isVisible,
  message = 'ബാച്ച് വിജയകരമായി ചേർത്തു!',
  subMessage = 'Batch Saved Successfully',
  onComplete,
  duration = 2000,
}) => {
  const [show, setShow] = useState(false);
  const [fadeOut, setFadeOut] = useState(false);

  useEffect(() => {
    if (isVisible) {
      setShow(true);
      setFadeOut(false);

      const fadeTimer = setTimeout(() => {
        setFadeOut(true);
      }, duration - 350);

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
      className={`absolute inset-0 z-50 bg-white dark:bg-[#1E1B1B] text-stone-900 dark:text-stone-100 rounded-t-3xl sm:rounded-2xl p-6 sm:p-8 flex flex-col items-center justify-center gap-4 transition-opacity duration-300 pointer-events-auto ${
        fadeOut ? 'opacity-0' : 'opacity-100'
      }`}
    >
      {/* Animated ring + checkmark */}
      <div className="relative w-24 h-24 flex items-center justify-center my-1">
        {/* Outer ripple rings */}
        <div className="absolute inset-0 batch-ripple-1 rounded-full border-2 border-epso-red/50" />
        <div className="absolute inset-[-8px] batch-ripple-2 rounded-full border border-amber-500/35" />
        <div className="absolute inset-[-16px] batch-ripple-3 rounded-full border border-amber-400/20" />

        {/* Main circle */}
        <div className="absolute inset-0 rounded-full batch-success-circle flex items-center justify-center shadow-[0_10px_30px_rgba(198,56,43,0.35)]">
          {/* Background gradient fill */}
          <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-[#991B1B] via-epso-red to-amber-500 batch-circle-fill" />

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
              strokeWidth="5"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          </svg>
        </div>

        {/* Particle bursts */}
        {Array.from({ length: 10 }).map((_, i) => (
          <div
            key={`p-${i}`}
            className="absolute left-1/2 top-1/2 batch-particle"
            style={{
              '--particle-angle': `${i * 36}deg`,
              '--particle-delay': `${0.25 + i * 0.04}s`,
              '--particle-color': i % 2 === 0 ? '#C6382B' : '#F59E0B',
            } as React.CSSProperties}
          />
        ))}

        {/* Mini confetti dots */}
        {Array.from({ length: 14 }).map((_, i) => (
          <div
            key={`confetti-${i}`}
            className="absolute left-1/2 top-1/2 batch-confetti"
            style={{
              '--confetti-angle': `${i * 25.7}deg`,
              '--confetti-delay': `${0.3 + i * 0.03}s`,
              '--confetti-distance': `${48 + (i % 3) * 12}px`,
              '--confetti-color': ['#C6382B', '#F59E0B', '#10B981', '#FBBF24', '#EF4444'][i % 5],
            } as React.CSSProperties}
          />
        ))}
      </div>

      {/* Text inside Modal */}
      <div className="text-center batch-success-text px-2 max-w-sm">
        <p className="text-xl sm:text-2xl font-black text-stone-900 dark:text-stone-100 font-malayalam tracking-tight leading-snug">
          {message}
        </p>
        {subMessage && (
          <p className="text-xs sm:text-sm font-bold text-stone-500 dark:text-stone-400 mt-1.5">
            {subMessage}
          </p>
        )}
      </div>
    </div>
  );
};
