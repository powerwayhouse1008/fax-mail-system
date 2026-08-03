/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ["@sparticuz/chromium", "puppeteer-core"],
    outputFileTracingIncludes: {
      "*": [
        "./node_modules/@sparticuz/chromium/bin/**/*",
        "./node_modules/@sparticuz/chromium/build/**/*",
      ],
    },
  },
};

export default nextConfig;
