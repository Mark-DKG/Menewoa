// Every colour is a CSS variable (src/index.css) so light and dark themes switch
// instantly everywhere — including inline styles, SVG and charts.
export const COLORS = {
  wine: "var(--c-wine)",
  wineDark: "var(--c-wine-dark)",
  wineSoft: "var(--c-wine-soft)",
  onWine: "var(--c-on-wine)", // text/icons placed ON a wine-coloured fill
  sand: "var(--c-sand)",
  sandDeep: "var(--c-sand-deep)",
  white: "var(--c-white)", // card / surface colour
  page: "var(--c-page)",
  headerBg: "var(--c-header-bg)",
  ink: "var(--c-ink)",
  inkSoft: "var(--c-ink-soft)",
  line: "var(--c-line)",
  fertile: "var(--c-fertile)",
  fertileSoft: "var(--c-fertile-soft)",
  gold: "var(--c-gold)",
  goldSoft: "var(--c-gold-soft)",
  danger: "var(--c-danger)",
  dangerSoft: "var(--c-danger-soft)",
  inputBg: "var(--c-input-bg)",
  toggleOff: "var(--c-toggle-off)",
  track: "var(--c-track)",
};

// Fonts are SELF-HOSTED (see src/main.jsx: @fontsource-variable/*) and exposed as
// CSS variables in src/index.css, so no request ever goes to a third-party font
// CDN (which would reveal users' IP addresses and need a looser CSP).
// Quicksand + Nunito: soft, rounded terminals that echo the Menewoa wordmark.
export const displayFont = { fontFamily: "var(--font-display)" };
export const bodyFont = { fontFamily: "var(--font-body)" };
