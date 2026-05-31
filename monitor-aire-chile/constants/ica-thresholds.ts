import { ICAResult } from '@/types/openaq'

// ─── Marco normativo ─────────────────────────────────────────────────────────
// MP2.5: D.S. N°12/2011 MMA (Acuerdo 32/2025) — Límite anual: 15 µg/m³ | Límite diario (P98): 50 µg/m³
// MP10:  D.S. N°12/2021 MMA — Límite diario (P98): 130 µg/m³ (superado si P98 ≥ 130 o >7 días/año)
//
// IMPORTANTE: Los umbrales ICA de este archivo son una escala progresiva de categorías
// para monitoreo EDUCATIVO/INFORMATIVO (semáforo visual). NO son los límites legales diarios.
// Los límites legales de 24h (MP2.5=50, MP10=130) están en RegionReport.tsx → LEGAL_LIMITS.
//
// Regla de Oro del Dato (Manual Maestro §1.2):
// - Dato Puntual (Latest): Solo para monitoreo educativo. Prohibido para declarar alertas.
// - Promedio Móvil 24h: Obligatorio para declarar Alerta/Preemergencia/Emergencia.
//
// GEC (Gestión de Episodios Críticos): Es una resolución administrativa del PPDA.
// NO es una medida de sensor individual. Las etiquetas de esta app son "Estimación ICA".
// ─────────────────────────────────────────────────────────────────────────────


type Threshold = {
  max: number
  categoria: string
  color: string
  descripcion: string
}

// Colores refinados y elegantes para el semáforo de calidad de aire
export const COLOR_BUENO = '#00E5A3'           // Verde menta/esmeralda premium y radiante
export const COLOR_REGULAR = '#FFD300'         // Amarillo cálido dorado / miel de alta visibilidad
export const COLOR_ALERTA = '#FF7A00'          // Naranja vibrante
export const COLOR_PREEMERGENCIA = '#FF2E54'   // Rojo carmín / rosa oscuro
export const COLOR_EMERGENCIA = '#A32CC4'      // Púrpura / magenta real
export const COLOR_SINDATOS = '#64748b'        // Slate / sin datos

export function getContrastTextColor(color: string): string {
  if (color === COLOR_BUENO || color === COLOR_REGULAR) {
    return 'text-slate-950'
  }
  return 'text-white'
}


const THRESHOLDS_PM10: Threshold[] = [
  { max: 50, categoria: 'Bueno', color: COLOR_BUENO, descripcion: 'Calidad de aire satisfactoria' },
  { max: 100, categoria: 'Regular', color: COLOR_REGULAR, descripcion: 'Aceptable, sensible a personas con enfermedades respiratorias' },
  { max: 150, categoria: 'Alerta', color: COLOR_ALERTA, descripcion: 'Insalubre para grupos sensibles' },
  { max: 200, categoria: 'Preemergencia', color: COLOR_PREEMERGENCIA, descripcion: 'Insalubre para todos' },
  { max: Infinity, categoria: 'Emergencia', color: COLOR_EMERGENCIA, descripcion: 'Condiciones de emergencia extrema' },
]

const THRESHOLDS_PM25: Threshold[] = [
  { max: 12, categoria: 'Bueno', color: COLOR_BUENO, descripcion: 'Calidad de aire satisfactoria' },
  { max: 25, categoria: 'Regular', color: COLOR_REGULAR, descripcion: 'Aceptable, sensible a personas con enfermedades respiratorias' },
  { max: 35, categoria: 'Alerta', color: COLOR_ALERTA, descripcion: 'Insalubre para grupos sensibles' },
  { max: 45, categoria: 'Preemergencia', color: COLOR_PREEMERGENCIA, descripcion: 'Insalubre para todos' },
  { max: Infinity, categoria: 'Emergencia', color: COLOR_EMERGENCIA, descripcion: 'Condiciones de emergencia extrema' },
]

const THRESHOLDS_SO2: Threshold[] = [
  { max: 80, categoria: 'Bueno', color: COLOR_BUENO, descripcion: 'Calidad de aire satisfactoria' },
  { max: 250, categoria: 'Regular', color: COLOR_REGULAR, descripcion: 'Aceptable para la población general' },
  { max: 500, categoria: 'Alerta', color: COLOR_ALERTA, descripcion: 'Insalubre para personas con asma o afecciones cardíacas' },
  { max: 1000, categoria: 'Preemergencia', color: COLOR_PREEMERGENCIA, descripcion: 'Efectos adversos notables en la salud general' },
  { max: Infinity, categoria: 'Emergencia', color: COLOR_EMERGENCIA, descripcion: 'Condiciones críticas por dióxido de azufre' },
]

const THRESHOLDS_NO2: Threshold[] = [
  { max: 100, categoria: 'Bueno', color: COLOR_BUENO, descripcion: 'Calidad de aire satisfactoria' },
  { max: 300, categoria: 'Regular', color: COLOR_REGULAR, descripcion: 'Aceptable para la población general' },
  { max: 600, categoria: 'Alerta', color: COLOR_ALERTA, descripcion: 'Insalubre para grupos vulnerables' },
  { max: 1000, categoria: 'Preemergencia', color: COLOR_PREEMERGENCIA, descripcion: 'Insalubre para toda la población' },
  { max: Infinity, categoria: 'Emergencia', color: COLOR_EMERGENCIA, descripcion: 'Alerta sanitaria extrema por dióxido de nitrógeno' },
]

const THRESHOLDS_O3: Threshold[] = [
  { max: 110, categoria: 'Bueno', color: COLOR_BUENO, descripcion: 'Calidad de aire satisfactoria' },
  { max: 170, categoria: 'Regular', color: COLOR_REGULAR, descripcion: 'Aceptable para la población general' },
  { max: 350, categoria: 'Alerta', color: COLOR_ALERTA, descripcion: 'Insalubre para grupos de riesgo (niños, deportistas)' },
  { max: 450, categoria: 'Preemergencia', color: COLOR_PREEMERGENCIA, descripcion: 'Insalubre para toda la población' },
  { max: Infinity, categoria: 'Emergencia', color: COLOR_EMERGENCIA, descripcion: 'Condiciones peligrosas por concentración de ozono' },
]

// CO expresado en microgramos por metro cúbico (µg/m³), equivalente a:
// Bueno: 9 mg/m³, Regular: 15 mg/m³, Alerta: 30 mg/m³, Preemergencia: 40 mg/m³
const THRESHOLDS_CO: Threshold[] = [
  { max: 9000, categoria: 'Bueno', color: COLOR_BUENO, descripcion: 'Calidad de aire satisfactoria' },
  { max: 15000, categoria: 'Regular', color: COLOR_REGULAR, descripcion: 'Aceptable para la población general' },
  { max: 30000, categoria: 'Alerta', color: COLOR_ALERTA, descripcion: 'Insalubre para personas con problemas cardiovasculares' },
  { max: 40000, categoria: 'Preemergencia', color: COLOR_PREEMERGENCIA, descripcion: 'Insalubre para toda la población' },
  { max: Infinity, categoria: 'Emergencia', color: COLOR_EMERGENCIA, descripcion: 'Condiciones de emergencia por monóxido de carbono' },
]

export function getICACategory(
  valor: number,
  parametro: 'pm10' | 'pm25' | 'so2' | 'no2' | 'o3' | 'co'
): ICAResult {
  let thresholds: Threshold[]
  switch (parametro) {
    case 'pm10': thresholds = THRESHOLDS_PM10; break
    case 'pm25': thresholds = THRESHOLDS_PM25; break
    case 'so2':  thresholds = THRESHOLDS_SO2; break
    case 'no2':  thresholds = THRESHOLDS_NO2; break
    case 'o3':   thresholds = THRESHOLDS_O3; break
    case 'co':   thresholds = THRESHOLDS_CO; break
  }

  for (const t of thresholds) {
    if (valor <= t.max) {
      return {
        valor,
        categoria: t.categoria,
        color: t.color,
        descripcion: t.descripcion,
      }
    }
  }

  const last = thresholds[thresholds.length - 1]
  return {
    valor,
    categoria: last.categoria,
    color: last.color,
    descripcion: last.descripcion,
  }
}

export function getWorstICACategory(station: any): ICAResult | null {
  const pollutants: ('pm25' | 'pm10' | 'so2' | 'no2' | 'o3' | 'co')[] = ['pm25', 'pm10', 'so2', 'no2', 'o3', 'co']
  let worstIca: ICAResult | null = null
  const order = ['Bueno', 'Regular', 'Alerta', 'Preemergencia', 'Emergencia']

  for (const p of pollutants) {
    const val = station[p]
    if (typeof val === 'number' && val >= 0) {
      const ica = getICACategory(val, p)
      if (!worstIca || order.indexOf(ica.categoria) > order.indexOf(worstIca.categoria)) {
        worstIca = {
          valor: ica.valor,
          categoria: ica.categoria,
          color: ica.color,
          descripcion: `Calidad de aire determinada por el peor contaminante registrado (${p.toUpperCase()})`
        }
      }
    }
  }
  return worstIca
}
