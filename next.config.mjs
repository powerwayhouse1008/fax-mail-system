/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ["@sparticuz/chromium"],
    outputFileTracingIncludes: {
      "/app/api/fax/send": [
        "./node_modules/@sparticuz/chromium/bin/**/*",
        "./node_modules/@sparticuz/chromium/build/**/*",
      ],
      "/api/fax/send": [
        "./node_modules/@sparticuz/chromium/bin/**/*",
        "./node_modules/@sparticuz/chromium/build/**/*",
      ],
      "**": [
        "./node_modules/@sparticuz/chromium/bin/**/*",
        "./node_modules/@sparticuz/chromium/build/**/*",
      ],
      "/**": [
        "./node_modules/@sparticuz/chromium/bin/**/*",
        "./node_modules/@sparticuz/chromium/build/**/*",
      ],
    },
  },
};

export default nextConfig;
