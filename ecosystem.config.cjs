module.exports = {
  apps: [
    {
      name: 'ai-iot-dashboard',
      script: './server.js',
      exec_mode: 'fork',
      instances: 1,
      env: {
        NODE_ENV: 'production',
        PORT: process.env.PORT || 3006,
        DATABASE_URL: process.env.DATABASE_URL,
        DATABASE_SSL: process.env.DATABASE_SSL,
      },
    },
  ],
};
