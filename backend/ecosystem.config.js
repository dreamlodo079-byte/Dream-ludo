module.exports = {
  apps: [
    {
      name: 'sexus-backend-cluster',
      script: './dist/server.js',
      instances: 'max',
      exec_mode: 'cluster',
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
      },
      env_production: {
        NODE_ENV: 'production',
      },
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      error_file: './logs/pm2_err.log',
      out_file: './logs/pm2_out.log',
      merge_logs: true,
      autorestart: true,
      wait_ready: true,
      listen_timeout: 10000,
      kill_timeout: 5000,
    },
  ],
};
