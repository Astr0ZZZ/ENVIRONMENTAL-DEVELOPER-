'use client'

import { useState, useMemo } from 'react'
import { AirMapWrapper } from '@/components/AirMapWrapper'
import { RegionTable } from '@/components/RegionTable'
import { StationPanel } from '@/components/StationPanel'
import type { Station } from '@/types/openaq'
import { 
  getICACategory, 
  COLOR_BUENO, 
  COLOR_REGULAR, 
  COLOR_ALERTA, 
  COLOR_PREEMERGENCIA, 
  COLOR_EMERGENCIA,
  COLOR_SINDATOS
} from '@/constants/ica-thresholds'

interface DashboardProps {
  stations: Station[]
}

/**
 * Normaliza texto para búsqueda insensible a tildes, mayúsculas y espacios extra.
 * "Concepción" → "concepcion", "Los Ángeles" → "losangeles"
 */
function normalizeSearch(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function Dashboard({ stations }: DashboardProps) {
  const [selectedRegion, setSelectedRegion] = useState<string>('Todas')
  const [selectedLocality, setSelectedLocality] = useState<string>('Todas')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedStation, setSelectedStation] = useState<Station | null>(null)
  const [activePollutant, setActivePollutant] = useState<'pm25' | 'pm10' | 'so2' | 'no2' | 'o3' | 'co'>('pm25')
  const [showSuggestions, setShowSuggestions] = useState(false)

  const regions = useMemo(() => {
    const unique = Array.from(new Set(stations.map((s) => s.region)))
    return ['Todas', ...unique.sort()]
  }, [stations])

  const localities = useMemo(() => {
    const stationsInRegion = selectedRegion === 'Todas'
      ? stations
      : stations.filter((s) => s.region === selectedRegion)
    const unique = Array.from(new Set(stationsInRegion.map((s) => s.locality)))
    return ['Todas', ...unique.sort()]
  }, [stations, selectedRegion])

  const filtered = useMemo(() => {
    const q = normalizeSearch(searchQuery)

    return stations.filter((s) => {
      const matchesRegion =
        selectedRegion === 'Todas' || s.region === selectedRegion

      const matchesLocality =
        selectedLocality === 'Todas' || s.locality === selectedLocality

      const matchesSearch =
        q === '' ||
        normalizeSearch(s.nombre).includes(q) ||
        normalizeSearch(s.region).includes(q) ||
        normalizeSearch(s.locality).includes(q)

      return matchesRegion && matchesLocality && matchesSearch
    })
  }, [stations, selectedRegion, selectedLocality, searchQuery])

  const activeCount = filtered.length

  const searchSuggestions = useMemo(() => {
    const q = normalizeSearch(searchQuery)
    if (q === '') return []

    // Filtrar estaciones
    const matching = stations.filter(
      (s) =>
        normalizeSearch(s.nombre).includes(q) ||
        normalizeSearch(s.region).includes(q) ||
        normalizeSearch(s.locality).includes(q)
    )

    // Agrupar por región
    const map = new Map<string, Station[]>()
    for (const s of matching) {
      if (!map.has(s.region)) {
        map.set(s.region, [])
      }
      map.get(s.region)!.push(s)
    }

    return Array.from(map.entries()).map(([region, stList]) => ({
      region,
      stations: stList.sort((a, b) => a.nombre.localeCompare(b.nombre)),
    }))
  }, [stations, searchQuery])

  const stats = useMemo(() => {
    let bueno = 0,
      regular = 0,
      alerta = 0,
      preemergencia = 0,
      emergencia = 0,
      sinDatos = 0

    for (const s of filtered) {
      const val = s[activePollutant]
      const ica =
        typeof val === 'number' && val >= 0
          ? getICACategory(val, activePollutant)
          : null

      if (!ica) {
        sinDatos++
        continue
      }
      switch (ica.categoria) {
        case 'Bueno':
          bueno++
          break
        case 'Regular':
          regular++
          break
        case 'Alerta':
          alerta++
          break
        case 'Preemergencia':
          preemergencia++
          break
        case 'Emergencia':
          emergencia++
          break
        default:
          sinDatos++
      }
    }

    return { bueno, regular, alerta, preemergencia, emergencia, sinDatos }
  }, [filtered, activePollutant])

  return (
    <>
      {/* Stats cards */}
      <section className="px-6 md:px-12 max-w-[1400px] mx-auto mb-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard label="Bueno" value={stats.bueno} color={COLOR_BUENO} />
        <StatCard label="Regular" value={stats.regular} color={COLOR_REGULAR} />
        <StatCard label="Alerta" value={stats.alerta} color={COLOR_ALERTA} />
        <StatCard label="Preemergencia" value={stats.preemergencia} color={COLOR_PREEMERGENCIA} />
        <StatCard label="Emergencia" value={stats.emergencia} color={COLOR_EMERGENCIA} />
        <StatCard label="Sin Datos" value={stats.sinDatos} color={COLOR_SINDATOS} />
      </section>


      {/* Filtros compuestos: buscador glassmorphism + selector de región */}
      <section className="px-6 md:px-12 max-w-[1400px] mx-auto mb-6">
        {/* Selector de Contaminante Principal (Pestañas premium) */}
        <div className="mb-5">
          <label className="mb-2.5 block text-[11px] font-semibold uppercase tracking-[0.08em] text-[#6e685e] dark:text-slate-400">
            Contaminante a visualizar
          </label>
          <div className="grid grid-cols-2 gap-2 rounded-xl bg-white/80 dark:bg-slate-900/40 p-1.5 border border-[#d4cebe] dark:border-slate-800/60 backdrop-blur-xl shadow-md dark:shadow-lg sm:flex sm:flex-wrap sm:gap-2">
            {[
              { key: 'pm25', label: 'PM2.5', desc: 'Material Fino (µg/m³)' },
              { key: 'pm10', label: 'PM10', desc: 'Material Grueso (µg/m³)' },
              { key: 'so2', label: 'SO₂', desc: 'Dióxido Azufre (µg/m³)' },
              { key: 'no2', label: 'NO₂', desc: 'Dióxido Nitrógeno (µg/m³)' },
              { key: 'o3', label: 'O₃', desc: 'Ozono (µg/m³)' },
              { key: 'co', label: 'CO', desc: 'Monóxido Carbono (mg/m³)' },
            ].map((p) => {
              const isActive = activePollutant === p.key
              return (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => setActivePollutant(p.key as any)}
                  className={`flex flex-1 flex-col items-start rounded-lg px-4 py-2 text-left transition-all duration-300 sm:flex-initial sm:min-w-[140px] border ${
                    isActive
                      ? 'bg-emerald-500/10 dark:bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 border-emerald-500/30 dark:border-emerald-500/35 shadow-[0_0_15px_rgba(16,185,129,0.08)]'
                      : 'text-[#6e685e] dark:text-slate-400 hover:text-[#2d2a24] dark:hover:text-slate-200 border-transparent hover:bg-[#e4dec9]/50 dark:hover:bg-slate-800/40'
                  }`}
                >
                  <span className="text-sm font-black tracking-tight">{p.label}</span>
                  <span className="text-[9px] font-semibold opacity-70 mt-0.5 leading-none">{p.desc}</span>
                </button>
              )
            })}
          </div>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:gap-4">
          {/* Input búsqueda con normalización de tildes */}
          <div className="relative flex-1">
            <label
              htmlFor="search-stations"
              className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.08em] text-[#6e685e] dark:text-slate-400"
            >
              Buscar estación o comuna
            </label>
            <div className="group relative">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5">
                <SearchIcon className="h-4 w-4 text-[#a8a29e] dark:text-slate-500 transition-colors group-focus-within:text-emerald-600 dark:group-focus-within:text-emerald-400" />
              </div>
              <input
                id="search-stations"
                type="text"
                value={searchQuery}
                onFocus={() => setShowSuggestions(true)}
                onBlur={() => setTimeout(() => setShowSuggestions(false), 250)}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Ej: Pudahuel, Temuco, Concepción..."
                className="w-full rounded-xl border border-[#d4cebe] dark:border-slate-700/60 bg-white/80 dark:bg-slate-900/40 py-2.5 pl-10 pr-10 text-sm text-[#2d2a24] dark:text-slate-100 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)] outline-none backdrop-blur-xl transition-all placeholder-[#a8a29e] dark:placeholder:text-slate-500 focus:border-emerald-600/55 dark:focus:border-emerald-500/50 focus:bg-white dark:focus:bg-slate-900/60 focus:shadow-[0_0_0_3px_rgba(16,185,129,0.12),inset_0_1px_0_0_rgba(255,255,255,0.05)] hover:border-[#b5ae9b] dark:hover:border-slate-600/80"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-[#a8a29e] dark:text-slate-500 transition-colors hover:text-[#2d2a24] dark:hover:text-slate-300"
                  aria-label="Limpiar búsqueda"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>

            {/* Sugerencias de búsqueda agrupadas por región */}
            {showSuggestions && searchSuggestions.length > 0 && (
              <div className="absolute left-0 right-0 top-full z-[2000] mt-2 max-h-80 overflow-y-auto rounded-xl border border-[#d4cebe] dark:border-slate-800/90 bg-white/95 dark:bg-slate-950/95 p-2 shadow-2xl backdrop-blur-xl scrollbar-thin">
                {searchSuggestions.map((group) => (
                  <div key={group.region} className="mb-2.5 last:mb-0">
                    <div className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-[#6e685e] dark:text-slate-500 border-b border-[#e4dec9]/60 dark:border-slate-800/30 pb-1">
                      {group.region}
                    </div>
                    <div className="mt-1 space-y-0.5">
                      {group.stations.map((s) => {
                        const val = s[activePollutant]
                        const ica =
                          typeof val === 'number' && val >= 0
                            ? getICACategory(val, activePollutant)
                            : null

                        return (
                          <button
                            key={s.id}
                            type="button"
                            onClick={() => {
                              setSelectedStation(s)
                              setSearchQuery(s.nombre)
                              setShowSuggestions(false)
                            }}
                            className="flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-xs text-[#4a453c] dark:text-slate-300 transition-colors hover:bg-[#faf6eb] dark:hover:bg-slate-900/60 hover:text-[#1e1b18] dark:hover:text-white"
                          >
                            <span className="font-medium">{s.nombre}</span>
                            {ica && typeof val === 'number' ? (
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] font-bold opacity-80" style={{ color: ica.color }}>
                                  {activePollutant === 'co'
                                    ? `${(val / 1000).toFixed(1)} mg/m³`
                                    : `${Math.round(val)} µg/m³`}
                                </span>
                                <span
                                  className="h-2.5 w-2.5 rounded-full ring-1 ring-white/10"
                                  style={{
                                    backgroundColor: ica.color,
                                    boxShadow: `0 0 6px ${ica.color}`,
                                  }}
                                />
                              </div>
                            ) : (
                              <span className="text-[10px] text-slate-400 dark:text-slate-500 font-semibold">Sin datos</span>
                            )}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Selector de región */}
          <div className="sm:w-64">
            <label
              htmlFor="region-filter"
              className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.08em] text-[#6e685e] dark:text-slate-400"
            >
              Filtrar por Región
            </label>
            <div className="relative">
              <select
                id="region-filter"
                value={selectedRegion}
                onChange={(e) => {
                  setSelectedRegion(e.target.value)
                  setSelectedLocality('Todas')
                }}
                className="w-full appearance-none rounded-xl border border-[#d4cebe] dark:border-slate-700/60 bg-white/80 dark:bg-slate-900/40 px-4 py-2.5 pr-10 text-sm text-[#2d2a24] dark:text-slate-100 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)] outline-none backdrop-blur-xl transition-all focus:border-emerald-600/55 dark:focus:border-emerald-500/50 focus:bg-white dark:focus:bg-slate-900/60 focus:shadow-[0_0_0_3px_rgba(16,185,129,0.12),inset_0_1px_0_0_rgba(255,255,255,0.05)] hover:border-[#b5ae9b] dark:hover:border-slate-600/80"
              >
                {regions.map((r) => (
                  <option key={r} value={r} className="bg-white text-slate-900 dark:bg-slate-950 dark:text-slate-100">
                    {r}
                  </option>
                ))}
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3.5 text-[#6e685e] dark:text-slate-400">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>
          </div>

          {/* Selector de comuna / localidad */}
          <div className="sm:w-64">
            <label
              htmlFor="locality-filter"
              className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.08em] text-[#6e685e] dark:text-slate-400"
            >
              Comuna / Localidad
            </label>
            <div className="relative">
              <select
                id="locality-filter"
                value={selectedLocality}
                onChange={(e) => setSelectedLocality(e.target.value)}
                disabled={selectedRegion === 'Todas'}
                className="w-full appearance-none rounded-xl border border-[#d4cebe] dark:border-slate-700/60 bg-white/80 dark:bg-slate-900/40 px-4 py-2.5 pr-10 text-sm text-[#2d2a24] dark:text-slate-100 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)] outline-none backdrop-blur-xl transition-all focus:border-emerald-600/55 dark:focus:border-emerald-500/50 focus:bg-white dark:focus:bg-slate-900/60 focus:shadow-[0_0_0_3px_rgba(16,185,129,0.12),inset_0_1px_0_0_rgba(255,255,255,0.05)] hover:border-[#b5ae9b] dark:hover:border-slate-600/80 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {selectedRegion === 'Todas' ? (
                  <option value="Todas" className="bg-white text-slate-900 dark:bg-slate-950 dark:text-slate-100">Seleccione una Región primero</option>
                ) : (
                  localities.map((loc) => (
                    <option key={loc} value={loc} className="bg-white text-slate-900 dark:bg-slate-950 dark:text-slate-100">
                      {loc === 'Todas' ? 'Todas las comunas' : loc}
                    </option>
                  ))
                )}
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3.5 text-[#6e685e] dark:text-slate-400">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between">
          <p className="text-xs text-[#6e685e] dark:text-slate-500">
            Mostrando{' '}
            <span className="font-semibold text-[#2d2a24] dark:text-slate-300">{activeCount}</span>{' '}
            estación{activeCount !== 1 ? 'es' : ''}
            {selectedRegion !== 'Todas' ? ` en ${selectedRegion}` : ''}
            {selectedLocality !== 'Todas' ? `, comuna de ${selectedLocality}` : ''}
          </p>
          {(searchQuery || selectedRegion !== 'Todas' || selectedLocality !== 'Todas') && (
            <button
              onClick={() => {
                setSearchQuery('')
                setSelectedRegion('Todas')
                setSelectedLocality('Todas')
              }}
              className="text-xs font-medium text-emerald-600 dark:text-emerald-400 transition-colors hover:text-emerald-700 dark:hover:text-emerald-300"
            >
              Limpiar filtros
            </button>
          )}
        </div>
      </section>

      {/* Mapa */}
      <section className="px-6 md:px-12 max-w-[1600px] mx-auto mb-12 h-[600px]">
        <AirMapWrapper stations={filtered} activePollutant={activePollutant} onSelectStation={setSelectedStation} />
      </section>

      {/* Tabla */}
      <section className="px-6 md:px-12 max-w-[1400px] mx-auto pb-20">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-2xl font-bold tracking-tight text-[#1e1b18] dark:text-white">Resumen por región</h2>
          {searchQuery && (
            <span className="inline-flex items-center rounded-full border border-[#d4cebe] dark:border-slate-700/60 bg-white/60 dark:bg-slate-900/40 px-3 py-1 text-xs text-[#6e685e] dark:text-slate-400 backdrop-blur-md">
              Búsqueda: &ldquo;{searchQuery}&rdquo;
            </span>
          )}
        </div>
        <RegionTable
          stations={filtered}
          activePollutant={activePollutant}
          onSelectStation={setSelectedStation}
          searchQuery={searchQuery}
        />
      </section>

      {/* Panel de detalles de la estación */}
      <StationPanel station={selectedStation} activePollutant={activePollutant} onClose={() => setSelectedStation(null)} />
    </>
  )
}

function StatCard({
  label,
  value,
  color,
}: {
  label: string
  value: number
  color: string
}) {
  return (
    <div
      className="rounded-xl border p-4 backdrop-blur-md transition-all duration-300 hover:scale-[1.02]"
      style={{
        backgroundColor: `${color}12`, // ~7% de opacidad para el fondo
        borderColor: `${color}35`,     // ~20% de opacidad para el borde
        color: color,
      }}
    >
      <p className="text-[10px] font-bold uppercase tracking-[0.08em] opacity-80">
        {label}
      </p>
      <p className="mt-1.5 text-2xl font-black tabular-nums text-[#2d2a24] dark:text-slate-100">{value}</p>
    </div>
  )
}

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
      />
    </svg>
  )
}
