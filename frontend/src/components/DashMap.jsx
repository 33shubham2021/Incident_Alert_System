import { useEffect, useRef } from 'react';
import L from 'leaflet';

const ALERT_DATA = [
  { type: 'traffic',  lat: 51.510, lng: -0.085, title: 'Heavy Traffic Jam',  desc: 'A40 Westbound — 40 min delay',   severity: 'High'   },
  { type: 'accident', lat: 51.497, lng: -0.105, title: 'Accident Reported',   desc: '2 vehicles — lane blocked',      severity: 'Medium' },
  { type: 'closure',  lat: 51.515, lng: -0.070, title: 'Road Closure',        desc: 'Waterloo Bridge — until 18:00',  severity: 'High'   },
  { type: 'climate',  lat: 51.503, lng: -0.120, title: 'Heavy Rain Warning',  desc: 'Reduced visibility, slow down',  severity: 'Low'    },
  { type: 'traffic',  lat: 51.522, lng: -0.095, title: 'Traffic Build-up',    desc: 'City Road — 15 min delay',       severity: 'Medium' },
  { type: 'closure',  lat: 51.488, lng: -0.095, title: 'Construction Zone',   desc: 'Vauxhall Bridge — 1 lane open',  severity: 'Medium' },
  { type: 'climate',  lat: 51.530, lng: -0.075, title: 'Fog Alert',           desc: 'Low visibility on A10 North',    severity: 'Low'    },
  { type: 'accident', lat: 51.480, lng: -0.110, title: 'Minor Collision',     desc: 'Clapham High St — cleared soon', severity: 'Low'    },
];

const MARKER_COLORS = { traffic: '#ef4444', accident: '#f97316', closure: '#f59e0b', climate: '#3b82f6' };
const TYPE_LABELS   = { traffic: 'Traffic Jam', accident: 'Accident', closure: 'Road Closure', climate: 'Climate Alert' };

function severityColor(s) {
  return s === 'High' ? '#ef4444' : s === 'Medium' ? '#f97316' : '#22c55e';
}

function makeIcon(type) {
  return L.divIcon({
    className: '',
    html: `<div class="custom-marker" style="background:${MARKER_COLORS[type]}"></div>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  });
}

export default function DashMap() {
  const containerRef = useRef(null);
  const mapRef       = useRef(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || mapRef.current) return;

    const map = L.map(container, {
      center: [51.505, -0.09],
      zoom: 12,
      zoomControl: false,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map);

    L.control.zoom({ position: 'bottomright' }).addTo(map);

    ALERT_DATA.forEach((a) => {
      L.marker([a.lat, a.lng], { icon: makeIcon(a.type) })
        .bindPopup(
          `<span class="popup-badge" style="background:${MARKER_COLORS[a.type]}">${TYPE_LABELS[a.type]}</span>
           <div class="popup-title">${a.title}</div>
           <div class="popup-body">${a.desc}</div>
           <div class="popup-body" style="margin-top:4px;font-weight:600;color:${severityColor(a.severity)}">Severity: ${a.severity}</div>`,
          { maxWidth: 200 }
        )
        .addTo(map);
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  return <div ref={containerRef} className="dash-map" />;
}
