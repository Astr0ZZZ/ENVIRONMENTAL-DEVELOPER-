'use client'

import { useMemo, useEffect, useState } from 'react'
import { MapContainer, TileLayer, Marker, Polygon, Circle, Popup, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { Station } from '@/types/openaq'
import { getICACategory, getContrastTextColor } from '@/constants/ica-thresholds'

interface AirMapProps {
  stations: Station[]
  activePollutant: 'pm25' | 'pm10' | 'so2' | 'no2' | 'o3' | 'co'
  center?: [number, number]
  zoom?: number
  onSelectStation?: (station: Station) => void
}

function ZoomTracker({ onChange }: { onChange: (zoom: number) => void }) {
  const map = useMap()
  useEffect(() => {
    const onZoom = () => onChange(map.getZoom())
    map.on('zoomend', onZoom)
    return () => {
      map.off('zoomend', onZoom)
    }
  }, [map, onChange])
  return null
}

function getPollutantSeverityRatio(
  valor: number,
  parametro: 'pm10' | 'pm25' | 'so2' | 'no2' | 'o3' | 'co'
): number {
  const maxVal = {
    pm25: 45,
    pm10: 200,
    so2: 1000,
    no2: 1000,
    o3: 450,
    co: 40000,
  }[parametro] || 100
  return Math.min(1.5, Math.max(0.1, valor / maxVal))
}

function getWindVector(lat: number, lng: number, stationId: string) {
  let hash = 0
  for (let i = 0; i < stationId.length; i++) {
    hash = stationId.charCodeAt(i) + ((hash << 5) - hash)
  }
  const rand = (offset: number) => {
    const x = Math.sin(hash + offset) * 10000
    return x - Math.floor(x)
  }

  // Modelo de viento regional científico de Chile según latitud:
  // Norte (lat > -30): vientos predominantes del WSW (apuntan a ENE, ~60 grados)
  // Centro (lat > -38): vientos del SW en el valle y costa (apuntan a NE, ~45 grados)
  // Sur (lat <= -38): vientos del Oeste del Pacífico / Westerlies (apuntan a Este, ~90 grados en sistema de 0=Norte)
  let baseAngleRad = 0
  if (lat > -30) {
    baseAngleRad = (60 * Math.PI) / 180
  } else if (lat <= -30 && lat > -38) {
    baseAngleRad = (45 * Math.PI) / 180
  } else {
    baseAngleRad = (90 * Math.PI) / 180
  }

  // Variación determinista de +-15 grados por estación para realismo
  const angle = baseAngleRad + (rand(1) * 0.5 - 0.25)
  // Intensidad/dispersión en km (de 4 a 14 km)
  const speedKm = 4 + rand(2) * 10
  return { angle, speedKm }
}

function getGaussianPlumePolygon(
  lat: number,
  lng: number,
  angle: number, // Dirección downwind en radianes
  lengthKm: number,
  expansionAngleDeg: number
): [number, number][] {
  const pointsLeft: [number, number][] = []
  const pointsRight: [number, number][] = []
  
  const latToKm = 111.32
  const lngToKm = 111.32 * Math.cos((lat * Math.PI) / 180)
  
  const steps = 12
  const expansionRad = (expansionAngleDeg * Math.PI) / 180
  
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const dist = t * lengthKm
    // Pluma de dispersión física cónica: el ancho se expande con la distancia
    const width = 0.05 + dist * Math.tan(expansionRad)
    
    const centerLat = lat + (dist * Math.cos(angle)) / latToKm
    const centerLng = lng + (dist * Math.sin(angle)) / lngToKm
    
    const perpLatOffset = (width * -Math.sin(angle)) / latToKm
    const perpLngOffset = (width * Math.cos(angle)) / lngToKm
    
    const leftLat = centerLat + perpLatOffset
    const leftLng = centerLng + perpLngOffset
    const rightLat = centerLat - perpLatOffset
    const rightLng = centerLng - perpLngOffset
    
    pointsLeft.push([leftLat, leftLng])
    if (i > 0) {
      pointsRight.push([rightLat, rightLng])
    }
  }
  
  return [
    [lat, lng],
    ...pointsLeft,
    ...pointsRight.reverse(),
    [lat, lng]
  ]
}


function createCustomIcon(color: string, valueStr: string, category: string, isZoomedIn: boolean) {
  const pulseClass = ['Alerta', 'Preemergencia', 'Emergencia'].includes(category) ? 'animate-pulse-glow' : ''
  const showText = isZoomedIn && valueStr !== '—'
  const isDarkText = getContrastTextColor(color) === 'text-slate-950'
  const textColor = isDarkText ? '#0f172a' : '#ffffff'

  return L.divIcon({
    className: 'custom-station-marker',
    html: `
      <div class="relative flex items-center justify-center">
        <!-- Pulsing Ring for high alert levels -->
        ${pulseClass ? `
          <div class="absolute -inset-2 rounded-full opacity-65 ${pulseClass}" style="border: 2px solid ${color};"></div>
        ` : ''}
        
        <!-- Glowing Ambient Shadow -->
        <div class="absolute inset-0 rounded-full blur-[6px]" style="background-color: ${color}; opacity: 0.5;"></div>
        
        <!-- Main Marker Circle -->
        <div class="relative flex ${showText ? 'h-7 w-7' : 'h-4.5 w-4.5'} items-center justify-center rounded-full border-[1.5px] border-slate-950 text-[10px] font-black shadow-2xl transition-all duration-300 hover:scale-110" style="background-color: ${color}; color: ${textColor};">
          ${showText ? valueStr : ''}
        </div>
      </div>
    `,
    iconSize: showText ? [28, 28] : [18, 18],
    iconAnchor: showText ? [14, 14] : [9, 9],
  })
}

function MapController({ stations }: { stations: (Station & { lat: number; lng: number })[] }) {
  const map = useMap()

  useEffect(() => {
    if (stations.length === 0) return

    // Si es solo 1 estación, centrar y hacer zoom intermedio
    if (stations.length === 1) {
      map.flyTo([stations[0].lat, stations[0].lng], 11, {
        animate: true,
        duration: 1.2
      })
      return
    }

    const lats = stations.map(s => s.lat)
    const lngs = stations.map(s => s.lng)
    
    const minLat = Math.min(...lats)
    const maxLat = Math.max(...lats)
    const minLng = Math.min(...lngs)
    const maxLng = Math.max(...lngs)

    // Ajustar límites con padding
    map.fitBounds([
      [minLat, minLng],
      [maxLat, maxLng]
    ], {
      padding: [40, 40],
      maxZoom: 10,
      animate: true,
      duration: 1.5
    })
  }, [stations, map])

  return null
}

export function AirMap({
  stations,
  activePollutant,
  center = [-33.45, -70.67],
  zoom = 6,
  onSelectStation,
}: AirMapProps) {
  const [zoomLevel, setZoomLevel] = useState(zoom)
  const [mapTheme, setMapTheme] = useState<'dark' | 'detailed' | 'satellite'>('detailed')

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const isDark = document.documentElement.classList.contains('dark')
      setMapTheme(isDark ? 'dark' : 'detailed')
    }
  }, [])

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
      {/* Selector de Mapa Premium */}
      <div className="absolute right-4 top-4 z-[1000] flex gap-1 rounded-xl border border-[#d4cebe] dark:border-slate-700/60 bg-white/90 dark:bg-slate-900/85 p-1 backdrop-blur-md shadow-2xl">
        <button
          type="button"
          onClick={() => setMapTheme('dark')}
          className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-all duration-200 border ${
            mapTheme === 'dark'
              ? 'bg-emerald-500/10 dark:bg-emerald-500/20 text-emerald-800 dark:text-emerald-400 border-emerald-500/20 dark:border-emerald-500/30'
              : 'text-[#6e685e] dark:text-slate-400 hover:text-[#2d2a24] dark:hover:text-slate-200 border-transparent hover:bg-[#e4dec9]/50 dark:hover:bg-slate-800/40'
          }`}
        >
          Vista Oscura
        </button>
        <button
          type="button"
          onClick={() => setMapTheme('detailed')}
          className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-all duration-200 border ${
            mapTheme === 'detailed'
              ? 'bg-emerald-500/10 dark:bg-emerald-500/20 text-emerald-800 dark:text-emerald-400 border-emerald-500/20 dark:border-emerald-500/30'
              : 'text-[#6e685e] dark:text-slate-400 hover:text-[#2d2a24] dark:hover:text-slate-200 border-transparent hover:bg-[#e4dec9]/50 dark:hover:bg-slate-800/40'
          }`}
        >
          Vista Detallada
        </button>
        <button
          type="button"
          onClick={() => setMapTheme('satellite')}
          className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-all duration-200 border ${
            mapTheme === 'satellite'
              ? 'bg-emerald-500/10 dark:bg-emerald-500/20 text-emerald-800 dark:text-emerald-400 border-emerald-500/20 dark:border-emerald-500/30'
              : 'text-[#6e685e] dark:text-slate-400 hover:text-[#2d2a24] dark:hover:text-slate-200 border-transparent hover:bg-[#e4dec9]/50 dark:hover:bg-slate-800/40'
          }`}
        >
          Vista Satélite
        </button>
      </div>

      <MapContainer
        center={center}
        zoom={zoom}
        scrollWheelZoom
        className="h-full w-full z-0 bg-[#faf8f2] dark:bg-[#0f172a]"
      >
        <MapController stations={validStations} />
        <ZoomTracker onChange={setZoomLevel} />
        <TileLayer
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
        {validStations.map((station) => {
          const val = station[activePollutant]
          const hasVal = typeof val === 'number' && val >= 0

          const ica = hasVal
            ? getICACategory(val, activePollutant)
            : null

          const fillColor = ica?.color ?? '#64748b'

          // Formatear valor para el marcador del mapa
          let displayValue = '—'
          if (hasVal) {
            if (activePollutant === 'co') {
              // Convertir CO de µg/m³ a mg/m³ para el mapa
              displayValue = (val / 1000).toFixed(1)
            } else {
              displayValue = String(Math.round(val))
            }
          }

          // Lógica de dispersión adaptativa (nube)
          let dispersionPlumes: React.ReactNode = null

          if (ica && ica.categoria !== 'Bueno') {
            const severityRatio = getPollutantSeverityRatio(val as number, activePollutant)
            const { angle } = getWindVector(station.lat, station.lng, station.id)

            if (zoomLevel >= 8) {
              // Pluma de dispersión cónica gaussiana con tres niveles de concentración anidados
              const outerPlume = getGaussianPlumePolygon(station.lat, station.lng, angle, 8 + severityRatio * 14, 32)
              const midPlume = getGaussianPlumePolygon(station.lat, station.lng, angle, 4 + severityRatio * 8, 22)
              const innerPlume = getGaussianPlumePolygon(station.lat, station.lng, angle, 2 + severityRatio * 4, 12)

              dispersionPlumes = (
                <>
                  <Polygon
                    positions={outerPlume}
                    pathOptions={{
                      fillColor,
                      color: 'transparent',
                      stroke: false,
                      fillOpacity: 0.05 * severityRatio,
                      className: 'leaflet-glow-halo-plume',
                    }}
                    interactive={false}
                  />
                  <Polygon
                    positions={midPlume}
                    pathOptions={{
                      fillColor,
                      color: 'transparent',
                      stroke: false,
                      fillOpacity: 0.12 * severityRatio,
                      className: 'leaflet-glow-halo-plume',
                    }}
                    interactive={false}
                  />
                  <Polygon
                    positions={innerPlume}
                    pathOptions={{
                      fillColor,
                      color: 'transparent',
                      stroke: false,
                      fillOpacity: 0.22 * severityRatio,
                      className: 'leaflet-glow-halo-plume',
                    }}
                    interactive={false}
                  />
                </>
              )
            } else {
              // A zoom bajo, mostrar un halo difuminado que se desplaza en la dirección del viento para realismo macroscópico
              const offsetKm = 3 + severityRatio * 5
              const latToKm = 111.32
              const lngToKm = 111.32 * Math.cos((station.lat * Math.PI) / 180)
              
              const centerLat = station.lat + (offsetKm * Math.cos(angle)) / latToKm
              const centerLng = station.lng + (offsetKm * Math.sin(angle)) / lngToKm
              
              const glowRadiusKm = 6 + severityRatio * 10
              const radiusMeters = glowRadiusKm * 1000

              dispersionPlumes = (
                <Circle
                  center={[centerLat, centerLng]}
                  radius={radiusMeters}
                  pathOptions={{
                    fillColor,
                    color: 'transparent',
                    stroke: false,
                    fillOpacity: 0.05 + (severityRatio * 0.04), // Opacidad adaptada y muy suave
                    className: 'leaflet-glow-halo-ambient',
                  }}
                  interactive={false}
                />
              )
            }
          }

          // Obtener otros contaminantes para el listado secundario en el popup
          const otherPollutants = [
            { label: 'PM2.5', value: station.pm25, key: 'pm25' },
            { label: 'PM10', value: station.pm10, key: 'pm10' },
            { label: 'SO₂', value: station.so2, key: 'so2' },
            { label: 'NO₂', value: station.no2, key: 'no2' },
            { label: 'O₃', value: station.o3, key: 'o3' },
            { label: 'CO', value: station.co, key: 'co' },
          ].filter(
            (p): p is { label: string; value: number; key: string } =>
              p.key !== activePollutant &&
              typeof p.value === 'number' &&
              p.value >= 0
          )

          return (
            <div key={station.id}>
              {dispersionPlumes}

              {/* Marcador Principal */}
              <Marker
                position={[station.lat, station.lng]}
                icon={createCustomIcon(fillColor, displayValue, ica?.categoria ?? 'Sin Datos', zoomLevel >= 9)}
                eventHandlers={{
                  click: () => {
                    onSelectStation?.(station)
                  },
                }}
              >
                <Popup>
                  <div className="min-w-[240px] space-y-3 p-1 text-[#4a453c] dark:text-slate-100">
                    {/* Header con contraste premium */}
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
                              className="inline-block h-3.5 w-3.5 rounded-full"
                              style={{
                                backgroundColor: fillColor,
                                boxShadow: `0 0 10px ${fillColor}`,
                              }}
                            />
                            <span className="text-xs font-black uppercase tracking-wider" style={{ color: fillColor }}>
                              {ica.categoria} ({activePollutant.toUpperCase()})
                            </span>
                          </div>
                          <p className="text-xs leading-relaxed text-[#4a453c] dark:text-slate-300">
                            {ica.descripcion}
                          </p>

                          {/* Valor activo destacado */}
                          <div className="rounded-lg bg-[#faf8f2]/80 dark:bg-slate-900/60 border border-[#d4cebe]/50 dark:border-slate-800/40 p-2.5">
                            <p className="text-[9px] font-bold text-[#8c8273] dark:text-slate-500 uppercase tracking-wider">
                              Concentración Actual de {activePollutant.toUpperCase()}
                            </p>
                            <p className="text-sm font-black text-[#1e1b18] dark:text-white tabular-nums">
                              {activePollutant === 'co' 
                                ? `${((val ?? 0) / 1000).toFixed(2)} mg/m³` 
                                : `${val ?? 0} µg/m³`}
                            </p>
                          </div>

                          {/* Otros gases en el popup */}
                          {otherPollutants.length > 0 && (
                            <div className="space-y-1.5 border-t border-[#d4cebe] dark:border-slate-800/60 pt-2.5">
                              <p className="text-[9px] font-bold text-[#8c8273] dark:text-slate-500 uppercase tracking-wider">
                                Otros Sensores
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
                          Estación activa. Los datos para {activePollutant.toUpperCase()} no están disponibles temporalmente.
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
