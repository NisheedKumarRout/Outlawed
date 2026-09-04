/** @type {import("next").NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Public OTR and the OutLawed operator portal can run from this same code
  // checkout at the same time without competing for Next's build lock.
  distDir: process.env.PORTAL_MODE === "admin" ? ".next-admin" : ".next",
};

export default nextConfig;
