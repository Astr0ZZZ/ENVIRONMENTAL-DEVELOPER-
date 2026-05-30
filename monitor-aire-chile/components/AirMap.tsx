'use client'

import { useMemo, useEffect, useState, useCallback } from 'react'
import { MapContainer, TileLayer, Marker, Rectangle, Circle, Popup, useMap, ZoomControl } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { Station } from '@/types/openaq'
import { getICACategory, getWorstICACategory } from '@/constants/ica-thresholds'

interface AirMapProps {
  stations: Station[]
  activePollutant: 'pm25' | 'pm10' | 'so2' | 'no2' | 'o3' | 'co' | 'all'
  center?: [number, number]
  zoom?: number
  onSelectStation?: (station: Station) => void
  searchCoords?: { lat: number; lng: number } | null
  selectedRegion?: string
}

/* ─── Zoom tracker ────────────────────────────────────────────────────────── */
function ZoomTracker({ onChange }: { onChange: (zoom: number) => void }) {
  const map = useMap()
  useEffect(() => {
    const onZoom = () => onChange(map.getZoom())
    map.on('zoomend', onZoom)
    return () => { map.off('zoomend', onZoom) }
  }, [map, onChange])
  return null
}

/* ─── Severity ratio for zone sizing ──────────────────────────────────────── */
function getSeverityRatio(
  valor: number,
  parametro: 'pm10' | 'pm25' | 'so2' | 'no2' | 'o3' | 'co'
): number {
  const maxVal = {
    pm25: 45, pm10: 200, so2: 1000,
    no2: 1000, o3: 450, co: 40000,
  }[parametro] || 100
  return Math.min(1.5, Math.max(0.15, valor / maxVal))
}

/* ─── Clean dot icon (no numbers, no pulsing) ─────────────────────────────── */
function createCleanDotIcon(color: string) {
  return L.divIcon({
    className: 'custom-station-marker',
    html: `
      <div class="relative flex items-center justify-center" style="width:24px;height:24px;">
        <div class="absolute rounded-full transition-transform duration-200" style="
          width: 14px;
          height: 14px;
          background: radial-gradient(circle at 35% 35%, ${color}ff, ${color}cc);
          border: 1.5px solid white;
          box-shadow: 0 2px 6px rgba(0,0,0,0.3);
        "></div>
      </div>
    `,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  })
}

/* ─── Map auto-fit controller ─────────────────────────────────────────────── */
function MapController({ stations, selectedRegion }: { stations: (Station & { lat: number; lng: number })[], selectedRegion?: string }) {
  const map = useMap()
  const [lastRegion, setLastRegion] = useState(selectedRegion)

  useEffect(() => {
    if (stations.length === 0) return

    // Limit fitBounds to only when region selection changes, or on initial load
    if (selectedRegion !== lastRegion) {
      setLastRegion(selectedRegion)
    } else if (lastRegion !== undefined) {
      return
    }

    if (stations.length === 1) {
      map.flyTo([stations[0].lat, stations[0].lng], 11, {
        animate: true,
        duration: 1.2
      })
      return
    }

    const lats = stations.map(s => s.lat)
    const lngs = stations.map(s => s.lng)

    map.fitBounds([
      [Math.min(...lats), Math.min(...lngs)],
      [Math.max(...lats), Math.max(...lngs)]
    ], {
      padding: [40, 40],
      maxZoom: 10,
      animate: true,
      duration: 1.5
    })
  }, [selectedRegion, map, stations, lastRegion])

  return null
}

/* ─── Fly to searched location ────────────────────────────────────────────── */
function FlyToSearch({ coords }: { coords: { lat: number; lng: number } | null }) {
  const map = useMap()
  useEffect(() => {
    if (coords) {
      map.flyTo([coords.lat, coords.lng], 12, {
        animate: true,
        duration: 1.5
      })
    }
  }, [coords, map])
  return null
}

/* ─── Main component ──────────────────────────────────────────────────────── */
export function AirMap({
  stations,
  activePollutant,
  center = [-33.45, -70.67],
  zoom = 6,
  onSelectStation,
  searchCoords,
  selectedRegion,
}: AirMapProps) {
  const [zoomLevel, setZoomLevel] = useState(zoom)
  const [mapTheme, setMapTheme] = useState<'dark' | 'detailed' | 'satellite'>('detailed')
  const [showLegend, setShowLegend] = useState(true)

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const isDark = document.documentElement.classList.contains('dark')
      setMapTheme(isDark ? 'dark' : 'detailed')
    }
  }, [])

  const handleZoom = useCallback((z: number) => setZoomLevel(z), [])

  const validStations = useMemo(() => {
    return stations.filter(
      (s): s is Station & { lat: number; lng: number } =>
        typeof s.lat === 'number' &&
        typeof s.lng === 'number' &&
        !isNaN(s.lat) &&
        !isNaN(s.lng)
    )
  }, [stations])

  return (
    <div className="relative h-full w-full overflow-hidden rounded-xl border border-[#d4cebe] dark:border-slate-800/60 shadow-lg">
      {/* Map Theme Selector (Responsive padding and spacing) */}
      <div className="absolute right-2 top-2 sm:right-4 sm:top-4 z-[1000] flex gap-1 rounded-xl border border-[#d4cebe] dark:border-slate-700/60 bg-white/90 dark:bg-slate-900/85 p-0.5 sm:p-1 backdrop-blur-md shadow-2xl max-w-[calc(100%-80px)] overflow-x-auto">
        <button
          type="button"
          onClick={() => setMapTheme('dark')}
          className={`rounded-lg px-2 py-1 sm:px-3 sm:py-1.5 text-[10px] sm:text-xs font-bold transition-all duration-200 border whitespace-nowrap ${
            mapTheme === 'dark'
              ? 'bg-emerald-500/10 dark:bg-emerald-500/20 text-emerald-800 dark:text-emerald-400 border-emerald-500/20 dark:border-emerald-500/30'
              : 'text-[#6e685e] dark:text-slate-400 hover:text-[#2d2a24] dark:hover:text-slate-200 border-transparent hover:bg-[#e4dec9]/50 dark:hover:bg-slate-800/40'
          }`}
        >
          Oscuro
        </button>
        <button
          type="button"
          onClick={() => setMapTheme('detailed')}
          className={`rounded-lg px-2 py-1 sm:px-3 sm:py-1.5 text-[10px] sm:text-xs font-bold transition-all duration-200 border whitespace-nowrap ${
            mapTheme === 'detailed'
              ? 'bg-emerald-500/10 dark:bg-emerald-500/20 text-emerald-800 dark:text-emerald-400 border-emerald-500/20 dark:border-emerald-500/30'
              : 'text-[#6e685e] dark:text-slate-400 hover:text-[#2d2a24] dark:hover:text-slate-200 border-transparent hover:bg-[#e4dec9]/50 dark:hover:bg-slate-800/40'
          }`}
        >
          Detalle
        </button>
        <button
          type="button"
          onClick={() => setMapTheme('satellite')}
          className={`rounded-lg px-2 py-1 sm:px-3 sm:py-1.5 text-[10px] sm:text-xs font-bold transition-all duration-200 border whitespace-nowrap ${
            mapTheme === 'satellite'
              ? 'bg-emerald-500/10 dark:bg-emerald-500/20 text-emerald-800 dark:text-emerald-400 border-emerald-500/20 dark:border-emerald-500/30'
              : 'text-[#6e685e] dark:text-slate-400 hover:text-[#2d2a24] dark:hover:text-slate-200 border-transparent hover:bg-[#e4dec9]/50 dark:hover:bg-slate-800/40'
          }`}
        >
          Satélite
        </button>
      </div>

      {/* ICA Legend (Collapsible) */}
      <div className="absolute left-2 bottom-6 sm:left-4 sm:bottom-8 z-[1000] rounded-xl border border-[#d4cebe] dark:border-slate-700/60 bg-white/92 dark:bg-slate-900/90 p-2.5 sm:p-3 backdrop-blur-md shadow-2xl min-w-[110px] sm:min-w-[130px] transition-all duration-300">
        <div className="flex items-center justify-between gap-2 cursor-pointer select-none" onClick={() => setShowLegend(!showLegend)}>
          <p className="text-[9px] font-bold uppercase tracking-wider text-[#6e685e] dark:text-slate-400">
            Calidad del Aire
          </p>
          <span className="text-[8px] text-emerald-600 dark:text-emerald-400 font-black">
            {showLegend ? '▼' : '▲'}
          </span>
        </div>
        
        {showLegend && (
          <div className="space-y-1 mt-2 transition-all">
            {[
              { label: 'Bueno', color: '#00E5A3' },
              { label: 'Regular', color: '#FFD300' },
              { label: 'Alerta', color: '#FF7A00' },
              { label: 'Preemergencia', color: '#FF2E54' },
              { label: 'Emergencia', color: '#A32CC4' },
              { label: 'Sin Datos', color: '#64748b' },
            ].map((item) => (
              <div key={item.label} className="flex items-center gap-1.5 sm:gap-2">
                <div
                  className="h-2 w-2 sm:h-2.5 sm:w-2.5 rounded-sm"
                  style={{ backgroundColor: item.color }}
                />
                <span className="text-[9px] sm:text-[10px] font-semibold text-[#4a453c] dark:text-slate-300">
                  {item.label}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <MapContainer
        center={center}
        zoom={zoom}
        minZoom={3}
        maxBounds={[[-85, -180], [85, 180]]}
        maxBoundsViscosity={1.0}
        scrollWheelZoom
        zoomControl={false}
        className="h-full w-full z-0 bg-[#faf8f2] dark:bg-[#0f172a]"
      >
        <ZoomControl position="bottomright" />
        <MapController stations={validStations} selectedRegion={selectedRegion} />
        <ZoomTracker onChange={handleZoom} />
        {searchCoords && <FlyToSearch coords={searchCoords} />}
        <TileLayer
          noWrap={true}
          attribution={
            mapTheme === 'satellite'
              ? 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
              : mapTheme === 'detailed'
              ? 'Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ, TomTom, Intermap, iPC, USGS, FAO, NPS, NRCAN, GeoBase, Kadaster NL, Ordnance Survey, Esri Japan, METI, Esri China (Hong Kong), and the GIS User Community'
              : '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
          }
          url={
            mapTheme === 'dark'
              ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
              : mapTheme === 'satellite'
              ? 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
              : 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}'
          }
        />

        {/* Search location marker */}
        {searchCoords && (
          <Marker
            position={[searchCoords.lat, searchCoords.lng]}
            icon={L.divIcon({
              className: 'custom-station-marker',
              html: `
                <div class="flex items-center justify-center animate-bounce" style="width:32px;height:32px;">
                  <div style="
                    width: 14px; height: 14px;
                    background: #3b82f6;
                    border: 2.5px solid white;
                    border-radius: 50%;
                    box-shadow: 0 0 0 4px rgba(59,130,246,0.4), 0 2px 8px rgba(0,0,0,0.4);
                  "></div>
                </div>
              `,
              iconSize: [32, 32],
              iconAnchor: [16, 16],
            })}
          >
            <Popup>
              <div className="p-1 text-center">
                <p className="text-xs font-bold text-[#2d2a24] dark:text-white">📍 Ubicación Buscada</p>
              </div>
            </Popup>
          </Marker>
        )}

        {validStations.map((station) => {
          const isAll = activePollutant === 'all'
          const val = isAll ? null : station[activePollutant]
          const hasVal = isAll
            ? ['pm25', 'pm10', 'so2', 'no2', 'o3', 'co'].some(key => typeof station[key as keyof Station] === 'number' && (station[key as keyof Station] as number) >= 0)
            : typeof val === 'number' && val >= 0
          const ica = isAll
            ? getWorstICACategory(station)
            : (hasVal ? getICACategory(val as number, activePollutant as any) : null)
          const fillColor = ica?.color ?? '#64748b'
          const categoria = ica?.categoria ?? 'Sin Datos'

          // Geographical influence circle representing quality quadrant
          const qualityZone = ica && ica.categoria !== 'Bueno' ? (
            <Circle
              center={[station.lat, station.lng]}
              radius={3500} // 3.5km radius. Behaves like a real geographic zone of influence.
              eventHandlers={{
                click: () => onSelectStation?.(station),
              }}
              pathOptions={{
                fillColor,
                color: fillColor,
                stroke: true,
                weight: 1.5,
                fillOpacity: 0.12,
                opacity: 0.35,
                className: 'leaflet-quality-zone',
              }}
            />
          ) : null

          // Format value for popup
          let displayValue = '—'
          if (isAll) {
            displayValue = 'Índice Global'
          } else if (hasVal) {
            displayValue = activePollutant === 'co'
              ? `${((val as number) / 1000).toFixed(1)} mg/m³`
              : `${Math.round(val as number)} µg/m³`
          }

          // Other pollutants for popup
          const otherPollutants = [
            { label: 'PM2.5', value: station.pm25, key: 'pm25' },
            { label: 'PM10', value: station.pm10, key: 'pm10' },
            { label: 'SO₂', value: station.so2, key: 'so2' },
            { label: 'NO₂', value: station.no2, key: 'no2' },
            { label: 'O₃', value: station.o3, key: 'o3' },
            { label: 'CO', value: station.co, key: 'co' },
          ].filter(
            (p): p is { label: string; value: number; key: string } =>
              (isAll || p.key !== activePollutant) &&
              typeof p.value === 'number' &&
              p.value >= 0
          )

          return (
            <div key={station.id}>
              {qualityZone}
              <Marker
                position={[station.lat, station.lng]}
                icon={createCleanDotIcon(fillColor)}
                eventHandlers={{
                  click: () => onSelectStation?.(station),
                }}
              >
                <Popup>
                  <div className="min-w-[240px] space-y-3 p-1 text-[#4a453c] dark:text-slate-100">
                    {/* Header */}
                    <div className="border-b border-[#d4cebe] dark:border-slate-800/80 pb-2">
                      <h3 className="text-sm font-extrabold text-[#1e1b18] dark:text-white">
                        {station.nombre}
                      </h3>
                      <p className="text-[11px] font-medium text-[#6e685e] dark:text-slate-400">
                        {station.region} • Comuna de {station.locality}
                      </p>
                    </div>

                    <div className="space-y-2">
                      {ica ? (
                        <>
                          <div className="flex items-center gap-2">
                            <span
                              className="inline-block h-3.5 w-3.5 rounded-sm"
                              style={{
                                backgroundColor: fillColor,
                                boxShadow: `0 0 10px ${fillColor}`,
                              }}
                            />
                            <span className="text-xs font-black uppercase tracking-wider" style={{ color: fillColor }}>
                              {ica.categoria} {isAll ? '(ÍNDICE GLOBAL)' : `(${activePollutant.toUpperCase()})`}
                            </span>
                          </div>
                          <p className="text-xs leading-relaxed text-[#4a453c] dark:text-slate-300">
                            {ica.descripcion}
                          </p>

                          {/* Active value */}
                          <div className="rounded-lg bg-[#faf8f2]/80 dark:bg-slate-900/60 border border-[#d4cebe]/50 dark:border-slate-800/40 p-2.5">
                            <p className="text-[9px] font-bold text-[#8c8273] dark:text-slate-500 uppercase tracking-wider">
                              {isAll ? 'Estado de Calidad General' : `Concentración Actual de ${activePollutant.toUpperCase()}`}
                            </p>
                            <p className="text-sm font-black text-[#1e1b18] dark:text-white tabular-nums">
                              {displayValue}
                            </p>
                          </div>

                          {/* Other gases */}
                          {otherPollutants.length > 0 && (
                            <div className="space-y-1.5 border-t border-[#d4cebe] dark:border-slate-800/60 pt-2.5">
                              <p className="text-[9px] font-bold text-[#8c8273] dark:text-slate-500 uppercase tracking-wider">
                                {isAll ? 'Mediciones Disponibles' : 'Otros Sensores'}
                              </p>
                              <div className="grid grid-cols-2 gap-1.5 text-[11px]">
                                {otherPollutants.map((p) => {
                                  const isCO = p.key === 'co'
                                  const valFormatted = isCO ? (p.value / 1000).toFixed(2) : Math.round(p.value)
                                  const unitStr = isCO ? 'mg/m³' : 'µg/m³'
                                  return (
                                    <div key={p.key} className="flex justify-between bg-white/50 dark:bg-slate-900/40 border border-[#d4cebe]/50 dark:border-slate-800/40 px-2 py-1 rounded-lg">
                                      <span className="font-semibold text-[#8c8273] dark:text-slate-400">{p.label}:</span>
                                      <span className="font-bold text-[#2d2a24] dark:text-slate-200 tabular-nums">{valFormatted} {unitStr}</span>
                                    </div>
                                  )
                                })}
                              </div>
                            </div>
                          )}

                          {station.lastUpdated && (
                            <p className="text-[9px] text-[#8c8273] dark:text-slate-500 pt-1">
                              Actualizado: {new Date(station.lastUpdated).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}
                            </p>
                          )}
                        </>
                      ) : (
                        <p className="text-xs text-[#8c8273] dark:text-slate-400 leading-relaxed">
                          Estación activa. Los datos para {isAll ? 'los contaminantes' : activePollutant.toUpperCase()} no están disponibles temporalmente.
                        </p>
                      )}
                    </div>

                    <div className="flex items-center justify-between border-t border-[#d4cebe] dark:border-slate-800/60 pt-2.5 text-[10px] text-[#8c8273] dark:text-slate-500">
                      <span>ID: {station.id}</span>
                      <button
                        onClick={() => onSelectStation?.(station)}
                        className="text-emerald-600 dark:text-emerald-400 font-extrabold hover:text-emerald-700 dark:hover:text-emerald-300 transition-colors"
                      >
                        Ver detalles &rarr;
                      </button>
                    </div>
                  </div>
                </Popup>
              </Marker>
            </div>
          )
        })}
      </MapContainer>
    </div>
  )
}

