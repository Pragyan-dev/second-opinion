// Browser calls go to /backend/* on the dashboard's own origin and Next forwards them to the API.
// That avoids CORS, so the dashboard works from localhost, 127.0.0.1 or a LAN address.
// Set NEXT_PUBLIC_API_BASE to call an API directly instead (then CORS applies).
const target = process.env.BACKEND_URL || "http://127.0.0.1:8000";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [{ source: "/backend/:path*", destination: `${target}/:path*` }];
  },
};
export default nextConfig;
