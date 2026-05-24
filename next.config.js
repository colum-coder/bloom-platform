/** @type {import('next').NextConfig} */
const nextConfig = {
  // Railway injects PORT; Next.js reads it automatically
  // No custom distDir needed — Railway detects .next
  experimental: {
    // Increase server action body size limit for document uploads (default is 1 MB).
    // Next.js 14.2+ supports this config key.
    serverActions: {
      bodySizeLimit: "50mb",
    },
  },
};

module.exports = nextConfig;
