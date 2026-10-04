import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function base({ size = 18, ...props }: IconProps) {
  return {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    ...props,
  };
}

export function SearchIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="11" cy="11" r="7" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

export function GridIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  );
}

export function ListIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <line x1="4" y1="6" x2="20" y2="6" />
      <line x1="4" y1="12" x2="20" y2="12" />
      <line x1="4" y1="18" x2="20" y2="18" />
    </svg>
  );
}

/** "Group by category" — a stack of labeled section bars. */
export function LayersIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="3" y="4" width="8" height="4.5" rx="1.2" />
      <line x1="13" y1="6.25" x2="21" y2="6.25" />
      <rect x="3" y="14.5" width="8" height="4.5" rx="1.2" />
      <line x1="13" y1="16.75" x2="21" y2="16.75" />
    </svg>
  );
}

export function SunIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="12" cy="12" r="4" />
      <line x1="12" y1="2" x2="12" y2="4" />
      <line x1="12" y1="20" x2="12" y2="22" />
      <line x1="4" y1="12" x2="2" y2="12" />
      <line x1="22" y1="12" x2="20" y2="12" />
      <line x1="5" y1="5" x2="6.5" y2="6.5" />
      <line x1="17.5" y1="17.5" x2="19" y2="19" />
      <line x1="5" y1="19" x2="6.5" y2="17.5" />
      <line x1="17.5" y1="6.5" x2="19" y2="5" />
    </svg>
  );
}

export function MoonIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M21 12.5A9 9 0 1 1 11.5 3a7 7 0 0 0 9.5 9.5Z" />
    </svg>
  );
}

export function RefreshIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M3 12a9 9 0 0 1 15.3-6.4L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-15.3 6.4L3 16" />
      <path d="M3 21v-5h5" />
    </svg>
  );
}

export function TicketIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M3 8a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-4Z" />
      <line x1="10" y1="6" x2="10" y2="18" strokeDasharray="2,3" />
    </svg>
  );
}

export function MinusIcon(props: IconProps) {
  return (
    <svg {...base({ strokeWidth: 2.5, ...props })}>
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

export function PlusIcon(props: IconProps) {
  return (
    <svg {...base({ strokeWidth: 2.5, ...props })}>
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

export function CloseIcon(props: IconProps) {
  return (
    <svg {...base({ strokeWidth: 2.5, ...props })}>
      <line x1="6" y1="6" x2="18" y2="18" />
      <line x1="18" y1="6" x2="6" y2="18" />
    </svg>
  );
}

export function ChevronDownIcon(props: IconProps) {
  return (
    <svg {...base({ strokeWidth: 2.5, ...props })}>
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

export function BanknoteIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="2" y="6" width="20" height="12" rx="2" />
      <circle cx="12" cy="12" r="3" />
      <line x1="6" y1="10" x2="6" y2="10.01" />
      <line x1="18" y1="14" x2="18" y2="14.01" />
    </svg>
  );
}

export function SmartphoneIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="6" y="2" width="12" height="20" rx="2.5" />
      <line x1="11" y1="18" x2="13" y2="18" />
    </svg>
  );
}

export function SplitIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M8 3H5a2 2 0 0 0-2 2v3" />
      <path d="M16 3h3a2 2 0 0 1 2 2v3" />
      <path d="M3 16v3a2 2 0 0 0 2 2h3" />
      <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
      <line x1="12" y1="6" x2="12" y2="18" />
    </svg>
  );
}

export function TrashIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <line x1="4" y1="6" x2="20" y2="6" />
      <path d="M6 6v13a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V6" />
      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    </svg>
  );
}

export function AlertTriangleIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M12 3 2 20h20Z" />
      <line x1="12" y1="9" x2="12" y2="14" />
      <line x1="12" y1="17" x2="12" y2="17.01" />
    </svg>
  );
}

export function CheckIcon(props: IconProps) {
  return (
    <svg {...base({ strokeWidth: 2.5, ...props })}>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

export function CheckCircleIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="12" cy="12" r="10" />
      <polyline points="8 12 11 15 16 9" />
    </svg>
  );
}

export function CoffeeIcon(props: IconProps) {
  return (
    <svg {...base({ strokeWidth: 1.8, ...props })}>
      <path d="M4 9h13a1 1 0 0 1 1 1v3a5 5 0 0 1-5 5H8a4 4 0 0 1-4-4Z" />
      <path d="M18 10h1.5a2.5 2.5 0 0 1 0 5H18" />
      <path d="M8 3c-.5 1 .5 1.5 0 2.5" />
      <path d="M12 3c-.5 1 .5 1.5 0 2.5" />
    </svg>
  );
}
