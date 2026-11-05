import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';

export const NavigationProgress: React.FC = () => {
  const location = useLocation();
  const [navigating, setNavigating] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    // When location changes, trigger a quick, responsive progress animation
    setNavigating(true);
    setProgress(30);

    const t1 = setTimeout(() => {
      setProgress(75);
    }, 100);

    const t2 = setTimeout(() => {
      setProgress(100);
    }, 220);

    const t3 = setTimeout(() => {
      setNavigating(false);
      setProgress(0);
    }, 400);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [location.pathname, location.search]);

  if (!navigating && progress === 0) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-50 pointer-events-none">
      {/* Top Progress Line */}
      <div
        className="h-1 bg-gradient-to-r from-epso-red via-epso-orange to-amber-400 transition-all duration-200 ease-out shadow-[0_0_8px_rgba(198,56,43,0.6)]"
        style={{
          width: `${progress}%`,
          opacity: navigating ? 1 : 0,
        }}
      />
    </div>
  );
};
