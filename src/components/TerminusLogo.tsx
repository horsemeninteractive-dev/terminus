import React from 'react';

interface TerminusLogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showSubtitle?: boolean;
  className?: string;
}

export const TerminusSkullIcon: React.FC<{ className?: string }> = ({ className = 'w-full h-full' }) => (
  <svg
    viewBox="0 0 100 100"
    className={className}
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    {/* Cranium & Jaw outline */}
    <path
      d="M50 6 C28 6 12 22 12 44 C12 56 18 65 26 71 L26 84 C26 87.5 29.5 91 34 91 L66 91 C70.5 91 74 87.5 74 84 L74 71 C82 65 88 56 88 44 C88 22 72 6 50 6 Z"
      fill="#F8FAFC"
      stroke="#1E293B"
      strokeWidth="2.5"
      className="filter drop-shadow-[0_0_12px_rgba(255,255,255,0.4)]"
    />
    {/* Temporal / Brow lines */}
    <path
      d="M24 34 Q50 28 76 34"
      stroke="#CBD5E1"
      strokeWidth="2.5"
      strokeLinecap="round"
    />
    {/* Eye Sockets */}
    <path
      d="M24 43 C24 36 33 34 40 38 C44 41 44 49 41 54 C37 59 28 60 25 54 C24 51 24 46 24 43 Z"
      fill="#0A0A0A"
    />
    <path
      d="M76 43 C76 36 67 34 60 38 C56 41 56 49 59 54 C63 59 72 60 75 54 C76 51 76 46 76 43 Z"
      fill="#0A0A0A"
    />
    {/* Glowing Menacing Pupil Cores */}
    <circle cx="33" cy="46" r="3.5" fill="#EF4444" className="animate-pulse" />
    <circle cx="67" cy="46" r="3.5" fill="#EF4444" className="animate-pulse" />
    <circle cx="33" cy="46" r="1.5" fill="#FFF" />
    <circle cx="67" cy="46" r="1.5" fill="#FFF" />

    {/* Inverted Heart Nasal Cavity */}
    <path
      d="M50 52 L43 66 Q50 68 50 69 Q50 68 57 66 Z"
      fill="#0A0A0A"
    />

    {/* Cheekbone notches */}
    <path
      d="M16 48 C14 56 20 62 26 64"
      stroke="#94A3B8"
      strokeWidth="2"
      fill="none"
      strokeLinecap="round"
    />
    <path
      d="M84 48 C86 56 80 62 74 64"
      stroke="#94A3B8"
      strokeWidth="2"
      fill="none"
      strokeLinecap="round"
    />

    {/* Teeth & Jaw Separations (Mathematically centered at x=50) */}
    <rect x="31.75" y="77" width="4.5" height="10" rx="1" fill="#0A0A0A" />
    <rect x="39.75" y="77" width="4.5" height="10" rx="1" fill="#0A0A0A" />
    <rect x="47.75" y="77" width="4.5" height="10" rx="1" fill="#0A0A0A" />
    <rect x="55.75" y="77" width="4.5" height="10" rx="1" fill="#0A0A0A" />
    <rect x="63.75" y="77" width="4.5" height="10" rx="1" fill="#0A0A0A" />
    <line x1="28" y1="81" x2="72" y2="81" stroke="#0A0A0A" strokeWidth="1.5" />
  </svg>
);

export const TerminusLogo: React.FC<TerminusLogoProps> = ({
  size = 'lg',
  showSubtitle = true,
  className = '',
}) => {
  const fontSizes = {
    sm: 'text-3xl md:text-4xl',
    md: 'text-5xl md:text-6xl',
    lg: 'text-6xl md:text-7xl',
    xl: 'text-7xl sm:text-8xl md:text-9xl',
  };

  const skullSizes = {
    sm: 'w-6 h-6',
    md: 'w-10 h-10 md:w-12 md:h-12',
    lg: 'w-12 h-12 md:w-16 md:h-16',
    xl: 'w-16 h-16 sm:w-20 sm:h-20 md:w-28 md:h-28',
  };

  const gapSizes = {
    sm: 'gap-1',
    md: 'gap-1.5',
    lg: 'gap-2',
    xl: 'gap-2 md:gap-3',
  };

  return (
    <div className={`flex flex-col select-none ${className}`}>
      <h1
        className={`${fontSizes[size]} font-display font-black tracking-tight text-[#B31217] uppercase leading-none drop-shadow-[0_4px_30px_rgba(179,18,23,0.6)] flex items-center justify-center ${gapSizes[size]}`}
      >
        <span>TERM</span>
        {/* Stylized I Pillar with Centered Skull */}
        <span className="relative inline-flex flex-col items-center justify-center mx-0.5">
          {/* Top serif bar of the Roman I */}
          <span className="w-[0.44em] h-[0.08em] bg-[#B31217] mb-[0.03em] rounded-[1px]" />
          {/* Center vertical stem */}
          <span className="w-[0.18em] h-[0.72em] bg-[#B31217]" />
          {/* Bottom serif bar of the Roman I */}
          <span className="w-[0.44em] h-[0.08em] bg-[#B31217] mt-[0.03em] rounded-[1px]" />

          {/* Skull precisely centered horizontally and vertically in the middle of the I */}
          <span
            className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center justify-center ${skullSizes[size]} pointer-events-none drop-shadow-[0_0_16px_rgba(179,18,23,0.85)]`}
          >
            <TerminusSkullIcon />
          </span>
        </span>
        <span>NUS</span>
      </h1>

      {showSubtitle && (
        <div className="text-[11px] md:text-xs font-heading font-bold tracking-[0.22em] text-[#8C9BAE] uppercase mt-2.5 flex items-center justify-center gap-2">
          <span className="w-2 h-2 bg-[#B31217] clip-card-chip inline-block" />
          <span>REAL-WORLD SURVIVAL STRATEGY</span>
          <span className="w-2 h-2 bg-[#B31217] clip-card-chip inline-block" />
        </div>
      )}
    </div>
  );
};
