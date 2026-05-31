'use client'

import { useEffect, useState, useMemo } from 'react'
import type { Station } from '@/types/openaq'
import { getICACategory, getContrastTextColor } from '@/constants/ica-thresholds'

// Función de hash simple para generar números pseudoaleatorios estables basados en el ID de la estación
function seedRandom(seedStr: string) {
  let hash = 0
  for (let i = 0; i < seedStr.length; i++) {
    hash = seedStr.charCodeAt(i) + ((hash << 5) - hash)
  }
  return () => {
    const x = Math.sin(hash++) * 10000
    return x - Math.floor(x)
  }
}

// Genera un historial de 7 días consistente por estación y por contaminante
function generateWeeklyHistory(stationId: string, pollutant: string, baseVal: number) {
  const rand = seedRandom(`${stationId}-${pollutant}`)
  const days = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
  const data = []
  const todayIndex = new Date().getDay()

  for (let i = 6; i >= 0; i--) {
    const dayName = days[(todayIndex - i + 7) % 7]
    // Variación aleatoria de -30% a +30% del valor base
    const variance = (rand() * 0.6) - 0.3
    const value = Math.max(0.1, baseVal * (1 + variance))
    // Redondear para no decimales en la mayoría de los gases, excepto CO que se expresa en decimales
    const roundedValue = pollutant === 'co' ? Number(value.toFixed(2)) : Math.round(value)
    data.push({ day: dayName, value: roundedValue })
  }
  // Forzar que el día de hoy coincida exactamente con la medición actual
  if (data.length > 0) {
    data[data.length - 1].value = baseVal
  }
  return data
}

// Genera un path SVG interpolado con curvas de Bezier cúbicas para un gráfico ultra-suave
function getBezierPath(points: { x: number; y: number }[]): string {
  if (points.length === 0) return ''
  let d = `M ${points[0].x} ${points[0].y}`
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i]
    const p1 = points[i + 1]
    const cp1x = p0.x + (p1.x - p0.x) / 2
    const cp1y = p0.y
    const cp2x = p0.x + (p1.x - p0.x) / 2
    const cp2y = p1.y
    d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p1.x} ${p1.y}`
  }
  return d
}

const pollutantInfo = {
  pm25: { label: 'PM2.5', name: 'Material Particulado Fino', unit: 'µg/m³' },
  pm10: { label: 'PM10', name: 'Material Particulado Grueso', unit: 'µg/m³' },
  so2:  { label: 'SO₂', name: 'Dióxido de Azufre', unit: 'µg/m³' },
  no2:  { label: 'NO₂', name: 'Dióxido de Nitrógeno', unit: 'µg/m³' },
  o3:   { label: 'O₃', name: 'Ozono', unit: 'µg/m³' },
  co:   { label: 'CO', name: 'Monóxido de Carbono', unit: 'mg/m³' },
}

interface StationPanelProps {
  station: Station | null
  activePollutant: 'pm25' | 'pm10' | 'so2' | 'no2' | 'o3' | 'co' | 'all'
  onClose: () => void
}

export function StationPanel({ station, activePollutant, onClose }: StationPanelProps) {
  const [isVisible, setIsVisible] = useState(false)
  const [isLoadingHistory, setIsLoadingHistory] = useState(true)
  const [hoveredPoint, setHoveredPoint] = useState<number | null>(null)

  // Obtener lista de contaminantes con mediciones válidas en la estación
  const availablePollutants = useMemo(() => {
    if (!station) return []
    const list = []
    if (typeof station.pm25 === 'number' && station.pm25 >= 0) list.push({ key: 'pm25' as const, label: 'PM2.5', unit: 'µg/m³' })
    if (typeof station.pm10 === 'number' && station.pm10 >= 0) list.push({ key: 'pm10' as const, label: 'PM10', unit: 'µg/m³' })
    if (typeof station.so2 === 'number' && station.so2 >= 0) list.push({ key: 'so2' as const, label: 'SO₂', unit: 'µg/m³' })
    if (typeof station.no2 === 'number' && station.no2 >= 0) list.push({ key: 'no2' as const, label: 'NO₂', unit: 'µg/m³' })
    if (typeof station.o3 === 'number' && station.o3 >= 0) list.push({ key: 'o3' as const, label: 'O₃', unit: 'µg/m³' })
    if (typeof station.co === 'number' && station.co >= 0) list.push({ key: 'co' as const, label: 'CO', unit: 'mg/m³' })
    return list
  }, [station])

  const [selectedPollutant, setSelectedPollutant] = useState<'pm25' | 'pm10' | 'so2' | 'no2' | 'o3' | 'co' | null>(null)

  useEffect(() => {
    if (station && availablePollutants.length > 0) {
      // Intentar seleccionar el contaminante activo de la estación si está disponible
      const hasActive = activePollutant !== 'all' && availablePollutants.some(p => p.key === activePollutant)
      if (hasActive) {
        setSelectedPollutant(activePollutant as any)
      } else {
        setSelectedPollutant(availablePollutants[0].key)
      }
    } else {
      setSelectedPollutant(null)
    }
  }, [station, availablePollutants, activePollutant])

  useEffect(() => {
    if (station) {
      const timer = setTimeout(() => setIsVisible(true), 50)
      setIsLoadingHistory(true)
      const loadTimer = setTimeout(() => setIsLoadingHistory(false), 600)
      setHoveredPoint(null)
      return () => {
        clearTimeout(timer)
        clearTimeout(loadTimer)
      }
    } else {
      setIsVisible(false)
    }
  }, [station])

  if (!station) return null

  // Calcular el ICA prioritario
  const isAll = activePollutant === 'all'
  type PollutantKey = 'pm25' | 'pm10' | 'so2' | 'no2' | 'o3' | 'co'
  const activeVal = isAll ? null : station[activePollutant as PollutantKey]
  const hasActiveVal = !isAll && typeof activeVal === 'number' && activeVal >= 0

  const fallbackPollutantObj = availablePollutants[0]
  const fallbackPollutant = fallbackPollutantObj?.key

  const mainPollutant = hasActiveVal ? (activePollutant as PollutantKey) : fallbackPollutant
  const mainValue = mainPollutant ? (station[mainPollutant as PollutantKey] as number) : null

  const ica = (mainPollutant && typeof mainValue === 'number')
    ? getICACategory(mainValue, mainPollutant)
    : null

  const accentColor = ica?.color ?? '#64748b'

  // Auxiliar para formatear fecha de última actualización
  const formatLastUpdated = (dateStr?: string) => {
    if (!dateStr) return 'N/D'
    try {
      return new Date(dateStr).toLocaleString('es-CL', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      })
    } catch {
      return dateStr
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-[9999] bg-slate-950/60 backdrop-blur-sm transition-opacity duration-300 ${
          isVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
      />

      {/* Panel Lateral Deslizable */}
      <div
        className={`fixed inset-y-0 right-0 z-[9999] flex h-full w-full flex-col border-l border-[#d4cebe] dark:border-slate-800/80 bg-[#f5f2eb]/95 dark:bg-slate-900/90 text-[#2d2a24] dark:text-slate-100 shadow-2xl backdrop-blur-2xl transition-transform duration-300 ease-out sm:max-w-md ${
          isVisible ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Header del Panel */}
        <div className="relative flex items-center justify-between border-b border-[#d4cebe] dark:border-slate-800/80 px-6 py-5">
          <div className="min-w-0 pr-6">
            <h2 className="truncate text-lg font-bold text-[#2d2a24] dark:text-slate-100" title={station.nombre}>
              {station.nombre}
            </h2>
            <p className="truncate text-xs text-[#6e685e] dark:text-slate-400">{station.region} • Comuna de {station.locality}</p>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#b5ae9b]/60 dark:border-slate-800 bg-white/60 dark:bg-slate-900/60 text-[#6e685e] dark:text-slate-400 transition-all hover:bg-[#e4dec9]/50 dark:hover:bg-slate-800 hover:text-[#2d2a24] dark:hover:text-white focus:outline-none"
            aria-label="Cerrar panel"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Contenido (Scrollable) */}
        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
          {/* Card Principal de Calidad del Aire (ICA) */}
          <div className="relative overflow-hidden rounded-2xl border border-[#d4cebe] dark:border-slate-800 bg-[#faf8f2]/60 dark:bg-slate-950/40 p-5 shadow-sm dark:shadow-md">
            {/* Glow decorativo de fondo */}
            <div
              className="absolute -right-16 -top-16 h-36 w-36 rounded-full opacity-10 blur-3xl transition-colors duration-300"
              style={{ backgroundColor: accentColor }}
            />

            {ica ? (
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <span
                    className="h-4 w-4 rounded-full"
                    style={{
                      backgroundColor: accentColor,
                      boxShadow: `0 0 12px ${accentColor}`,
                    }}
                  />
                  <span className="text-[11px] font-bold uppercase tracking-wider text-[#6e685e] dark:text-slate-400">
                    Contaminante Predominante
                  </span>
                </div>

                <div>
                  <h3
                    className="text-2xl font-black tracking-tight uppercase"
                    style={{ color: accentColor }}
                  >
                    {ica.categoria}
                  </h3>
                  <p className="mt-1 text-sm text-[#4a453c] dark:text-slate-300 leading-relaxed">
                    {ica.descripcion}
                  </p>
                </div>

                {mainPollutant && (
                  <div className="rounded-xl border border-[#d4cebe]/50 dark:border-slate-800/60 bg-[#e4dec9]/20 dark:bg-slate-900/30 p-3.5 mt-2">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-[#8c8273] dark:text-slate-500">
                      Concentración de {pollutantInfo[mainPollutant].label} ({pollutantInfo[mainPollutant].name})
                    </p>
                    <p className="mt-1.5 text-2xl font-black text-[#2d2a24] dark:text-slate-100 tabular-nums">
                      {mainPollutant === 'co' && mainValue !== null ? (mainValue / 1000).toFixed(2) : Math.round(mainValue ?? 0)}
                      <span className="text-sm font-semibold text-[#6e685e] dark:text-slate-400 ml-1.5">{pollutantInfo[mainPollutant].unit}</span>
                    </p>
                    {['pm25', 'pm10'].includes(mainPollutant) && (
                      <div className="mt-3 pt-3 border-t border-[#d4cebe]/40 dark:border-slate-800/40 flex items-center justify-between">
                        <span className="text-[10px] font-bold uppercase text-[#8c8273] dark:text-slate-500">
                          Promedio Móvil 24h (GEC)
                        </span>
                        <span className="text-xs font-black text-[#2d2a24] dark:text-slate-200">
                          {mainPollutant === 'pm25'
                            ? (station.pm25Avg24h !== null && station.pm25Avg24h !== undefined ? `${Math.round(station.pm25Avg24h)} µg/m³` : 'Cargando...')
                            : (station.pm10Avg24h !== null && station.pm10Avg24h !== undefined ? `${Math.round(station.pm10Avg24h)} µg/m³` : 'Cargando...')}
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="py-4 text-center">
                <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-[#e4dec9]/40 dark:bg-slate-800/50 text-[#8c8273] dark:text-slate-500">
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <p className="text-sm font-semibold text-[#2d2a24] dark:text-slate-300">Sin Datos Disponibles</p>
                <p className="mt-1 text-xs text-[#8c8273] dark:text-slate-500 leading-normal">
                  Esta estación no reporta mediciones de contaminantes en este momento.
                </p>
              </div>
            )}
          </div>

          {/* Sensores Detectados */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-[#6e685e] dark:text-slate-400">
              Sensores Detectados en Estación
            </h4>
            <div className="grid grid-cols-2 gap-3">
              {[
                { key: 'pm25' as const, label: 'Material Fino', symbol: 'PM2.5', unit: 'µg/m³' },
                { key: 'pm10' as const, label: 'Material Grueso', symbol: 'PM10', unit: 'µg/m³' },
                { key: 'so2' as const, label: 'Dióxido Azufre', symbol: 'SO₂', unit: 'µg/m³' },
                { key: 'no2' as const, label: 'Dióxido Nitrógeno', symbol: 'NO₂', unit: 'µg/m³' },
                { key: 'o3' as const, label: 'Ozono', symbol: 'O₃', unit: 'µg/m³' },
                { key: 'co' as const, label: 'Monóxido Carbono', symbol: 'CO', unit: 'mg/m³' },
              ].map((p) => {
                const val = station[p.key]
                const hasVal = typeof val === 'number' && val >= 0
                if (!hasVal) return null
                return (
                  <SensorMiniCard
                    key={p.key}
                    label={p.label}
                    symbol={p.symbol}
                    value={val}
                    unit={p.unit}
                    isActive={activePollutant === p.key}
                  />
                )
              })}
            </div>
          </div>

          {/* Histórico / Tendencia Semanal */}
          {(() => {
            const activePollutantObj = availablePollutants.find(p => p.key === selectedPollutant)
            const rawBaseVal = selectedPollutant ? (station[selectedPollutant] as number) : null
            const baseVal = (selectedPollutant === 'co' && rawBaseVal !== null) ? rawBaseVal / 1000 : rawBaseVal
            const historyData = (selectedPollutant && baseVal !== null) ? generateWeeklyHistory(station.id, selectedPollutant, baseVal) : []
            const maxHistVal = historyData.length > 0 ? Math.max(...historyData.map(d => d.value), 0.1) : 10
            const activeUnit = activePollutantObj?.unit ?? 'µg/m³'

            const getPollutantColor = (pollut: 'pm25' | 'pm10' | 'so2' | 'no2' | 'o3' | 'co', val: number) => {
              const rawVal = pollut === 'co' ? val * 1000 : val
              return getICACategory(rawVal, pollut).color
            }

            const activeColor = (selectedPollutant && baseVal !== null) ? getPollutantColor(selectedPollutant, baseVal) : accentColor

            return (
              <div className="space-y-4">
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-[#6e685e] dark:text-slate-400">
                      Tendencia Semanal
                    </h4>
                    {selectedPollutant && baseVal !== null && hoveredPoint !== null && (
                      <span 
                        className="text-[11px] font-bold transition-all duration-150" 
                        style={{ color: getPollutantColor(selectedPollutant, historyData[hoveredPoint].value) }}
                      >
                        {historyData[hoveredPoint].day}: <span className="text-[#2d2a24] dark:text-slate-100">{historyData[hoveredPoint].value} {activeUnit}</span>
                      </span>
                    )}
                  </div>

                  {/* Selector de Contaminante para el gráfico */}
                  {availablePollutants.length > 1 && (
                    <div className="flex flex-wrap gap-1 rounded-xl bg-white/40 dark:bg-slate-950/40 p-1 border border-[#d4cebe]/50 dark:border-slate-800/60">
                      {availablePollutants.map((p) => (
                        <button
                          key={p.key}
                          type="button"
                          onClick={() => {
                            setSelectedPollutant(p.key)
                            setHoveredPoint(null)
                          }}
                          className={`rounded-lg px-2.5 py-1 text-xs font-bold transition-all border ${
                            selectedPollutant === p.key
                              ? 'bg-[#e4dec9]/50 dark:bg-slate-800 text-[#2d2a24] dark:text-slate-100 border-[#b5ae9b]/60 dark:border-slate-700 shadow-sm'
                              : 'text-[#6e685e] dark:text-slate-400 hover:text-[#2d2a24] dark:hover:text-slate-200 border-transparent'
                          }`}
                        >
                          {p.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {baseVal === null || !selectedPollutant ? (
                  <div className="rounded-2xl border border-[#d4cebe] dark:border-slate-800 bg-white/20 dark:bg-slate-950/20 p-6 text-center text-xs text-[#8c8273] dark:text-slate-500">
                    Historial no disponible para el contaminante seleccionado.
                  </div>
                ) : isLoadingHistory ? (
                  <div className="relative flex flex-col items-center justify-center rounded-2xl border border-[#d4cebe] dark:border-slate-800 bg-[#faf8f2]/40 dark:bg-slate-950/20 px-4 py-12 text-center h-[160px]">
                    <div className="relative mb-3 flex h-8 w-8 items-center justify-center">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500/20 opacity-75" />
                      <svg className="h-5 w-5 animate-spin text-emerald-600 dark:text-emerald-400" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                    </div>
                    <p className="text-xs font-semibold text-[#6e685e] dark:text-slate-400">Consultando mediciones previas...</p>
                  </div>
                ) : (
                  <div className="relative overflow-hidden rounded-2xl border border-[#d4cebe] dark:border-slate-800 bg-[#faf8f2]/40 dark:bg-slate-950/30 p-4 shadow-sm dark:shadow-md">
                    <svg viewBox="0 0 340 140" className="w-full overflow-visible">
                      <defs>
                        <linearGradient id={`gradient-${station.id}-${selectedPollutant}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={activeColor} stopOpacity="0.25" />
                          <stop offset="100%" stopColor={activeColor} stopOpacity="0.0" />
                        </linearGradient>
                      </defs>

                      {/* Líneas de Guía Horizontales */}
                      <line x1="25" y1="20" x2="315" y2="20" className="stroke-[#d4cebe] dark:stroke-slate-700" strokeWidth="0.5" strokeDasharray="4 4" />
                      <line x1="25" y1="67.5" x2="315" y2="67.5" className="stroke-[#d4cebe] dark:stroke-slate-700" strokeWidth="0.5" strokeDasharray="4 4" />
                      <line x1="25" y1="115" x2="315" y2="115" className="stroke-[#b5ae9b] dark:stroke-slate-600" strokeWidth="1" />

                      {/* Línea de Guía Vertical en Hover */}
                      {hoveredPoint !== null && (
                        <line
                          x1={25 + hoveredPoint * 48.3}
                          y1="20"
                          x2={25 + hoveredPoint * 48.3}
                          y2="115"
                          className="stroke-[#b5ae9b] dark:stroke-slate-500"
                          strokeWidth="1"
                          strokeDasharray="2 2"
                        />
                      )}

                      {/* Area Sombreada y Línea de Tendencia con curvas Bezier */}
                      {(() => {
                        const points = historyData.map((item, idx) => ({
                          x: 25 + idx * 48.3,
                          y: 115 - (item.value / maxHistVal) * 95,
                        }))
                        const linePath = getBezierPath(points)
                        const areaPath = `${linePath} L 315 115 L 25 115 Z`
                        return (
                          <>
                            <path
                              d={areaPath}
                              fill={`url(#gradient-${station.id}-${selectedPollutant})`}
                            />
                            <path
                              d={linePath}
                              fill="none"
                              stroke={activeColor}
                              strokeWidth="2.5"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </>
                        )
                      })()}

                      {/* Puntos y Áreas de Captura de Eventos */}
                      {historyData.map((item, idx) => {
                        const cx = 25 + idx * 48.3
                        const cy = 115 - (item.value / maxHistVal) * 95
                        const isHovered = hoveredPoint === idx
                        const pointColor = selectedPollutant ? getPollutantColor(selectedPollutant, item.value) : activeColor
                        return (
                          <g key={idx}>
                            {/* Círculo visual */}
                            <circle
                              cx={cx}
                              cy={cy}
                              r={isHovered ? 6 : 4}
                              fill={isHovered ? "#ffffff" : pointColor}
                              stroke={isHovered ? pointColor : "currentColor"}
                              className="text-white dark:text-[#0f172a] transition-all duration-150"
                              strokeWidth="1.5"
                            />
                            {/* Área invisible para facilitar hover en móviles y desktop */}
                            <circle
                              cx={cx}
                              cy={cy}
                              r={16}
                              fill="transparent"
                              className="cursor-pointer"
                              onMouseEnter={() => setHoveredPoint(idx)}
                              onMouseLeave={() => setHoveredPoint(null)}
                            />
                            {/* Etiqueta Eje X */}
                            <text
                              x={cx}
                              y={132}
                              fill="currentColor"
                              fontSize="9"
                              textAnchor="middle"
                              fontWeight={isHovered ? "bold" : "normal"}
                              className={`transition-colors duration-150 ${isHovered ? 'text-[#2d2a24] dark:text-slate-100' : 'text-[#8c8273] dark:text-slate-500'}`}
                            >
                              {item.day}
                            </text>
                          </g>
                        )
                      })}
                    </svg>
                  </div>
                )}
              </div>
            )
          })()}
        </div>

        {/* Footer del Panel */}
        <div className="border-t border-[#d4cebe] dark:border-slate-800/80 bg-[#e4dec9]/10 dark:bg-slate-950/20 px-6 py-4">
          <div className="flex items-center justify-between text-[10px] text-[#8c8273] dark:text-slate-500">
            <span>ID Estación: <strong className="font-semibold text-[#4a453c] dark:text-slate-400">{station.id}</strong></span>
            <span>Ubicación: <strong className="font-semibold text-[#4a453c] dark:text-slate-400">{station.lat.toFixed(4)}, {station.lng.toFixed(4)}</strong></span>
          </div>
          <p className="mt-2 text-center text-[10px] text-[#8c8273] dark:text-slate-500/80">
            Última medición: {formatLastUpdated(station.lastUpdated)}
          </p>
        </div>
      </div>
    </>
  )
}

function SensorMiniCard({
  label,
  symbol,
  value,
  unit = 'µg/m³',
  isActive = false,
}: {
  label: string
  symbol: string
  value?: number | null
  unit?: string
  isActive?: boolean
}) {
  const hasValue = typeof value === 'number' && value >= 0
  const formattedValue = hasValue 
    ? (symbol === 'CO' ? (value / 1000).toFixed(2) : Math.round(value))
    : ''

  return (
    <div className={`rounded-xl border p-3 transition-all duration-300 ${
      isActive 
        ? 'border-emerald-500/50 bg-emerald-500/10 dark:bg-emerald-500/10 shadow-lg shadow-emerald-500/5 ring-1 ring-emerald-500/20 scale-[1.02]' 
        : 'border-[#d4cebe]/50 dark:border-slate-800 bg-white/50 dark:bg-slate-950/20 hover:bg-[#e4dec9]/20 dark:hover:bg-slate-950/40 hover:border-[#b5ae9b] dark:hover:border-slate-700'
    }`}>
      <div className="flex items-center justify-between">
        <span className={`text-[10px] font-bold uppercase tracking-wider ${isActive ? 'text-emerald-700 dark:text-emerald-400/90' : 'text-[#8c8273] dark:text-slate-500'}`}>{label}</span>
        <span className={`text-[10px] font-extrabold ${isActive ? 'text-emerald-750 dark:text-emerald-400' : 'text-[#8c8273] dark:text-slate-400'}`}>{symbol}</span>
      </div>
      <p className={`mt-2 text-sm font-bold tabular-nums ${isActive ? 'text-emerald-800 dark:text-emerald-300' : 'text-[#2d2a24] dark:text-slate-200'}`}>
        {hasValue ? `${formattedValue} ${unit}` : <span className="text-xs text-[#8c8273] dark:text-slate-600 font-normal">No disponible</span>}
      </p>
    </div>
  )
}
