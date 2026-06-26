/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack: (config, options) => {
    // Disable scope hoisting on client bundles to avoid production TDZ errors
    // (e.g. "Cannot access 'i' before initialization") from shared dashboard chunks
    // and circular/module-hoisting ordering in concatenated modules.
    if (!options.isServer && config.optimization) {
      config.optimization.concatenateModules = false;
    }
    return config;
  },
};

export default nextConfig;
