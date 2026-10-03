import { useId } from "react";

export interface FlagProps {
  /** Language name as stored in the database (e.g. "Japanese"); matched case-insensitively. */
  language: string;
}

/** Simplified flag icon for a study language; renders nothing for unknown languages. It always fills its box (`slice`), cropping rather than letterboxing when the box ratio differs. */
export function Flag({ language }: FlagProps) {
  const clipId = useId();
  switch (language.toLowerCase()) {
    case "japanese":
      return (
        <svg viewBox="0 0 30 20" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
          <rect width="30" height="20" fill="#ffffff" />
          <circle cx="15" cy="10" r="6" fill="#bc002d" />
        </svg>
      );
    case "english":
      return (
        <svg viewBox="0 0 60 40" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
          <clipPath id={clipId}>
            <rect width="60" height="40" />
          </clipPath>
          <g clipPath={`url(#${clipId})`}>
            <rect width="60" height="40" fill="#012169" />
            <path d="M0,0 L60,40 M60,0 L0,40" stroke="#ffffff" strokeWidth="6" />
            <path d="M0,0 L60,40 M60,0 L0,40" stroke="#c8102e" strokeWidth="3" />
            <path d="M30,0 V40 M0,20 H60" stroke="#ffffff" strokeWidth="10" />
            <path d="M30,0 V40 M0,20 H60" stroke="#c8102e" strokeWidth="6" />
          </g>
        </svg>
      );
    case "chinese":
      return (
        <svg viewBox="0 0 30 20" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
          <rect width="30" height="20" fill="#de2910" />
          <g fill="#ffde00">
            <polygon points="6,3.6 6.84,6.18 9.55,6.18 7.36,7.78 8.2,10.36 6,8.76 3.8,10.36 4.64,7.78 2.45,6.18 5.16,6.18" />
            <circle cx="11.5" cy="2.5" r="0.65" />
            <circle cx="13" cy="4.5" r="0.65" />
            <circle cx="13" cy="7" r="0.65" />
            <circle cx="11.5" cy="9" r="0.65" />
          </g>
        </svg>
      );
    case "spanish":
      return (
        <svg viewBox="0 0 30 20" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
          <rect width="30" height="20" fill="#aa151b" />
          <rect y="5" width="30" height="10" fill="#f1bf00" />
        </svg>
      );
    case "french":
      return (
        <svg viewBox="0 0 30 20" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
          <rect width="10" height="20" fill="#0055a4" />
          <rect x="10" width="10" height="20" fill="#ffffff" />
          <rect x="20" width="10" height="20" fill="#ef4135" />
        </svg>
      );
    default:
      return null;
  }
}
