'use client'

import { useState, useRef, useCallback } from 'react'
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

const POLLUTANTS = [
    { key: 'pm25', label: 'PM2.5', unit: 'µg/m³', max: 150 },
    { key: 'pm10', label: 'PM10', unit: 'µg/m³', max: 300 },
    { key: 'so2', label: 'SO₂', unit: 'µg/m³', max: 500 },
    { key: 'no2', label: 'NO₂', unit: 'µg/m³', max: 400 },
    { key: 'o3', label: 'O₃', unit: 'µg/m³', max: 300 },
    { key: 'co', label: 'CO', unit: 'mg/m³', max: 15000, divisor: 1000, maxDisplay: 15 },
] as const

const SEVERITY_ORDER = ['Bueno', 'Regular', 'Alerta', 'Preemergencia', 'Emergencia', 'Sin datos']

const ICA_COLORS: Record<string, string> = {
    Bueno: COLOR_BUENO,
    Regular: COLOR_REGULAR,
    Alerta: COLOR_ALERTA,
    Preemergencia: COLOR_PREEMERGENCIA,
    Emergencia: COLOR_EMERGENCIA,
    'Sin datos': COLOR_SINDATOS,
}

function computeRegionStats(stns: Station[]) {
    const withData = stns.filter((s) => getWorstICACategory(s) !== null)
    const noData = stns.length - withData.length

    const categoryCounts: Record<string, number> = {
        Bueno: 0, Regular: 0, Alerta: 0, Preemergencia: 0, Emergencia: 0, 'Sin datos': noData,
    }

    for (const s of withData) {
        const cat = getWorstICACategory(s)?.categoria ?? 'Sin datos'
        categoryCounts[cat] = (categoryCounts[cat] ?? 0) + 1
    }

    const pollutantStats = POLLUTANTS.map((p) => {
        const vals = stns
            .map((s) => s[p.key as keyof Station] as number | undefined | null)
            .filter((v): v is number => typeof v === 'number' && v >= 0)
        if (vals.length === 0) return { ...p, avg: null, max: null, min: null, count: 0 }
        const avg = vals.reduce((a, b) => a + b, 0) / vals.length
        return {
            ...p,
            avg,
            max: Math.max(...vals),
            min: Math.min(...vals),
            count: vals.length,
        }
    })

    const worstStation = stns.reduce<Station | null>((worst, s) => {
        const cat = getWorstICACategory(s)?.categoria ?? 'Sin datos'
        const catIdx = SEVERITY_ORDER.indexOf(cat)
        const worstCat = worst ? (getWorstICACategory(worst)?.categoria ?? 'Sin datos') : 'Sin datos'
        const worstIdx = SEVERITY_ORDER.indexOf(worstCat)
        return catIdx > worstIdx ? s : worst
    }, null)

    return { categoryCounts, pollutantStats, worstStation, withData: withData.length, noData }
}

// Mini SVG bar chart for PDF preview
function BarChart({
    data,
    width = 280,
    height = 120,
}: {
    data: { label: string; value: number | null; unit: string; maxVal: number; color: string }[]
    width?: number
    height?: number
}) {
    const padding = { top: 10, right: 8, bottom: 32, left: 40 }
    const chartW = width - padding.left - padding.right
    const chartH = height - padding.top - padding.bottom
    const barW = Math.floor(chartW / data.length) - 4

    const maxVal = Math.max(...data.filter((d) => d.value !== null).map((d) => d.maxVal), 1)

    return (
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ overflow: 'visible' }}>
            {/* Y axis line */}
            <line
                x1={padding.left}
                y1={padding.top}
                x2={padding.left}
                y2={padding.top + chartH}
                stroke="#4a453c"
                strokeWidth={0.5}
                opacity={0.3}
            />
            {/* X axis line */}
            <line
                x1={padding.left}
                y1={padding.top + chartH}
                x2={padding.left + chartW}
                y2={padding.top + chartH}
                stroke="#4a453c"
                strokeWidth={0.5}
                opacity={0.3}
            />

            {data.map((d, i) => {
                const x = padding.left + i * (chartW / data.length) + 2
                const barHeight = d.value !== null ? Math.max(2, (d.value / d.maxVal) * chartH) : 0
                const y = padding.top + chartH - barHeight

                return (
                    <g key={d.label}>
                        {/* Bar */}
                        {d.value !== null && (
                            <rect
                                x={x}
                                y={y}
                                width={barW}
                                height={barHeight}
                                fill={d.color}
                                rx={2}
                                opacity={0.85}
                            />
                        )}
                        {d.value === null && (
                            <rect
                                x={x}
                                y={padding.top + chartH - 4}
                                width={barW}
                                height={4}
                                fill={COLOR_SINDATOS}
                                rx={2}
                                opacity={0.4}
                            />
                        )}
                        {/* Value label */}
                        {d.value !== null && (
                            <text
                                x={x + barW / 2}
                                y={y - 3}
                                textAnchor="middle"
                                fontSize={7}
                                fill={d.color}
                                fontWeight="700"
                            >
                                {d.value < 10 ? d.value.toFixed(1) : Math.round(d.value)}
                            </text>
                        )}
                        {/* X label */}
                        <text
                            x={x + barW / 2}
                            y={padding.top + chartH + 12}
                            textAnchor="middle"
                            fontSize={7.5}
                            fill="#6e685e"
                            fontWeight="600"
                        >
                            {d.label}
                        </text>
                    </g>
                )
            })}
        </svg>
    )
}

// Donut chart for category distribution
function DonutChart({
    data,
    size = 100,
}: {
    data: { label: string; count: number; color: string }[]
    size?: number
}) {
    const total = data.reduce((a, b) => a + b.count, 0)
    if (total === 0) return <div style={{ width: size, height: size }} className="flex items-center justify-center text-xs text-slate-500">Sin datos</div>

    const cx = size / 2
    const cy = size / 2
    const r = size * 0.38
    const innerR = size * 0.22
    let angle = -Math.PI / 2

    const segments = data
        .filter((d) => d.count > 0)
        .map((d) => {
            const sweep = (d.count / total) * 2 * Math.PI
            const startAngle = angle
            angle += sweep
            const endAngle = angle

            const x1 = cx + r * Math.cos(startAngle)
            const y1 = cy + r * Math.sin(startAngle)
            const x2 = cx + r * Math.cos(endAngle)
            const y2 = cy + r * Math.sin(endAngle)
            const ix1 = cx + innerR * Math.cos(startAngle)
            const iy1 = cy + innerR * Math.sin(startAngle)
            const ix2 = cx + innerR * Math.cos(endAngle)
            const iy2 = cy + innerR * Math.sin(endAngle)
            const largeArc = sweep > Math.PI ? 1 : 0

            return {
                ...d,
                path: `M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} L ${ix2} ${iy2} A ${innerR} ${innerR} 0 ${largeArc} 0 ${ix1} ${iy1} Z`,
                sweep,
            }
        })

    return (
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
            {segments.map((s, i) => (
                <path key={i} d={s.path} fill={s.color} opacity={0.9} />
            ))}
            <text x={cx} y={cy - 4} textAnchor="middle" fontSize={10} fontWeight="800" fill="#2d2a24">
                {total}
            </text>
            <text x={cx} y={cy + 8} textAnchor="middle" fontSize={6} fill="#6e685e">
                estaciones
            </text>
        </svg>
    )
}

export function RegionReport({ stations, onClose }: RegionReportProps) {
    const [selectedRegion, setSelectedRegion] = useState<string>('')
    const [isGenerating, setIsGenerating] = useState(false)
    const [progress, setProgress] = useState(0)
    const reportRef = useRef<HTMLDivElement>(null)

    const regions = Array.from(new Set(stations.map((s) => s.region))).sort()

    const regionStations = selectedRegion
        ? stations.filter((s) => s.region === selectedRegion)
        : []

    const stats = selectedRegion ? computeRegionStats(regionStations) : null

    const handleGeneratePDF = useCallback(async () => {
        if (!selectedRegion || !stats || !reportRef.current) return
        setIsGenerating(true)
        setProgress(10)

        try {
            // Dynamic imports to avoid SSR issues
            const [jsPDFModule, html2canvasModule] = await Promise.all([
                import('jspdf'),
                import('html2canvas'),
            ])
            const jsPDF = jsPDFModule.default
            const html2canvas = html2canvasModule.default

            setProgress(30)

            const canvas = await html2canvas(reportRef.current, {
                scale: 2,
                useCORS: true,
                backgroundColor: '#faf8f2',
                logging: false,
            })

            setProgress(70)

            const imgData = canvas.toDataURL('image/png')
            const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })

            const pageW = pdf.internal.pageSize.getWidth()
            const pageH = pdf.internal.pageSize.getHeight()
            const margin = 12
            const contentW = pageW - margin * 2

            // Scale image to fit page width
            const imgW = canvas.width
            const imgH = canvas.height
            const ratio = contentW / (imgW / (96 / 25.4))
            const scaledW = contentW
            const scaledH = (imgH / imgW) * scaledW

            // Paginate if content exceeds one page
            let yOffset = 0
            let page = 0

            while (yOffset < scaledH) {
                if (page > 0) pdf.addPage()
                pdf.addImage(imgData, 'PNG', margin, margin, scaledW, scaledH, '', 'FAST', 0)
                // Clip to page
                yOffset += pageH - margin * 2
                page++
                if (page > 20) break // safety
            }

            setProgress(90)

            const safeRegion = selectedRegion.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '')
            const dateStr = new Date().toISOString().split('T')[0]
            pdf.save(`Informe_CalidadAire_${safeRegion}_${dateStr}.pdf`)

            setProgress(100)
            setTimeout(() => {
                setIsGenerating(false)
                setProgress(0)
            }, 800)
        } catch (err) {
            console.error('PDF generation error:', err)
            setIsGenerating(false)
            setProgress(0)
        }
    }, [selectedRegion, stats])

    const now = new Date().toLocaleString('es-CL', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    })

    return (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 backdrop-blur-sm p-4">
            <div className="w-full max-w-3xl my-8">
                {/* Modal header */}
                <div className="rounded-t-2xl border border-[#d4cebe] dark:border-slate-700 bg-[#faf8f2] dark:bg-slate-900 px-6 py-5 flex items-center justify-between">
                    <div>
                        <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs font-bold uppercase tracking-widest text-emerald-600 dark:text-emerald-400">
                                Red Nacional de Monitoreo
                            </span>
                        </div>
                        <h2 className="text-xl font-black text-[#2d2a24] dark:text-white">
                            Informe de Calidad del Aire
                        </h2>
                        <p className="text-xs text-[#8c8273] dark:text-slate-400 mt-0.5">
                            Genera un informe PDF detallado por región con estadísticas y semáforos ICA
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className="rounded-xl border border-[#d4cebe] dark:border-slate-700 bg-white/60 dark:bg-slate-800 p-2.5 text-[#6e685e] dark:text-slate-400 hover:text-[#2d2a24] dark:hover:text-white transition-colors"
                    >
                        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Region selector */}
                <div className="border-x border-[#d4cebe] dark:border-slate-700 bg-white/80 dark:bg-slate-950/80 px-6 py-4">
                    <label className="block text-xs font-bold uppercase tracking-widest text-[#6e685e] dark:text-slate-400 mb-2">
                        Seleccionar Región
                    </label>
                    <select
                        value={selectedRegion}
                        onChange={(e) => setSelectedRegion(e.target.value)}
                        className="w-full rounded-xl border border-[#d4cebe] dark:border-slate-700 bg-[#faf8f2] dark:bg-slate-900 px-4 py-3 text-sm font-semibold text-[#2d2a24] dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all appearance-none cursor-pointer"
                    >
                        <option value="">— Elige una región —</option>
                        {regions.map((r) => (
                            <option key={r} value={r}>{r}</option>
                        ))}
                    </select>
                </div>

                {/* PDF Preview */}
                {selectedRegion && stats && (
                    <>
                        {/* Printable report content */}
                        <div
                            ref={reportRef}
                            className="border-x border-[#d4cebe] bg-[#faf8f2] px-8 py-8 text-[#2d2a24]"
                            style={{ fontFamily: 'system-ui, sans-serif' }}
                        >
                            {/* Report Header */}
                            <div className="flex items-start justify-between mb-6 pb-5 border-b-2 border-[#d4cebe]">
                                <div>
                                    <div className="flex items-center gap-2 mb-2">
                                        <div className="w-3 h-3 rounded-full bg-emerald-500" />
                                        <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-600">
                                            Red Nacional de Monitoreo Oficial · SINCA/MMA · OpenAQ v3
                                        </span>
                                    </div>
                                    <h1 className="text-2xl font-black text-[#1a1714] leading-tight">
                                        Informe de Calidad del Aire
                                    </h1>
                                    <h2 className="text-lg font-bold text-emerald-600 mt-0.5">
                                        {selectedRegion}
                                    </h2>
                                </div>
                                <div className="text-right">
                                    <p className="text-[10px] text-[#8c8273] font-medium">Generado el</p>
                                    <p className="text-xs font-bold text-[#4a453c]">{now}</p>
                                    <p className="text-[10px] text-[#8c8273] mt-2 font-medium">Total estaciones</p>
                                    <p className="text-2xl font-black text-[#1a1714]">{regionStations.length}</p>
                                </div>
                            </div>

                            {/* Summary cards */}
                            <div className="mb-6">
                                <h3 className="text-[11px] font-bold uppercase tracking-widest text-[#8c8273] mb-3">
                                    Distribución por Categoría ICA
                                </h3>
                                <div className="flex gap-4 items-center">
                                    <DonutChart
                                        size={110}
                                        data={Object.entries(stats.categoryCounts)
                                            .filter(([, count]) => count > 0)
                                            .map(([label, count]) => ({
                                                label,
                                                count,
                                                color: ICA_COLORS[label] ?? COLOR_SINDATOS,
                                            }))}
                                    />
                                    <div className="flex-1 grid grid-cols-3 gap-2">
                                        {Object.entries(stats.categoryCounts)
                                            .filter(([, count]) => count > 0)
                                            .map(([cat, count]) => (
                                                <div
                                                    key={cat}
                                                    className="rounded-lg px-3 py-2.5"
                                                    style={{ backgroundColor: `${ICA_COLORS[cat] ?? COLOR_SINDATOS}18`, border: `1.5px solid ${ICA_COLORS[cat] ?? COLOR_SINDATOS}40` }}
                                                >
                                                    <p
                                                        className="text-[9px] font-black uppercase tracking-wider"
                                                        style={{ color: ICA_COLORS[cat] ?? COLOR_SINDATOS }}
                                                    >
                                                        {cat}
                                                    </p>
                                                    <p className="text-xl font-black text-[#1a1714] mt-0.5">{count}</p>
                                                    <p className="text-[9px] text-[#8c8273]">
                                                        {count === 1 ? 'estación' : 'estaciones'}
                                                    </p>
                                                </div>
                                            ))}
                                    </div>
                                </div>
                            </div>

                            {/* Pollutant bar charts */}
                            <div className="mb-6">
                                <h3 className="text-[11px] font-bold uppercase tracking-widest text-[#8c8273] mb-3">
                                    Concentración Promedio por Contaminante
                                </h3>
                                <BarChart
                                    width={620}
                                    height={130}
                                    data={stats.pollutantStats.map((p) => {
                                        const avg = p.avg !== null
                                            ? (p.key === 'co' ? p.avg / 1000 : p.avg)
                                            : null
                                        const ica = avg !== null && avg >= 0
                                            ? getICACategory(p.key === 'co' ? avg * 1000 : avg, p.key as any)
                                            : null
                                        return {
                                            label: p.label,
                                            value: avg,
                                            unit: p.unit,
                                            maxVal: p.key === 'co' ? 15 : (p as any).max,
                                            color: ica?.color ?? COLOR_SINDATOS,
                                        }
                                    })}
                                />
                            </div>

                            {/* Pollutant stats table */}
                            <div className="mb-6">
                                <h3 className="text-[11px] font-bold uppercase tracking-widest text-[#8c8273] mb-3">
                                    Estadísticas Detalladas
                                </h3>
                                <table className="w-full text-xs border-collapse">
                                    <thead>
                                        <tr className="bg-[#e4dec9]/50">
                                            <th className="text-left px-3 py-2 font-bold text-[#6e685e] text-[10px] uppercase tracking-wider rounded-tl-lg">Contaminante</th>
                                            <th className="text-right px-3 py-2 font-bold text-[#6e685e] text-[10px] uppercase tracking-wider">Promedio</th>
                                            <th className="text-right px-3 py-2 font-bold text-[#6e685e] text-[10px] uppercase tracking-wider">Máximo</th>
                                            <th className="text-right px-3 py-2 font-bold text-[#6e685e] text-[10px] uppercase tracking-wider">Mínimo</th>
                                            <th className="text-center px-3 py-2 font-bold text-[#6e685e] text-[10px] uppercase tracking-wider">Estaciones</th>
                                            <th className="text-center px-3 py-2 font-bold text-[#6e685e] text-[10px] uppercase tracking-wider rounded-tr-lg">Estado</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {stats.pollutantStats.map((p, i) => {
                                            const isCO = p.key === 'co'
                                            const avg = p.avg !== null ? (isCO ? p.avg / 1000 : p.avg) : null
                                            const max = p.max !== null ? (isCO ? p.max / 1000 : p.max) : null
                                            const min = p.min !== null ? (isCO ? p.min / 1000 : p.min) : null
                                            const ica = avg !== null && avg >= 0
                                                ? getICACategory(isCO ? avg * 1000 : avg, p.key as any)
                                                : null
                                            return (
                                                <tr
                                                    key={p.key}
                                                    className={i % 2 === 0 ? 'bg-white/60' : 'bg-[#faf8f2]'}
                                                    style={{ borderBottom: '1px solid #e4dec9' }}
                                                >
                                                    <td className="px-3 py-2.5 font-bold text-[#2d2a24]">{p.label}</td>
                                                    <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-[#2d2a24]">
                                                        {avg !== null ? `${avg < 10 ? avg.toFixed(2) : avg.toFixed(1)} ${p.unit}` : '—'}
                                                    </td>
                                                    <td className="px-3 py-2.5 text-right tabular-nums text-[#4a453c]">
                                                        {max !== null ? `${max < 10 ? max.toFixed(2) : Math.round(max)} ${p.unit}` : '—'}
                                                    </td>
                                                    <td className="px-3 py-2.5 text-right tabular-nums text-[#4a453c]">
                                                        {min !== null ? `${min < 10 ? min.toFixed(2) : Math.round(min)} ${p.unit}` : '—'}
                                                    </td>
                                                    <td className="px-3 py-2.5 text-center text-[#6e685e]">{p.count}</td>
                                                    <td className="px-3 py-2.5 text-center">
                                                        {ica ? (
                                                            <span
                                                                className="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wide"
                                                                style={{
                                                                    backgroundColor: ica.color,
                                                                    color: ['Bueno', 'Regular'].includes(ica.categoria) ? '#1a1714' : '#fff',
                                                                }}
                                                            >
                                                                {ica.categoria}
                                                            </span>
                                                        ) : (
                                                            <span className="text-[#8c8273] text-[9px]">Sin datos</span>
                                                        )}
                                                    </td>
                                                </tr>
                                            )
                                        })}
                                    </tbody>
                                </table>
                            </div>

                            {/* Station list */}
                            <div className="mb-4">
                                <h3 className="text-[11px] font-bold uppercase tracking-widest text-[#8c8273] mb-3">
                                    Detalle de Estaciones ({regionStations.length})
                                </h3>
                                <div className="space-y-1.5">
                                    {regionStations
                                        .sort((a, b) => {
                                            const ai = SEVERITY_ORDER.indexOf(getWorstICACategory(a)?.categoria ?? 'Sin datos')
                                            const bi = SEVERITY_ORDER.indexOf(getWorstICACategory(b)?.categoria ?? 'Sin datos')
                                            return bi - ai
                                        })
                                        .map((s) => {
                                            const worst = getWorstICACategory(s)
                                            return (
                                                <div
                                                    key={s.id}
                                                    className="flex items-center gap-3 rounded-lg px-3 py-2"
                                                    style={{
                                                        backgroundColor: worst ? `${worst.color}10` : '#f0ede6',
                                                        border: `1px solid ${worst ? worst.color + '30' : '#d4cebe'}`,
                                                    }}
                                                >
                                                    <div
                                                        className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                                                        style={{ backgroundColor: worst?.color ?? COLOR_SINDATOS }}
                                                    />
                                                    <div className="flex-1 min-w-0">
                                                        <span className="text-xs font-bold text-[#2d2a24] truncate">{s.nombre}</span>
                                                        <span className="text-[10px] text-[#8c8273] ml-1.5">{s.locality}</span>
                                                    </div>
                                                    <div className="flex items-center gap-2 flex-shrink-0 text-[10px]">
                                                        {(['pm25', 'pm10', 'so2', 'no2', 'o3', 'co'] as const).map((pk) => {
                                                            const val = s[pk]
                                                            if (typeof val !== 'number' || val < 0) return null
                                                            const ica = getICACategory(val, pk)
                                                            const display = pk === 'co' ? (val / 1000).toFixed(1) : Math.round(val)
                                                            return (
                                                                <span
                                                                    key={pk}
                                                                    className="px-1.5 py-0.5 rounded font-black tabular-nums"
                                                                    style={{
                                                                        backgroundColor: ica.color,
                                                                        color: ['Bueno', 'Regular'].includes(ica.categoria) ? '#1a1714' : '#fff',
                                                                        fontSize: '9px',
                                                                    }}
                                                                >
                                                                    {display}
                                                                </span>
                                                            )
                                                        })}
                                                    </div>
                                                    {worst && (
                                                        <span
                                                            className="text-[9px] font-black uppercase px-2 py-0.5 rounded-full flex-shrink-0"
                                                            style={{
                                                                backgroundColor: worst.color,
                                                                color: ['Bueno', 'Regular'].includes(worst.categoria) ? '#1a1714' : '#fff',
                                                            }}
                                                        >
                                                            {worst.categoria}
                                                        </span>
                                                    )}
                                                </div>
                                            )
                                        })}
                                </div>
                            </div>

                            {/* Footer */}
                            <div className="mt-6 pt-4 border-t border-[#d4cebe] flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <div className="w-2 h-2 rounded-full bg-emerald-500" />
                                    <span className="text-[9px] text-[#8c8273] font-medium">
                                        Sistema de Monitoreo Calidad del Aire en Chile · Datos: SINCA/MMA vía OpenAQ v3
                                    </span>
                                </div>
                                <span className="text-[9px] text-[#8c8273]">
                                    Generado: {now}
                                </span>
                            </div>
                        </div>

                        {/* Action bar */}
                        <div className="rounded-b-2xl border border-[#d4cebe] dark:border-slate-700 bg-[#faf8f2] dark:bg-slate-900 px-6 py-4 flex items-center justify-between">
                            <p className="text-xs text-[#8c8273] dark:text-slate-500">
                                Vista previa del informe · Se exportará como PDF
                            </p>
                            <button
                                onClick={handleGeneratePDF}
                                disabled={isGenerating}
                                className="flex items-center gap-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 disabled:cursor-wait px-5 py-2.5 text-sm font-bold text-white transition-all shadow-lg shadow-emerald-600/20"
                            >
                                {isGenerating ? (
                                    <>
                                        <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                        </svg>
                                        Generando… {progress}%
                                    </>
                                ) : (
                                    <>
                                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                        </svg>
                                        Descargar PDF
                                    </>
                                )}
                            </button>
                        </div>
                    </>
                )}

                {!selectedRegion && (
                    <div className="rounded-b-2xl border-x border-b border-[#d4cebe] dark:border-slate-700 bg-white/40 dark:bg-slate-950/40 px-6 py-12 text-center">
                        <div className="w-12 h-12 rounded-2xl bg-[#e4dec9]/60 dark:bg-slate-800/60 flex items-center justify-center mx-auto mb-3">
                            <svg className="h-6 w-6 text-[#8c8273] dark:text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                        </div>
                        <p className="text-sm font-semibold text-[#6e685e] dark:text-slate-400">
                            Selecciona una región para previsualizar y descargar su informe
                        </p>
                    </div>
                )}
            </div>
        </div>
    )
}
