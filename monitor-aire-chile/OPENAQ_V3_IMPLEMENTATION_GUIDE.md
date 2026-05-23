# Guía de Implementación API OpenAQ v3 para Kimi

Este documento contiene las reglas y descubrimientos técnicos sobre la API v3 de OpenAQ, los cuales debes seguir estrictamente para implementar la recolección de datos en la Fase 3.

## 1. Autenticación y Cabeceras
La API v3 de OpenAQ es estricta con la autenticación. 
- **Header requerido:** `X-API-Key`
- **Variable de entorno:** `process.env.OPENAQ_API_KEY`
- Todas las peticiones fetch desde el servidor de Next.js deben incluir este header.

## 2. Obtención de Estaciones (Locaciones)
El endpoint para obtener la lista de estaciones de Chile es:
`GET https://api.openaq.org/v3/locations?countries_id=3&limit=1000`

- **Nota Crítica:** El ID de país para Chile en OpenAQ v3 es **3** (No 41 ni "CL").
- La respuesta incluye un array `results`. Cada locación tiene sus coordenadas (`coordinates.latitude`, `coordinates.longitude`), su nombre (`name`) y un arreglo de `sensors`.

## 3. El Problema de los Valores "latest" y Solución de Mapeo
En la versión antigua de OpenAQ (v2), la lista de locaciones incluía el último valor medido (`lastValue`). **En la API v3 esto ya no es así.**
El endpoint `/locations` no devuelve el valor actual de contaminación directamente en la locación, por lo que es necesario consultar `GET /locations/{id}/latest`. 

### Mapeo Dinámico de Parámetros (`sensorMap`):
Dado que la respuesta del endpoint `/latest` solo expone `sensorsId` y no los nombres del parámetro (`pm10`/`pm25`), se implementó la siguiente solución:
1. Al consultar el catálogo de `/locations`, construimos un mapa asociativo de IDs de sensores a parámetros:
   ```typescript
   const sensorMap: Record<number, string> = {}
   for (const s of loc.sensors) {
     const paramName = s.parameter?.name
     if (paramName) {
       sensorMap[s.id] = paramName // Mapea ej. { 14724: "pm25" }
     }
   }
   ```
2. Al procesar la respuesta de `/latest`, cruzamos `r.sensorsId` con `sensorMap[r.sensorsId]` para extraer los valores reales del parámetro correcto.

---

## 4. Estrategia de Caché Híbrida y Ventana Deslizante (Sliding Window)

Para consultar las **186 estaciones** en Chile sin exceder el Rate Limit de OpenAQ v3 (60 req/min):

1. **Caché en Archivo Persistente**: Los datos se guardan en `lib/openaq-cache.json` con una estructura de par estación-datos y marca de tiempo (`cachedAt`).
2. **Ventana Deslizante de Actualizaciones (Sliding Window)**:
   - Al cargar la página, se ordenan las estaciones priorizando las que no tienen datos o tienen datos más antiguos.
   - Solo se actualizan un máximo de **20 estaciones expiradas** (`MAX_UPDATES_PER_REQ = 20`) por cada recarga de página.
   - El resto de las estaciones se sirven instantáneamente desde el caché local.
   - Esto distribuye la carga en solicitudes cortas, responde en `< 1.5s` al usuario final y mantiene el consumo muy por debajo del límite de la API.
3. **Manejo de Reintentos de Rate Limit**: En caso de recibir un error `HTTP 429` (Rate Limit Exceeded), el caché pospone automáticamente el reintento de la estación afectada por 3 minutos sumando tiempo ficticio a su propiedad `cachedAt`, evitando bloqueos en la cola.

---

## 5. Pre-población de Caché (Semillero)
Para evitar que el primer usuario cargue el mapa con estaciones vacías (grises), se implementó un script offline:
- **Archivo:** `test-openaq.mjs`
- **Comando:** `node test-openaq.mjs`
- **Funcionamiento:** Recorre secuencialmente las 186 estaciones del catálogo base con pausas de 1.2 segundos entre cada llamada. Cuenta con manejo automático de errores 429 (esperando 10 segundos antes de reintentar) y guarda los resultados directo en `lib/openaq-cache.json`.
- **Uso recomendado:** Ejecutar este script antes de levantar el servidor por primera vez o antes de un deploy a producción para asegurar que el caché esté 100% caliente.

---

## 6. Fase 3: Visualizaciones Avanzadas (Plumas de Viento, Gráfico de Tendencias e Interactividad)
- **Mapeo Multivariable:** El catalogador y caché de `lib/openaq-server.ts` extraen adicionalmente contaminantes secundarios (`so2`, `no2`, `o3`, `co`).
- **Dispersión Física y Modelado de Nubosidad (Plumas Gaussianas):**
  - Implementado en `components/AirMap.tsx`.
  - Se oculta la dispersión para estaciones con calidad de aire **"Bueno"** para mantener limpio el mapa.
  - Para estaciones con estado "Regular" o superior, se simulan plumas de dispersión físicas guiadas por la latitud del viento en Chile (Vientos predominantes WSW en el Norte que apuntan a ~60°, vientos SW en el Centro que apuntan a ~45°, y Westerlies en el Sur que apuntan a ~90°).
  - **Zoom Alto (>= 8):** Dibuja plumas de dispersión cónicas con tres niveles de concentración anidados (`Polygon` de Leaflet) que se expanden con la distancia. Tienen un difuminado (`blur(20px)`) para lograr una nubosidad suave y realista.
  - **Zoom Bajo (< 8):** Muestra un halo ambiental difuso (`Circle` de Leaflet con radio geográfico en metros y blur de `52px`) desplazado downwind según el vector de viento de la estación para evitar sobreposición densa.
- **Panel Lateral Deslizable (`components/StationPanel.tsx`):**
  - Muestra un desglose visual premium del contaminante prioritario y un panel secundario con los otros gases detectados (escalando CO a `mg/m³`).
  - Grafica la tendencia de los últimos 7 días con un gráfico SVG de curvas Bézier cúbicas suaves.
  - **Colores Dinámicos:** Cada coordenada e indicador en el gráfico se colorea de manera individual según su categoría ICA del respectivo día.
  - **Interactividad Premium:** Soporta eventos hover/touch que dibujan líneas guía de contraste y un tooltip interactivo con el día de la semana y valor medido en tiempo real.
- **Jerarquía Territorial y Minimización (`components/Dashboard.tsx` / `components/RegionTable.tsx`):**
  - **Filtro de Comunas Desactivado:** El selector de Comunas/Localidades está condicionado al selector de Región. Permanece deshabilitado con un marcador instructivo hasta que el usuario escoja una región específica.
  - **Minimización de Tabla General:** Permite colapsar la grilla de la tabla resumen. Cuenta con un botón superior y un botón en el pie de la tabla que oculta los datos y realiza un scroll animado fluido al control superior para mejorar el espacio de pantalla en vistas móviles.
  - **Preservación de Localidades:** El resolvedor regional en `lib/chile-regions.ts` utiliza la propiedad `locality` provista por la API de OpenAQ de forma preferente, eliminando nombres genéricos duplicados y ordenándolos adecuadamente por su región administrativa real.
- **Diseño Beige Premium Claro por Defecto y Mapa Ensanchado:**
  - **Preferencia por Defecto:** Se configuró el sitio para cargar el tema beige claro (`bg-[#f5f2eb]`) de forma predeterminada. El tema oscuro permanece disponible y se guarda en `localStorage` tras la interacción.
  - **Prevención de Destellos:** La propiedad `mapTheme` de Leaflet se inicializa dinámicamente según la clase del documento (`detailed` para modo claro y `dark` para modo oscuro) para evitar destellos oscuros o claros al cargar los mosaicos del mapa.
  - **Dispersión Condicional:** Se implementó `mix-blend-mode: multiply` en modo claro para que las plumas gaussianas y halos de la nube sean perfectamente visibles sobre el mapa físico, y `mix-blend-mode: plus-lighter` en modo oscuro para mantener su luminiscencia.
  - **Contenedor Ampliado:** Se amplió la sección del mapa a `max-w-[1600px]`, logrando que resalte visualmente sobre el resto de las secciones (`max-w-[1400px]`) y le brinde mayor cuerpo a la página.
  - **Normalización de Clases:** Se estandarizaron todas las clases de Tailwind que usaban especificaciones no válidas (`slate-850`, `slate-450`, etc.) a formatos de color oficiales para garantizar una compilación limpia.

