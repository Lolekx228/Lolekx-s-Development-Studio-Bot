module.exports = {
  distDir: 'build', poweredByHeader: false, reactStrictMode: true,
  productionBrowserSourceMaps: false, trailingSlash: true,
  basePath: process.env.LDS_BASE_PATH || '/Lolekx-s-Development-Studio-Bot',
  env: { NEXT_PUBLIC_BASE_PATH: process.env.LDS_BASE_PATH || '/Lolekx-s-Development-Studio-Bot' },
  generateBuildId: async () => 'lds-classic-20261014',
  eslint: { ignoreDuringBuilds: true },
  experimental: { cpus: 2 }
};
