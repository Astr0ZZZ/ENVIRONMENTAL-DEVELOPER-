import { Dashboard } from '@/components/Dashboard'
import { ThemeToggle } from '@/components/ThemeToggle'
import { fetchLocationsServer } from '@/lib/openaq-server'

export const dynamic = 'force-dynamic'

export default async function Home() {
  const stations = await fetchLocationsServer()

  return (
    <main className="relative min-h-screen overflow-hidden">
      {/* Decorative ambient backdrop glows */}
      <div className="absolute left-1/4 top-0 -z-10 h-[500px] w-[500px] rounded-full bg-emerald-500/10 blur-[120px] dark:bg-emerald-500/10 bg-emerald-500/5" />
      <div className="absolute right-10 top-20 -z-10 h-[400px] w-[400px] rounded-full bg-indigo-500/5 blur-[100px] dark:bg-indigo-500/5 bg-indigo-500/2" />
      
      <section className="px-6 py-12 md:px-12 max-w-[1400px] mx-auto flex flex-col md:flex-row md:items-end md:justify-between gap-6">
        <div>
          <div className="mb-3.5 inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs font-bold text-emerald-700 dark:text-emerald-400 backdrop-blur-md">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-600 dark:bg-emerald-500" />
            </span>
            Red Nacional de Monitoreo
          </div>
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-black tracking-tight bg-gradient-to-b from-[#2d2a24] to-[#5c5850] dark:from-white dark:via-slate-100 dark:to-slate-400 bg-clip-text text-transparent">
            Calidad del Aire en Chile
          </h1>
          <p className="mt-4 text-sm md:text-base text-[#5c5850] dark:text-slate-400 max-w-2xl leading-relaxed">
            Visualización y análisis en tiempo real de material particulado y gases atmosféricos. Datos consolidados de estaciones oficiales a través de la red de <strong className="font-semibold text-[#1e1b18] dark:text-slate-200">OpenAQ v3</strong> (incluyendo SINCA/MMA).
          </p>
        </div>
        
        <div className="flex flex-row md:flex-col items-center md:items-end justify-between md:justify-end gap-6 md:gap-4 border-l-2 border-[#d4cebe] dark:border-slate-800 pl-4 md:border-l-0 md:pl-0 md:text-right w-full md:w-auto">
          <div className="flex flex-col gap-1">
            <span className="text-[10px] text-[#6e685e] dark:text-slate-500 font-bold uppercase tracking-wider">Territorio Monitoreado</span>
            <span className="text-3xl font-black text-[#1e1b18] dark:text-slate-200 tabular-nums">15 Regiones</span>
            <span className="text-xs text-[#6e685e] dark:text-slate-400">De Arica a Punta Arenas</span>
          </div>
          <ThemeToggle />
        </div>
      </section>

      <Dashboard stations={stations} />
    </main>
  )
}
