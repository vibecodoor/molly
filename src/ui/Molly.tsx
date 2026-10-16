import { t } from '../core/i18n';

/** Molly the mole. Flat soil fur, pink nose and paws, round wire glasses. */
export type MollyPose = 'peek' | 'sleep';

export function Molly({ pose = 'peek', size = 96, className }: { pose?: MollyPose; size?: number; className?: string }) {
  const eye = (cx: number, closed: boolean) =>
    closed ? (
      <path d={`M${cx - 3.2} 58.6 q3.2 2.6 6.4 0`} fill="none" stroke="var(--wire)" strokeWidth="1.8" strokeLinecap="round" />
    ) : (
      <circle cx={cx} cy={58} r="1.9" fill="var(--wire)" />
    );
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 120 120"
      role="img"
      aria-label={t().molly}
      style={{ display: 'block', overflow: 'visible' }}
    >
      {/* body rising out of the ground */}
      <path d="M8 120 C8 74 28 34 60 34 C92 34 112 74 112 120 Z" fill="var(--fur)" />
      {/* velvet sheen */}
      <path d="M32 54 C39 44 48 39 59 38" fill="none" stroke="var(--fur-2)" strokeWidth="3" strokeLinecap="round" />
      {/* glasses */}
      <g fill="none" stroke="var(--wire)" strokeWidth="2">
        <circle cx="46" cy="58" r="9.5" />
        <circle cx="74" cy="58" r="9.5" />
        <path d="M55.5 57 q4.5 -2.6 9 0" />
      </g>
      {eye(46, pose === 'sleep')}
      {eye(74, pose === 'sleep')}
      {/* snout and nose */}
      <ellipse cx="60" cy="79" rx="15" ry="11.5" fill="var(--fur-2)" />
      <ellipse cx="60" cy="73.5" rx="7.4" ry="5.6" fill="var(--nose)" />
      <path d="M55.5 85.5 q4.5 3.2 9 0" fill="none" stroke="var(--fur)" strokeWidth="1.8" strokeLinecap="round" />
      {/* paws on the ground edge */}
      <g fill="var(--paw)">
        <path d="M22 120 c0 -9 7 -14 14 -14 s13 5 13 14 Z" />
        <path d="M71 120 c0 -9 6 -14 13 -14 s14 5 14 14 Z" />
      </g>
      <g stroke="var(--fur)" strokeWidth="1.4" strokeLinecap="round" opacity="0.55">
        <path d="M30 120 v-5 M35.5 120 v-6 M41 120 v-5" />
        <path d="M79 120 v-5 M84.5 120 v-6 M90 120 v-5" />
      </g>
      {pose === 'sleep' && (
        <g fill="none" stroke="var(--ink-3)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M96 30 h8 l-8 9 h8" />
          <path d="M108 16 h6 l-6 7 h6" />
        </g>
      )}
    </svg>
  );
}
