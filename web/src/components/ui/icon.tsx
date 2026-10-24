import type { SVGProps } from "react";

const paths = {
  feed: <path d="M4 6h16M4 12h10M4 18h7" />,
  explore: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m20 20-4.2-4.2" />
    </>
  ),
  launch: <path d="M12 5v14M5 12h14" />,
  portfolio: (
    <>
      <rect x="3.5" y="6" width="17" height="13" rx="3" />
      <path d="M16 12.5h1.5M3.5 9.5h17M7 6V4.5h10V6" />
    </>
  ),
  profile: (
    <>
      <circle cx="12" cy="8.5" r="3.75" />
      <path d="M4.5 20c1.2-3.6 4-5.5 7.5-5.5s6.3 1.9 7.5 5.5" />
    </>
  ),
  back: <path d="m15 5-7 7 7 7" />,
  chevron: <path d="m9 5 7 7-7 7" />,
  star: <path d="m12 4 2.4 5 5.4.6-4 3.7 1.1 5.4L12 16l-4.9 2.7 1.1-5.4-4-3.7 5.4-.6z" />,
  copy: (
    <>
      <rect x="8.5" y="8.5" width="11" height="11" rx="2.5" />
      <path d="M15.5 8.5V6a1.5 1.5 0 0 0-1.5-1.5H6A1.5 1.5 0 0 0 4.5 6v8A1.5 1.5 0 0 0 6 15.5h2.5" />
    </>
  ),
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  backspace: (
    <>
      <path d="M8.5 5.5H19a1.5 1.5 0 0 1 1.5 1.5v10a1.5 1.5 0 0 1-1.5 1.5H8.5L3.5 12z" />
      <path d="m11 9.5 5 5M16 9.5l-5 5" />
    </>
  ),
  trophy: (
    <>
      <path d="M8 4.5h8v5a4 4 0 0 1-8 0zM8 6.5H5.5a2.5 2.5 0 0 0 2.6 3.6M16 6.5h2.5a2.5 2.5 0 0 1-2.6 3.6" />
      <path d="M12 13.5V17M8.5 19.5h7" />
    </>
  ),
  arrowDown: <path d="M12 5v14M6 13l6 6 6-6" />,
  arrowUp: <path d="M12 19V5M6 11l6-6 6 6" />,
  drop: <path d="M12 4.5s-5.5 6-5.5 9.5a5.5 5.5 0 0 0 11 0c0-3.5-5.5-9.5-5.5-9.5z" />,
  lock: (
    <>
      <rect x="5" y="10.5" width="14" height="9" rx="2.5" />
      <path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" />
    </>
  ),
} as const;

export type IconName = keyof typeof paths;

export function Icon({ name, size = 24, ...rest }: { name: IconName; size?: number } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...rest}
    >
      {paths[name]}
    </svg>
  );
}
