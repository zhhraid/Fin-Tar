import { existsSync, readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";
import tsConfigPaths from "vite-tsconfig-paths";

// Local development only: make secrets in .env (AI keys) visible to server
// code through process.env. The file is gitignored, so hosted builds skip this
// and read the variables set in the hosting dashboard instead.
if (existsSync(".env")) Object.assign(process.env, parseEnv(readFileSync(".env", "utf8")));

export default defineConfig(({ command }) => ({
  plugins: [
    tailwindcss(),
    tsConfigPaths({ projects: ["./tsconfig.json"] }),
    tanstackStart({
      // src/server.ts wraps the default server entry to turn crashes into an error page.
      server: { entry: "server" },
      // Server-only code must never be bundled for the browser.
      importProtection: { behavior: "error", client: { files: ["**/server/**"], specifiers: ["server-only"] } },
    }),
    // Nitro packages the server for deployment. Without a preset it builds a Node server
    // (npm start); on Vercel, Netlify or Cloudflare it detects the platform by itself.
    ...(command === "build" ? [nitro()] : []),
    viteReact(),
  ],
  resolve: { dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query", "@tanstack/query-core"] },
}));
