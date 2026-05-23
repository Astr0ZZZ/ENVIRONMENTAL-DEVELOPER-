'use client'

import dynamic from 'next/dynamic'
import type { ComponentProps } from 'react'

const AirMap = dynamic(
  () => import('@/components/AirMap').then((mod) => mod.AirMap),
  { ssr: false, loading: () => <div className="h-[600px] w-full rounded-xl bg-[#e4dec9]/20 dark:bg-slate-900 border border-[#d4cebe] dark:border-slate-800 animate-pulse" /> }
)

export function AirMapWrapper(props: ComponentProps<typeof AirMap>) {
  return <AirMap {...props} />
}
