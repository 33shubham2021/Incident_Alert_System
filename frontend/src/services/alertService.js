import { ALERTS_API } from '../config';

export const fetchRecentAlerts = async () => {
  const url = `${ALERTS_API.baseUrl}${ALERTS_API.alertsPath}?minutes=${ALERTS_API.windowMinutes}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Alerts API responded with ${res.status}`);
  const { alerts } = await res.json();
  return alerts ?? [];
};
