/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-body)"],
        display: ["var(--font-display)"],
      },
      colors: {
        wine: "#7F011F",
        "wine-dark": "#5C0016",
        "wine-soft": "#A83350",
        sand: "#F5EBD0",
        "sand-deep": "#E9D9AC",
        ink: "#2B1912",
      },
    },
  },
  plugins: [],
};
