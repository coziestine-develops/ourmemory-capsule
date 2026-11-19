/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      screens: {
        xs: '420px',
        short: { raw: '(max-height: 800px)' },
      },
      colors: {
        // Brand palette from the color reference: CHERRY and CREAM, with BLUSH and COCOA blended from them.
        cherry: '#4D0909',
        cream: '#FFFCF6',
        blush: '#EADFDA',
        cocoa: '#7A4644',
        // Aliases kept so existing components pick up the new palette without changes.
        ivory: '#FFFCF6',
        rose: { DEFAULT: '#4D0909', muted: '#7A4644' },
        mocha: '#4D0909',
        espresso: '#4D0909',
        heart: '#4D0909',
      },
      fontFamily: {
        heading: ['"Playfair Display"', 'Georgia', 'serif'],
        body: ['"Times New Roman"', 'Times', 'serif'],
        handwriting: ['"Times New Roman"', 'Times', 'serif'],
      },
      boxShadow: {
        polaroid: '0 10px 28px -14px rgba(77, 9, 9, 0.28)',
        romantic: '0 18px 50px -24px rgba(77, 9, 9, 0.25)',
      },
    },
  },
  plugins: [],
  // Hover styles only apply on devices that truly hover, so a tap never leaves a stuck hover state.
  future: { hoverOnlyWhenSupported: true },
};