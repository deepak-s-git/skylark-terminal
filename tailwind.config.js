/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        vanta: '#09090B',
        titanium: '#18181B',
        bordercol: '#27272A',
        vermilion: '#FF3B00',
        chartreuse: '#DFFF00',
        ghost: '#FAFAFA',
        slateMuted: '#A1A1AA',
        darkMuted: '#52525B',
      },
      fontFamily: {
        sans: ['"Space Grotesk"', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      }
    },
  },
  plugins: [],
}
