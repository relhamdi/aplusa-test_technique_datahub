import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // In dev, "/api/*" is forwarded to the backend with the prefix stripped.
    // In production the nginx container does the exact same rewrite,
    // so the frontend code uses the same relative URLs everywhere and CORS is never involved.
    proxy: {
      "/api": {
        target: "http://localhost:8000",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
  test: {
    environment: "jsdom",
    globals: true, // lets Testing Library register its automatic cleanup
    setupFiles: ["./src/test/setup.ts"],
    css: false,
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "src/main.tsx",
        "src/test/**",
        "src/**/*.test.{ts,tsx}",
        "src/types/**",
      ],
      // Same minimum as the backend (project requirement).
      thresholds: { lines: 70, functions: 70, branches: 70, statements: 70 },
    },
  },
});
