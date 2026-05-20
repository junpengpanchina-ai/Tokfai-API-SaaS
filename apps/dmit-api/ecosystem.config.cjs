/** PM2 process file — run from apps/dmit-api after `npm run build`. */
module.exports = {
  apps: [
    {
      name: "dmit-api",
      cwd: __dirname,
      script: "dist/index.js",
      node_args: "--env-file=.env",
      env: {
        NODE_ENV: "production",
      },
      autorestart: true,
      max_restarts: 20,
      min_uptime: "10s",
      restart_delay: 2000,
    },
  ],
};
