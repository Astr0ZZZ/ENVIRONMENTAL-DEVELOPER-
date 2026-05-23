# Proyecto C — Monitor Calidad del Aire Chile

**Repo:** `monitor-aire-chile`  
**Deploy:** Vercel (CI/CD desde GitHub)  
**Stack:** Next.js 15 + TypeScript + Tailwind CSS + shadcn/ui + Leaflet + Recharts  
**Datos:** API OpenAQ v3 (aggrega datos oficiales entre ellos SINCA/MMA)

---

## Pivot Técnico: SINCA → OpenAQ v3

**Motivo:** OpenAQ ofrece un ecosistema API REST estable, documentado y con cobertura global que incluye estaciones chilenas. Elimina problemas de CORS inestables y parseo HTML propietario. Requiere `X-API-Key`.

**Mapeo de variables:**
- OpenAQ `pm10` → ICA MP10 (D.S. 59/2000)
- OpenAQ `pm25` → ICA MP2.5 (D.S. 13/2011 / OMS)

---

## Fase 1: Scaffold Base ✅ COMPLETADA

| Item | Estado | Commit hint |
|---|---|---|
| Next.js 15 configurado con TypeScript | ✅ | `chore: init nextjs 15` |
| Tailwind + dark mode (`class`) activo | ✅ | `style: add tailwind config with ica colors` |
| API Route proxy `/api/openaq` (evita exponer key) | ✅ | `feat: add OpenAQ server-side proxy` |
| Tipos TypeScript (`types/openaq.ts`) | ✅ | `types: define OpenAQ interfaces` |
| Umbrales ICA oficiales (`constants/ica-thresholds.ts`) | ✅ | `feat: add ICA thresholds pm10/pm25` |
| Cliente OpenAQ server-only (`lib/openaq-server.ts`) | ✅ | `feat: add server-only OpenAQ client` |
| `package.json`, `tsconfig.json`, `globals.css` base | ✅ | `chore: add base config files` |

## Fase 2: Componentes Core de Visualización ✅ COMPLETADA

| Item | Estado | Detalle técnico |
|---|---|---|
| `AirMap.tsx` with Leaflet | ✅ | Marcadores `CircleMarker` coloreados por ICA. Popup con PM10/PM2.5. |
| `AirMapWrapper.tsx` | ✅ | Dynamic import `ssr: false` para evitar errores de hidratación. |
| `RegionTable.tsx` | ✅ | Tabla resumen por región/localidad con semáforo visual. Calcula peor categoría ICA considerando ambos parámetros. |
| Filtro por región interactivo | ✅ | Select en `Dashboard.tsx` sincroniza mapa + tabla vía `useMemo`. |
| `Dashboard.tsx` (Cliente) | ✅ | Orquesta estado del filtro. `page.tsx` permanece Server Component. |

## Fase 3: Integración de Datos Reales y UX ✅ COMPLETADA

| Item | Estado | Detalle técnico |
|---|---|---|
| Fetch valores MP10/PM2.5 por estación (`/locations/{id}/latest`) y cruzar con coords | ✅ | Resuelto mediante mapeo dinámico por `sensorsId` usando `sensorMap` generado del catálogo base de locaciones. |
| Implementar batching concurrente para las 186 estaciones | ✅ | Implementado con límite de concurrencia y esperas entre lotes. Adicionalmente se diseñó un script de pre-población secuencial para inicializar el caché. |
| SWR o `revalidate` cada 15 min en Server Components para no agotar API Key | ✅ | Resuelto con un caché persistente en archivo (`lib/openaq-cache.json`) que realiza actualizaciones por ventana deslizante ("sliding-window") limitando a un máximo de 20 estaciones por recarga de página. |
| Índice de calidad del aire (ICA) calculado en tiempo real | ✅ | Implementado en frontend mediante el peor de los dos índices para PM10/PM2.5. |
| Responsive mobile fino (tabla scroll, mapa altura adaptable) | ✅ | Completado y verificado en UI responsiva. |
| Efecto de Nubosidad / Glow en el Mapa y Sensores Sofisticados | ✅ | Implementadas plumas de dispersión físicas (cónicas gaussianas) guiadas por vientos regionales. Ajustadas con mix-blend-mode: multiply para modo claro y plus-lighter para modo oscuro, garantizando perfecta legibilidad. |
| Panel Lateral Deslizable de Detalles (`StationPanel.tsx`) | ✅ | Integra clics en mapa/tabla. Historial de 7 días con curvas Bézier SVG y coloración ICA individual. |
| Buscador Premium y Control de Acordeón General (`RegionTable.tsx` / `Dashboard.tsx`) | ✅ | Botón de desplegar/contraer regiones, buscador predictivo agrupado por región y minimización de tabla general. |
| Interfaz Beige Premium y Mapa Extendido | ✅ | Activación por defecto de tema beige claro cálido y mapa ensanchado a max-w-[1600px] para ocupar mayor espacio visual y equilibrar el diseño. Sincronización de mapa sin destellos. |
| Deploy público Vercel + post LinkedIn C-4 | 🔄 | PENDIENTE (Código listo para producción. Listo para desplegar). |

## Notas regulatorias

- **MP10:** Umbrales según D.S. N° 59/2000 (Norma Primaria de Calidad Ambiental).
- **MP2.5:** Umbrales basados en D.S. N° 13/2011 y estándares OMS 2021, dado que el D.S. 59/2000 no regula esta fracción.
- **Otros Gases:** Visualización complementaria de concentraciones de SO₂, NO₂, O₃ y CO reportados por estaciones oficiales.
- **Fuente de datos:** [api.openaq.org](https://docs.openaq.org/) (Extrae datos de SINCA y otros nodos globales). El ID de Chile en OpenAQ v3 es `3`.
- **Implementación OpenAQ:** Toda la lógica de obtención concurrente de "latest values" debe regirse por las instrucciones del archivo local `OPENAQ_V3_IMPLEMENTATION_GUIDE.md`.

---

*Documento vivo. Última actualización: Buscador premium agrupado por región y botón de desplegar/contraer todas las regiones integrados con éxito.*
