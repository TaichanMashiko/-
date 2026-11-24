import type { MascotMood } from '../types';

interface MascotProps {
  mood: MascotMood;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  darkSurface?: boolean;
}

export function Mascot({ mood, size = 'md', darkSurface = false }: MascotProps) {
  const dimensionClass =
    size === 'xs'
      ? 'w-9 h-9'
      : size === 'sm'
        ? 'w-12 h-12'
        : size === 'lg'
          ? 'w-20 h-20'
          : 'w-16 h-16';

  const motionClass =
    mood === 'confused'
      ? 'animate-mascot-wobble'
      : mood === 'happy'
        ? 'animate-mascot-cheer'
        : 'animate-mascot-float';

  const bodyFill =
    mood === 'confused'
      ? '#FFF1F2'
      : mood === 'happy'
        ? '#ECFDF5'
        : mood === 'alert'
          ? '#FEF2F2'
          : '#EFF6FF';

  const bodyStroke =
    mood === 'confused'
      ? '#E11D48'
      : mood === 'happy'
        ? '#059669'
        : mood === 'alert'
          ? '#EF4444'
          : '#2563EB';

  const cheekFill =
    mood === 'confused'
      ? '#FDA4AF'
      : mood === 'happy'
        ? '#6EE7B7'
        : '#93C5FD';

  return (
    <div
      className={`relative inline-flex items-center justify-center select-none shrink-0 ${dimensionClass}`}
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 96 96"
        className={`w-full h-full overflow-visible ${motionClass}`}
      >
        {/* Little sprout / antenna */}
        <path
          d="M48 16 C48 9, 41 6, 38 10 C35 14, 44 17, 48 16 Z"
          fill="#34D399"
          stroke={bodyStroke}
          strokeWidth="2.5"
          strokeLinejoin="round"
        />
        <path
          d="M48 16 C48 9, 55 6, 58 10 C61 14, 52 17, 48 16 Z"
          fill="#10B981"
          stroke={bodyStroke}
          strokeWidth="2.5"
          strokeLinejoin="round"
        />
        <line
          x1="48"
          y1="16"
          x2="48"
          y2="24"
          stroke={bodyStroke}
          strokeWidth="3"
          strokeLinecap="round"
        />

        {/* Soft rounded companion body */}
        <rect
          x="16"
          y="24"
          width="64"
          height="56"
          rx="26"
          fill={bodyFill}
          stroke={bodyStroke}
          strokeWidth="3.5"
        />

        {/* Ear / side tufts */}
        <circle cx="17" cy="48" r="6" fill={bodyFill} stroke={bodyStroke} strokeWidth="3" />
        <circle cx="79" cy="48" r="6" fill={bodyFill} stroke={bodyStroke} strokeWidth="3" />

        {/* Rosy cheeks */}
        <ellipse cx="30" cy="57" rx="5.5" ry="3.2" fill={cheekFill} opacity="0.85" />
        <ellipse cx="66" cy="57" rx="5.5" ry="3.2" fill={cheekFill} opacity="0.85" />

        {/* Facial expressions by mood */}
        {mood === 'confused' && (
          <>
            {/* Worried eyebrows */}
            <path
              d="M29 41 L38 44"
              stroke="#1E293B"
              strokeWidth="2.8"
              strokeLinecap="round"
            />
            <path
              d="M67 41 L58 44"
              stroke="#1E293B"
              strokeWidth="2.8"
              strokeLinecap="round"
            />
            {/* Swirled / worried eyes */}
            <circle cx="35" cy="50" r="3.6" fill="#1E293B" />
            <circle cx="61" cy="50" r="3.6" fill="#1E293B" />
            <circle cx="36.2" cy="48.8" r="1.2" fill="#FFFFFF" />
            <circle cx="62.2" cy="48.8" r="1.2" fill="#FFFFFF" />
            {/* Wavy confused mouth */}
            <path
              d="M41 62 Q44.5 59 48 62 T55 62"
              fill="none"
              stroke="#1E293B"
              strokeWidth="2.8"
              strokeLinecap="round"
            />
            {/* Sweat drop */}
            <path
              d="M72 32 C72 32, 76 38, 76 41 C76 43.5, 74 45, 72 45 C70 45, 68 43.5, 68 41 C68 38, 72 32, 72 32 Z"
              fill="#38BDF8"
              stroke="#0284C7"
              strokeWidth="1.5"
            />
            {/* Floating "?" badge */}
            <g transform="translate(68, 4)">
              <circle
                cx="12"
                cy="12"
                r="11"
                fill="#E11D48"
                stroke={darkSurface ? '#0F172A' : '#FFFFFF'}
                strokeWidth="2"
              />
              <text
                x="12"
                y="17"
                textAnchor="middle"
                fill="#FFFFFF"
                fontSize="15"
                fontWeight="800"
                fontFamily="Plus Jakarta Sans, sans-serif"
              >
                ?
              </text>
            </g>
          </>
        )}

        {mood === 'happy' && (
          <>
            {/* Happy crescent eyes */}
            <path
              d="M29 50 Q35 43 41 50"
              fill="none"
              stroke="#1E293B"
              strokeWidth="3.2"
              strokeLinecap="round"
            />
            <path
              d="M55 50 Q61 43 67 50"
              fill="none"
              stroke="#1E293B"
              strokeWidth="3.2"
              strokeLinecap="round"
            />
            {/* Big cheerful smile */}
            <path
              d="M40 58 Q48 67 56 58"
              fill="none"
              stroke="#1E293B"
              strokeWidth="3"
              strokeLinecap="round"
            />
            {/* Sparkles */}
            <path
              d="M78 14 L80 20 L86 22 L80 24 L78 30 L76 24 L70 22 L76 20 Z"
              fill="#F59E0B"
            />
            <path
              d="M15 20 L16.5 24 L20.5 25.5 L16.5 27 L15 31 L13.5 27 L9.5 25.5 L13.5 24 Z"
              fill="#10B981"
            />
          </>
        )}

        {mood === 'alert' && (
          <>
            {/* Wide attentive eyes */}
            <circle cx="35" cy="48" r="4.5" fill="#1E293B" />
            <circle cx="61" cy="48" r="4.5" fill="#1E293B" />
            <circle cx="36.5" cy="46.5" r="1.5" fill="#FFFFFF" />
            <circle cx="62.5" cy="46.5" r="1.5" fill="#FFFFFF" />
            <ellipse cx="48" cy="61" rx="4.5" ry="3.5" fill="#1E293B" />
            <g transform="translate(68, 4)">
              <circle
                cx="12"
                cy="12"
                r="11"
                fill="#EF4444"
                stroke="#0F172A"
                strokeWidth="2"
              />
              <text
                x="12"
                y="17"
                textAnchor="middle"
                fill="#FFFFFF"
                fontSize="15"
                fontWeight="800"
              >
                !
              </text>
            </g>
          </>
        )}

        {mood === 'paused' && (
          <>
            {/* Calm closed eyes */}
            <path
              d="M29 50 L40 50"
              stroke="#475569"
              strokeWidth="3"
              strokeLinecap="round"
            />
            <path
              d="M56 50 L67 50"
              stroke="#475569"
              strokeWidth="3"
              strokeLinecap="round"
            />
            <line
              x1="43"
              y1="61"
              x2="53"
              y2="61"
              stroke="#475569"
              strokeWidth="2.8"
              strokeLinecap="round"
            />
          </>
        )}

        {mood === 'idle' && (
          <>
            {/* Friendly bright eyes */}
            <circle cx="35" cy="49" r="3.8" fill="#1E293B" />
            <circle cx="61" cy="49" r="3.8" fill="#1E293B" />
            <circle cx="36.2" cy="47.5" r="1.3" fill="#FFFFFF" />
            <circle cx="62.2" cy="47.5" r="1.3" fill="#FFFFFF" />
            {/* Gentle smile */}
            <path
              d="M42 59 Q48 64 54 59"
              fill="none"
              stroke="#1E293B"
              strokeWidth="2.8"
              strokeLinecap="round"
            />
          </>
        )}
      </svg>
    </div>
  );
}
