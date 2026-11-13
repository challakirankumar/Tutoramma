"use client";

import { clsx } from "clsx";

/**
 * Stylized SVG street map for live home-visit tracking.
 * Projects lat/lng points onto a soft-vector city canvas with route,
 * geofence, home marker and a live tutor marker (red pulse when SOS).
 */
export interface MapPoint {
  lat: number;
  lng: number;
}

export function MapView({
  route,
  marker,
  dest,
  destLabel,
  geofenceMeters = 150,
  sosActive = false,
  stage = "scheduled",
  progress = 0,
  className,
  compact = false,
}: {
  route?: MapPoint[];
  marker?: MapPoint | null;
  dest: MapPoint;
  destLabel?: string;
  geofenceMeters?: number;
  sosActive?: boolean;
  stage?: string;
  progress?: number;
  className?: string;
  compact?: boolean;
}) {
  const W = 640;
  const H = compact ? 300 : 380;
  const PAD = 52;

  const pts: MapPoint[] = [dest, ...(route ?? []), ...(marker ? [marker] : [])];
  const minLat = Math.min(...pts.map((p) => p.lat));
  const maxLat = Math.max(...pts.map((p) => p.lat));
  const minLng = Math.min(...pts.map((p) => p.lng));
  const maxLng = Math.max(...pts.map((p) => p.lng));
  const latSpan = Math.max(maxLat - minLat, 0.004);
  const lngSpan = Math.max(maxLng - minLng, 0.006);

  const px = (p: MapPoint) => ({
    x: PAD + ((p.lng - minLng) / lngSpan) * (W - PAD * 2),
    y: H - PAD - ((p.lat - minLat) / latSpan) * (H - PAD * 2),
  });

  const destP = px(dest);
  const markerP = marker ? px(marker) : null;
  const routePts = (route ?? []).map(px);

  // geofence circle: 150m ≈ 0.00135 lat — scale to canvas
  const metersToDeg = 0.000009;
  const geoR =
    (geofenceMeters * metersToDeg / latSpan) * (H - PAD * 2) || 26;

  const routePolyline = routePts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");

  const markerColor = sosActive ? "#D64550" : stage === "in_progress" || stage === "arrived" ? "#1F9D68" : "#E76E0F";

  return (
    <div className={clsx("relative rounded-2xl overflow-hidden border", className)} style={{ borderColor: "var(--border)" }}>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-full block" role="img" aria-label="Live tracking map">
        <defs>
          <linearGradient id="mv-canvas" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#EDF2FA" />
            <stop offset="100%" stopColor="#E2EAF6" />
          </linearGradient>
          <linearGradient id="mv-water" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#BFDCF4" />
            <stop offset="100%" stopColor="#A9CDEE" />
          </linearGradient>
          <filter id="mv-shadow" x="-40%" y="-40%" width="180%" height="180%">
            <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#14246B" floodOpacity="0.25" />
          </filter>
        </defs>

        {/* canvas */}
        <rect x="0" y="0" width={W} height={H} fill="url(#mv-canvas)" rx="16" />

        {/* water body (right edge) */}
        <path d={`M ${W} 40 Q ${W - 60} 90 ${W - 42} 170 Q ${W - 20} 260 ${W} 340 L ${W} ${H} L ${W - 0} 0 Z`} fill="url(#mv-water)" opacity="0.75" />
        <path d={`M ${W} 40 Q ${W - 60} 90 ${W - 42} 170 Q ${W - 20} 260 ${W} 340`} fill="none" stroke="#8FBBE2" strokeWidth="2" />

        {/* park blocks */}
        <rect x="70" y="58" width="86" height="58" rx="10" fill="#CDE8CF" opacity="0.8" />
        <rect x="430" y="250" width="96" height="62" rx="10" fill="#CDE8CF" opacity="0.7" />
        <rect x="120" y="290" width="70" height="48" rx="10" fill="#F3E6C8" opacity="0.9" />

        {/* street grid */}
        {[0.16, 0.3, 0.44, 0.58, 0.72, 0.86].map((t, i) => (
          <line key={`h${i}`} x1={0} y1={H * t} x2={W} y2={H * t} stroke="#FFFFFF" strokeWidth={i % 2 ? 10 : 15} strokeLinecap="round" />
        ))}
        {[0.14, 0.28, 0.42, 0.56, 0.7, 0.84].map((t, i) => (
          <line key={`v${i}`} x1={W * t} y1={0} x2={W * t} y2={H} stroke="#FFFFFF" strokeWidth={i % 2 ? 9 : 13} strokeLinecap="round" />
        ))}
        {/* main avenue */}
        <line x1={0} y1={H * 0.51} x2={W} y2={H * 0.49} stroke="#F7FAFF" strokeWidth="22" />
        <line x1={0} y1={H * 0.51} x2={W} y2={H * 0.49} stroke="#D8E2F2" strokeWidth="1.4" strokeDasharray="10 8" />

        {/* little buildings */}
        {[
          [200, 70], [240, 130], [90, 170], [330, 90], [370, 200], [180, 220],
          [470, 80], [510, 150], [280, 300], [420, 320], [150, 120], [540, 220],
        ].map(([x, y], i) => (
          <rect key={i} x={x} y={y} width={i % 3 ? 22 : 30} height={i % 2 ? 16 : 20} rx="4" fill="#D9E2F1" stroke="#CBD6EA" strokeWidth="1" />
        ))}

        {/* geofence */}
        <circle cx={destP.x} cy={destP.y} r={geoR} fill="#315BE5" fillOpacity="0.08" stroke="#315BE5" strokeWidth="1.6" strokeDasharray="6 5" />
        <text x={destP.x} y={destP.y - geoR - 7} textAnchor="middle" fontSize="10.5" fontWeight="700" fill="#315BE5">
          Geofence {geofenceMeters} m
        </text>

        {/* route */}
        {routePts.length > 1 && (
          <>
            <polyline points={routePolyline} fill="none" stroke="#14246B" strokeOpacity="0.16" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
            <polyline
              points={routePolyline}
              fill="none"
              stroke={sosActive ? "#D64550" : "#F47B20"}
              strokeWidth="3.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray="9 7"
            >
              {(stage === "enroute" || stage === "arrived" || stage === "in_progress" || stage === "done") && (
                <animate attributeName="stroke-dashoffset" values="32;0" dur="1.4s" repeatCount="indefinite" />
              )}
            </polyline>
          </>
        )}

        {/* progress badge */}
        {stage === "enroute" && (
          <g>
            <rect x={W / 2 - 62} y={12} width="124" height="26" rx="13" fill="#14246B" filter="url(#mv-shadow)" />
            <text x={W / 2} y={29.5} textAnchor="middle" fontSize="12" fontWeight="700" fill="#fff">
              En route · {Math.round(progress)}%
            </text>
          </g>
        )}
        {stage === "in_progress" && (
          <g>
            <rect x={W / 2 - 74} y={12} width="148" height="26" rx="13" fill="#1F9D68" filter="url(#mv-shadow)" />
            <text x={W / 2} y={29.5} textAnchor="middle" fontSize="12" fontWeight="700" fill="#fff">
              Session in progress ✓
            </text>
          </g>
        )}
        {sosActive && (
          <g>
            <rect x={W / 2 - 58} y={12} width="116" height="26" rx="13" fill="#C03342" filter="url(#mv-shadow)" />
            <text x={W / 2} y={29.5} textAnchor="middle" fontSize="12" fontWeight="800" fill="#fff">
              🚨 SOS ACTIVE
            </text>
          </g>
        )}

        {/* home marker */}
        <g filter="url(#mv-shadow)">
          <path
            d={`M ${destP.x} ${destP.y - 15} l 13 11 h -3 v 11 h -20 v -11 h -3 z`}
            fill="#14246B"
            stroke="#0E1A52"
            strokeWidth="1.4"
          />
          <rect x={destP.x - 4} y={destP.y - 1} width="8" height="8" fill="#FFD9AE" />
        </g>
        <text x={destP.x} y={destP.y + 30} textAnchor="middle" fontSize="10.5" fontWeight="700" fill="#2A3560">
          {destLabel || "Student's home"}
        </text>

        {/* live tutor marker */}
        {markerP && (stage === "enroute" || stage === "arrived" || stage === "in_progress") && (
          <g className="marker-bounce" style={{ transformOrigin: `${markerP.x}px ${markerP.y}px` }}>
            {sosActive && <circle cx={markerP.x} cy={markerP.y} r="18" fill="#D64550" opacity="0.25" className="sos-pulse" />}
            <circle cx={markerP.x} cy={markerP.y} r="11.5" fill={markerColor} stroke="#fff" strokeWidth="2.6" filter="url(#mv-shadow)" />
            {stage === "in_progress" || stage === "arrived" ? (
              <circle cx={markerP.x} cy={markerP.y} r="4" fill="#fff" />
            ) : (
              <path
                d={`M ${markerP.x - 4.6} ${markerP.y - 1.6} l 2.6 -2.8 h 4 l 2.6 2.8 v 4.6 h -9.2 z`}
                fill="#fff"
              />
            )}
            <text x={markerP.x} y={markerP.y - 17} textAnchor="middle" fontSize="10" fontWeight="800" fill={markerColor}>
              Tutor
            </text>
          </g>
        )}
      </svg>
    </div>
  );
}
