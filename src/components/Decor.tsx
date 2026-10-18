/** Elementos decorativos propios. aria-hidden: no aportan información. */

export function Plant() {
  return (
    <svg width="74" height="150" viewBox="0 0 74 150" aria-hidden="true" className="block">
      <g fill="none" strokeLinecap="round">
        <path d="M37 98 C35 78 30 62 18 46" stroke="#4f6b4c" strokeWidth="2" />
        <path d="M37 98 C39 74 44 56 58 40" stroke="#4f6b4c" strokeWidth="2" />
        <path d="M37 98 C37 70 36 40 38 14" stroke="#4f6b4c" strokeWidth="2" />
      </g>
      <g fill="#5f8159">
        <path d="M18 46 C6 44 2 34 4 26 C14 28 20 36 18 46Z" />
        <path d="M58 40 C70 36 72 26 70 18 C60 22 56 30 58 40Z" />
        <path d="M38 14 C30 8 31 0 36 -2 C42 4 42 10 38 14Z" transform="translate(0 6)" />
      </g>
      <g fill="#6f9468">
        <path d="M26 60 C14 62 8 56 8 48 C18 48 24 52 26 60Z" />
        <path d="M48 56 C60 60 66 54 68 46 C58 44 50 48 48 56Z" />
        <path d="M37 40 C28 36 28 26 32 22 C40 26 40 34 37 40Z" />
        <path d="M37 40 C46 36 46 26 42 22 C35 26 35 34 37 40Z" opacity="0.85" />
      </g>
      <path d="M16 98 H58 L53 146 H21 Z" fill="#2c3a3a" />
      <path d="M16 98 H58 L57 106 H17 Z" fill="#3a4c4b" />
      <path d="M24 112 C30 116 44 116 50 112" stroke="#4a6160" strokeWidth="1.5" fill="none" />
    </svg>
  );
}

export function BookStack() {
  return (
    <svg width="96" height="64" viewBox="0 0 96 64" aria-hidden="true" className="block">
      <rect x="4" y="44" width="88" height="20" rx="1.5" fill="#26364f" />
      <rect x="4" y="44" width="88" height="3" fill="#ffffff" opacity="0.08" />
      <rect x="84" y="46" width="6" height="16" fill="#e8dfcf" opacity="0.75" />
      <rect x="10" y="28" width="76" height="16" rx="1.5" fill="#a7803b" />
      <rect x="78" y="30" width="6" height="12" fill="#efe6d4" opacity="0.7" />
      <rect x="20" y="34" width="34" height="2" fill="#1f1810" opacity="0.4" />
      <rect x="6" y="14" width="70" height="14" rx="1.5" fill="#6e2a2a" />
      <rect x="68" y="16" width="6" height="10" fill="#f0e3d3" opacity="0.65" />
      <path d="M30 14 L33 0 L36 14 Z" fill="#d9b77a" opacity="0.9" />
    </svg>
  );
}

export function EmptyShelfIllustration() {
  return (
    <svg width="220" height="120" viewBox="0 0 220 120" aria-hidden="true" className="mx-auto block">
      <rect x="0" y="100" width="220" height="10" fill="var(--plank)" />
      <rect x="0" y="100" width="220" height="2" fill="var(--plank-top)" />
      <rect x="150" y="36" width="20" height="64" rx="1" fill="#2f4b3c" />
      <rect x="171" y="46" width="16" height="54" rx="1" fill="#c9b48e" />
      <rect x="188" y="30" width="22" height="70" rx="1" fill="#4c3049" transform="rotate(-8 199 100)" />
    </svg>
  );
}
