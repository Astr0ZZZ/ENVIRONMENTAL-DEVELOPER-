'use client'

import { useMemo, useState, useEffect } from 'react'
import type { Station } from '@/types/openaq'
import { getICACategory, getContrastTextColor } from '@/constants/ica-thresholds'

interface RegionTableProps {
  stations: Station[]
  activePollutant: 'pm25' | 'pm10' | 'so2' | 'no2' | 'o3' | 'co'
  onSelectStation?: (station: Station) => void
  searchQuery?: string
}

type SortKey = 'region' | 'count' | 'severity' | 'activeMax'
type SortDirection = 'asc' | 'desc'

const SEVERITY_ORDER = [
  'Sin datos',
  'Bueno',
  'Regular',
  'Alerta',
  'Preemergencia',
  'Emergencia',
]

export function RegionTable({ stations, activePollutant, onSelectStation, searchQuery }: RegionTableProps) {
  const [isMinimized, setIsMinimized] = useState(false)
  const [expandedRegions, setExpandedRegions] = useState<Set<string>>(new Set())
  const [sortConfig, setSortConfig] = useState<{
    key: SortKey
    direction: SortDirection
  }>({ key: 'region', direction: 'asc' })

  // Auto-expande todas las regiones que tienen resultados cuando se busca algo
  useEffect(() => {
    if (searchQuery && searchQuery.trim() !== '') {
      const regionsWithStations = Array.from(new Set(stations.map(s => s.region)))
      setExpandedRegions(prev => {
        const next = new Set(prev)
        regionsWithStations.forEach(reg => next.add(reg))
        return next
      })
    }
  }, [searchQuery, stations])

  const allRegions = useMemo(() => {
    return Array.from(new Set(stations.map((s) => s.region)))
  }, [stations])

  const areAllExpanded = useMemo(() => {
    return allRegions.length > 0 && allRegions.every((r) => expandedRegions.has(r))
  }, [allRegions, expandedRegions])

  const toggleAll = () => {
    if (areAllExpanded) {
      setExpandedRegions(new Set())
    } else {
      setExpandedRegions(new Set(allRegions))
    }
  }

  const toggleRegion = (region: string) => {
    setExpandedRegions((prev) => {
      const next = new Set(prev)
      if (next.has(region)) next.delete(region)
      else next.add(region)
      return next
    })
  }

  const handleSort = (key: SortKey) => {
    setSortConfig((prev) => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc',
    }))
  }

  const SortIcon = ({
    active,
    direction,
  }: {
    active: boolean
    direction: SortDirection
  }) => (
    <svg
      className={`ml-1 inline-block h-3 w-3 transition-transform duration-200 ${
        active ? 'text-emerald-600 dark:text-emerald-400' : 'text-[#8c8273] dark:text-slate-600'
      } ${active && direction === 'desc' ? 'rotate-180' : ''}`}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2.5}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
    </svg>
  )

  const rows = useMemo(() => {
    const map = new Map<
      string,
      {
        region: string
        stations: Station[]
        worstCategory: string
        worstColor: string
        worstIndex: number
        activeMax: number | null
      }
    >()

    for (const s of stations) {
      if (!map.has(s.region)) {
        map.set(s.region, {
          region: s.region,
          stations: [],
          worstCategory: 'Sin datos',
          worstColor: '#64748b',
          worstIndex: -1,
          activeMax: null,
        })
      }
      const row = map.get(s.region)!
      row.stations.push(s)

      const val = s[activePollutant]
      if (typeof val === 'number' && val >= 0) {
        const ica = getICACategory(val, activePollutant)
        const idx = SEVERITY_ORDER.indexOf(ica.categoria)
        if (idx > row.worstIndex) {
          row.worstIndex = idx
          row.worstCategory = ica.categoria
          row.worstColor = ica.color
        }
        row.activeMax =
          row.activeMax === null ? val : Math.max(row.activeMax, val)
      }
    }

    let arr = Array.from(map.values())

    arr.sort((a, b) => {
      const dir = sortConfig.direction === 'asc' ? 1 : -1
      switch (sortConfig.key) {
        case 'region':
          return a.region.localeCompare(b.region) * dir
        case 'count':
          return (a.stations.length - b.stations.length) * dir
        case 'severity':
          return (a.worstIndex - b.worstIndex) * dir
        case 'activeMax': {
          const av = a.activeMax ?? -1
          const bv = b.activeMax ?? -1
          return (av - bv) * dir
        }
      }
    })

    return arr
  }, [stations, activePollutant, sortConfig])

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-slate-800 py-16 text-slate-500">
        <svg className="mb-3 h-10 w-10 text-slate-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 01-1.125-1.125M3.375 19.5h7.5c.621 0 1.125-.504 1.125-1.125m-9.75 0V5.625m0 12.75v-1.5c0-.621.504-1.125 1.125-1.125m18.375 2.625V5.625m0 12.75c0 .621-.504 1.125-1.125 1.125m1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125m0 3.75h-7.5A1.125 1.125 0 0112 18.375m9.75-12.75c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125m19.5 0v1.5c0 .621-.504 1.125-1.125 1.125M2.25 5.625v1.5c0 .621.504 1.125 1.125 1.125m0 0h17.25m-17.25 0h7.5c.621 0 1.125.504 1.125 1.125M3.375 8.25c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125m17.25-3.75h-7.5c-.621 0-1.125.504-1.125 1.125m8.625-1.125c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125m-17.25 0h7.5m-7.5 0c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125M12 10.875v-1.5m0 1.5c0 .621-.504 1.125-1.125 1.125M12 10.875c0 .621.504 1.125 1.125 1.125m-2.25 0c.621 0 1.125.504 1.125 1.125M13.125 12h7.5m-7.5 0c-.621 0-1.125.504-1.125 1.125M20.625 12c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125m-17.25 0h7.5m-7.5 0c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125M12 14.625v-1.5m0 1.5c0 .621-.504 1.125-1.125 1.125M12 14.625c0 .621.504 1.125 1.125 1.125m-2.25 0c.621 0 1.125.504 1.125 1.125m0 1.5v-1.5m0 1.5c0 .621.504 1.125 1.125 1.125M12 17.25v-1.5" />
        </svg>
        <p className="text-sm">No hay estaciones que coincidan con los filtros seleccionados.</p>
      </div>
    )
  }

  return (
    <div className="w-full overflow-hidden rounded-xl border border-[#d4cebe] dark:border-slate-800/60 bg-white/80 dark:bg-slate-950/40 backdrop-blur-md shadow-md dark:shadow-xl">
      {/* Barra de Controles Superior para Expandir/Colapsar todo */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#d4cebe] dark:border-slate-800/60 bg-[#e4dec9]/20 dark:bg-slate-900/30 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-wider text-[#6e685e] dark:text-slate-400">
            Vista de Regiones
          </span>
          <span className="rounded-md bg-[#e4dec9]/40 dark:bg-slate-900/60 border border-[#d4cebe]/50 dark:border-slate-800/50 px-2 py-0.5 text-xs text-[#6e685e] dark:text-slate-500 font-semibold">
            {allRegions.length} {allRegions.length === 1 ? 'región' : 'regiones'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {!isMinimized && (
            <button
              type="button"
              onClick={toggleAll}
              className="flex items-center gap-1.5 rounded-lg border border-[#b5ae9b]/60 dark:border-slate-700/50 bg-white/60 dark:bg-slate-900/50 px-3 py-1.5 text-xs font-bold text-[#4a453c] dark:text-slate-300 transition-all hover:bg-[#e4dec9]/50 dark:hover:bg-slate-800/60 hover:text-[#2d2a24] dark:hover:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
            >
              {areAllExpanded ? (
                <>
                  <svg className="h-3.5 w-3.5 text-[#6e685e] dark:text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 12h-15" />
                  </svg>
                  Contraer Todas
                </>
              ) : (
                <>
                  <svg className="h-3.5 w-3.5 text-[#6e685e] dark:text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                  </svg>
                  Desplegar Todas
                </>
              )}
            </button>
          )}
          <button
            id="toggle-minimize-table-btn"
            type="button"
            onClick={() => setIsMinimized(!isMinimized)}
            className="flex items-center gap-1.5 rounded-lg border border-[#b5ae9b]/60 dark:border-slate-700/50 bg-white/60 dark:bg-slate-900/50 px-3 py-1.5 text-xs font-bold text-[#4a453c] dark:text-slate-300 transition-all hover:bg-[#e4dec9]/50 dark:hover:bg-slate-800/60 hover:text-[#2d2a24] dark:hover:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
          >
            {isMinimized ? (
              <>
                <svg className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                </svg>
                Mostrar Tabla
              </>
            ) : (
              <>
                <svg className="h-3.5 w-3.5 text-[#6e685e] dark:text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" />
                </svg>
                Minimizar
              </>
            )}
          </button>
        </div>
      </div>
      <div
        className="grid transition-[grid-template-rows,opacity] duration-350 ease-out"
        style={{
          gridTemplateRows: isMinimized ? '0fr' : '1fr',
          opacity: isMinimized ? 0 : 1,
        }}
      >
        <div className="overflow-hidden overflow-x-auto">
          <table className="w-full text-left text-sm text-[#4a453c] dark:text-slate-300">
          <thead className="bg-[#e4dec9]/30 dark:bg-slate-900/70 text-xs font-semibold uppercase tracking-wider text-[#6e685e] dark:text-slate-400 border-b border-[#d4cebe]/40 dark:border-slate-800/40">
            <tr>
              <th className="w-12 px-4 py-3"></th>
              <th
                className="cursor-pointer select-none px-4 py-3 font-medium transition-colors hover:text-[#2d2a24] dark:hover:text-slate-200"
                onClick={() => handleSort('region')}
              >
                Región / Localidad
                <SortIcon active={sortConfig.key === 'region'} direction={sortConfig.direction} />
              </th>
              <th
                className="cursor-pointer select-none px-4 py-3 text-center font-medium transition-colors hover:text-[#2d2a24] dark:hover:text-slate-200"
                onClick={() => handleSort('count')}
              >
                Estaciones
                <SortIcon active={sortConfig.key === 'count'} direction={sortConfig.direction} />
              </th>
              <th
                className="cursor-pointer select-none px-4 py-3 font-medium transition-colors hover:text-[#2d2a24] dark:hover:text-slate-200"
                onClick={() => handleSort('severity')}
              >
                Peor calidad
                <SortIcon active={sortConfig.key === 'severity'} direction={sortConfig.direction} />
              </th>
              <th
                className="cursor-pointer select-none px-4 py-3 text-right font-medium transition-colors hover:text-[#2d2a24] dark:hover:text-slate-200"
                onClick={() => handleSort('activeMax')}
              >
                Máx {activePollutant.toUpperCase()}
                <SortIcon active={sortConfig.key === 'activeMax'} direction={sortConfig.direction} />
              </th>
              <th className="px-4 py-3 text-center font-medium">Semáforo</th>
            </tr>
          </thead>

          {rows.map((row) => {
            const isOpen = expandedRegions.has(row.region)

            return (
              <tbody key={row.region} className="group/region">
                {/* Fila principal del acordeón */}
                <tr
                  onClick={() => toggleRegion(row.region)}
                  className="cursor-pointer border-b border-[#d4cebe]/50 dark:border-slate-800/50 bg-[#faf8f2]/30 dark:bg-slate-950/30 transition-colors duration-200 hover:bg-[#e4dec9]/20 dark:hover:bg-slate-900/50"
                >
                  <td className="px-4 py-3">
                    <div
                      className={`flex h-6 w-6 items-center justify-center rounded-md border border-[#b5ae9b]/60 dark:border-slate-700/50 bg-white/60 dark:bg-slate-900/50 transition-transform duration-300 ${
                        isOpen ? 'rotate-90' : ''
                      }`}
                    >
                      <svg
                        className="h-3.5 w-3.5 text-[#6e685e] dark:text-slate-400"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={3}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                  </td>
                  <td className="px-4 py-3 font-semibold text-[#2d2a24] dark:text-slate-200">
                    {row.region}
                  </td>
                  <td className="px-4 py-3 text-center tabular-nums text-[#6e685e] dark:text-slate-400">
                    {row.stations.length}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide shadow-lg ${getContrastTextColor(row.worstColor)}`}
                      style={{ backgroundColor: row.worstColor }}
                    >
                      {row.worstCategory}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums font-bold text-[#2d2a24] dark:text-slate-200">
                    {row.activeMax !== null 
                      ? (activePollutant === 'co' 
                        ? `${(row.activeMax / 1000).toFixed(2)} mg/m³` 
                        : `${Math.round(row.activeMax)} µg/m³`)
                      : '—'}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span
                      className="inline-block h-3.5 w-3.5 rounded-full ring-2 ring-white/10"
                      style={{
                        backgroundColor: row.worstColor,
                        boxShadow: `0 0 14px ${row.worstColor}80`,
                      }}
                      aria-label={`Semáforo ${row.worstCategory}`}
                    />
                  </td>
                </tr>

                {/* Contenido expandible con micro-animación */}
                <tr>
                  <td colSpan={6} className="p-0">
                    <div
                      className="grid transition-[grid-template-rows,opacity,padding] duration-300 ease-out"
                      style={{
                        gridTemplateRows: isOpen ? '1fr' : '0fr',
                        opacity: isOpen ? 1 : 0,
                      }}
                    >
                      <div className="overflow-hidden">
                        <div className="border-b border-[#d4cebe]/30 dark:border-slate-800/40 bg-[#e4dec9]/10 dark:bg-slate-950/20 px-4 py-4 sm:px-6">
                          {/* Sub-listado de estaciones */}
                          <div className="space-y-2">
                            {row.stations
                              .sort((a, b) => a.nombre.localeCompare(b.nombre))
                              .map((s) => {
                                const pollutantsList = [
                                  { key: 'pm25', label: 'PM2.5' },
                                  { key: 'pm10', label: 'PM10' },
                                  { key: 'so2', label: 'SO₂' },
                                  { key: 'no2', label: 'NO₂' },
                                  { key: 'o3', label: 'O₃' },
                                  { key: 'co', label: 'CO' },
                                ]

                                return (
                                  <div
                                    key={s.id}
                                    onClick={() => onSelectStation?.(s)}
                                    className="flex flex-col gap-3 rounded-lg border border-[#d4cebe]/60 dark:border-slate-800/50 bg-white/40 dark:bg-slate-900/40 p-3 cursor-pointer transition-all hover:bg-[#e4dec9]/20 dark:hover:bg-slate-800/65 hover:border-[#b5ae9b]/60 dark:hover:border-slate-700/50 sm:flex-row sm:items-center sm:justify-between"
                                  >
                                    <div className="min-w-0 flex-1">
                                      <div className="flex items-center gap-2">
                                        <p className="truncate text-sm font-medium text-[#2d2a24] dark:text-slate-200">
                                          {s.nombre}
                                        </p>
                                        <span className="rounded bg-[#e4dec9]/40 dark:bg-slate-800/60 px-1.5 py-0.5 text-[9px] font-bold text-[#6e685e] dark:text-slate-400 border border-[#d4cebe]/50 dark:border-slate-700/30">
                                          {s.locality}
                                        </span>
                                      </div>
                                      <p className="text-[11px] text-[#8c8273] dark:text-slate-500 mt-0.5">
                                        ID OpenAQ: {s.id}
                                      </p>
                                    </div>

                                    <div className="flex flex-wrap items-center gap-3 sm:gap-4">
                                      {/* Lista de Contaminantes */}
                                      <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                                        {pollutantsList.map((p) => {
                                          const val = s[p.key as keyof Station] as number | undefined
                                          if (typeof val !== 'number' || val < 0) return null

                                          const ica = getICACategory(val, p.key as any)
                                          const isCO = p.key === 'co'
                                          const displayVal = isCO ? (val / 1000).toFixed(1) : Math.round(val)
                                          const isCurrentActive = activePollutant === p.key
                                          const textColorClass = getContrastTextColor(ica.color)

                                          return (
                                            <div 
                                              key={p.key} 
                                              className={`flex items-center gap-1 bg-white/40 dark:bg-slate-950/40 border border-[#d4cebe]/50 dark:border-slate-800/60 px-2 py-0.5 rounded-lg text-xs transition-all duration-200 ${
                                                isCurrentActive 
                                                  ? 'ring-2 ring-emerald-500/50 scale-[1.03] bg-emerald-50/50 dark:bg-slate-900/80 border-emerald-500/40 dark:border-slate-700/80 shadow-[0_0_10px_rgba(16,185,129,0.15)]' 
                                                  : ''
                                              }`}
                                            >
                                              <span className="text-[9px] font-semibold text-[#8c8273] dark:text-slate-500 uppercase tracking-wider">
                                                {p.label}
                                              </span>
                                              <span
                                                className={`rounded px-1 text-[11px] font-black tabular-nums shadow-sm ${textColorClass}`}
                                                style={{
                                                  backgroundColor: ica.color,
                                                  boxShadow: `0 0 6px ${ica.color}50`,
                                                }}
                                              >
                                                {displayVal}
                                              </span>
                                            </div>
                                          )
                                        })}
                                      </div>

                                      {/* Timestamp */}
                                      <div className="hidden text-right sm:block sm:w-28">
                                        <p className="text-[10px] text-[#8c8273] dark:text-slate-500">
                                          {s.lastUpdated
                                            ? new Date(s.lastUpdated).toLocaleString('es-CL', {
                                                day: '2-digit',
                                                month: 'short',
                                                hour: '2-digit',
                                                minute: '2-digit',
                                              })
                                            : 'N/D'}
                                        </p>
                                      </div>

                                      {/* Indicador semáforo */}
                                      <div className="flex items-center justify-center sm:w-6">
                                        {(() => {
                                          const activeVal = s[activePollutant]
                                          if (typeof activeVal === 'number' && activeVal >= 0) {
                                            const activeIca = getICACategory(activeVal, activePollutant)
                                            return (
                                              <span
                                                className="inline-block h-3.5 w-3.5 rounded-full"
                                                style={{
                                                  backgroundColor: activeIca.color,
                                                  boxShadow: `0 0 10px ${activeIca.color}`,
                                                }}
                                              />
                                            )
                                          }
                                          return <span className="inline-block h-3.5 w-3.5 rounded-full bg-slate-400 dark:bg-slate-700" />
                                        })()}
                                      </div>
                                    </div>
                                  </div>
                                )
                              })}
                          </div>
                        </div>
                      </div>
                    </div>
                  </td>
                </tr>
              </tbody>
            )
          })}
        </table>
      </div>
      {!isMinimized && (
        <div className="flex justify-center border-t border-[#d4cebe]/40 dark:border-slate-800/40 bg-[#e4dec9]/10 dark:bg-slate-900/10 px-4 py-3.5">
          <button
            type="button"
            onClick={() => {
              setIsMinimized(true)
              document.getElementById('toggle-minimize-table-btn')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
            }}
            className="flex items-center gap-1.5 rounded-lg border border-[#b5ae9b]/60 dark:border-slate-700/50 bg-white/60 dark:bg-slate-950/40 px-4 py-2 text-xs font-bold text-[#6e685e] dark:text-slate-400 transition-all hover:bg-[#e4dec9]/50 dark:hover:bg-slate-800/60 hover:text-[#2d2a24] dark:hover:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
          >
            <svg className="h-3.5 w-3.5 text-[#6e685e] dark:text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" />
            </svg>
            Minimizar Tabla de Regiones
          </button>
        </div>
      )}
    </div>
  </div>
  )
}
