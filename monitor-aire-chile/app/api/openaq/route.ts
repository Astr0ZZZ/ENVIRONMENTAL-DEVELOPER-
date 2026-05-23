import { NextRequest, NextResponse } from 'next/server'

const OPENAQ_BASE = 'https://api.openaq.org/v3'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const endpoint = searchParams.get('endpoint') || 'locations'

  const apiKey = process.env.OPENAQ_API_KEY
  if (!apiKey) {
    return NextResponse.json(
      { error: 'OPENAQ_API_KEY no configurada' },
      { status: 500 }
    )
  }

  try {
    const targetUrl = `${OPENAQ_BASE}/${endpoint}?countries_id=3&limit=1000`

    const res = await fetch(targetUrl, {
      headers: { 'X-API-Key': apiKey },
      cache: 'no-store',
    })

    if (!res.ok) {
      return NextResponse.json(
        { error: `OpenAQ error ${res.status}` },
        { status: res.status }
      )
    }

    const data = await res.json()
    return NextResponse.json(data)
  } catch (error) {
    console.error('Proxy OpenAQ error:', error)
    return NextResponse.json(
      { error: 'Error interno al consultar OpenAQ' },
      { status: 500 }
    )
  }
}
