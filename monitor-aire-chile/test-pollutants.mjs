import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CACHE_FILE_PATH = path.join(__dirname, 'lib', 'openaq-cache.json');

try {
  const content = fs.readFileSync(CACHE_FILE_PATH, 'utf-8');
  const data = JSON.parse(content);
  
  const stations = data.stations || {};
  let total = 0;
  let allPollutantsCount = 0;
  
  const stationsWithAll = [];
  
  for (const [id, s] of Object.entries(stations)) {
    total++;
    const hasPm10 = s.pm10 !== null;
    const hasPm25 = s.pm25 !== null;
    const hasSo2 = s.so2 !== null && s.so2 !== undefined;
    const hasNo2 = s.no2 !== null && s.no2 !== undefined;
    const hasO3 = s.o3 !== null && s.o3 !== undefined;
    const hasCo = s.co !== null && s.co !== undefined;
    
    if (hasPm10 && hasPm25 && hasSo2 && hasNo2 && hasO3 && hasCo) {
      allPollutantsCount++;
      stationsWithAll.push(id);
    }
  }
  
  console.log(`Total estaciones cacheadas: ${total}`);
  console.log(`Estaciones con TODOS los contaminantes (PM10, PM2.5, SO2, NO2, O3, CO): ${allPollutantsCount}`);
  if (stationsWithAll.length > 0) {
    console.log(`IDs de estaciones con todos los contaminantes:`, stationsWithAll.join(', '));
  } else {
    console.log('Ninguna estación tiene todos los contaminantes simultáneamente.');
  }
} catch (err) {
  console.error('Error:', err.message);
}
