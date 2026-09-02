/** @type {import('next').NextConfig} */
const apiUpstream = process.env.EDGE_API_UPSTREAM;

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
