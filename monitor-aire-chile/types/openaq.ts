export interface Station {
  id: string
  nombre: string
  region: string
  locality: string
  lat: number
  lng: number
  pm10?: number | null
  pm25?: number | null
  so2?: number | null
  no2?: number | null
  o3?: number | null
  co?: number | null
  lastUpdated?: string
  active?: boolean
}

export interface ICAResult {
  valor: number
  categoria: string
  color: string
  descripcion: string
}
