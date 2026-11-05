import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PGlite ships a WASM runtime that must be loaded from node_modules, not bundled.
  serverExternalPackages: ["@electric-sql/pglite"],
  // Lets the dev server be opened through 127.0.0.1 as well as localhost.
  allowedDevOrigins: ["127.0.0.1"],
  // A project's board, list and "my tasks" became one Tasks page (the board unless ?view=list).
  // Old links and bookmarks land on the matching view; their filters in the address carry over.
  async redirects() {
    return [
      { source: "/projects/:id/board", destination: "/projects/:id/tasks", permanent: false },
      { source: "/projects/:id/list", destination: "/projects/:id/tasks?view=list", permanent: false },
      { source: "/projects/:id/my-tasks", destination: "/projects/:id/tasks?assignee=me", permanent: false },
    ];
  },
  // OAuth discovery for the Claude connector (see src/lib/mcp/oauth.ts) lives at the standard addresses.
  async rewrites() {
    return [
      { source: "/.well-known/oauth-protected-resource/:path*", destination: "/api/oauth/metadata/protected-resource" },
      { source: "/.well-known/oauth-authorization-server/:path*", destination: "/api/oauth/metadata/authorization-server" },
      { source: "/.well-known/openid-configuration/:path*", destination: "/api/oauth/metadata/authorization-server" },
    ];
  },
  async headers() {
    return [
      {
        // The service worker is checked for updates on every visit, so a new version reaches devices right away.
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'" },
        ],
      },
    ];
  },
};

export default nextConfig;
