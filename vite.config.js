import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
  build: { sourcemap: false, target: "es2020" },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["tests/components/setup.js"],
    include: ["tests/components/**/*.test.{js,jsx}"],
    css: false,
  },
});
