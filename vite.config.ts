import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query", "@tanstack/query-core"],
  },
  build: {
    chunkSizeWarningLimit: 1100,
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (!id.includes("node_modules")) return;
          if (/[\\/]node_modules[\\/](react|react-dom|scheduler|react-router|react-router-dom)[\\/]/.test(id)) return "react-vendor";
          if (/[\\/]node_modules[\\/](jspdf|pdfjs-dist|html2canvas|canvg)[\\/]/.test(id)) return "pdf-vendor";
          if (/[\\/]node_modules[\\/](lucide-react)[\\/]/.test(id)) return "icons";
          if (/[\\/]node_modules[\\/](@supabase|recharts|d3-|victory)[\\/]/.test(id)) return "data-vendor";
          if (/[\\/]node_modules[\\/](@radix-ui|cmdk|vaul|embla-carousel)/.test(id)) return "ui-vendor";
        },
      },
    },
  },
}));
