export default function Loading() {
  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center">
      <div className="space-y-4 text-center">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-slate-800 border-t-emerald-500 mx-auto shadow-[0_0_15px_rgba(16,185,129,0.5)]" />
        <p className="text-sm font-medium tracking-wide text-slate-400 animate-pulse">
          Conectando con OpenAQ v3...
        </p>
      </div>
    </div>
  )
}
