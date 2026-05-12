import { useEffect, useRef, useState, useCallback } from 'react';
import L from 'leaflet';
import { MAP_CONFIG, ALERTS_API } from '../config';
import { fetchRecentAlerts } from '../services/alertService';

const MARKER_COLORS = {
  traffic:  '#ef4444',
  accident: '#f97316',
  closure:  '#f59e0b',
  climate:  '#3b82f6',
};

const TYPE_LABELS = {
  traffic:  'Traffic',
  accident: 'Accident',
  closure:  'Road Closure',
  climate:  'Climate Alert',
};

function makeIcon(type) {
  const color = MARKER_COLORS[type] ?? '#6b7280';
  return L.divIcon({
    className: '',
    html: `<div class="custom-marker" style="background:${color}"></div>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  });
}

export default function DashMap() {
  const containerRef  = useRef(null);
  const mapRef        = useRef(null);
  const alertLayerRef = useRef(null);

  const [alerts, setAlerts] = useState([]);

  // ── fetch alerts from API ──────────────────────────────────────────────────
  const loadAlerts = useCallback(async () => {
    try {
      const data = await fetchRecentAlerts();
      setAlerts(data);
    } catch {
      // retain last good state on transient errors
    }
  }, []);

  // ── map init (runs once) ───────────────────────────────────────────────────
  useEffect(() => {
    const container = containerRef.current;
    if (!container || mapRef.current) return;

    const map = L.map(container, {
      center: MAP_CONFIG.center,
      zoom: MAP_CONFIG.zoom,
      zoomControl: false,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map);

    L.control.zoom({ position: 'bottomright' }).addTo(map);

    const alertLayer = L.layerGroup().addTo(map);
    alertLayerRef.current = alertLayer;
    mapRef.current        = map;

    return () => {
      map.remove();
      mapRef.current        = null;
      alertLayerRef.current = null;
    };
  }, []);

  // ── sync markers whenever alerts state updates ─────────────────────────────
  useEffect(() => {
    const layer = alertLayerRef.current;
    if (!layer) return;

    layer.clearLayers();
    alerts.forEach((alert) => {
      const type  = alert.alertType.toLowerCase();
      const color = MARKER_COLORS[type] ?? '#6b7280';
      const label = TYPE_LABELS[type]   ?? alert.alertType;

      L.marker(
        [parseFloat(alert.latitude), parseFloat(alert.longitude)],
        { icon: makeIcon(type) }
      )
        .bindPopup(
          `<span class="popup-badge" style="background:${color}">${label}</span>
           <div class="popup-title">${label}</div>
           <div class="popup-body">${alert.description}</div>`,
          { maxWidth: 220 }
        )
        .addTo(layer);
    });
  }, [alerts]);

  // ── initial fetch + polling ────────────────────────────────────────────────
  useEffect(() => {
    loadAlerts();
    const id = setInterval(loadAlerts, ALERTS_API.pollIntervalMs);
    return () => clearInterval(id);
  }, [loadAlerts]);

  return <div ref={containerRef} className="dash-map" />;
}
