import React, { useEffect, useState } from 'react';
import { IFZ_IMAGES } from '../assets/images';

interface DynamicAtmosphericBackgroundProps {
  className?: string;
  enableWeather?: boolean;
}

export const DynamicAtmosphericBackground: React.FC<DynamicAtmosphericBackgroundProps> = ({
  className = '',
  enableWeather = true,
}) => {
  const [cycleProgress, setCycleProgress] = useState<number>(0);

  // 40-second continuous cycle from Dawn -> Day -> Dusk -> Night -> Dawn
  const CYCLE_DURATION_MS = 40000;

  useEffect(() => {
    let animationFrameId: number;
    const startTime = performance.now();

    const updateLoop = (currentTime: number) => {
      const elapsed = (currentTime - startTime) % CYCLE_DURATION_MS;
      const progress = elapsed / CYCLE_DURATION_MS; // 0.0 to 1.0
      setCycleProgress(progress);
      animationFrameId = requestAnimationFrame(updateLoop);
    };

    animationFrameId = requestAnimationFrame(updateLoop);
    return () => cancelAnimationFrame(animationFrameId);
  }, []);

  // Calculate smooth cosine weights for the 4 time-of-day images
  const calculateWeights = (p: number) => {
    const dist = (target: number) => {
      let d = Math.abs(p - target);
      if (d > 0.5) d = 1 - d;
      return d;
    };

    const computeWeight = (center: number) => {
      const d = dist(center);
      if (d >= 0.25) return 0;
      return 0.5 * (1 + Math.cos((d / 0.25) * Math.PI));
    };

    const wDawn = computeWeight(0.0);
    const wDay = computeWeight(0.25);
    const wDusk = computeWeight(0.5);
    const wNight = computeWeight(0.75);

    const total = (wDawn + wDay + wDusk + wNight) || 1;
    return {
      dawn: wDawn / total,
      day: wDay / total,
      dusk: wDusk / total,
      night: wNight / total,
    };
  };

  const weights = calculateWeights(cycleProgress);

  return (
    <div className={`absolute inset-0 overflow-hidden pointer-events-none ${className}`}>
      {/* 1. Dawn Layer */}
      <img
        src={IFZ_IMAGES.menuBgDawn}
        alt="Terminus Dawn Horizon"
        referrerPolicy="no-referrer"
        className="absolute inset-0 w-full h-full object-cover object-center transition-opacity duration-300 ease-linear will-change-opacity"
        style={{ opacity: weights.dawn }}
      />

      {/* 2. Day Layer */}
      <img
        src={IFZ_IMAGES.menuBgDay}
        alt="Terminus Midday Horizon"
        referrerPolicy="no-referrer"
        className="absolute inset-0 w-full h-full object-cover object-center transition-opacity duration-300 ease-linear will-change-opacity"
        style={{ opacity: weights.day }}
      />

      {/* 3. Dusk Layer */}
      <img
        src={IFZ_IMAGES.menuBgDusk}
        alt="Terminus Dusk Horizon"
        referrerPolicy="no-referrer"
        className="absolute inset-0 w-full h-full object-cover object-center transition-opacity duration-300 ease-linear will-change-opacity"
        style={{ opacity: weights.dusk }}
      />

      {/* 4. Night Layer */}
      <img
        src={IFZ_IMAGES.menuBgNight}
        alt="Terminus Night Horizon"
        referrerPolicy="no-referrer"
        className="absolute inset-0 w-full h-full object-cover object-center transition-opacity duration-300 ease-linear will-change-opacity"
        style={{ opacity: weights.night }}
      />
    </div>
  );
};
