/** @type {import('next').NextConfig} */
// EDGE_API_UPSTREAM is server-only.  Falling back to the legacy public URL
// lets existing Vercel + ngrok deployments move to the proxy without exposing
// a second configuration switch to the browser.
const legacyPublicApiUrl = process.env.NEXT_PUBLIC_API_URL;
const apiUpstream = process.env.EDGE_API_UPSTREAM
  ?? (/^https?:\/\//i.test(legacyPublicApiUrl ?? "") ? legacyPublicApiUrl : undefined);

const nextConfig = {
  async headers() {
    return [{
      source: "/sw.js",
      headers: [
        { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
        { key: "Service-Worker-Allowed", value: "/" },
      ],
    }];
  },
  async rewrites() {
    // Store-node deployments set this to the Docker-only API hostname. The
    // browser consequently calls its local web node, never the cloud API.
    if (!apiUpstream) return [];
    return [{
      source: "/edge-api/:path*",
      destination: `${apiUpstream.replace(/\/$/, "")}/:path*`,
    }];
  },
};

export default nextConfig;
