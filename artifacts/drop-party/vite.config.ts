import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

export default defineConfig(({ command }) => {
  const isDev = command === "serve";

  let port = 3000;
  let basePath = "/";

  if (isDev) {
    const rawPort = process.env.PORT;
    if (!rawPort) throw new Error("PORT environment variable is required");
    port = Number(rawPort);
    if (Number.isNaN(port) || port <= 0) throw new Error(`Invalid PORT: "${rawPort}"`);

    const rawBasePath = process.env.BASE_PATH;
    if (!rawBasePath) throw new Error("BASE_PATH environment variable is required");
    basePath = rawBasePath;
  }

  return {
    base: basePath,
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        "@": path.resolve(import.meta.dirname, "src"),
        "@assets": path.resolve(import.meta.dirname, "..", "..", "attached_assets"),
      },
      dedupe: ["react", "react-dom"],
    },
    root: path.resolve(import.meta.dirname),
    build: {
      outDir: path.resolve(import.meta.dirname, "dist/public"),
      emptyOutDir: true,
    },
    server: {
      port,
      host: "0.0.0.0",
      allowedHosts: true,
      fs: {
        strict: true,
        deny: ["**/.*"],
      },
    },
    preview: {
      port,
      host: "0.0.0.0",
      allowedHosts: true,
    },
  };
});
