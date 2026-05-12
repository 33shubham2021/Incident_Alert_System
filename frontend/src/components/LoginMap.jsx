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

const TYPE_EMOJI = {
  traffic:  '🔴',
  accident: '🟠',
  closure:  '🟡',
  climate:  '🔵',
};

function makeIcon(type) {
  const color = MARKER_COLORS[type] ?? '#6b7280';
  return L.divIcon({
    className: '',
    html: `<div class="custom-marker marker-${type}" style="background:${color}"></div>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  });
}

export default function LoginMap() {
  const containerRef  = useRef(null);
  const mapRef        = useRef(null);
  const layersRef     = useRef({});
  const alertLayerRef = useRef(null);

  const [alerts, setAlerts]               = useState([]);
  const [searchQuery, setSearchQuery]     = useState('');
  const [currentLayer, setCurrentLayer]   = useState('street');
  const [alertsVisible, setAlertsVisible] = useState(true);

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

    const streetTile = L.tileLayer(
      'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
      { attribution: '© OpenStreetMap contributors', maxZoom: 19 }
    );
    const satelliteTile = L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      { attribution: 'Tiles © Esri', maxZoom: 19 }
    );

    const map = L.map(container, {
      center: MAP_CONFIG.center,
      zoom: MAP_CONFIG.zoom,
      layers: [streetTile],
      zoomControl: false,
    });

    L.control.zoom({ position: 'bottomright' }).addTo(map);

    const alertLayer = L.layerGroup().addTo(map);
    alertLayerRef.current = alertLayer;
    mapRef.current        = map;
    layersRef.current     = { streetTile, satelliteTile };

    return () => {
      map.remove();
      mapRef.current        = null;
      alertLayerRef.current = null;
      layersRef.current     = {};
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

  // ── ticker: newest-first live alerts from API ──────────────────────────────
  const tickerText = alerts.length
    ? [...alerts]
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .slice(0, 10)
        .map((a) => `${TYPE_EMOJI[a.alertType.toLowerCase()] ?? '⚪'} ${a.description}  ·  `)
        .join('')
    : 'Connecting to live alert feed…  ·  ';

  // ── controls ───────────────────────────────────────────────────────────────
  function toggleLayer() {
    const map = mapRef.current;
    const { streetTile, satelliteTile } = layersRef.current;
    if (!map) return;
    if (currentLayer === 'street') {
      map.removeLayer(streetTile);
      satelliteTile.addTo(map);
      setCurrentLayer('satellite');
    } else {
      map.removeLayer(satelliteTile);
      streetTile.addTo(map);
      setCurrentLayer('street');
    }
  }

  function toggleAlertsLayer() {
    const map   = mapRef.current;
    const layer = alertLayerRef.current;
    if (!map || !layer) return;
    if (alertsVisible) {
      map.removeLayer(layer);
    } else {
      layer.addTo(map);
    }
    setAlertsVisible((v) => !v);
  }

  function goToMyLocation() {
    const map = mapRef.current;
    if (!navigator.geolocation || !map) return;
    navigator.geolocation.getCurrentPosition(
      ({ coords: { latitude: lat, longitude: lng } }) => {
        map.flyTo([lat, lng], 15, { duration: 1.4 });
        L.circleMarker([lat, lng], {
          radius: 8, fillColor: '#4f6ef7', color: 'white', weight: 2.5, fillOpacity: 1,
        })
          .addTo(map)
          .bindPopup('<div class="popup-title">You are here</div>')
          .openPopup();
      },
      () => showToast('Location access denied')
    );
  }

  function showToast(msg) {
    const el = document.createElement('div');
    el.textContent = msg;
    Object.assign(el.style, {
      position: 'fixed', bottom: '60px', left: '50%', transform: 'translateX(-50%)',
      background: 'rgba(15,22,41,.85)', color: 'white', padding: '7px 18px',
      borderRadius: '99px', fontSize: '.8rem', zIndex: '9999',
      backdropFilter: 'blur(6px)',
    });
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2800);
  }

  async function searchLocation() {
    const q   = searchQuery.trim();
    const map = mapRef.current;
    if (!q || !map) return;
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=1`,
        { headers: { 'Accept-Language': 'en' } }
      );
      const data = await res.json();
      if (data.length) {
        const { lat, lon, display_name } = data[0];
        map.flyTo([+lat, +lon], 14, { duration: 1.4 });
        L.popup({ maxWidth: 280 })
          .setLatLng([+lat, +lon])
          .setContent(
            `<div class="popup-title">${display_name.split(',')[0]}</div>
             <div class="popup-body">${display_name}</div>`
          )
          .openOn(map);
      } else {
        showToast('No results found');
      }
    } catch {
      showToast('Search failed — check connection');
    }
  }

  return (
    <section className="map-panel">
      <div className="map-toolbar">
        <div className="search-box">
          <svg className="search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
          </svg>
          <input
            type="text"
            placeholder="Search location, road, city…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && searchLocation()}
          />
          <button className="search-btn" onClick={searchLocation}>Go</button>
        </div>

        <div className="map-controls">
          <button className="map-btn" title="My Location" onClick={goToMyLocation}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
            </svg>
          </button>
          <button className="map-btn" title="Toggle Satellite/Street" onClick={toggleLayer}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18M3 15h18M9 3v18M15 3v18" />
            </svg>
          </button>
          <button className="map-btn" title="Toggle Alert Markers" onClick={toggleAlertsLayer}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 22V12M12 12l-3-3m3 3 3-3M6 6l-3 3m3-3L3 3M18 6l3 3m-3-3 3-3" />
            </svg>
          </button>
        </div>
      </div>

      <div ref={containerRef} id="map" />

      <div className="map-legend">
        <p className="legend-title">Live Alerts</p>
        <div className="legend-items">
          <span className="legend-item"><span className="leg-dot" style={{ background: '#ef4444' }} />Traffic</span>
          <span className="legend-item"><span className="leg-dot" style={{ background: '#3b82f6' }} />Climate</span>
          <span className="legend-item"><span className="leg-dot" style={{ background: '#f59e0b' }} />Closure</span>
          <span className="legend-item"><span className="leg-dot" style={{ background: '#f97316' }} />Accident</span>
        </div>
      </div>

      <div className="alert-ticker">
        <span className="ticker-label">LIVE</span>
        <div className="ticker-track">
          <span className="ticker-text">{tickerText}</span>
        </div>
      </div>
    </section>
  );
}
