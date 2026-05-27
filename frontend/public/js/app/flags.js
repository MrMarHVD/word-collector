// Simplified country flag SVGs for the supported study languages.
// Returned as static markup so they can be injected via innerHTML.
const FLAGS = {
  japanese: `
    <svg viewBox="0 0 30 20" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <rect width="30" height="20" fill="#ffffff"/>
      <circle cx="15" cy="10" r="6" fill="#bc002d"/>
    </svg>
  `,
  english: `
    <svg viewBox="0 0 60 40" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <clipPath id="uk-clip"><rect width="60" height="40"/></clipPath>
      <g clip-path="url(#uk-clip)">
        <rect width="60" height="40" fill="#012169"/>
        <path d="M0,0 L60,40 M60,0 L0,40" stroke="#ffffff" stroke-width="6"/>
        <path d="M0,0 L60,40 M60,0 L0,40" stroke="#c8102e" stroke-width="3"/>
        <path d="M30,0 V40 M0,20 H60" stroke="#ffffff" stroke-width="10"/>
        <path d="M30,0 V40 M0,20 H60" stroke="#c8102e" stroke-width="6"/>
      </g>
    </svg>
  `,
  chinese: `
    <svg viewBox="0 0 30 20" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <rect width="30" height="20" fill="#de2910"/>
      <g fill="#ffde00">
        <polygon points="6,3.6 6.84,6.18 9.55,6.18 7.36,7.78 8.2,10.36 6,8.76 3.8,10.36 4.64,7.78 2.45,6.18 5.16,6.18"/>
        <circle cx="11.5" cy="2.5" r="0.65"/>
        <circle cx="13" cy="4.5" r="0.65"/>
        <circle cx="13" cy="7" r="0.65"/>
        <circle cx="11.5" cy="9" r="0.65"/>
      </g>
    </svg>
  `
};

export function flagSvg(languageName) {
  const key = String(languageName || "").toLowerCase();
  return FLAGS[key] || "";
}
