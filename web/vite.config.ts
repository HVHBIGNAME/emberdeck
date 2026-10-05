import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  base: process.env.EMBER_WEB_BASE || "/",
  plugins: [react()],
  server: { host: "127.0.0.1", proxy: { "/api": "http://127.0.0.1:8080" } },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          react: [
            "react",
            "react-dom",
            "react-dom/client",
            "react/jsx-runtime",
          ],
          motion: ["motion/react"],
          controls: ["@radix-ui/react-dialog", "@radix-ui/react-select"],
          i18n: ["i18next", "react-i18next"],
        },
      },
    },
  },
});
