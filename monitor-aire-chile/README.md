# Monitor Aire Chile

Plataforma de monitoreo de calidad del aire en Chile en tiempo real, basada en datos de la Red Nacional de Monitoreo SINCA/MMA a través de la API OpenAQ v3.

**Stack:** Next.js 15 · TypeScript · Tailwind CSS · Leaflet · Recharts  
**Datos:** [OpenAQ v3 API](https://docs.openaq.org/) (agrega estaciones oficiales SINCA)

---

## Limitaciones y Metodología

### Declaración de Limitaciones

> La aplicación utiliza datos de sensores (OpenAQ v3) para estimaciones técnicas.  
> **No reemplaza los informes de la Superintendencia del Medio Ambiente (SMA).**

Los datos mostrados provienen de estaciones de la Red SINCA del Ministerio del Medio Ambiente de Chile, accedidos vía OpenAQ v3. Pueden contener lecturas inconsistentes o períodos sin telemetría.

### Metodología de Promedios

> Los estados ambientales declarados en esta app se calculan mediante el **promedio móvil de 24 horas**, alineado con el **D.S. 12/2011 MMA**.

> ⚠️ *Nota técnica: Actualmente se utiliza el último valor puntual disponible por estación. La migración completa a promedio móvil de 24 horas (ring-buffer horario) está en desarrollo. Por esta razón, los estados mostrados se etiquetan como **"Estimación ICA"** y no como declaraciones oficiales de GEC.*

### Protocolo de Salud Escolar (MINEDUC)

> Durante **Preemergencia** y **Emergencia**, se prohíbe todo esfuerzo físico vigoroso.  
> Se debe reorientar la pedagogía a actividades de estabilidad y contenidos teóricos (según MINEDUC).

---

## Marco Normativo

| Parámetro | Decreto | Límite diario | Condición |
|---|---|---|---|
| **MP2.5** | D.S. N°12/2011 MMA (Acuerdo 32/2025) | 50 µg/m³ (P98) | Anual: 15 µg/m³ |
| **MP10** | D.S. N°12/2021 MMA | 130 µg/m³ (P98) | > 7 días/año |

**GEC (Gestión de Episodios Críticos):** Resolución administrativa del PPDA. No es una medida de sensor individual. Esta aplicación usa "Estimación ICA" para diferenciarlo claramente.

**Prohibición de quemas (RM):** Vigente 365 días al año desde el 26/11/2026 (incluye quema de hojas y escombros).

---

## Instalación y desarrollo

```bash
# Instalar dependencias
npm install

# Variables de entorno requeridas
cp .env.example .env
# Agregar OPENAQ_API_KEY en .env

# Servidor de desarrollo
npm run dev
```

---

## Arquitectura

- **`lib/openaq-server.ts`** — Motor de datos con caché persistente sliding-window (20 estaciones/request, TTL 15 min)
- **`constants/ica-thresholds.ts`** — Escala ICA (semáforo visual). Los umbrales son progresivos, no equivalen a límites legales diarios.
- **`components/RegionReport.tsx`** — Generador de informes PDF con jsPDF nativo + jspdf-autotable
- **`components/AirMap.tsx`** — Mapa interactivo con plumas de dispersión gaussiana y marcadores ICA

---

*Fuente de datos: SINCA / Ministerio del Medio Ambiente de Chile, vía OpenAQ v3 · [api.openaq.org](https://docs.openaq.org/)*
