const { URL } = require('node:url');

function validateApiConfig(environment = process.env) {
  const release = environment.EAS_BUILD_PROFILE === 'production' ||
    ['production', 'staging'].includes(environment.EXPO_PUBLIC_ENV);
  if (!release) return;
  let url;
  try { url = new URL(environment.EXPO_PUBLIC_API_URL || ''); } catch {
    throw new Error('EXPO_PUBLIC_API_URL doit être configurée avant de construire ou publier une version.');
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash ||
    ['localhost', '127.0.0.1', '[::1]', 'zwanga-api.onrender.com'].includes(url.hostname) ||
    /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(url.hostname) ||
    !url.pathname.replace(/\/$/, '').endsWith('/api/v1')) {
    throw new Error('EXPO_PUBLIC_API_URL doit cibler une API HTTPS publique valide avec le chemin /api/v1, sans identifiants.');
  }
}
module.exports = { validateApiConfig };
if (require.main === module) {
  try { validateApiConfig(); console.log('API configuration: OK'); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
