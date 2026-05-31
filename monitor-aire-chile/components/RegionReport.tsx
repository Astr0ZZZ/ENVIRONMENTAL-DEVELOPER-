'use client'

import { useState, useRef, useCallback, useMemo } from 'react'
import type { Station } from '@/types/openaq'
import {
    getICACategory,
    getWorstICACategory,
    COLOR_BUENO,
    COLOR_REGULAR,
    COLOR_ALERTA,
    COLOR_PREEMERGENCIA,
    COLOR_EMERGENCIA,
    COLOR_SINDATOS,
} from '@/constants/ica-thresholds'

interface RegionReportProps {
    stations: Station[]
    onClose: () => void
}

// â”€â”€â”€ Normativa legal chilena â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const LEGAL_LIMITS: Record<string, { value: number; decreto: string; label: string; unit: string }> = {
    pm25: { value: 50, decreto: 'DS N°12/2011 MMA', label: 'MP2,5 límite 24h', unit: 'µg/m³' },
    pm10: { value: 130, decreto: 'DS N°12/2021 MMA', label: 'MP10 límite 24h', unit: 'µg/m³' },
    so2: { value: 250, decreto: 'OMS / NCh', label: 'SOâ‚‚ referencia', unit: 'µg/m³' },
    no2: { value: 200, decreto: 'OMS / NCh', label: 'NOâ‚‚ referencia', unit: 'µg/m³' },
    o3: { value: 160, decreto: 'OMS / NCh', label: 'Oâ‚ƒ referencia', unit: 'µg/m³' },
    co: { value: 10, decreto: 'OMS / NCh', label: 'CO referencia', unit: 'mg/m³' },
}

// Umbrales episodios críticos GEC (MP2.5 24h, µg/m³)
const GEC_THRESHOLDS = [
    { label: 'Emergencia', min: 170, color: COLOR_EMERGENCIA },
    { label: 'Preemergencia', min: 110, color: COLOR_PREEMERGENCIA },
    { label: 'Alerta', min: 80, color: COLOR_ALERTA },
]

const SEVERITY_ORDER = ['Bueno', 'Regular', 'Alerta', 'Preemergencia', 'Emergencia', 'Sin datos']

const ICA_COLORS: Record<string, string> = {
    Bueno: COLOR_BUENO,
    Regular: COLOR_REGULAR,
    Alerta: COLOR_ALERTA,
    Preemergencia: COLOR_PREEMERGENCIA,
    Emergencia: COLOR_EMERGENCIA,
    'Sin datos': COLOR_SINDATOS,
}

const POLLUTANTS = [
    { key: 'pm25', label: 'PM2.5', unit: 'µg/m³', isCO: false },
    { key: 'pm10', label: 'PM10', unit: 'µg/m³', isCO: false },
    { key: 'so2', label: 'SOâ‚‚', unit: 'µg/m³', isCO: false },
    { key: 'no2', label: 'NOâ‚‚', unit: 'µg/m³', isCO: false },
    { key: 'o3', label: 'Oâ‚ƒ', unit: 'µg/m³', isCO: false },
    { key: 'co', label: 'CO', unit: 'mg/m³', isCO: true },
] as const

// â”€â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function hasAnyData(s: Station): boolean {
    return POLLUTANTS.some(p => {
        const v = s[p.key as keyof Station]
        return typeof v === 'number' && v >= 0
    })
}

function getDisplayVal(val: number, key: string): number {
    return key === 'co' ? val / 1000 : val
}

function formatVal(val: number, key: string): string {
    const d = getDisplayVal(val, key)
    return d < 10 ? d.toFixed(2) : Math.round(d).toString()
}

function exceedsLegal(val: number, key: string): boolean {
    const limit = LEGAL_LIMITS[key]
    if (!limit) return false
    const display = getDisplayVal(val, key)
    return display > limit.value
}

function getGECLevel(pm25: number | null | undefined): string | null {
    if (typeof pm25 !== 'number' || pm25 < 0) return null
    for (const t of GEC_THRESHOLDS) {
        if (pm25 >= t.min) return t.label
    }
    return null
}

function getRegionGECLevel(stns: Station[]): string | null {
    let worst: string | null = null
    const order = ['Bueno', 'Regular', 'Alerta', 'Preemergencia', 'Emergencia']
    for (const s of stns) {
        const ica = getWorstICACategory(s)
        const lvl = ica?.categoria ?? null
        if (lvl && (!worst || order.indexOf(lvl) > order.indexOf(worst))) {
            worst = lvl
        }
    }
    return worst
}

function computeRegionStats(stns: Station[]) {
    const withData = stns.filter(hasAnyData)

    const categoryCounts: Record<string, number> = {
        Bueno: 0, Regular: 0, Alerta: 0, Preemergencia: 0, Emergencia: 0,
    }
    for (const s of withData) {
        const cat = getWorstICACategory(s)?.categoria
        if (cat && cat in categoryCounts) categoryCounts[cat]++
    }

    const pollutantStats = POLLUTANTS.map(p => {
        const vals = withData
            .map(s => s[p.key as keyof Station] as number | undefined | null)
            .filter((v): v is number => typeof v === 'number' && v >= 0)
        if (!vals.length) return { ...p, avg: null, max: null, min: null, count: 0 }
        const avg = vals.reduce((a, b) => a + b, 0) / vals.length
        return { ...p, avg, max: Math.max(...vals), min: Math.min(...vals), count: vals.length }
    }).filter(p => p.count > 0)

    // Communes grouping
    const communeMap = new Map<string, Station[]>()
    for (const s of withData) {
        if (!communeMap.has(s.locality)) communeMap.set(s.locality, [])
        communeMap.get(s.locality)!.push(s)
    }
    const communes = Array.from(communeMap.entries())
        .map(([name, stns]) => {
            const worst = stns.reduce<string>((w, s) => {
                const cat = getWorstICACategory(s)?.categoria ?? 'Sin datos'
                return SEVERITY_ORDER.indexOf(cat) > SEVERITY_ORDER.indexOf(w) ? cat : w
            }, 'Bueno')
            return { name, stations: stns, worstCategory: worst }
        })
        .sort((a, b) => SEVERITY_ORDER.indexOf(b.worstCategory) - SEVERITY_ORDER.indexOf(a.worstCategory))

    // Legal violations
    const violations: { station: string; locality: string; pollutant: string; value: number; decreto: string }[] = []
    for (const s of withData) {
        for (const p of POLLUTANTS) {
            const val = s[p.key as keyof Station] as number | undefined | null
            if (typeof val === 'number' && val >= 0 && exceedsLegal(val, p.key)) {
                violations.push({
                    station: s.nombre,
                    locality: s.locality,
                    pollutant: p.label,
                    value: val,
                    decreto: LEGAL_LIMITS[p.key].decreto,
                })
            }
        }
    }

    return { categoryCounts, pollutantStats, communes, violations, withData: withData.length, total: stns.length }
}

// â”€â”€â”€ SVG Components â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function DonutChart({ data, size = 96 }: { data: { label: string; count: number; color: string }[]; size?: number }) {
    const total = data.reduce((a, b) => a + b.count, 0)
    if (!total) return null
    const cx = size / 2, cy = size / 2
    const R = size * 0.4, r = size * 0.24
    let angle = -Math.PI / 2
    const segs = data.filter(d => d.count > 0).map(d => {
        const sweep = (d.count / total) * 2 * Math.PI
        const s = angle, e = angle + sweep
        angle = e
        const large = sweep > Math.PI ? 1 : 0
        const path = `M${cx + R * Math.cos(s)} ${cy + R * Math.sin(s)} A${R} ${R} 0 ${large} 1 ${cx + R * Math.cos(e)} ${cy + R * Math.sin(e)} L${cx + r * Math.cos(e)} ${cy + r * Math.sin(e)} A${r} ${r} 0 ${large} 0 ${cx + r * Math.cos(s)} ${cy + r * Math.sin(s)}Z`
        return { ...d, path }
    })
    return (
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
            {segs.map((s, i) => <path key={i} d={s.path} fill={s.color} opacity={0.92} />)}
            <text x={cx} y={cy - 5} textAnchor="middle" fontSize={11} fontWeight="800" fill="#1a1714">{total}</text>
            <text x={cx} y={cy + 8} textAnchor="middle" fontSize={6} fill="#8c8273">estaciones</text>
        </svg>
    )
}

function HorizontalBar({
    label, value, maxVal, color, legalLimit, legalLabel, unit, decreto
}: {
    label: string; value: number | null; maxVal: number; color: string
    legalLimit?: number; legalLabel?: string; unit: string; decreto?: string
}) {
    const W = 320, H = 28
    const barW = value !== null ? Math.max(4, (value / maxVal) * W) : 0
    const limitX = legalLimit ? Math.min((legalLimit / maxVal) * W, W) : null
    const exceeds = legalLimit && value !== null && value > legalLimit

    return (
        <div style={{ marginBottom: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: '#4a453c' }}>{label}</span>
                <span style={{ fontSize: 10, fontWeight: 800, color: color, fontVariantNumeric: 'tabular-nums' }}>
                    {value !== null ? `${value < 10 ? value.toFixed(2) : Math.round(value)} ${unit}` : '—'}
                    {exceeds && <span style={{ marginLeft: 4, fontSize: 8, background: COLOR_EMERGENCIA, color: '#fff', borderRadius: 3, padding: '1px 4px', fontWeight: 900 }}>↑ {decreto}</span>}
                </span>
            </div>
            <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: H }}>
                <rect x={0} y={8} width={W} height={12} rx={6} fill="#e4dec9" opacity={0.6} />
                {value !== null && <rect x={0} y={8} width={barW} height={12} rx={6} fill={color} opacity={0.85} />}
                {limitX !== null && (
                    <>
                        <line x1={limitX} y1={4} x2={limitX} y2={24} stroke="#FF2E54" strokeWidth={1.5} strokeDasharray="3,2" />
                        <text x={limitX + 3} y={5} fontSize={6} fill="#FF2E54" fontWeight={700}>{legalLabel}</text>
                    </>
                )}
            </svg>
        </div>
    )
}

// ─── Helper PDF ─────────────────────────────────────────────────────────────
function hexToRgb(hex: string): [number, number, number] {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
    return result
        ? [parseInt(result[1], 16), parseInt(result[2], 16), parseInt(result[3], 16)]
        : [100, 116, 139]
}

function drawSector(doc: any, cx: number, cy: number, r: number, startAngleDeg: number, endAngleDeg: number, color: [number, number, number]) {
    doc.setFillColor(color[0], color[1], color[2])
    doc.moveTo(cx, cy)
    const startRad = startAngleDeg * Math.PI / 180
    const endRad = endAngleDeg * Math.PI / 180
    
    const step = 2
    for (let a = startAngleDeg; a <= endAngleDeg; a += step) {
        const rad = a * Math.PI / 180
        const x = cx + r * Math.cos(rad)
        const y = cy + r * Math.sin(rad)
        doc.lineTo(x, y)
    }
    const lastX = cx + r * Math.cos(endRad)
    const lastY = cy + r * Math.sin(endRad)
    doc.lineTo(lastX, lastY)
    doc.lineTo(cx, cy)
    doc.fill()
}

// ─── Main Component ───────────────────────────────────────────────────────────
export function RegionReport({ stations, onClose }: RegionReportProps) {
    const [selectedRegion, setSelectedRegion] = useState('')
    const [isGenerating, setIsGenerating] = useState(false)
    const [progress, setProgress] = useState(0)
    const reportRef = useRef<HTMLDivElement>(null)

    const regions = Array.from(new Set(stations.map(s => s.region))).sort()
    const regionStations = selectedRegion ? stations.filter(s => s.region === selectedRegion) : []
    const stats = selectedRegion ? computeRegionStats(regionStations) : null
    const gecLevel = selectedRegion ? getRegionGECLevel(regionStations.filter(hasAnyData)) : null

    const severityOrder = useMemo(() => ['Bueno', 'Regular', 'Alerta', 'Preemergencia', 'Emergencia'], [])
    const activeRegionStations = useMemo(() => regionStations.filter(hasAnyData), [regionStations])
    const sortedStationsData = useMemo(() => {
        return activeRegionStations.map(s => {
            const worstCat = getWorstICACategory(s)
            const catLabel = worstCat?.categoria ?? 'Sin datos'
            
            const gases: string[] = []
            if (typeof s.so2 === 'number' && s.so2 >= 0) gases.push(`SO₂: ${Math.round(s.so2)}`)
            if (typeof s.no2 === 'number' && s.no2 >= 0) gases.push(`NO₂: ${Math.round(s.no2)}`)
            if (typeof s.o3 === 'number' && s.o3 >= 0) gases.push(`O₃: ${Math.round(s.o3)}`)
            if (typeof s.co === 'number' && s.co >= 0) gases.push(`CO: ${(s.co / 1000).toFixed(1)}`)
            const gasesStr = gases.length > 0 ? gases.join(', ') : '—'

            return {
                station: s.nombre,
                locality: s.locality,
                catLabel,
                pm25: typeof s.pm25 === 'number' ? `${Math.round(s.pm25)} µg/m³` : '—',
                pm10: typeof s.pm10 === 'number' ? `${Math.round(s.pm10)} µg/m³` : '—',
                gasesStr,
                pm25Val: s.pm25,
                pm10Val: s.pm10,
            }
        }).sort((a, b) => {
            return severityOrder.indexOf(b.catLabel) - severityOrder.indexOf(a.catLabel)
        })
    }, [activeRegionStations, severityOrder])

    const now = new Date().toLocaleString('es-CL', {
        day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit'
    })
    const dateOnly = new Date().toLocaleDateString('es-CL', { day: '2-digit', month: 'long', year: 'numeric' })

    const handleGeneratePDF = useCallback(async () => {
        if (!selectedRegion || !stats) return
        setIsGenerating(true)
        setProgress(10)
        try {
            const { jsPDF } = await import('jspdf')
            const autoTable = (await import('jspdf-autotable')).default
            setProgress(25)

            const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
            const pageW = (doc.internal.pageSize as any).getWidth()
            const pageH = (doc.internal.pageSize as any).getHeight()
            const mL = 14, mR = 14
            const cW = pageW - mL - mR
            const FOOTER_H = 30
            let y = 14;

            // Monkey-patch doc.addPage to automatically paint the beige background
            const originalAddPage = doc.addPage
            doc.addPage = function(...args) {
                const res = originalAddPage.apply(this, args)
                doc.setFillColor(250, 248, 242)
                doc.rect(0, 0, pageW, pageH, 'F')
                return res
            }

            // Paint background of the first page
            doc.setFillColor(250, 248, 242)
            doc.rect(0, 0, pageW, pageH, 'F')

            const checkPage = (needed: number) => {
                if (y + needed > pageH - FOOTER_H) {
                    doc.addPage()
                    y = 14
                }
            }

            // ── HEADER ────────────────────────────────────────────────────────────
            doc.setFillColor(0, 229, 163)
            doc.rect(mL, y, cW, 0.8, 'F')
            y += 4

            doc.setFont('helvetica', 'bold')
            doc.setFontSize(7)
            doc.setTextColor(0, 229, 163)
            doc.text('RED NACIONAL DE MONITOREO OFICIAL · SINCA/MMA · OPENAQ v3', mL, y)
            y += 6

            doc.setFontSize(18)
            doc.setTextColor(26, 23, 20)
            doc.text('Informe de Calidad del Aire', mL, y)
            y += 7

            doc.setFontSize(12)
            doc.setTextColor(0, 229, 163)
            doc.text(selectedRegion, mL, y)
            y += 5

            doc.setFontSize(7)
            doc.setTextColor(140, 130, 115)
            doc.text(dateOnly, mL, y)

            // Badge Estimación ICA (esquina superior derecha en tarjeta redondeada)
            if (gecLevel) {
                const [br, bg, bb] = hexToRgb(ICA_COLORS[gecLevel] ?? '#64748b')
                doc.setFillColor(br, bg, bb)
                doc.roundedRect(pageW - mR - 36, 14, 36, 15, 2, 2, 'F')
                doc.setFont('helvetica', 'bold')
                doc.setFontSize(6)
                doc.setTextColor(255, 255, 255)
                doc.text('ESTIMACION ICA', pageW - mR - 18, 21, { align: 'center' })
                doc.setFontSize(10)
                doc.text(gecLevel.toUpperCase(), pageW - mR - 18, 27, { align: 'center' })
            }

            y += 5
            doc.setFont('helvetica', 'normal')
            doc.setFontSize(7)
            doc.setTextColor(140, 130, 115)
            doc.text(`${stats.withData} estaciones con datos · ${stats.total - stats.withData} sin datos (excluidas)`, pageW - mR, y, { align: 'right' })
            y += 5

            doc.setDrawColor(212, 206, 190)
            doc.setLineWidth(0.3)
            doc.line(mL, y, pageW - mR, y)
            y += 8

            // ── ALERTA TÉCNICA ICA BANNER ──────────────────────────────────────────
            if (gecLevel && ['Alerta', 'Preemergencia', 'Emergencia'].includes(gecLevel)) {
                const bannerH = 15
                checkPage(bannerH + 4)
                
                const bannerBgRGB: Record<string, [number, number, number]> = {
                    Alerta: [255, 242, 230],
                    Preemergencia: [255, 235, 238],
                    Emergencia: [246, 235, 249],
                }
                const bannerBorderRGB: Record<string, [number, number, number]> = {
                    Alerta: [255, 180, 120],
                    Preemergencia: [255, 150, 170],
                    Emergencia: [210, 150, 225],
                }
                
                const [bgR, bgG, bgB] = bannerBgRGB[gecLevel] ?? [240, 240, 240]
                const [bdR, bdG, bdB] = bannerBorderRGB[gecLevel] ?? [200, 200, 200]
                
                doc.setFillColor(bgR, bgG, bgB)
                doc.setDrawColor(bdR, bdG, bdB)
                doc.setLineWidth(0.3)
                doc.roundedRect(mL, y, cW, bannerH, 2, 2, 'FD')
                
                const txtColor = ICA_COLORS[gecLevel]
                const [tr, tg, tb] = hexToRgb(txtColor)
                
                doc.setFont('helvetica', 'bold')
                doc.setFontSize(7)
                doc.setTextColor(tr, tg, tb)
                doc.text(`ALERTA TECNICA ICA - ${gecLevel} (estimacion sensor):`, mL + 4, y + 4.5)
                
                doc.setFont('helvetica', 'normal')
                doc.setFontSize(6)
                doc.setTextColor(74, 69, 60)
                
                let text = ''
                if (gecLevel === 'Emergencia') {
                    text = 'Situacion de extremo riesgo para la salud publica. (Umbral sensor ICA: PM2.5 > 45 ug/m3 o PM10 > 200 ug/m3; umbral GEC oficial: PM2.5 >= 170 ug/m3 o PM10 >= 330 ug/m3). Estimacion tecnica - no equivale a declaracion oficial de GEC.'
                } else if (gecLevel === 'Preemergencia') {
                    text = 'Nivel de contaminacion severa. (Umbral sensor ICA: PM2.5 36-45 ug/m3 o PM10 151-200 ug/m3; umbral GEC oficial: PM2.5 110-169 ug/m3 o PM10 240-329 ug/m3). Estimacion tecnica - no equivale a declaracion oficial de GEC.'
                } else if (gecLevel === 'Alerta') {
                    text = 'Nivel inicial de resguardo preventivo. (Umbral sensor ICA: PM2.5 26-35 ug/m3 o PM10 101-150 ug/m3; umbral GEC oficial: PM2.5 80-109 ug/m3 o PM10 195-239 ug/m3). Estimacion tecnica - no equivale a declaracion oficial de GEC.'
                }
                
                const splitText = doc.splitTextToSize(text, cW - 8)
                doc.text(splitText, mL + 4, y + 8)
                y += bannerH + 6
            }
            setProgress(35)

            // ── SECCIÓN: Distribución por Categoría ICA ──
            checkPage(42)
            doc.setFont('helvetica', 'bold')
            doc.setFontSize(8)
            doc.setTextColor(140, 130, 115)
            doc.text('DISTRIBUCIÓN POR CATEGORÍA ICA', mL, y)
            y += 5

            const catOrder = ['Bueno', 'Regular', 'Alerta', 'Preemergencia', 'Emergencia']
            const catRGB: Record<string, [number, number, number]> = {
                Bueno: [0, 229, 163], Regular: [255, 211, 0], Alerta: [255, 122, 0],
                Preemergencia: [255, 46, 84], Emergencia: [163, 44, 196],
            }
            const totalEstaciones = stats.withData
            if (totalEstaciones > 0) {
                const cardH = 34
                doc.setFillColor(255, 255, 255)
                doc.setDrawColor(212, 206, 190)
                doc.setLineWidth(0.3)
                doc.roundedRect(mL, y, cW, cardH, 3, 3, 'FD')

                const dcx = mL + 24
                const dcy = y + 17
                const dR = 12
                const drInner = 7.5
                let currentAngle = -90

                catOrder.forEach(cat => {
                    const count = stats.categoryCounts[cat] ?? 0
                    if (count === 0) return
                    const sweep = (count / totalEstaciones) * 360
                    const rgb = catRGB[cat]
                    drawSector(doc, dcx, dcy, dR, currentAngle, currentAngle + sweep, rgb)
                    currentAngle += sweep
                })

                doc.setFillColor(255, 255, 255)
                doc.circle(dcx, dcy, drInner, 'F')

                doc.setFont('helvetica', 'bold')
                doc.setFontSize(10)
                doc.setTextColor(26, 23, 20)
                doc.text(String(totalEstaciones), dcx, dcy - 0.5, { align: 'center' })
                doc.setFontSize(5)
                doc.setTextColor(140, 130, 115)
                doc.text('estaciones', dcx, dcy + 3.5, { align: 'center' })

                const legX = dcx + 20
                let legY = y + 6
                catOrder.forEach(cat => {
                    const count = stats.categoryCounts[cat] ?? 0
                    if (count === 0) return
                    const [cr, cg, cb] = catRGB[cat]
                    
                    doc.setFillColor(cr, cg, cb)
                    doc.circle(legX, legY - 1, 1.3, 'F')

                    doc.setFont('helvetica', 'bold')
                    doc.setFontSize(7)
                    doc.setTextColor(26, 23, 20)
                    doc.text(`${cat}:`, legX + 4, legY)

                    doc.setFont('helvetica', 'normal')
                    doc.setFontSize(7)
                    doc.setTextColor(74, 69, 60)
                    doc.text(`${count} ${count === 1 ? 'estacion' : 'estaciones'} (${Math.round((count / totalEstaciones) * 100)}%)`, legX + 22, legY)
                    legY += 5.5
                })

                y += cardH + 6
            }
            setProgress(50)

            // ── SECCIÓN: Gráfico comparativo vectorial ──
            const pollData = stats.pollutantStats.filter(p => p.avg !== null)
            if (pollData.length > 0) {
                checkPage(24 + pollData.length * 12)
                doc.setFont('helvetica', 'bold')
                doc.setFontSize(8)
                doc.setTextColor(140, 130, 115)
                doc.text('CONCENTRACIÓN PROMEDIO POR CONTAMINANTE vs. LÍMITE NORMATIVO', mL, y)
                y += 5

                const cardH = pollData.length * 12 + 8
                doc.setFillColor(255, 255, 255)
                doc.setDrawColor(212, 206, 190)
                doc.setLineWidth(0.3)
                doc.roundedRect(mL, y, cW, cardH, 3, 3, 'FD')

                let cardY = y + 4
                const CEILING: Record<string, number> = {
                    pm25: 150, pm10: 300, so2: 750, no2: 1200, o3: 600, co: 60,
                }
                const BAR_H = 5, GAP = 7, LBL = 16
                const bMaxW = cW - LBL - 28

                pollData.forEach(p => {
                    if (p.avg === null) return
                    const isC = p.key === 'co'
                    const dAvg = isC ? p.avg / 1000 : p.avg
                    const dCeil = CEILING[p.key] ?? Math.max(dAvg * 2, 1)
                    const dLimit = LEGAL_LIMITS[p.key]?.value ?? dCeil
                    const unit = isC ? 'mg/m³' : 'µg/m³'

                    const bW = Math.max(1, Math.min((dAvg / dCeil) * bMaxW, bMaxW))
                    const limX = Math.min((dLimit / dCeil) * bMaxW, bMaxW)

                    const cleanLabel = p.label.replace('₂', '2').replace('₃', '3')
                    doc.setFont('helvetica', 'bold')
                    doc.setFontSize(6.5)
                    doc.setTextColor(74, 69, 60)
                    doc.text(cleanLabel, mL + 4, cardY + BAR_H - 1)

                    doc.setFillColor(228, 222, 201)
                    doc.roundedRect(mL + LBL + 4, cardY, bMaxW, BAR_H, 1.5, 1.5, 'F')

                    const ica = getICACategory(p.avg ?? 0, p.key as any)
                    const [ir, ig, ib] = hexToRgb(ica.color)
                    doc.setFillColor(ir, ig, ib)
                    doc.roundedRect(mL + LBL + 4, cardY, bW, BAR_H, 1.5, 1.5, 'F')

                    doc.setDrawColor(255, 46, 84)
                    doc.setLineWidth(0.5)
                    if (typeof (doc as any).setLineDash === 'function') (doc as any).setLineDash([1.5, 1], 0)
                    doc.line(mL + LBL + 4 + limX, cardY - 1, mL + LBL + 4 + limX, cardY + BAR_H + 1)
                    if (typeof (doc as any).setLineDash === 'function') (doc as any).setLineDash([], 0)

                    doc.setFont('helvetica', 'bold')
                    doc.setFontSize(6)
                    doc.setTextColor(ir, ig, ib)
                    doc.text(`${dAvg < 10 ? dAvg.toFixed(2) : Math.round(dAvg)} ${unit}`, mL + LBL + 4 + bMaxW + 2, cardY + BAR_H - 1)
                    
                    cardY += BAR_H + GAP
                })

                y += cardH + 4
                doc.setFont('helvetica', 'italic')
                doc.setFontSize(5.5)
                doc.setTextColor(140, 130, 115)
                doc.text('Linea roja punteada = limite normativo 24h (DS vigente). Las barras que la superan indican posible superacion de norma.', mL, y)
                y += 8
            }

            // ── SECCIÓN: Análisis Comparativo y Clúster de Estaciones ──
            if (sortedStationsData.length > 0) {
                checkPage(25)
                doc.setFont('helvetica', 'bold')
                doc.setFontSize(8)
                doc.setTextColor(140, 130, 115)
                doc.text('DETALLE COMPARATIVO DE ESTACIONES EN LA REGIÓN', mL, y)
                y += 4

                autoTable(doc, {
                    startY: y,
                    head: [['Estación', 'Comuna', 'Estado ICA', 'MP2.5', 'MP10', 'Gases']],
                    body: sortedStationsData.map(d => [
                        d.station,
                        d.locality,
                        d.catLabel,
                        d.pm25,
                        d.pm10,
                        d.gasesStr.replace('₂', '2').replace('₃', '3')
                    ]),
                    theme: 'plain',
                    styles: { fontSize: 7, cellPadding: 2.5, font: 'helvetica', overflow: 'linebreak', lineColor: [212, 206, 190], lineWidth: 0.15 },
                    headStyles: { fillColor: [0, 229, 163], textColor: [26, 23, 20], fontStyle: 'bold', fontSize: 6.5 },
                    alternateRowStyles: { fillColor: [248, 247, 242] },
                    columnStyles: { 0: { cellWidth: 42 }, 1: { cellWidth: 26 }, 2: { fontStyle: 'bold', cellWidth: 26 }, 3: { cellWidth: 20 }, 4: { cellWidth: 20 }, 5: { cellWidth: 48 } },
                    margin: { left: mL, right: mR },
                    willDrawCell: (data: any) => {
                        if (data.section === 'body') {
                            if (data.column.index === 2) {
                                const val = data.cell.raw
                                const colorHex = ICA_COLORS[val] ?? COLOR_SINDATOS
                                const [r, g, b] = hexToRgb(colorHex)
                                data.cell.styles.textColor = [r, g, b]
                                data.cell.styles.fontStyle = 'bold'
                            }
                            if (data.column.index === 3) {
                                const valStr = data.cell.raw
                                if (valStr && valStr !== '—') {
                                    const num = parseFloat(valStr)
                                    if (!isNaN(num)) {
                                        const cat = getICACategory(num, 'pm25')
                                        const [r, g, b] = hexToRgb(cat.color)
                                        data.cell.styles.textColor = [r, g, b]
                                        data.cell.styles.fontStyle = 'bold'
                                    }
                                }
                            }
                            if (data.column.index === 4) {
                                const valStr = data.cell.raw
                                if (valStr && valStr !== '—') {
                                    const num = parseFloat(valStr)
                                    if (!isNaN(num)) {
                                        const cat = getICACategory(num, 'pm10')
                                        const [r, g, b] = hexToRgb(cat.color)
                                        data.cell.styles.textColor = [r, g, b]
                                        data.cell.styles.fontStyle = 'bold'
                                    }
                                }
                            }
                        }
                    },
                    didDrawPage: () => { y = (doc as any).lastAutoTable?.finalY ?? y },
                })
                y = (doc as any).lastAutoTable?.finalY + 6
            }
            setProgress(68)

            // ── SECCIÓN: Tabla de superaciones normativas ──
            if (stats.violations.length > 0) {
                checkPage(20)
                doc.setFont('helvetica', 'bold')
                doc.setFontSize(8)
                doc.setTextColor(140, 130, 115)
                doc.text(`SUPERACIONES NORMATIVA VIGENTE (${stats.violations.length})`, mL, y)
                y += 4

                autoTable(doc, {
                    startY: y,
                    head: [['Estación', 'Comuna', 'Parámetro', 'Valor medido', 'Decreto']],
                    body: stats.violations.map(v => {
                        const dv = v.pollutant === 'CO'
                            ? (v.value / 1000).toFixed(2) + ' mg/m³'
                            : Math.round(v.value) + ' µg/m³'
                        return [v.station, v.locality, v.pollutant.replace('₂', '2').replace('₃', '3'), dv, v.decreto]
                    }),
                    theme: 'plain',
                    styles: { fontSize: 7, cellPadding: 2.5, font: 'helvetica', overflow: 'linebreak', lineColor: [212, 206, 190], lineWidth: 0.15 },
                    headStyles: { fillColor: [255, 46, 84], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 6.5 },
                    alternateRowStyles: { fillColor: [255, 249, 249] },
                    columnStyles: {
                        0: { cellWidth: 44 },
                        1: { cellWidth: 32 },
                        2: { cellWidth: 22 },
                        3: { fontStyle: 'bold', textColor: [255, 46, 84], cellWidth: 30 },
                        4: { fontSize: 6, textColor: [140, 130, 115] },
                    },
                    margin: { left: mL, right: mR },
                    didDrawPage: () => { y = (doc as any).lastAutoTable?.finalY ?? y },
                })
                const finalY: number = (doc as any).lastAutoTable?.finalY ?? y
                y = finalY + 6
            }
            setProgress(85)

            // ── FOOTER (en cada página) ───────────────────────────────────────────
            const totalPages = (doc as any).getNumberOfPages()
            for (let pg = 1; pg <= totalPages; pg++) {
                doc.setPage(pg)
                const fY = pageH - 26
                doc.setDrawColor(212, 206, 190)
                doc.setLineWidth(0.3)
                doc.line(mL, fY, pageW - mR, fY)
                doc.setFont('helvetica', 'normal')
                doc.setFontSize(5.5)
                doc.setTextColor(140, 130, 115)
                doc.text([
                    'Fuente: SINCA / Ministerio del Medio Ambiente de Chile, via OpenAQ v3.',
                    'Normativa: DS N.12/2021 MMA (MP10) · DS N.12/2011 MMA (MP2.5) · Plan GEC segun PPDA vigente.',
                    'Limitacion: Datos de sensores - estimacion tecnica. No reemplaza informes de la SMA.',
                    'La categoria "Estimacion ICA" NO equivale a una declaracion oficial de GEC (resolucion administrativa).',
                    'Quemas RM: Prohibicion 365 dias desde 26/11/2026 (incluye hojas y escombros).',
                ], mL, fY + 4, { lineHeightFactor: 1.6 })
                doc.setFont('helvetica', 'bold')
                doc.setFontSize(5.5)
                doc.setTextColor(100, 116, 139)
                doc.text(`Pag. ${pg}/${totalPages} · Generado: ${now}`, pageW - mR, fY + 4, { align: 'right' })
            }

            setProgress(95)
            const safe = selectedRegion.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '')
            doc.save(`Informe_CalidadAire_${safe}_${new Date().toISOString().split('T')[0]}.pdf`)
            setProgress(100)
            setTimeout(() => { setIsGenerating(false); setProgress(0) }, 700)

        } catch (e) {
            console.error('[PDF Error]', e)
            alert(`Error generando PDF: ${e instanceof Error ? e.message : String(e)}`)
            setIsGenerating(false)
            setProgress(0)
        }
    }, [selectedRegion, stats, gecLevel, now, dateOnly])
    return (
        <div className="fixed inset-0 z-[10000] flex items-start justify-center overflow-y-auto bg-black/70 backdrop-blur-sm p-4 py-8">
            <div className="w-full max-w-2xl">

                {/* â”€â”€ Modal shell â”€â”€ */}
                <div className="rounded-2xl overflow-hidden shadow-2xl border border-[#d4cebe]/60 dark:border-slate-700">

                    {/* Header */}
                    <div className="bg-[#faf8f2] dark:bg-slate-900 px-6 py-5 flex items-center justify-between border-b border-[#d4cebe] dark:border-slate-800">
                        <div>
                            <div className="flex items-center gap-2 mb-1">
                                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-600 dark:text-emerald-400">
                                    SINCA / MMA · OpenAQ v3
                                </span>
                            </div>
                            <h2 className="text-lg font-black text-[#1a1714] dark:text-white">Informe de Calidad del Aire</h2>
                            <p className="text-xs text-[#8c8273] dark:text-slate-400 mt-0.5">
                                Genera un PDF con análisis regulatorio por región y comuna
                            </p>
                        </div>
                        <button onClick={onClose}
                            className="rounded-xl border border-[#d4cebe] dark:border-slate-700 bg-white/60 dark:bg-slate-800 p-2 text-[#6e685e] dark:text-slate-400 hover:text-[#2d2a24] dark:hover:text-white transition-colors">
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>

                    {/* Region selector */}
                    <div className="bg-white/60 dark:bg-slate-950/60 px-6 py-4 border-b border-[#d4cebe] dark:border-slate-800">
                        <label className="block text-[10px] font-bold uppercase tracking-widest text-[#8c8273] dark:text-slate-400 mb-2">
                            Seleccionar Región
                        </label>
                        <select value={selectedRegion} onChange={e => setSelectedRegion(e.target.value)}
                            className="w-full rounded-xl border border-[#d4cebe] dark:border-slate-700 bg-[#faf8f2] dark:bg-slate-900 px-4 py-3 text-sm font-semibold text-[#2d2a24] dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 cursor-pointer appearance-none transition-all">
                            <option value="">— Elige una región —</option>
                            {regions.map(r => <option key={r} value={r}>{r}</option>)}
                        </select>
                    </div>

                    {/* Empty state */}
                    {!selectedRegion && (
                        <div className="bg-[#faf8f2]/40 dark:bg-slate-950/40 px-6 py-14 text-center">
                            <div className="w-10 h-10 rounded-2xl bg-[#e4dec9]/60 dark:bg-slate-800 flex items-center justify-center mx-auto mb-3">
                                <svg className="h-5 w-5 text-[#8c8273]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                </svg>
                            </div>
                            <p className="text-sm text-[#8c8273] dark:text-slate-500 font-medium">
                                Selecciona una región para previsualizar el informe
                            </p>
                        </div>
                    )}

                    {/* â”€â”€ PDF Preview â”€â”€ */}
                    {selectedRegion && stats && (
                        <>
                            <div className="bg-white/40 dark:bg-slate-950/40 px-4 py-3 border-b border-[#d4cebe] dark:border-slate-800 flex items-center justify-between">
                                <span className="text-[10px] font-bold uppercase tracking-widest text-[#8c8273] dark:text-slate-500">
                                    Vista previa del informe
                                </span>
                                <span className="text-[10px] text-[#8c8273] dark:text-slate-500">
                                    {stats.withData} estaciones con datos · {stats.total - stats.withData} sin datos (excluidas)
                                </span>
                            </div>

                            {/* â•â• PRINTABLE REPORT â•â• */}
                            <div ref={reportRef} style={{
                                background: '#faf8f2', fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
                                color: '#2d2a24', padding: '32px 36px',
                            }}>

                                {/* â”€â”€ 1. Header â”€â”€ */}
                                <div style={{ borderBottom: '2.5px solid #00E5A3', paddingBottom: 18, marginBottom: 24 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                        <div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                                                <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#00E5A3' }} />
                                                <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', color: '#00E5A3', textTransform: 'uppercase' }}>
                                                    Red Nacional de Monitoreo Oficial · SINCA/MMA · OpenAQ v3
                                                </span>
                                            </div>
                                            <h1 style={{ fontSize: 22, fontWeight: 900, color: '#1a1714', margin: 0, lineHeight: 1.1 }}>
                                                Informe de Calidad del Aire
                                            </h1>
                                            <h2 style={{ fontSize: 15, fontWeight: 700, color: '#00E5A3', margin: '4px 0 0' }}>
                                                {selectedRegion}
                                            </h2>
                                            <p style={{ fontSize: 9, color: '#8c8273', margin: '6px 0 0' }}>{dateOnly}</p>
                                        </div>
                                        <div style={{ textAlign: 'right' }}>
                                            <div style={{
                                                background: gecLevel ? ICA_COLORS[gecLevel] : '#e4dec9',
                                                borderRadius: 10, padding: '8px 14px', display: 'inline-block'
                                            }}>
                                                <p style={{ fontSize: 8, fontWeight: 700, color: gecLevel ? '#fff' : '#8c8273', margin: 0, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                                                    Estimación ICA
                                                </p>
                                                <p style={{ fontSize: 14, fontWeight: 900, color: gecLevel ? '#fff' : '#4a453c', margin: '2px 0 0' }}>
                                                    {gecLevel ?? 'Normal'}
                                                </p>
                                            </div>
                                            <div style={{ marginTop: 8 }}>
                                                <p style={{ fontSize: 9, color: '#8c8273', margin: 0 }}>Estaciones con datos</p>
                                                <p style={{ fontSize: 22, fontWeight: 900, color: '#1a1714', margin: 0 }}>{stats.withData}</p>
                                                {stats.total - stats.withData > 0 && (
                                                    <p style={{ fontSize: 8, color: '#8c8273', margin: 0 }}>
                                                        +{stats.total - stats.withData} sin datos excluidas
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    {gecLevel && ['Alerta', 'Preemergencia', 'Emergencia'].includes(gecLevel) && (
                                        <div style={{
                                            marginTop: 14, borderRadius: 8, padding: '8px 12px',
                                            background: `${ICA_COLORS[gecLevel]}15`,
                                            border: `1.5px solid ${ICA_COLORS[gecLevel]}50`,
                                        }}>
                                            <p style={{ fontSize: 9, margin: 0, color: '#4a453c', lineHeight: 1.5 }}>
                                                <strong style={{ color: ICA_COLORS[gecLevel] }}>⚠️ Alerta Técnica ICA — {gecLevel} (estimación sensor):</strong>{' '}
                                                {gecLevel === 'Emergencia' && 'Situación de extremo riesgo para la salud pública. (Umbral sensor ICA: PM2.5 > 45 µg/m³ o PM10 > 200 µg/m³; umbral GEC oficial: PM2.5 ≥ 170 µg/m³ o PM10 ≥ 330 µg/m³). Estimación técnica — no equivale a declaración oficial de GEC.'}
                                                {gecLevel === 'Preemergencia' && 'Nivel de contaminación severa. (Umbral sensor ICA: PM2.5 36-45 µg/m³ o PM10 151-200 µg/m³; umbral GEC oficial: PM2.5 110-169 µg/m³ o PM10 240-329 µg/m³). Estimación técnica — no equivale a declaración oficial de GEC.'}
                                                {gecLevel === 'Alerta' && 'Nivel inicial de resguardo preventivo. (Umbral sensor ICA: PM2.5 26-35 µg/m³ o PM10 101-150 µg/m³; umbral GEC oficial: PM2.5 80-109 µg/m³ o PM10 195-239 µg/m³). Estimación técnica — no equivale a declaración oficial de GEC.'}
                                            </p>
                                        </div>
                                    )}
                                </div>

                                {/* â”€â”€ 2. Resumen ejecutivo â”€â”€ */}
                                <div style={{ marginBottom: 24 }}>
                                    <p style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#8c8273', marginBottom: 10 }}>
                                        Distribución por Categoría ICA
                                    </p>
                                    <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
                                        <DonutChart
                                            size={100}
                                            data={Object.entries(stats.categoryCounts)
                                                .filter(([, c]) => c > 0)
                                                .map(([label, count]) => ({ label, count, color: ICA_COLORS[label] ?? COLOR_SINDATOS }))}
                                        />
                                        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
                                            {Object.entries(stats.categoryCounts).filter(([, c]) => c > 0).map(([cat, count]) => (
                                                <div key={cat} style={{
                                                    borderRadius: 10, padding: '8px 10px',
                                                    background: `${ICA_COLORS[cat] ?? COLOR_SINDATOS}12`,
                                                    border: `1.5px solid ${ICA_COLORS[cat] ?? COLOR_SINDATOS}35`,
                                                }}>
                                                    <p style={{ fontSize: 8, fontWeight: 900, color: ICA_COLORS[cat] ?? COLOR_SINDATOS, textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0 }}>{cat}</p>
                                                    <p style={{ fontSize: 20, fontWeight: 900, color: '#1a1714', margin: '2px 0 0' }}>{count}</p>
                                                    <p style={{ fontSize: 8, color: '#8c8273', margin: 0 }}>{count === 1 ? 'estación' : 'estaciones'}</p>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>

                                {/* â”€â”€ 3. Contaminantes con límite legal â”€â”€ */}
                                <div style={{ marginBottom: 24 }}>
                                    <p style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#8c8273', marginBottom: 12 }}>
                                        Concentración Promedio por Contaminante
                                    </p>
                                    <div style={{ background: '#fff', borderRadius: 12, padding: '14px 16px', border: '1px solid #e4dec9' }}>
                                        {stats.pollutantStats.map(p => {
                                            const avg = p.avg !== null ? getDisplayVal(p.avg, p.key) : null
                                            const ica = avg !== null ? getICACategory(p.isCO ? avg * 1000 : avg, p.key as any) : null
                                            const limit = LEGAL_LIMITS[p.key]
                                            return (
                                                <HorizontalBar
                                                    key={p.key}
                                                    label={`${p.label} · Promedio ${p.count} estaciones`}
                                                    value={avg}
                                                    maxVal={limit.value * 1.8}
                                                    color={ica?.color ?? COLOR_SINDATOS}
                                                    legalLimit={limit.value}
                                                    legalLabel={`Límite ${limit.value}${p.unit}`}
                                                    unit={p.unit}
                                                    decreto={avg !== null && avg > limit.value ? limit.decreto : undefined}
                                                />
                                            )
                                        })}
                                        <p style={{ fontSize: 8, color: '#8c8273', margin: '10px 0 0', fontStyle: 'italic' }}>
                                            La línea roja punteada indica el límite normativo vigente para concentración de 24 horas.
                                        </p>
                                    </div>
                                </div>

                                {/* â”€â”€ 4. Agrupación por comuna â”€â”€ */}
                                <div style={{ marginBottom: 24 }}>
                                    <p style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#8c8273', marginBottom: 12 }}>
                                        Detalle por Comuna
                                    </p>
                                    {stats.communes.map(commune => {
                                        const color = ICA_COLORS[commune.worstCategory] ?? COLOR_SINDATOS
                                        return (
                                            <div key={commune.name} style={{
                                                marginBottom: 10, borderRadius: 12, overflow: 'hidden',
                                                border: `1.5px solid ${color}40`,
                                            }}>
                                                <div style={{
                                                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                                    padding: '8px 14px', background: `${color}12`,
                                                }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                        <div style={{ width: 10, height: 10, borderRadius: '50%', background: color, flexShrink: 0 }} />
                                                        <span style={{ fontSize: 12, fontWeight: 800, color: '#1a1714' }}>{commune.name}</span>
                                                        <span style={{ fontSize: 9, color: '#8c8273' }}>{commune.stations.length} {commune.stations.length === 1 ? 'estación' : 'estaciones'}</span>
                                                    </div>
                                                    <span style={{
                                                        fontSize: 9, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.06em',
                                                        background: color, color: ['Bueno', 'Regular'].includes(commune.worstCategory) ? '#1a1714' : '#fff',
                                                        borderRadius: 20, padding: '3px 10px',
                                                    }}>{commune.worstCategory}</span>
                                                </div>
                                                {commune.stations
                                                    .sort((a, b) => {
                                                        const ai = SEVERITY_ORDER.indexOf(getWorstICACategory(a)?.categoria ?? 'Sin datos')
                                                        const bi = SEVERITY_ORDER.indexOf(getWorstICACategory(b)?.categoria ?? 'Sin datos')
                                                        return bi - ai
                                                    })
                                                    .map(s => {
                                                        const worst = getWorstICACategory(s)
                                                        return (
                                                            <div key={s.id} style={{
                                                                display: 'flex', alignItems: 'center', gap: 8,
                                                                padding: '7px 14px', borderTop: '1px solid #e4dec9',
                                                                background: '#fff',
                                                            }}>
                                                                <div style={{ width: 7, height: 7, borderRadius: '50%', background: worst?.color ?? COLOR_SINDATOS, flexShrink: 0 }} />
                                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                                    <span style={{ fontSize: 10, fontWeight: 700, color: '#2d2a24' }}>{s.nombre}</span>
                                                                </div>
                                                                <div style={{ display: 'flex', gap: 4, flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                                                                    {POLLUTANTS.map(p => {
                                                                        const val = s[p.key as keyof Station] as number | undefined | null
                                                                        if (typeof val !== 'number' || val < 0) return null
                                                                        const ica = getICACategory(val, p.key as any)
                                                                        const display = getDisplayVal(val, p.key)
                                                                        const over = exceedsLegal(val, p.key)
                                                                        return (
                                                                            <div key={p.key} style={{
                                                                                background: ica.color,
                                                                                borderRadius: 5, padding: '2px 5px',
                                                                                display: 'flex', alignItems: 'center', gap: 3,
                                                                                outline: over ? '1.5px solid #FF2E54' : 'none',
                                                                                outlineOffset: 1,
                                                                            }}>
                                                                                <span style={{ fontSize: 7, color: ['Bueno', 'Regular'].includes(ica.categoria) ? '#1a1714' : '#fff', opacity: 0.8 }}>{p.label}</span>
                                                                                <span style={{ fontSize: 9, fontWeight: 900, color: ['Bueno', 'Regular'].includes(ica.categoria) ? '#1a1714' : '#fff', fontVariantNumeric: 'tabular-nums' }}>
                                                                                    {display < 10 ? display.toFixed(1) : Math.round(display)}
                                                                                </span>
                                                                            </div>
                                                                        )
                                                                    })}
                                                                </div>
                                                                {s.lastUpdated && (
                                                                    <span style={{ fontSize: 8, color: '#8c8273', flexShrink: 0, marginLeft: 4 }}>
                                                                        {new Date(s.lastUpdated).toLocaleString('es-CL', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        )
                                                    })}
                                            </div>
                                        )
                                    })}
                                </div>

                                {/* â”€â”€ 5. Tabla de alertas regulatorias â”€â”€ */}
                                {stats.violations.length > 0 && (
                                    <div style={{ marginBottom: 24 }}>
                                        <p style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#8c8273', marginBottom: 10 }}>
                                            Superaciones Normativa Vigente ({stats.violations.length})
                                        </p>
                                        <div style={{ borderRadius: 12, overflow: 'hidden', border: `1.5px solid ${COLOR_EMERGENCIA}40` }}>
                                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 9 }}>
                                                <thead>
                                                    <tr style={{ background: `${COLOR_EMERGENCIA}12` }}>
                                                        {['Estación', 'Comuna', 'Parámetro', 'Valor', 'Decreto'].map(h => (
                                                            <th key={h} style={{ padding: '7px 10px', textAlign: 'left', fontWeight: 800, color: '#4a453c', fontSize: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</th>
                                                        ))}
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {stats.violations.map((v, i) => {
                                                        const displayVal = v.pollutant === 'CO' ? (v.value / 1000).toFixed(2) + ' mg/m³' : Math.round(v.value) + ' µg/m³'
                                                        return (
                                                            <tr key={i} style={{ borderTop: '1px solid #fde8ea', background: i % 2 === 0 ? '#fff' : '#fff9f9' }}>
                                                                <td style={{ padding: '6px 10px', fontWeight: 700, color: '#2d2a24' }}>{v.station}</td>
                                                                <td style={{ padding: '6px 10px', color: '#6e685e' }}>{v.locality}</td>
                                                                <td style={{ padding: '6px 10px', fontWeight: 700, color: COLOR_ALERTA }}>{v.pollutant}</td>
                                                                <td style={{ padding: '6px 10px', fontWeight: 900, color: COLOR_EMERGENCIA, fontVariantNumeric: 'tabular-nums' }}>{displayVal}</td>
                                                                <td style={{ padding: '6px 10px', color: '#8c8273', fontSize: 8 }}>{v.decreto}</td>
                                                            </tr>
                                                        )
                                                    })}
                                                </tbody>
                                            </table>
                                        </div>
                                        <p style={{ fontSize: 8, color: '#8c8273', margin: '6px 0 0', fontStyle: 'italic' }}>
                                            Los valores destacados superan los límites de concentración de 24h establecidos en la normativa chilena vigente y directrices OMS.
                                        </p>
                                    </div>
                                )}

                                {/* â”€â”€ 6. Footer â”€â”€ */}
                                <div style={{ borderTop: '1px solid #d4cebe', paddingTop: 12, marginTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                                    <div>
                                        <p style={{ fontSize: 8, color: '#8c8273', margin: 0, lineHeight: 1.7 }}>
                                             <strong>Fuente:</strong> SINCA / Ministerio del Medio Ambiente de Chile, vía OpenAQ v3.<br />
                                             <strong>Normativa:</strong> DS N°12/2021 MMA (MP10) · DS N°12/2011 MMA (MP2.5) · Plan GEC segÃºn PPDA vigente.<br />
                                             <strong>Limitación:</strong> Datos de sensores para estimaciones técnicas. No reemplaza informes de la SMA (Superintendencia del Medio Ambiente).<br />
                                             <strong>GEC:</strong> La categoría «Estimación ICA» NO equivale a una declaración oficial de GEC emitida por resolución administrativa.<br />
                                             <strong>Quemas:</strong> Prohibición permanente 365 días en la RM desde el 26/11/2026 (incluye quema de hojas y escombros).
                                         </p>
                                    </div>
                                    <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 16 }}>
                                        <p style={{ fontSize: 8, color: '#8c8273', margin: 0 }}>Generado el</p>
                                        <p style={{ fontSize: 9, fontWeight: 700, color: '#4a453c', margin: '1px 0 0' }}>{now}</p>
                                    </div>
                                </div>

                            </div>
                            {/* â•â• END PRINTABLE â•â• */}

                            {/* Action bar */}
                            <div className="bg-[#faf8f2] dark:bg-slate-900 px-6 py-4 border-t border-[#d4cebe] dark:border-slate-800 flex items-center justify-between">
                                <div>
                                    {isGenerating && (
                                        <div className="flex items-center gap-2">
                                            <div className="h-1.5 w-40 bg-[#e4dec9] dark:bg-slate-800 rounded-full overflow-hidden">
                                                <div className="h-full bg-emerald-500 rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
                                            </div>
                                            <span className="text-xs text-[#8c8273] dark:text-slate-400 tabular-nums">{progress}%</span>
                                        </div>
                                    )}
                                    {!isGenerating && (
                                        <p className="text-xs text-[#8c8273] dark:text-slate-500">
                                            {stats.violations.length > 0
                                                ? `âš  ${stats.violations.length} superación${stats.violations.length > 1 ? 'es' : ''} normativa detectada${stats.violations.length > 1 ? 's' : ''}`
                                                : 'Sin superaciones normativas detectadas'}
                                        </p>
                                    )}
                                </div>
                                <button onClick={handleGeneratePDF} disabled={isGenerating}
                                    className="flex items-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 disabled:cursor-wait px-5 py-2.5 text-sm font-bold text-white transition-all shadow-lg shadow-emerald-600/20">
                                    {isGenerating ? (
                                        <><svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>Generandoâ€¦</>
                                    ) : (
                                        <><svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>Descargar PDF</>
                                    )}
                                </button>
                            </div>

                        </>
                    )}
                </div>
            </div>
        </div>
    )
}