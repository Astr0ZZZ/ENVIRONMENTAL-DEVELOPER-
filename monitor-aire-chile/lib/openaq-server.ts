import 'server-only'
import { Station } from '@/types/openaq'
import fs from 'fs'
import path from 'path'
import { getChileRegionAndLocality } from './chile-regions'

const OPENAQ_BASE = 'https://api.openaq.org/v3'
const CONCURRENCY = 5
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
      await new Promise((r) => setTimeout(r, 150))
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
      console.error('[openaq] Fallo obteniendo catálogo base de locaciones:', err)
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
      return {
        id: String(loc.id),
        nombre: String(loc.name),
        region,
        locality,
        lat,
        lng,
        sensorMap,
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

  // Filtrar estaciones expiradas
  const expiredStations = sortedStations.filter((station) => {
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
          let lastUpdated: string | undefined

          for (const r of results) {
            const sensorId = Number(r.sensorsId)
            const paramName = station.sensorMap[sensorId]
            const value = typeof r.value === 'number' ? r.value : null
            const ts = r.datetime?.utc || r.datetime?.local || r.datetime

            if (paramName === 'pm10' && value !== null && pm10 === null) {
              pm10 = value
              if (ts) lastUpdated = ts
            }
            if (paramName === 'pm25' && value !== null && pm25 === null) {
              pm25 = value
              if (ts) lastUpdated = ts
            }
            if (paramName === 'so2' && value !== null && so2 === null) {
              so2 = value
              if (ts) lastUpdated = ts
            }
            if (paramName === 'no2' && value !== null && no2 === null) {
              no2 = value
              if (ts) lastUpdated = ts
            }
            if (paramName === 'o3' && value !== null && o3 === null) {
              o3 = value
              if (ts) lastUpdated = ts
            }
            if (paramName === 'co' && value !== null && co === null) {
              co = value
              if (ts) lastUpdated = ts
            }
          }
          return { id: station.id, pm10, pm25, so2, no2, o3, co, lastUpdated, success: true }
        } catch (err) {
          console.error(`[openaq] Fallo latest para location ${station.id}:`, err)
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
    return {
      id: station.id,
      nombre: station.nombre,
      region: station.region,
      locality: station.locality,
      lat: station.lat,
      lng: station.lng,
      pm10: cached ? cached.pm10 : null,
      pm25: cached ? cached.pm25 : null,
      so2: cached ? (cached.so2 ?? null) : null,
      no2: cached ? (cached.no2 ?? null) : null,
      o3: cached ? (cached.o3 ?? null) : null,
      co: cached ? (cached.co ?? null) : null,
      lastUpdated: cached ? cached.lastUpdated : undefined,
    }
  })
}
