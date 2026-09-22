/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    './*.html',
    './*.js',
  ],
  safelist: [
    /* ─── Arbitrary-value classes used inside JS template strings ─── */
    'bg-[#030712]',
    'bg-[#070b14]/80',
    'bg-[#0b0f19]',
    'bg-[#0b0f19]/70',
    'bg-[#0b1221]/80',
    'bg-[linear-gradient(to_right,#1e293b0a_1px,transparent_1px),linear-gradient(to_bottom,#1e293b0a_1px,transparent_1px)]',
    'bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))]',
    'bg-[var(--theme-accent)]/10',
    'focus:border-[var(--theme-accent)]/60',
    'from-[var(--theme-accent)]',
    'via-[var(--theme-accent)]',
    'text-[var(--theme-accent)]',
    'shadow-[0_0_10px_rgba(52,211,153,0.8)]',
    'shadow-[0_0_10px_rgba(99,102,241,0.6)]',
    'shadow-[0_0_12px_var(--theme-accent)]',
    'shadow-[0_0_15px_rgba(52,211,153,0.5)]',
    'shadow-[0_0_20px_rgba(52,211,153,0.3)]',
    'shadow-[0_0_20px_rgba(99,102,241,0.3)]',
    'shadow-[0_0_25px_rgba(16,185,129,0.35)]',
    'shadow-[0_0_25px_rgba(99,102,241,0.35)]',
    'shadow-[0_0_50px_rgba(0,0,0,0.5)]',
    'shadow-[0_0_8px_rgba(16,185,129,0.8)]',
    'shadow-[0_10px_40px_-10px_rgba(0,0,0,0.5)]',
    'shadow-[0_15px_35px_-10px_rgba(0,0,0,0.6)]',
    'shadow-[0_25px_80px_rgba(0,0,0,0.85)]',
    'hover:shadow-[0_0_35px_rgba(99,102,241,0.6)]',
    'w-[30%]',
    'w-[32%]',
    'border-dark-600',
    'animate-scanner',
    'animate-pulse-slow',
  ],
  theme: {
    extend: {
      colors: {
        /* painel.html / presenca.html */
        darkbg: '#090d16',
        darkcard: '#0f172a',
        bordercolor: '#1e293b',
        darkhover: '#1a2236',
        darker: '#030712',
        accent: '#38bdf8',
        dourado: '#fcd34d',
        /* todos_os_dias.html / automações */
        dark: {
          950: '#05080f',
          900: '#0a0f1c',
          800: '#11192b',
          700: '#1c2842',
          600: '#243456',
        },
      },
      animation: {
        'scanner': 'scanner 2s ease-in-out infinite alternate',
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
      keyframes: {
        scanner: {
          '0%': { transform: 'translateY(-100%)' },
          '100%': { transform: 'translateY(100%)' },
        },
      },
    },
  },
  plugins: [],
}
