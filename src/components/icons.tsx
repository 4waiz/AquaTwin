/**
 * Minimal 16 px stroke icon set (1.5 px strokes, currentColor). Drawn for this
 * product so every glyph shares one visual grammar.
 */
import type { SVGProps } from "react";

type P = SVGProps<SVGSVGElement> & { size?: number };

function Svg({ size = 16, children, ...rest }: P & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...rest}
    >
      {children}
    </svg>
  );
}

export const IconOverview = (p: P) => (
  <Svg {...p}>
    <rect x="2" y="2" width="5" height="5" rx="1" />
    <rect x="9" y="2" width="5" height="5" rx="1" />
    <rect x="2" y="9" width="5" height="5" rx="1" />
    <rect x="9" y="9" width="5" height="5" rx="1" />
  </Svg>
);

export const IconTwin = (p: P) => (
  <Svg {...p}>
    <path d="M8 1.8 13.5 5v6L8 14.2 2.5 11V5L8 1.8Z" />
    <path d="M2.5 5 8 8.2 13.5 5M8 8.2v6" />
  </Svg>
);

export const IconScenario = (p: P) => (
  <Svg {...p}>
    <path d="M6 2h4M6.8 2v4.2L3 12.6A1 1 0 0 0 3.9 14h8.2a1 1 0 0 0 .9-1.4L9.2 6.2V2" />
    <path d="M4.6 10h6.8" />
  </Svg>
);

export const IconOptimize = (p: P) => (
  <Svg {...p}>
    <path d="M2 13.5h12" />
    <circle cx="4.5" cy="10" r="1.2" />
    <circle cx="7" cy="6.5" r="1.2" />
    <circle cx="11.5" cy="4" r="1.2" />
    <path d="M2.5 12 5 9.8m1.8-2.1 3.8-3" />
  </Svg>
);

export const IconMembrane = (p: P) => (
  <Svg {...p}>
    <rect x="1.8" y="4" width="12.4" height="3" rx="1.5" />
    <rect x="1.8" y="9" width="12.4" height="3" rx="1.5" />
    <path d="M4.5 4v3M4.5 9v3M11.5 4v3M11.5 9v3" />
  </Svg>
);

export const IconDroplet = (p: P) => (
  <Svg {...p}>
    <path d="M8 1.8s4.5 4.7 4.5 8a4.5 4.5 0 0 1-9 0c0-3.3 4.5-8 4.5-8Z" />
    <path d="M6 10.5a2 2 0 0 0 2 2" />
  </Svg>
);

export const IconBolt = (p: P) => (
  <Svg {...p}>
    <path d="M9 1.8 3.5 9h4L7 14.2 12.5 7h-4L9 1.8Z" />
  </Svg>
);

export const IconLayers = (p: P) => (
  <Svg {...p}>
    <path d="M8 2 14 5 8 8 2 5 8 2Z" />
    <path d="m2 8 6 3 6-3M2 11l6 3 6-3" />
  </Svg>
);

export const IconValidation = (p: P) => (
  <Svg {...p}>
    <path d="M2.5 13.5V2.5M2.5 13.5h11" />
    <path d="m5 9.5 2.2 2L12.5 5" />
  </Svg>
);

export const IconReport = (p: P) => (
  <Svg {...p}>
    <path d="M4 1.8h5.5L12.5 5v9.2H4V1.8Z" />
    <path d="M9.5 1.8V5h3M6 8h4.5M6 10.5h4.5" />
  </Svg>
);

export const IconInfo = (p: P) => (
  <Svg {...p}>
    <circle cx="8" cy="8" r="6.2" />
    <path d="M8 7.2v4M8 4.9v.1" />
  </Svg>
);

export const IconArrowRight = (p: P) => (
  <Svg {...p}>
    <path d="M3 8h10M9 4l4 4-4 4" />
  </Svg>
);

export const IconExternal = (p: P) => (
  <Svg {...p}>
    <path d="M9 2.5h4.5V7M13.5 2.5 7.5 8.5M12 9.5v3.3a.7.7 0 0 1-.7.7H3.2a.7.7 0 0 1-.7-.7V4.7c0-.4.3-.7.7-.7h3.3" />
  </Svg>
);

export const IconReset = (p: P) => (
  <Svg {...p}>
    <path d="M2.8 6.5A5.3 5.3 0 1 1 3 10" />
    <path d="M2.5 2.8v3.8h3.8" />
  </Svg>
);

export const IconPlay = (p: P) => (
  <Svg {...p}>
    <path d="M5 3.2v9.6L12.5 8 5 3.2Z" />
  </Svg>
);

export const IconPause = (p: P) => (
  <Svg {...p}>
    <path d="M5.5 3.5v9M10.5 3.5v9" />
  </Svg>
);

export const IconShield = (p: P) => (
  <Svg {...p}>
    <path d="M8 1.8 13 3.6v4.2c0 3-2.1 5.4-5 6.4-2.9-1-5-3.4-5-6.4V3.6L8 1.8Z" />
    <path d="m5.8 8 1.6 1.6L10.4 6.4" />
  </Svg>
);

export const IconWave = (p: P) => (
  <Svg {...p}>
    <path d="M1.8 6c1.5-1.4 2.7-1.4 4.1 0s2.7 1.4 4.2 0 2.6-1.4 4.1 0" />
    <path d="M1.8 10c1.5-1.4 2.7-1.4 4.1 0s2.7 1.4 4.2 0 2.6-1.4 4.1 0" />
  </Svg>
);

export const IconThermo = (p: P) => (
  <Svg {...p}>
    <path d="M6.5 9.3V3a1.5 1.5 0 0 1 3 0v6.3a3 3 0 1 1-3 0Z" />
    <path d="M8 6.5v4.5" />
  </Svg>
);

export const IconEye = (p: P) => (
  <Svg {...p}>
    <path d="M1.8 8S4 3.8 8 3.8 14.2 8 14.2 8 12 12.2 8 12.2 1.8 8 1.8 8Z" />
    <circle cx="8" cy="8" r="2" />
  </Svg>
);

export const IconFlask = IconScenario;

export const IconDownload = (p: P) => (
  <Svg {...p}>
    <path d="M8 2v8.5M4.5 7 8 10.5 11.5 7M2.5 13.5h11" />
  </Svg>
);

export const IconClose = (p: P) => (
  <Svg {...p}>
    <path d="m4 4 8 8M12 4l-8 8" />
  </Svg>
);

export const IconChevron = (p: P) => (
  <Svg {...p}>
    <path d="m6 3.5 4.5 4.5L6 12.5" />
  </Svg>
);

export const IconSun = (p: P) => (
  <Svg {...p}>
    <circle cx="8" cy="8" r="2.8" />
    <path d="M8 1.6v1.6M8 12.8v1.6M1.6 8h1.6M12.8 8h1.6M3.5 3.5l1.1 1.1M11.4 11.4l1.1 1.1M3.5 12.5l1.1-1.1M11.4 4.6l1.1-1.1" />
  </Svg>
);

export const IconMoon = (p: P) => (
  <Svg {...p}>
    <path d="M13.2 9.6A5.6 5.6 0 0 1 6.4 2.8a5.6 5.6 0 1 0 6.8 6.8Z" />
  </Svg>
);

export const IconWarning = (p: P) => (
  <Svg {...p}>
    <path d="M8 2.2 14 13H2L8 2.2Z" />
    <path d="M8 6.5v3M8 11.2v.1" />
  </Svg>
);

/**
 * AquaTwin logo: the app-icon tile (a droplet holding two waves and the plant's
 * bars). Raster assets are generated from the master by scripts/brand/make_assets.py.
 */
export function AquaTwinMark({ size = 22, glow = false, className = "" }: { size?: number; glow?: boolean; className?: string }) {
  const [x1, x2] = size <= 64 ? [128, 256] : [256, 512];
  return (
    // A plain <img>: the app is a static export, so next/image optimisation is unavailable.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/brand/aquatwin-icon-${x1}.png`}
      srcSet={`/brand/aquatwin-icon-${x1}.png 1x, /brand/aquatwin-icon-${x2}.png 2x`}
      width={size}
      height={size}
      alt=""
      aria-hidden
      draggable={false}
      decoding="async"
      className={`shrink-0 select-none ${glow ? "logo-glow" : ""} ${className}`}
    />
  );
}
