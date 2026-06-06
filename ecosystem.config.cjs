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
      },
    },
  ],
};
