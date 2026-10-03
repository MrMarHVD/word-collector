/**
 * Stylelint config for feature CSS (SPEC-005): feature stylesheets keep layout
 * only (grid, flex, sizes, positioning). Raw colours, radii, shadows and font
 * weights belong to the design tokens and the canonical components in styles/
 * (not linted here) and to Tailwind utilities in markup.
 */

const RAW_COLOUR_FUNCTIONS = ["rgb", "rgba", "hsl", "hsla", "hwb", "lab", "lch", "oklab", "oklch", "color"];

/** @type {import("stylelint").Config} */
export default {
  rules: {
    "color-no-hex": true,
    "color-named": ["never", { message: "Use a design token; named colours are banned in feature CSS." }],
    "function-disallowed-list": [RAW_COLOUR_FUNCTIONS, { message: "Raw colours are banned in feature CSS: use a design token." }],
    "property-disallowed-list": [
      [
        "border-radius",
        "border-top-left-radius",
        "border-top-right-radius",
        "border-bottom-left-radius",
        "border-bottom-right-radius",
        "border-start-start-radius",
        "border-start-end-radius",
        "border-end-start-radius",
        "border-end-end-radius",
        "box-shadow",
        "font-weight"
      ],
      { message: "Radii, shadows and font weights come from the canonical components or Tailwind utilities, not feature CSS." }
    ]
  }
};
