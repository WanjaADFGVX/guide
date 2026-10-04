module.exports = {
  apps: [{
    name: 'study-portal',
    script: 'server.js',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '150M',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    }
  }]
};
