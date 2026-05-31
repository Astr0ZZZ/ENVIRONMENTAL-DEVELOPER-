'use client'

import { useState, useMemo, useEffect } from 'react'
import { AirMapWrapper } from '@/components/AirMapWrapper'
import { RegionTable } from '@/components/RegionTable'
import { RegionReport } from '@/components/RegionReport'
import { StationPanel } from '@/components/StationPanel'
import type { Station } from '@/types/openaq'
import {
  getICACategory,
  COLOR_BUENO,
  COLOR_REGULAR,
  COLOR_ALERTA,
  COLOR_PREEMERGENCIA,
  COLOR_EMERGENCIA,
  COLOR_SINDATOS,
  getWorstICACategory
} from '@/constants/ica-thresholds'

interface DashboardProps {
  stations: Station[]
}

/**
 * Normaliza texto para búsqueda insensible a tildes, mayúsculas y espacios extra.
 */
function normalizeSearch(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

// Helper distance formula (Haversine in km)
function getDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371 // Earth's radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLon = ((lon2 - lon1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLon / 2) *
    Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

export function Dashboard({ stations }: DashboardProps) {
  // State variables
  const [selectedRegion, setSelectedRegion] = useState<string>('Todas')
  const [selectedLocality, setSelectedLocality] = useState<string>('Todas')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedStation, setSelectedStation] = useState<Station | null>(null)
  const [activePollutant, setActivePollutant] = useState<'pm25' | 'pm10' | 'so2' | 'no2' | 'o3' | 'co' | 'all'>('all')
  const [showReport, setShowReport] = useState(false)

  // Guided tour state
  const [tourStep, setTourStep] = useState<number | null>(null)
  const [tourCoords, setTourCoords] = useState<{ top: number; left: number; width: number; height: number } | null>(null)

  // Structured search system
  const [searchMode, setSearchMode] = useState<'station' | 'commune' | 'address' | 'region'>('station')

  // Minimization states for pollutant and search panels
  const [isMinimizedStats, setIsMinimizedStats] = useState(false)
  const [isMinimizedPollutant, setIsMinimizedPollutant] = useState(false)
  const [isMinimizedSearchPanel, setIsMinimizedSearchPanel] = useState(false)

  // Autocomplete / Suggestions
  const [communeQuery, setCommuneQuery] = useState('')
  const [communeSuggestions, setCommuneSuggestions] = useState<any[]>([])
  const [isSearchingCommune, setIsSearchingCommune] = useState(false)
  const [communeError, setCommuneError] = useState<string | null>(null)

  const [addressQuery, setAddressQuery] = useState('')
  const [addressSuggestions, setAddressSuggestions] = useState<any[]>([])
  const [isSearchingAddress, setIsSearchingAddress] = useState(false)
  const [addressError, setAddressError] = useState<string | null>(null)

  const [searchCoords, setSearchCoords] = useState<{ lat: number; lng: number } | null>(null)
  const [selectedFromAutocomplete, setSelectedFromAutocomplete] = useState(false)
  const [showSuggestions, setShowSuggestions] = useState(false)

  // Top Buttons (ICA Category Filters)
  const [activeIcaFilter, setActiveIcaFilter] = useState<string | null>(null)

  // Tour steps definition
  const tourSteps = useMemo(() => [
    {
      targetId: 'tour-title',
      title: '👋 ¡Bienvenido al Monitor de Aire!',
      content: 'Esta plataforma te permite visualizar en tiempo real la calidad del aire y la red nacional de monitoreo en Chile.',
    },
    {
      targetId: 'tour-stats',
      title: '🚨 Estados de Emergencia',
      content: 'Haz clic en estas tarjetas para filtrar rápidamente las estaciones según su estado actual (Bueno, Alerta, Emergencia, etc.).',
    },
    {
      targetId: 'tour-pollutant',
      title: '🧪 Selector de Contaminante',
      content: 'Elige qué contaminante o gas visualizar en el mapa y en la tabla resumen (PM2.5, PM10, SO₂, Ozono, CO, etc.).',
    },
    {
      targetId: 'tour-search',
      title: '🔍 Buscador Inteligente',
      content: 'Busca por nombre de estación, comuna, dirección exacta (encuentra las estaciones más cercanas) o región.',
    },
    {
      targetId: 'tour-map',
      title: '🗺️ Mapa de Monitoreo',
      content: 'Visualiza la ubicación y la zona de influencia de cada estación. Haz clic en cualquier punto para ver históricos y tendencias.',
    },
    {
      targetId: 'tour-table-header',
      title: '📊 Resumen por Región',
      content: 'Compara los datos agrupados por regiones. Puedes expandir y ver las estaciones de una región haciendo clic en su fila.',
    },
    {
      targetId: 'toggle-minimize-table-btn',
      title: '↕️ Minimizar o Maximizar',
      content: 'Haz clic en este botón para ocultar o volver a mostrar la tabla completa en cualquier momento y liberar espacio visual.',
    },
  ], [])

  useEffect(() => {
    if (tourStep === null) {
      setTourCoords(null)
      return
    }
    const step = tourSteps[tourStep]
    if (!step) return

    // Un-minimize panels automatically when the tour highlights them
    if (step.targetId === 'tour-pollutant') setIsMinimizedPollutant(false)
    if (step.targetId === 'tour-search') setIsMinimizedSearchPanel(false)
    if (step.targetId === 'tour-stats') setIsMinimizedStats(false)

    const updatePosition = (shouldScroll = false) => {
      const el = document.getElementById(step.targetId)
      if (el) {
        const rect = el.getBoundingClientRect()
        setTourCoords({
          top: rect.top + window.scrollY,
          left: rect.left + window.scrollX,
          width: rect.width,
          height: rect.height,
        })
        if (shouldScroll) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' })
        }
      } else {
        setTourCoords(null)
      }
    }

    // Scroll only on initial load of the step
    updatePosition(true)
    const t = setTimeout(() => updatePosition(false), 150)

    const handleUpdate = () => updatePosition(false)
    window.addEventListener('resize', handleUpdate)
    window.addEventListener('scroll', handleUpdate)
    return () => {
      clearTimeout(t)
      window.removeEventListener('resize', handleUpdate)
      window.removeEventListener('scroll', handleUpdate)
    }
  }, [tourStep, tourSteps])

  // Form 4 regional dropdown list values
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

  const availableGlobalPollutants = useMemo(() => {
    const found = new Set<string>()
    for (const s of stations) {
      if (typeof s.pm25 === 'number' && s.pm25 >= 0) found.add('pm25')
      if (typeof s.pm10 === 'number' && s.pm10 >= 0) found.add('pm10')
      if (typeof s.so2 === 'number' && s.so2 >= 0) found.add('so2')
      if (typeof s.no2 === 'number' && s.no2 >= 0) found.add('no2')
      if (typeof s.o3 === 'number' && s.o3 >= 0) found.add('o3')
      if (typeof s.co === 'number' && s.co >= 0) found.add('co')
      if (found.size === 6) break
    }
    return found
  }, [stations])

  // Commune autocomplete search effect
  useEffect(() => {
    if (communeQuery.length < 3 || selectedFromAutocomplete) {
      setCommuneSuggestions([])
      return
    }
    const controller = new AbortController()
    const delay = setTimeout(async () => {
      try {
        const response = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
            communeQuery
          )}&countrycodes=cl&limit=8`,
          { signal: controller.signal }
        )
        const data = await response.json()
        setCommuneSuggestions(data || [])
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          console.warn('[autocomplete] Error en comuna:', err)
        }
      }
    }, 400)
    return () => {
      clearTimeout(delay)
      controller.abort()
    }
  }, [communeQuery, selectedFromAutocomplete])

  // Address autocomplete search effect
  useEffect(() => {
    if (addressQuery.length < 3 || selectedFromAutocomplete) {
      setAddressSuggestions([])
      return
    }
    const controller = new AbortController()
    const delay = setTimeout(async () => {
      try {
        const response = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
            addressQuery
          )}&countrycodes=cl&limit=8`,
          { signal: controller.signal }
        )
        const data = await response.json()
        setAddressSuggestions(data || [])
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          console.warn('[autocomplete] Error en dirección:', err)
        }
      }
    }, 400)
    return () => {
      clearTimeout(delay)
      controller.abort()
    }
  }, [addressQuery, selectedFromAutocomplete])

  // Click handler to resolve geocoding from autocomplete selection
  const selectAddressSuggestion = (item: any) => {
    setSelectedFromAutocomplete(true)
    const lat = parseFloat(item.lat)
    const lng = parseFloat(item.lon)
    setSearchCoords({ lat, lng })

    if (searchMode === 'commune') {
      setCommuneQuery(item.display_name.split(',')[0])
      setCommuneSuggestions([])
    } else {
      setAddressQuery(item.display_name.split(',')[0] + ', ' + item.display_name.split(',')[1])
      setAddressSuggestions([])
    }
    setShowSuggestions(false)
    // Scroll to map
    setTimeout(() => {
      document.getElementById('tour-map')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 150)
  }

  // Geocoding submit handlers (if they press enter without selecting suggestion)
  const handleCommuneSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isSearchingCommune || !communeQuery.trim()) return
    setIsSearchingCommune(true)
    setCommuneError(null)
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
          communeQuery
        )}&countrycodes=cl&limit=1`
      )
      const data = await response.json()
      if (data && data.length > 0) {
        setSearchCoords({ lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) })
        // Scroll to map
        setTimeout(() => {
          document.getElementById('tour-map')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
        }, 150)
      } else {
        setCommuneError('Comuna no encontrada.')
      }
    } catch {
      setCommuneError('Error al buscar la comuna.')
    } finally {
      setIsSearchingCommune(false)
    }
  }

  const handleAddressSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isSearchingAddress || !addressQuery.trim()) return
    setIsSearchingAddress(true)
    setAddressError(null)
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
          addressQuery
        )}&countrycodes=cl&limit=1`
      )
      const data = await response.json()
      if (data && data.length > 0) {
        setSearchCoords({ lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) })
        // Scroll to map
        setTimeout(() => {
          document.getElementById('tour-map')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
        }, 150)
      } else {
        setAddressError('Dirección no encontrada.')
      }
    } catch {
      setAddressError('Error al buscar la dirección.')
    } finally {
      setIsSearchingAddress(false)
    }
  }

  // Filtered station list
  const filtered = useMemo(() => {
    const q = normalizeSearch(searchQuery)

    let result = stations.map(s => {
      // If we have search coordinates (commune or address mode), calculate distance
      if ((searchMode === 'address' || searchMode === 'commune') && searchCoords) {
        return {
          ...s,
          distanceKm: getDistance(searchCoords.lat, searchCoords.lng, s.lat as number, s.lng as number)
        }
      }
      return s
    }).filter((s) => {
      // Form 4: Region and Locality (only applied in Region mode)
      const matchesRegion =
        searchMode !== 'region' || selectedRegion === 'Todas' || s.region === selectedRegion

      const matchesLocality =
        searchMode !== 'region' || selectedLocality === 'Todas' || s.locality === selectedLocality

      // Form 1: Station name filter
      const matchesSearch =
        searchMode !== 'station' ||
        q === '' ||
        normalizeSearch(s.nombre).includes(q)

      // Top Buttons (ICA category) filter & standard "Sin Datos" exclusion
      const isAll = activePollutant === 'all'
      const val = isAll ? null : s[activePollutant]
      const hasVal = isAll
        ? ['pm25', 'pm10', 'so2', 'no2', 'o3', 'co'].some(key => typeof s[key as keyof Station] === 'number' && (s[key as keyof Station] as number) >= 0)
        : typeof val === 'number' && val >= 0
      const ica = isAll
        ? getWorstICACategory(s)
        : (hasVal ? getICACategory(val as number, activePollutant as any) : null)

      let matchesIca = true
      if (activeIcaFilter) {
        if (activeIcaFilter === 'Sin Datos') {
          // A station matches global "Sin Datos" only if it has no data at all across all 6 pollutants
          const hasAnyData = ['pm25', 'pm10', 'so2', 'no2', 'o3', 'co'].some(key => {
            const pv = s[key as keyof Station]
            return typeof pv === 'number' && pv >= 0
          })
          matchesIca = !hasAnyData
        } else {
          matchesIca = ica?.categoria === activeIcaFilter
        }
      } else {
        // Default standard behavior: hide stations without data
        matchesIca = hasVal
      }

      return matchesRegion && matchesLocality && matchesSearch && matchesIca
    })

    // Sort by proximity if coordinates are set in Address or Commune mode
    if ((searchMode === 'address' || searchMode === 'commune') && searchCoords) {
      result = [...result].sort((a, b) => {
        const distA = (a as any).distanceKm ?? 999999
        const distB = (b as any).distanceKm ?? 999999
        return distA - distB
      })
      result = result.slice(0, 5) // Filter: show only the 5 closest stations
    }

    return result
  }, [stations, selectedRegion, selectedLocality, searchQuery, searchCoords, searchMode, activePollutant, activeIcaFilter])

  const activeCount = filtered.length

  // Stats cards calculations (based on filters, ignoring the active ICA Category filter itself)
  const stats = useMemo(() => {
    let bueno = 0,
      regular = 0,
      alerta = 0,
      preemergencia = 0,
      emergencia = 0,
      sinDatos = 0

    const baseList = stations.filter((s) => {
      const matchesRegion =
        searchMode !== 'region' || selectedRegion === 'Todas' || s.region === selectedRegion

      const matchesLocality =
        searchMode !== 'region' || selectedLocality === 'Todas' || s.locality === selectedLocality

      const q = normalizeSearch(searchQuery)
      const matchesSearch =
        searchMode !== 'station' ||
        q === '' ||
        normalizeSearch(s.nombre).includes(q)

      return matchesRegion && matchesLocality && matchesSearch
    })

    for (const s of baseList) {
      const hasAnyData = ['pm25', 'pm10', 'so2', 'no2', 'o3', 'co'].some(key => {
        const pv = s[key as keyof Station]
        return typeof pv === 'number' && pv >= 0
      })

      if (!hasAnyData) {
        sinDatos++
        continue
      }

      const isAll = activePollutant === 'all'
      const val = isAll ? null : s[activePollutant]
      const ica = isAll
        ? getWorstICACategory(s)
        : (typeof val === 'number' && val >= 0 ? getICACategory(val as number, activePollutant as any) : null)

      if (!ica) {
        // Has data for other pollutants, but not this one. Don't count as Sin Datos
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
      }
    }

    return { bueno, regular, alerta, preemergencia, emergencia, sinDatos }
  }, [stations, selectedRegion, selectedLocality, searchQuery, searchMode, activePollutant])

  // Station suggestions for Station search mode
  const searchSuggestions = useMemo(() => {
    const q = normalizeSearch(searchQuery)

    const matching = q === ''
      ? stations
      : stations.filter((s) => normalizeSearch(s.nombre).includes(q))

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

  // Clear all filters handler
  const handleClearFilters = () => {
    setSearchQuery('')
    setSelectedRegion('Todas')
    setSelectedLocality('Todas')
    setCommuneQuery('')
    setAddressQuery('')
    setSearchCoords(null)
    setAddressError(null)
    setCommuneError(null)
    setActiveIcaFilter(null)
  }

  return (
    <>
      {/* Stats cards acting as interactive filters */}
      <section id="tour-stats" className="px-6 md:px-12 max-w-[1400px] mx-auto mb-6 scroll-mt-24">
        <div className="rounded-xl border border-[#d4cebe] dark:border-slate-800 bg-white/40 dark:bg-slate-900/25 p-4 shadow-sm backdrop-blur-md">
          <div className="flex items-center justify-between cursor-pointer select-none" onClick={() => setIsMinimizedStats(!isMinimizedStats)}>
            <h3 className="text-[11px] font-extrabold uppercase tracking-[0.08em] text-[#6e685e] dark:text-slate-400 flex items-center gap-1.5 cursor-pointer">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Estado de Estaciones
            </h3>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                setIsMinimizedStats(!isMinimizedStats)
              }}
              className="flex items-center gap-1.5 rounded-lg border border-[#b5ae9b]/60 dark:border-slate-700/50 bg-white/60 dark:bg-slate-900/50 px-3 py-1.5 text-xs font-bold text-[#4a453c] dark:text-slate-300 transition-all hover:bg-[#e4dec9]/50 dark:hover:bg-slate-800/60 hover:text-[#2d2a24] dark:hover:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
            >
              {isMinimizedStats ? (
                <>
                  <svg className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                  </svg>
                  Mostrar Estado
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
          
          <div
            className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out ${isMinimizedStats ? 'overflow-hidden' : 'overflow-visible'}`}
            style={{
              gridTemplateRows: isMinimizedStats ? '0fr' : '1fr',
              opacity: isMinimizedStats ? 0 : 1,
            }}
          >
            <div className={`${isMinimizedStats ? 'overflow-hidden' : 'overflow-visible'}`}>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6 mt-3">
                {[
                  { label: 'Bueno', val: stats.bueno, col: COLOR_BUENO },
                  { label: 'Regular', val: stats.regular, col: COLOR_REGULAR },
                  { label: 'Alerta', val: stats.alerta, col: COLOR_ALERTA },
                  { label: 'Preemergencia', val: stats.preemergencia, col: COLOR_PREEMERGENCIA },
                  { label: 'Emergencia', val: stats.emergencia, col: COLOR_EMERGENCIA },
                  { label: 'Sin Datos', val: stats.sinDatos, col: COLOR_SINDATOS },
                ].map((card) => {
                  const isActive = activeIcaFilter === card.label
                  return (
                    <StatCard
                      key={card.label}
                      label={card.label}
                      value={card.val}
                      color={card.col}
                      isActive={isActive}
                      onClick={() => setActiveIcaFilter(isActive ? null : card.label)}
                    />
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Sección 1: Contaminante a visualizar */}
      <section id="tour-pollutant" className="px-6 md:px-12 max-w-[1400px] mx-auto mb-6 scroll-mt-24">
        <div className="rounded-xl border border-[#d4cebe] dark:border-slate-800 bg-white/40 dark:bg-slate-900/25 p-4 shadow-sm backdrop-blur-md">
          <div className="flex items-center justify-between cursor-pointer select-none" onClick={() => setIsMinimizedPollutant(!isMinimizedPollutant)}>
            <label className="text-[11px] font-extrabold uppercase tracking-[0.08em] text-[#6e685e] dark:text-slate-400 cursor-pointer">
              Contaminante a visualizar
            </label>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                setIsMinimizedPollutant(!isMinimizedPollutant)
              }}
              className="flex items-center gap-1.5 rounded-lg border border-[#b5ae9b]/60 dark:border-slate-700/50 bg-white/60 dark:bg-slate-900/50 px-3 py-1.5 text-xs font-bold text-[#4a453c] dark:text-slate-300 transition-all hover:bg-[#e4dec9]/50 dark:hover:bg-slate-800/60 hover:text-[#2d2a24] dark:hover:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
            >
              {isMinimizedPollutant ? (
                <>
                  <svg className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                  </svg>
                  Mostrar Selector
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
          <div
            className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out ${isMinimizedPollutant ? 'overflow-hidden' : 'overflow-visible'}`}
            style={{
              gridTemplateRows: isMinimizedPollutant ? '0fr' : '1fr',
              opacity: isMinimizedPollutant ? 0 : 1,
            }}
          >
            <div className={`${isMinimizedPollutant ? 'overflow-hidden' : 'overflow-visible'}`}>
              <div className="grid grid-cols-2 gap-2 mt-3 rounded-xl bg-white/85 dark:bg-slate-900/60 p-1.5 border border-[#d4cebe]/70 dark:border-slate-800/80 shadow-inner sm:flex sm:flex-wrap sm:gap-2">
                {[
                  { key: 'all', label: 'Todos', desc: 'Peor índice activo (ICA)' },
                  { key: 'pm25', label: 'PM2.5', desc: 'Material Fino (µg/m³)' },
                  { key: 'pm10', label: 'PM10', desc: 'Material Grueso (µg/m³)' },
                  { key: 'so2', label: 'SO₂', desc: 'Dióxido Azufre (µg/m³)' },
                  { key: 'no2', label: 'NO₂', desc: 'Dióxido Nitrógeno (µg/m³)' },
                  { key: 'o3', label: 'O₃', desc: 'Ozono (µg/m³)' },
                  { key: 'co', label: 'CO', desc: 'Monóxido Carbono (mg/m³)' },
                ].filter(p => p.key === 'all' || availableGlobalPollutants.has(p.key)).map((p) => {
                  const isActive = activePollutant === p.key
                  return (
                    <button
                      key={p.key}
                      type="button"
                      onClick={() => setActivePollutant(p.key as any)}
                      className={`flex flex-1 flex-col items-start rounded-lg px-4 py-2 text-left transition-all duration-300 sm:flex-initial sm:min-w-[140px] border ${isActive
                        ? 'bg-emerald-500/10 dark:bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 border-emerald-500/30 dark:border-emerald-500/35 shadow-[0_0_15px_rgba(16,185,129,0.08)] font-bold'
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
          </div>
        </div>
      </section>

      {/* Sección 2: Sistema de Búsqueda de Estaciones */}
      <section id="tour-search" className="px-6 md:px-12 max-w-[1400px] mx-auto mb-6 scroll-mt-24 relative z-[1010]">
        <div className="rounded-xl border border-[#d4cebe] dark:border-slate-800 bg-white/40 dark:bg-slate-900/25 p-4 shadow-sm backdrop-blur-md">
          <div className="flex items-center justify-between cursor-pointer select-none mb-3" onClick={() => setIsMinimizedSearchPanel(!isMinimizedSearchPanel)}>
            <label className="text-[11px] font-extrabold uppercase tracking-[0.08em] text-[#6e685e] dark:text-slate-400 cursor-pointer">
              Sistema de Búsqueda de Estaciones
            </label>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                setIsMinimizedSearchPanel(!isMinimizedSearchPanel)
              }}
              className="flex items-center gap-1.5 rounded-lg border border-[#b5ae9b]/60 dark:border-slate-700/50 bg-white/60 dark:bg-slate-900/50 px-3 py-1.5 text-xs font-bold text-[#4a453c] dark:text-slate-300 transition-all hover:bg-[#e4dec9]/50 dark:hover:bg-slate-800/60 hover:text-[#2d2a24] dark:hover:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
            >
              {isMinimizedSearchPanel ? (
                <>
                  <svg className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                  </svg>
                  Mostrar Buscador
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
          <div
            className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out ${isMinimizedSearchPanel ? 'overflow-hidden' : 'overflow-visible'}`}
            style={{
              gridTemplateRows: isMinimizedSearchPanel ? '0fr' : '1fr',
              opacity: isMinimizedSearchPanel ? 0 : 1,
            }}
          >
            <div className={`${isMinimizedSearchPanel ? 'overflow-hidden' : 'overflow-visible'} space-y-4`}>
              {/* 4 Search Mode Tabs */}
              <div className="grid grid-cols-2 gap-2 md:grid-cols-4 rounded-xl bg-white/80 dark:bg-slate-900/40 p-1.5 border border-[#d4cebe] dark:border-slate-800/60 shadow-md">
                {[
                  { id: 'station', label: '1. Por Estación', desc: 'Nombre específico' },
                  { id: 'commune', label: '2. Por Comuna', desc: 'Cualquier comuna' },
                  { id: 'address', label: '3. Por Dirección', desc: 'Dirección exacta (Chile)' },
                  { id: 'region', label: '4. Por Región', desc: 'Filtrado regional completo' },
                ].map((tab) => {
                  const isActive = searchMode === tab.id
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => {
                        setSearchMode(tab.id as any)
                        handleClearFilters()
                        setSearchMode(tab.id as any)
                      }}
                      className={`flex flex-col items-start rounded-lg px-4 py-2 text-left transition-all duration-300 border ${isActive
                        ? 'bg-emerald-500/10 dark:bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 border-emerald-500/30 dark:border-emerald-500/35 shadow-sm font-bold'
                        : 'text-[#6e685e] dark:text-slate-400 hover:text-[#2d2a24] dark:hover:text-slate-200 border-transparent hover:bg-[#e4dec9]/50 dark:hover:bg-slate-800/40'
                        }`}
                    >
                      <span className="text-xs font-black tracking-tight">{tab.label}</span>
                      <span className="text-[9px] font-semibold opacity-70 mt-0.5 leading-none">{tab.desc}</span>
                    </button>
                  )
                })}
              </div>

              {/* Render search input mode */}
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:gap-4">

                {/* Forma 1: Buscar por nombres de estaciones */}
                {searchMode === 'station' && (
                  <div className="relative flex-1">
                    <label
                      htmlFor="search-stations"
                      className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.08em] text-[#6e685e] dark:text-slate-400"
                    >
                      Buscar Estación Específica
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
                        placeholder="Ej: Pudahuel, Temuco, Osorno..."
                        className="w-full rounded-xl border border-[#d4cebe] dark:border-slate-700/60 bg-white/80 dark:bg-slate-900/40 py-2.5 pl-10 pr-10 text-sm text-[#2d2a24] dark:text-slate-100 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)] outline-none backdrop-blur-xl transition-all placeholder-[#a8a29e] dark:placeholder:text-slate-500 focus:border-emerald-600/55 dark:focus:border-emerald-500/50 focus:bg-white dark:focus:bg-slate-900/60"
                      />
                      {searchQuery && (
                        <button
                          onClick={() => setSearchQuery('')}
                          className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-[#a8a29e] dark:text-slate-500 transition-colors hover:text-[#2d2a24]"
                          aria-label="Limpiar búsqueda"
                        >
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      )}
                    </div>

                    {/* Suggestions */}
                    {showSuggestions && searchSuggestions.length > 0 && (
                      <div className="absolute left-0 right-0 top-full z-[2000] mt-2 max-h-80 overflow-y-auto rounded-xl border border-[#d4cebe] dark:border-slate-800/90 bg-white/95 dark:bg-slate-950/95 p-2 shadow-2xl backdrop-blur-xl scrollbar-thin">
                        {searchSuggestions.map((group) => (
                          <div key={group.region} className="mb-2.5 last:mb-0">
                            <div className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-[#6e685e] dark:text-slate-500 border-b border-[#e4dec9]/60 dark:border-slate-800/30 pb-1">
                              {group.region}
                            </div>
                            <div className="mt-1 space-y-0.5">
                              {group.stations.map((s) => {
                                const isAll = activePollutant === 'all'
                                const val = isAll ? null : s[activePollutant]
                                const ica = isAll
                                  ? getWorstICACategory(s)
                                  : (typeof val === 'number' && val >= 0 ? getICACategory(val as number, activePollutant as any) : null)
                                return (
                                  <button
                                    key={s.id}
                                    type="button"
                                    onClick={() => {
                                      setSelectedStation(s)
                                      setSearchQuery(s.nombre)
                                      setShowSuggestions(false)
                                    }}
                                    className="flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-xs text-[#4a453c] dark:text-slate-300 transition-colors hover:bg-[#faf6eb] dark:hover:bg-slate-900/60"
                                  >
                                    <span className="font-medium">{s.nombre}</span>
                                    {ica ? (
                                      <div className="flex items-center gap-2">
                                        <span className="text-[10px] font-bold" style={{ color: ica.color }}>
                                          {isAll ? ica.categoria : (activePollutant === 'co' ? `${((val as number) / 1000).toFixed(1)} mg/m³` : `${Math.round(val as number)} µg/m³`)}
                                        </span>
                                        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: ica.color }} />
                                      </div>
                                    ) : (
                                      <span className="text-[10px] text-slate-400 font-semibold">Sin datos</span>
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
                )}

                {/* Forma 2: Buscar por Comuna (cualquiera de Chile, calcula más cercanas) */}
                {searchMode === 'commune' && (
                  <div className="relative flex-1">
                    <label
                      htmlFor="search-communes"
                      className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.08em] text-[#6e685e] dark:text-slate-400"
                    >
                      Ingresa cualquier Comuna de Chile
                    </label>
                    <form onSubmit={handleCommuneSubmit} className="group relative flex gap-2">
                      <div className="relative flex-1">
                        <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5">
                          <svg className="h-4 w-4 text-[#a8a29e] dark:text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                          </svg>
                        </div>
                        <input
                          id="search-communes"
                          type="text"
                          value={communeQuery}
                          disabled={isSearchingCommune}
                          onFocus={() => { setShowSuggestions(true); setSelectedFromAutocomplete(false) }}
                          onChange={(e) => { setCommuneQuery(e.target.value); setSelectedFromAutocomplete(false) }}
                          placeholder="Ej: Las Condes, Temuco, Valdivia, Valparaíso..."
                          className="w-full rounded-xl border border-[#d4cebe] dark:border-slate-700/60 bg-white/80 dark:bg-slate-900/40 py-2.5 pl-10 pr-10 text-sm text-[#2d2a24] dark:text-slate-100 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)] outline-none backdrop-blur-xl transition-all placeholder-[#a8a29e] dark:placeholder:text-slate-500 focus:border-emerald-600/55 dark:focus:border-emerald-500/50 focus:bg-white dark:focus:bg-slate-900/60 disabled:opacity-60"
                        />
                        {communeQuery && (
                          <button
                            type="button"
                            onClick={() => {
                              setCommuneQuery('')
                              setSearchCoords(null)
                              setCommuneError(null)
                            }}
                            className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-[#a8a29e]"
                          >
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        )}
                      </div>
                      <button
                        type="submit"
                        disabled={isSearchingCommune || !communeQuery.trim()}
                        className="rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-600/50 px-5 py-2.5 text-sm font-bold text-white shadow-md transition-all hover:scale-[1.02] flex items-center gap-1.5"
                      >
                        {isSearchingCommune ? 'Buscando...' : 'Buscar'}
                      </button>
                    </form>

                    {/* Commune Autocomplete suggestions dropdown */}
                    {showSuggestions && communeSuggestions.length > 0 && (
                      <div className="absolute left-0 right-0 top-full z-[2000] mt-2 max-h-60 overflow-y-auto rounded-xl border border-[#d4cebe] dark:border-slate-800/90 bg-white/95 dark:bg-slate-950/95 p-2 shadow-2xl backdrop-blur-xl">
                        {communeSuggestions.map((item, idx) => (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => selectAddressSuggestion(item)}
                            className="w-full text-left px-3 py-2 rounded-lg text-xs font-semibold text-[#4a453c] dark:text-slate-300 hover:bg-[#faf6eb] dark:hover:bg-slate-900/60 transition-colors"
                          >
                            📍 {item.display_name}
                          </button>
                        ))}
                      </div>
                    )}
                    {communeError && (
                      <p className="absolute left-0 mt-1 text-[11px] text-red-500 font-semibold">{communeError}</p>
                    )}
                  </div>
                )}

                {/* Forma 3: Búsqueda por Dirección Específica (con pre-rellenado autocomplete) */}
                {searchMode === 'address' && (
                  <div className="relative flex-1">
                    <label
                      htmlFor="search-address"
                      className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.08em] text-[#6e685e] dark:text-slate-400"
                    >
                      Dirección Específica (Calle, número y comuna)
                    </label>
                    <form onSubmit={handleAddressSubmit} className="group relative flex gap-2">
                      <div className="relative flex-1">
                        <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5">
                          <svg className="h-4 w-4 text-[#a8a29e] dark:text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                          </svg>
                        </div>
                        <input
                          id="search-address"
                          type="text"
                          value={addressQuery}
                          disabled={isSearchingAddress}
                          onFocus={() => { setShowSuggestions(true); setSelectedFromAutocomplete(false) }}
                          onChange={(e) => { setAddressQuery(e.target.value); setSelectedFromAutocomplete(false) }}
                          placeholder="Ej: Alameda 130, Santiago o Prat 500, Temuco..."
                          className="w-full rounded-xl border border-[#d4cebe] dark:border-slate-700/60 bg-white/80 dark:bg-slate-900/40 py-2.5 pl-10 pr-10 text-sm text-[#2d2a24] dark:text-slate-100 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)] outline-none backdrop-blur-xl transition-all placeholder-[#a8a29e] dark:placeholder:text-slate-500 focus:border-emerald-600/55 dark:focus:border-emerald-500/50 focus:bg-white dark:focus:bg-slate-900/60 disabled:opacity-60"
                        />
                        {addressQuery && (
                          <button
                            type="button"
                            onClick={() => {
                              setAddressQuery('')
                              setSearchCoords(null)
                              setAddressError(null)
                            }}
                            className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-[#a8a29e]"
                          >
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        )}
                      </div>
                      <button
                        type="submit"
                        disabled={isSearchingAddress || !addressQuery.trim()}
                        className="rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-600/50 px-5 py-2.5 text-sm font-bold text-white shadow-md transition-all hover:scale-[1.02] flex items-center gap-1.5 whitespace-nowrap"
                      >
                        {isSearchingAddress ? 'Buscando...' : 'Buscar'}
                      </button>
                    </form>

                    {/* Address suggestions list (pre-rellenado) */}
                    {showSuggestions && addressSuggestions.length > 0 && (
                      <div className="absolute left-0 right-0 top-full z-[2000] mt-2 max-h-60 overflow-y-auto rounded-xl border border-[#d4cebe] dark:border-slate-800/90 bg-white/95 dark:bg-slate-950/95 p-2 shadow-2xl backdrop-blur-xl">
                        {addressSuggestions.map((item, idx) => (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => selectAddressSuggestion(item)}
                            className="w-full text-left px-3 py-2 rounded-lg text-xs font-semibold text-[#4a453c] dark:text-slate-300 hover:bg-[#faf6eb] dark:hover:bg-slate-900/60 transition-colors"
                          >
                            📍 {item.display_name}
                          </button>
                        ))}
                      </div>
                    )}
                    {addressError && (
                      <p className="absolute left-0 mt-1 text-[11px] text-red-500 font-semibold">{addressError}</p>
                    )}
                  </div>
                )}

                {/* Forma 4: Selector de región + Comuna de la base de datos */}
                {searchMode === 'region' && (
                  <>
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
                          className="w-full appearance-none rounded-xl border border-[#d4cebe] dark:border-slate-700/60 bg-white/80 dark:bg-slate-900/40 px-4 py-2.5 pr-10 text-sm text-[#2d2a24] dark:text-slate-100 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)] outline-none backdrop-blur-xl transition-all focus:border-emerald-600/55 dark:focus:border-emerald-500/50 focus:bg-white dark:focus:bg-slate-900/60"
                        >
                          {regions.map((r) => (
                            <option key={r} value={r} className="bg-white text-slate-900 dark:bg-slate-955 dark:text-slate-100">
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
                          className="w-full appearance-none rounded-xl border border-[#d4cebe] dark:border-slate-700/60 bg-white/80 dark:bg-slate-900/40 px-4 py-2.5 pr-10 text-sm text-[#2d2a24] dark:text-slate-100 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)] outline-none backdrop-blur-xl transition-all focus:border-emerald-600/55 dark:focus:border-emerald-500/50 focus:bg-white dark:focus:bg-slate-900/60 disabled:opacity-50"
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
                  </>
                )}

              </div>
            </div>
          </div>
        </div>

        {/* Search Results Metadata Row */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-[#d4cebe]/50 dark:border-slate-800/60 pt-3">
          <p className="text-xs text-[#6e685e] dark:text-slate-500">
            Mostrando{' '}
            <span className="font-bold text-[#2d2a24] dark:text-slate-200">{activeCount}</span>{' '}
            estación{activeCount !== 1 ? 'es' : ''}
            {selectedRegion !== 'Todas' && searchMode === 'region' ? ` en ${selectedRegion}` : ''}
            {selectedLocality !== 'Todas' && searchMode === 'region' ? `, comuna de ${selectedLocality}` : ''}
            {searchCoords && (searchMode === 'address' || searchMode === 'commune') && (
              <span className="ml-1.5 font-bold text-emerald-600 dark:text-emerald-400">
                (ordenadas por cercanía física)
              </span>
            )}
            {activeIcaFilter && (
              <span className="ml-1.5 inline-flex items-center rounded-full bg-emerald-100 dark:bg-emerald-950/60 px-2.5 py-0.5 text-[10px] font-bold text-emerald-800 dark:text-emerald-300 border border-emerald-500/20">
                Filtrado por: {activeIcaFilter}
              </span>
            )}
          </p>
          {(searchQuery || selectedRegion !== 'Todas' || selectedLocality !== 'Todas' || searchCoords || activeIcaFilter) && (
            <button
              onClick={handleClearFilters}
              className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 transition-colors hover:text-emerald-700 dark:hover:text-emerald-300"
            >
              Limpiar todos los filtros y búsquedas
            </button>
          )}
        </div>
      </section>

      {/* Mapa */}
      <section id="tour-map" className="px-6 md:px-12 max-w-[1600px] mx-auto mb-12 h-[600px] scroll-mt-24">
        <AirMapWrapper
          stations={filtered}
          activePollutant={activePollutant}
          onSelectStation={setSelectedStation}
          searchCoords={searchCoords}
          selectedRegion={selectedRegion}
        />
      </section>

      {/* Tabla */}
      <section id="tour-table" className="px-6 md:px-12 max-w-[1400px] mx-auto pb-20 scroll-mt-24">
        <div id="tour-table-header" className="mb-6 flex items-center justify-between scroll-mt-24">
          <h2 className="text-2xl font-bold tracking-tight text-[#1e1b18] dark:text-white">Resumen por región</h2>
          <div className="flex items-center gap-3">
            {(searchQuery || searchCoords || activeIcaFilter) && (
              <span className="inline-flex items-center rounded-full border border-[#d4cebe] dark:border-slate-700/60 bg-white/60 dark:bg-slate-900/40 px-3 py-1 text-xs text-[#6e685e] dark:text-slate-400 backdrop-blur-md font-semibold">
                {searchCoords ? 'Proximidad geográfica activa' : activeIcaFilter ? `Categoría: ${activeIcaFilter}` : `Búsqueda: "${searchQuery}"`}
              </span>
            )}
            <button
              onClick={() => setShowReport(true)}
              className="flex items-center gap-2 rounded-xl border border-[#d4cebe] dark:border-slate-700 bg-white/70 dark:bg-slate-900/60 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 hover:border-emerald-400/60 dark:hover:border-emerald-600/40 px-4 py-2 text-xs font-bold text-[#4a453c] dark:text-slate-300 hover:text-emerald-700 dark:hover:text-emerald-400 transition-all shadow-sm"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Informe por Región
            </button>
          </div>
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

      {/* Modal de Informe por Región */}
      {showReport && (
        <RegionReport stations={stations} onClose={() => setShowReport(false)} />
      )}

      {/* Guided Tour Spotlight Overlay */}
      {tourStep !== null && tourCoords && (
        <div
          className="absolute z-[8500] border-2 border-emerald-500 rounded-xl pointer-events-none transition-all duration-300 shadow-[0_0_0_9999px_rgba(15,23,42,0.65)]"
          style={{
            top: tourCoords.top - 8,
            left: tourCoords.left - 8,
            width: tourCoords.width + 16,
            height: tourCoords.height + 16,
          }}
        />
      )}

      {/* Guided Tour Tooltip Card */}
      {tourStep !== null && (
        <div
          className="z-[8600] rounded-2xl border border-[#d4cebe] dark:border-slate-800 bg-[#f5f2eb]/95 dark:bg-slate-900/95 p-5 shadow-2xl backdrop-blur-md transition-all duration-300"
          style={
            (() => {
              if (!tourCoords) return { position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: '320px' } as const

              const currentStep = tourSteps[tourStep]
              const isFixedBottom = currentStep.targetId === 'tour-map' || currentStep.targetId === 'tour-table-header'

              if (isFixedBottom) {
                return {
                  position: 'fixed',
                  bottom: '90px',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  width: '320px',
                } as const
              }

              const viewportHeight = window.innerHeight
              const elementBottomViewport = tourCoords.top - window.scrollY + tourCoords.height
              const spaceBelow = viewportHeight - elementBottomViewport
              const spaceAbove = tourCoords.top - window.scrollY

              if (spaceBelow < 250 && spaceAbove > spaceBelow) {
                return {
                  position: 'absolute',
                  top: tourCoords.top - 20,
                  left: Math.max(10, Math.min(window.innerWidth - 330, tourCoords.left + tourCoords.width / 2 - 160)),
                  transform: 'translateY(-100%)',
                  width: '320px',
                } as const
              } else {
                return {
                  position: 'absolute',
                  top: tourCoords.top + tourCoords.height + 20,
                  left: Math.max(10, Math.min(window.innerWidth - 330, tourCoords.left + tourCoords.width / 2 - 160)),
                  width: '320px',
                } as const
              }
            })()
          }
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
              Guía de Uso • Paso {tourStep + 1} de {tourSteps.length}
            </span>
            <button
              onClick={() => setTourStep(null)}
              className="text-xs font-bold text-[#6e685e] hover:text-[#2d2a24] dark:hover:text-white"
            >
              Omitir
            </button>
          </div>
          <h4 className="text-sm font-black text-[#2d2a24] dark:text-white mb-1">
            {tourSteps[tourStep].title}
          </h4>
          <p className="text-xs text-[#5c5850] dark:text-slate-300 leading-relaxed mb-4">
            {tourSteps[tourStep].content}
          </p>
          <div className="flex items-center justify-between pt-2 border-t border-[#d4cebe]/50 dark:border-slate-800/40">
            <button
              disabled={tourStep === 0}
              onClick={() => setTourStep((prev) => (prev !== null ? prev - 1 : null))}
              className="px-2.5 py-1 text-xs font-bold text-[#6e685e] dark:text-slate-400 hover:text-[#2d2a24] dark:hover:text-white disabled:opacity-30 disabled:pointer-events-none"
            >
              &larr; Anterior
            </button>
            <button
              onClick={() => {
                if (tourStep === tourSteps.length - 1) {
                  setTourStep(null)
                } else {
                  setTourStep((prev) => (prev !== null ? prev + 1 : null))
                }
              }}
              className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all"
            >
              {tourStep === tourSteps.length - 1 ? 'Finalizar' : 'Siguiente →'}
            </button>
          </div>
        </div>
      )}

      {/* Floating help/tour button */}
      <button
        type="button"
        onClick={() => setTourStep(0)}
        className="fixed bottom-6 right-6 z-[8000] flex items-center gap-2 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 shadow-2xl transition-all duration-300 hover:scale-105 font-bold text-xs"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" />
        </svg>
        Guía de Uso
      </button>
    </>
  )
}

function StatCard({
  label,
  value,
  color,
  isActive,
  onClick,
}: {
  label: string
  value: number
  color: string
  isActive?: boolean
  onClick?: () => void
}) {
  const isSinDatos = label === 'Sin Datos'
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left rounded-xl border p-4 backdrop-blur-md transition-all duration-300 hover:scale-[1.02] cursor-pointer ${isActive
        ? 'ring-2 ring-emerald-500 shadow-md font-bold scale-[1.03] border-transparent'
        : isSinDatos
          ? 'opacity-40 hover:opacity-75 bg-slate-100/35 dark:bg-slate-900/15 border-slate-300/40 dark:border-slate-800/45'
          : 'opacity-70 hover:opacity-100'
        }`}
      style={{
        backgroundColor: isSinDatos ? undefined : `${color}12`,
        borderColor: isActive ? 'transparent' : (isSinDatos ? undefined : `${color}35`),
        color: isSinDatos ? '#71717a' : color,
      }}
    >
      <p className={`text-[10px] font-bold uppercase tracking-[0.08em] ${isSinDatos ? 'text-slate-500 dark:text-slate-400' : 'opacity-80'}`}>
        {label}
      </p>
      <p className="mt-1.5 text-2xl font-black tabular-nums text-[#2d2a24] dark:text-slate-100 flex items-baseline gap-1">
        {value}
        <span className="text-[10px] font-semibold opacity-70 text-[#6e685e] dark:text-slate-400 lowercase">
          {value === 1 ? 'estación' : 'estaciones'}
        </span>
      </p>
    </button>
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