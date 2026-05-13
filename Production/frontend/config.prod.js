// Production config – replaces frontend/src/config.js at Docker build time.
// All requests go through the host nginx, which routes /auth/* and /api/*
// to the respective backend containers.

export const API_CONFIG = {
  baseUrl: 'https://test.rohitaman.com',
  loginPath: '/auth/login',
  registerPath: '/auth/register',
  tokenField: 'token',
};

export const ALERTS_API = {
  baseUrl: 'https://test.rohitaman.com',
  alertsPath: '/api/alerts',
  windowMinutes: 30,
  pollIntervalMs: 60000,
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
