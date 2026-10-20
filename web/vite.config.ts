import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const backend = process.env.DEV_API_TARGET ?? "http://localhost:3000";

export default defineConfig({
  plugins: [react()],
  server: { proxy: { "/api": backend, "/renders": backend } },
});
