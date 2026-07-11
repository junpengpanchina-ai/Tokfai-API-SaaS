/** PM2 process file — run from apps/dmit-api after `npm run build`.
 *
 * Production contract:
 * - Process name: tokfai-api (only PM2 may own this API process)
 * - Bind: 127.0.0.1:8788 (Nginx proxies api.tokfai.com → here)
 * - Do not start with bare `node dist/index.js` on the server
 *
 * Legacy name `dmit-api` may still appear in older installs; migrate with:
 *   pm2 delete dmit-api && pm2 start ecosystem.config.cjs && pm2 save
 */
module.exports = {
  apps: [
    {
      name: "tokfai-api",
      cwd: __dirname,
      script: "dist/index.js",
      node_args: "--env-file=.env",
      env: {
        NODE_ENV: "production",
        HOST: "127.0.0.1",
        PORT: 8788,
      },
      autorestart: true,
      max_restarts: 20,
      min_uptime: "10s",
      restart_delay: 2000,
    },
  ],
};
