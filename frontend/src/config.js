export const API_CONFIG = {
  baseUrl: 'http://localhost:5050',
  loginPath: '/auth/login',
  registerPath: '/auth/register',
  tokenField: 'token',
};

export const ALERTS_API = {
  baseUrl: 'http://localhost:5051',
  alertsPath: '/api/alerts',
  windowMinutes: 30,
  pollIntervalMs: 60_000,

  // Subscription endpoints
  addSubscriptionPath: '/api/add-subscription',
  getSubscriptionsPath: '/api/get-subscriptions',
  getUserPath: '/api/get-user',
  deleteSubscriptionPath: '/api/delete-subscription',
  dummyTestPath: '/api/dummy-test',
};

export const MAP_CONFIG = {
  center: [20.5937, 78.9629],
  zoom: 5,
};
