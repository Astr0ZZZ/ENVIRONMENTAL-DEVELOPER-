import 'server-only'
import { Station } from '@/types/openaq'
import fs from 'fs'
import path from 'path'
import { getChileRegionAndLocality } from './chile-regions'

const OPENAQ_BASE = 'https://api.openaq.org/v3'
const CONCURRENCY = 2
const FETCH_TIMEOUT = 8000
const CACHE_TTL_MS = 15 * 60 * 1000 // 15 minutos

const CACHE_FILE_PATH = path.join(process.cwd(), 'lib', 'openaq-cache.json')


/* ---------- cache interfaces & helpers ---------- */

interface CacheStationData {
  pm10: number | null
  pm25: number | null
  so2?: number | null
  no2?: number | null
  o3?: number | null
  co?: number | null
  pm10Updated?: string
  pm25Updated?: string
  so2Updated?: string
  no2Updated?: string
  o3Updated?: string
  coUpdated?: string
  lastUpdated?: string
  cachedAt: number
}

interface CacheData {
  lastGlobalUpdate: number
  locations?: any[]
  stations: Record<string, CacheStationData>
}

// Fallback en memoria si falla la escritura en disco (ej. en serverless read-only)
let memoryCacheFallback: CacheData = {
  lastGlobalUpdate: 0,
  stations: {}
}

function readCache(): CacheData {
  try {
    if (fs.existsSync(CACHE_FILE_PATH)) {
      const content = fs.readFileSync(CACHE_FILE_PATH, 'utf-8')
      return JSON.parse(content)
    }
  } catch (err) {
    console.warn('[openaq] Error leyendo archivo de caché, usando caché en memoria:', err)
  }
  return memoryCacheFallback
}

function writeCache(data: CacheData) {
  memoryCacheFallback = data
  try {
    fs.writeFileSync(CACHE_FILE_PATH, JSON.stringify(data, null, 2), 'utf-8')
  } catch (err) {
    console.warn('[openaq] Error escribiendo archivo de caché:', err)
  }
}

/* ---------- helpers ---------- */

function getApiKey(): string {
  const key = process.env.OPENAQ_API_KEY
  if (!key) throw new Error('OPENAQ_API_KEY no está configurada')
  return key
}

async function fetchWithTimeout(url: string, init?: RequestInit) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT)

  try {
    const res = await fetch(url, {
      ...init,
      headers: { ...init?.headers, 'X-API-Key': getApiKey() },
      cache: 'no-store',
      signal: controller.signal,
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return res.json()
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Ejecuta un mapper sobre un array en lotes (batches) de tamaño fijo.
 * Cada lote se ejecuta concurrentemente, pero los lotes se procesan
 * secuencialmente para no saturar la API (rate-limit friendly).
 */
async function batchMap<T, R>(
  items: T[],
  batchSize: number,
  mapper: (item: T, index: number) => Promise<R>
): Promise<PromiseSettledResult<R>[]> {
  const out: PromiseSettledResult<R>[] = []

  for (let i = 0; i < items.length; i += batchSize) {
    const slice = items.slice(i, i + batchSize)
    const promises = slice.map((item, idx) => mapper(item, i + idx))
    const settled = await Promise.allSettled(promises)
    out.push(...settled)

    // Pausa entre lotes para ser buen ciudadano con la API
    if (i + batchSize < items.length) {
      await new Promise((r) => setTimeout(r, 300))
    }
  }

  return out
}

/* ---------- export principal ---------- */

export async function fetchLocationsServer(): Promise<Station[]> {
  // 1. Obtener catálogo base de estaciones chilenas (límite 250 para cargar las 186 estaciones)
  let results: any[] = []
  const cache = readCache()

  if (cache.locations && Date.now() - cache.lastGlobalUpdate < CACHE_TTL_MS) {
    results = cache.locations
  } else {
    try {
      console.log('[openaq] Buscando catálogo completo de ubicaciones de Chile desde la API...')
      const listData = await fetchWithTimeout(
        `${OPENAQ_BASE}/locations?countries_id=3&limit=250`
      )
      results = Array.isArray(listData.results) ? listData.results : []
      if (results.length > 0) {
        cache.locations = results
        cache.lastGlobalUpdate = Date.now()
        writeCache(cache)
      }
    } catch (err) {
      console.warn('[openaq] Fallo obteniendo catálogo base de locaciones:', err)
      if (cache.locations) {
        console.log('[openaq] Usando ubicaciones de caché expirado como fallback')
        results = cache.locations
      } else {
        throw err
      }
    }
  }

  const baseStations = results
    .map((loc: any) => {
      const sensorMap: Record<number, string> = {}
      if (Array.isArray(loc.sensors)) {
        for (const s of loc.sensors) {
          const paramName = s.parameter?.name
          if (paramName) {
            sensorMap[s.id] = paramName
          }
        }
      }
      const lat = Number(loc.coordinates?.latitude)
      const lng = Number(loc.coordinates?.longitude)
      const { region, locality } = getChileRegionAndLocality(
        String(loc.name || ''),
        loc.locality ? String(loc.locality) : null,
        lat,
        lng
      )
      // Check if location's datetimeLast is stale (older than 7 days)
      let active = true
      if (loc.datetimeLast?.utc) {
        const lastTime = new Date(loc.datetimeLast.utc).getTime()
        if (Date.now() - lastTime > 7 * 24 * 60 * 60 * 1000) {
          active = false
        }
      } else {
        active = false
      }

      return {
        id: String(loc.id),
        nombre: String(loc.name),
        region,
        locality,
        lat,
        lng,
        sensorMap,
        active,
      }
    })
    .filter((s: any) => !isNaN(s.lat) && !isNaN(s.lng))

  // 2. Determinar cuáles necesitan actualizarse (rotación de caché)
  const now = Date.now()
  const freshCache = readCache()

  // Ordenar para priorizar las que NO tienen datos o tienen datos más antiguos
  const sortedStations = [...baseStations].sort((a, b) => {
    const aCache = freshCache.stations[a.id]
    const bCache = freshCache.stations[b.id]
    const aTime = aCache ? aCache.cachedAt : 0
    const bTime = bCache ? bCache.cachedAt : 0
    return aTime - bTime
  })

  // Filtrar estaciones expiradas (solo activas)
  const expiredStations = sortedStations.filter((station) => {
    if (!station.active) return false
    const stationCache = freshCache.stations[station.id]
    return !stationCache || now - stationCache.cachedAt >= CACHE_TTL_MS
  })

  // Limitamos las consultas a un máximo de 20 estaciones por request de página
  // para ser extremadamente respetuosos del Rate Limit y no ralentizar la carga.
  const MAX_UPDATES_PER_REQ = 20
  const stationsToUpdate = expiredStations.slice(0, MAX_UPDATES_PER_REQ)

  if (stationsToUpdate.length > 0) {
    console.log(
      `[openaq] Actualizando ${stationsToUpdate.length} estaciones expiradas de un total de ${expiredStations.length} pendientes.`
    )

    // Consulta concurrente controlada por lotes
    const latestSettled = await batchMap(
      stationsToUpdate,
      CONCURRENCY,
      async (station) => {
        try {
          const data = await fetchWithTimeout(
            `${OPENAQ_BASE}/locations/${encodeURIComponent(station.id)}/latest`
          )
          const results = Array.isArray(data.results) ? data.results : []
          let pm10: number | null = null
          let pm25: number | null = null
          let so2: number | null = null
          let no2: number | null = null
          let o3: number | null = null
          let co: number | null = null

          let pm10Updated: string | undefined
          let pm25Updated: string | undefined
          let so2Updated: string | undefined
          let no2Updated: string | undefined
          let o3Updated: string | undefined
          let coUpdated: string | undefined

          for (const r of results) {
            const sensorId = Number(r.sensorsId)
            const paramName = station.sensorMap[sensorId]
            const value = typeof r.value === 'number' ? r.value : null
            const ts = r.datetime?.utc || r.datetime?.local || r.datetime

            if (paramName === 'pm10' && value !== null && pm10 === null) {
              pm10 = value
              if (ts) pm10Updated = ts
            }
            if (paramName === 'pm25' && value !== null && pm25 === null) {
              pm25 = value
              if (ts) pm25Updated = ts
            }
            if (paramName === 'so2' && value !== null && so2 === null) {
              so2 = value
              if (ts) so2Updated = ts
            }
            if (paramName === 'no2' && value !== null && no2 === null) {
              no2 = value
              if (ts) no2Updated = ts
            }
            if (paramName === 'o3' && value !== null && o3 === null) {
              o3 = value
              if (ts) o3Updated = ts
            }
            if (paramName === 'co' && value !== null && co === null) {
              co = value
              if (ts) coUpdated = ts
            }
          }

          // Calculate global lastUpdated for backward compatibility/general info
          let lastUpdated: string | undefined
          const dates = [pm10Updated, pm25Updated, so2Updated, no2Updated, o3Updated, coUpdated]
            .filter(Boolean)
            .map(d => new Date(d!))
          if (dates.length > 0) {
            const maxDate = new Date(Math.max(...dates.map(d => d.getTime())))
            lastUpdated = maxDate.toISOString()
          }

          return {
            id: station.id,
            pm10,
            pm25,
            so2,
            no2,
            o3,
            co,
            pm10Updated,
            pm25Updated,
            so2Updated,
            no2Updated,
            o3Updated,
            coUpdated,
            lastUpdated,
            success: true
          }
        } catch (err) {
          console.warn(`[openaq] Fallo latest para location ${station.id}:`, err)
          return { id: station.id, success: false }
        }
      }
    )

    // Guardar los datos en el caché persistente
    const cacheToSave = readCache()
    for (const settled of latestSettled) {
      if (settled.status === 'fulfilled') {
        const val = settled.value
        if (val.success) {
          cacheToSave.stations[val.id] = {
            pm10: val.pm10 ?? null,
            pm25: val.pm25 ?? null,
            so2: val.so2 ?? null,
            no2: val.no2 ?? null,
            o3: val.o3 ?? null,
            co: val.co ?? null,
            pm10Updated: val.pm10Updated,
            pm25Updated: val.pm25Updated,
            so2Updated: val.so2Updated,
            no2Updated: val.no2Updated,
            o3Updated: val.o3Updated,
            coUpdated: val.coUpdated,
            lastUpdated: val.lastUpdated,
            cachedAt: Date.now()
          }
        } else {
          // Si falla, posponemos el reintento empujando cachedAt ligeramente
          // para no bloquear la cola de rotación
          const existing = cacheToSave.stations[val.id]
          if (existing) {
            existing.cachedAt = Date.now() - CACHE_TTL_MS + (3 * 60 * 1000) // reintentar en 3 mins
          } else {
            cacheToSave.stations[val.id] = {
              pm10: null,
              pm25: null,
              so2: null,
              no2: null,
              o3: null,
              co: null,
              cachedAt: Date.now() - CACHE_TTL_MS + (3 * 60 * 1000)
            }
          }
        }
      }
    }
    writeCache(cacheToSave)
  }

  // 3. Devolver todas las estaciones chilenas mezcladas con el caché persistente actualizado
  const finalCache = readCache()
  return baseStations.map((station): Station => {
    const cached = finalCache.stations[station.id]
    const isActive = station.active

    const isParamFresh = (paramUpdated: string | undefined) => {
      const ts = paramUpdated || (cached ? cached.lastUpdated : undefined)
      if (!ts) return false
      const lastUpDate = new Date(ts)
      const diffDays = (Date.now() - lastUpDate.getTime()) / (1000 * 60 * 60 * 24)
      return diffDays <= 7
    }

    const showPm10 = isActive && cached && isParamFresh(cached.pm10Updated)
    const showPm25 = isActive && cached && isParamFresh(cached.pm25Updated)
    const showSo2 = isActive && cached && isParamFresh(cached.so2Updated)
    const showNo2 = isActive && cached && isParamFresh(cached.no2Updated)
    const showO3 = isActive && cached && isParamFresh(cached.o3Updated)
    const showCo = isActive && cached && isParamFresh(cached.coUpdated)

    let newestFreshUpdate: string | undefined
    if (cached) {
      const freshDates = [
        showPm10 ? (cached.pm10Updated || cached.lastUpdated) : null,
        showPm25 ? (cached.pm25Updated || cached.lastUpdated) : null,
        showSo2 ? (cached.so2Updated || cached.lastUpdated) : null,
        showNo2 ? (cached.no2Updated || cached.lastUpdated) : null,
        showO3 ? (cached.o3Updated || cached.lastUpdated) : null,
        showCo ? (cached.coUpdated || cached.lastUpdated) : null,
      ]
        .filter(Boolean)
        .map(d => new Date(d!))
      if (freshDates.length > 0) {
        newestFreshUpdate = new Date(Math.max(...freshDates.map(d => d.getTime()))).toISOString()
      }
    }

    return {
      id: station.id,
      nombre: station.nombre,
      region: station.region,
      locality: station.locality,
      lat: station.lat,
      lng: station.lng,
      pm10: showPm10 && cached ? cached.pm10 : null,
      pm25: showPm25 && cached ? cached.pm25 : null,
      so2: showSo2 && cached ? (cached.so2 ?? null) : null,
      no2: showNo2 && cached ? (cached.no2 ?? null) : null,
      o3: showO3 && cached ? (cached.o3 ?? null) : null,
      co: showCo && cached ? (cached.co ?? null) : null,
      lastUpdated: newestFreshUpdate || (cached ? cached.lastUpdated : undefined),
      active: isActive,
    }
  })
}
