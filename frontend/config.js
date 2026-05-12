// config.js — edit this file to configure the app per environment
window.APP_CONFIG = {
  api: {
    baseUrl:          'http://localhost:5050',
    loginPath:        '/auth/login',
    registerPath:     '/auth/register',
    tokenField:    'access_token',
    requestFormat: 'json',  // 'json' | 'form'
  },
  map: {
    center: [51.505, -0.09],
    zoom:   13,
  },
};
