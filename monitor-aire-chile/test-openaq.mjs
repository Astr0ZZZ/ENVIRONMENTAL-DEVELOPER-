import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const apiKey = '15b29dd37e6845b415b50ba7a309f29edbaad56313d7cefe670d50172745cef2';
const CACHE_FILE_PATH = path.join(__dirname, 'lib', 'openaq-cache.json');

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function run() {
  console.log('--- INICIANDO PRE-POBLACIÓN DE CACHÉ DE OPENAQ ---');
  
  // 1. Obtener ubicaciones
  const locationsUrl = 'https://api.openaq.org/v3/locations?countries_id=3&limit=250';
  console.log('Descargando lista de estaciones desde:', locationsUrl);
  
  let locations = [];
  try {
    const res = await fetch(locationsUrl, { headers: { 'X-API-Key': apiKey } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    locations = Array.isArray(data.results) ? data.results : [];
  } catch (err) {
    console.error('Error al descargar locaciones:', err);
    return;
  }
  
  console.log(`Se encontraron ${locations.length} estaciones en Chile.`);
  
  // Cargar caché existente si hay uno para no perder datos ya descargados
  let cache = { lastGlobalUpdate: Date.now(), locations, stations: {} };
  try {
    if (fs.existsSync(CACHE_FILE_PATH)) {
      const content = fs.readFileSync(CACHE_FILE_PATH, 'utf-8');
      const existingCache = JSON.parse(content);
      cache.stations = existingCache.stations || {};
      console.log(`Cargado caché existente con ${Object.keys(cache.stations).length} estaciones.`);
    }
  } catch (err) {
    console.warn('No se pudo cargar caché existente, empezando desde cero.');
  }

  // 2. Iterar estaciones y descargar latest con delay seguro de 1.2 segundos para evitar 429
  let index = 0;
  for (const loc of locations) {
    index++;
    const id = String(loc.id);
    
    // Si ya lo tenemos en caché y es reciente, nos lo saltamos
    if (cache.stations[id] && Date.now() - cache.stations[id].cachedAt < 15 * 60 * 1000) {
      console.log(`[${index}/${locations.length}] Estación ID ${id} (${loc.name}) ya está fresca en caché.`);
      continue;
    }
    
    console.log(`[${index}/${locations.length}] Descargando latest para ID ${id} (${loc.name})...`);
    
    // Mapeo de sensores
    const sensorMap = {};
    if (Array.isArray(loc.sensors)) {
      for (const s of loc.sensors) {
        if (s.parameter?.name) {
          sensorMap[s.id] = s.parameter.name;
        }
      }
    }
    
    try {
      const res = await fetch(`https://api.openaq.org/v3/locations/${id}/latest`, {
        headers: { 'X-API-Key': apiKey }
      });
      
      if (res.status === 429) {
        console.warn('¡Llegamos al Rate Limit (429)! Esperando 10 segundos antes de reintentar...');
        await delay(10000);
        // Reintentar una vez
        const resRetry = await fetch(`https://api.openaq.org/v3/locations/${id}/latest`, {
          headers: { 'X-API-Key': apiKey }
        });
        if (!resRetry.ok) throw new Error(`HTTP ${resRetry.status}`);
        const data = await resRetry.json();
        saveStationData(id, data.results, sensorMap, cache);
      } else if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      } else {
        const data = await res.json();
        saveStationData(id, data.results, sensorMap, cache);
      }
    } catch (err) {
      console.error(`Error descargando estación ID ${id}:`, err.message);
    }
    
    // Escribir archivo en cada iteración para guardar progreso en caso de interrupción
    try {
      fs.writeFileSync(CACHE_FILE_PATH, JSON.stringify(cache, null, 2), 'utf-8');
    } catch (err) {
      console.error('Error escribiendo caché:', err.message);
    }
    
    // Esperar 1.2 segundos entre consultas para respetar el rate limit de 60 req/min
    await delay(1200);
  }
  
  console.log('--- PRE-POBLACIÓN COMPLETADA CON ÉXITO ---');
}

function saveStationData(id, results, sensorMap, cache) {
  const dataArray = Array.isArray(results) ? results : [];
  let pm10 = null;
  let pm25 = null;
  let lastUpdated = undefined;
  
  for (const r of dataArray) {
    const sensorId = Number(r.sensorsId);
    const paramName = sensorMap[sensorId];
    const value = typeof r.value === 'number' ? r.value : null;
    const ts = r.datetime?.utc || r.datetime?.local || r.datetime;
    
    if (paramName === 'pm10' && value !== null && pm10 === null) {
      pm10 = value;
      if (ts) lastUpdated = ts;
    }
    if (paramName === 'pm25' && value !== null && pm25 === null) {
      pm25 = value;
      if (ts) lastUpdated = ts;
    }
  }
  
  cache.stations[id] = {
    pm10,
    pm25,
    lastUpdated,
    cachedAt: Date.now()
  };
  console.log(`  -> Guardado: pm10=${pm10}, pm25=${pm25}, lastUpdated=${lastUpdated}`);
}

run();
