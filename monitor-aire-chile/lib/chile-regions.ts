/**
 * Utilidades para resolver la jerarquía territorial de Chile (Regiones Administrativas y Comunas/Localidades)
 */

export const CHILE_REGIONS = [
  'Región de Arica y Parinacota',
  'Región de Tarapacá',
  'Región de Antofagasta',
  'Región de Atacama',
  'Región de Coquimbo',
  'Región de Valparaíso',
  'Región Metropolitana',
  'Región de O\'Higgins',
  'Región del Maule',
  'Región de Ñuble',
  'Región del Biobío',
  'Región de la Araucanía',
  'Región de Los Ríos',
  'Región de Los Lagos',
  'Región de Aysén',
  'Región de Magallanes'
] as const

export function getChileRegionAndLocality(
  name: string,
  localityInput: string | null,
  lat?: number,
  lng?: number
): { region: string; locality: string } {
  const cleanLoc = localityInput ? localityInput.trim() : ''
  const cleanName = name ? name.trim() : ''
  const sourceText = `${cleanLoc} ${cleanName}`.toLowerCase()
  const hasValidLoc = cleanLoc && cleanLoc.toLowerCase() !== 'chile'
  const finalLoc = hasValidLoc ? cleanLoc : null

  // Special exception: Parque O'Higgins is in Región Metropolitana (Santiago)
  if (sourceText.includes('parque o\'higgins') || sourceText.includes('parque ohiggins')) {
    return { region: 'Región Metropolitana', locality: finalLoc || 'Santiago' }
  }

  // 1. Región de Arica y Parinacota
  if (sourceText.includes('arica') || sourceText.includes('parinacota')) {
    return { region: 'Región de Arica y Parinacota', locality: finalLoc || 'Arica' }
  }
  
  // 2. Región de Tarapacá
  if (
    sourceText.includes('alto hospicio') ||
    sourceText.includes('iquique') ||
    sourceText.includes('tarapaca')
  ) {
    let locName = 'Alto Hospicio'
    if (sourceText.includes('iquique')) {
      locName = 'Iquique'
    }
    return { region: 'Región de Tarapacá', locality: finalLoc || locName }
  }

  // 3. Región de Antofagasta
  if (
    sourceText.includes('antofagasta') ||
    sourceText.includes('calama') ||
    sourceText.includes('sierra gorda') ||
    sourceText.includes('tocopilla') ||
    sourceText.includes('chiu chiu') ||
    sourceText.includes('mejillones') ||
    sourceText.includes('latorre') ||
    sourceText.includes('integra') ||
    sourceText.includes('escuela e-10') ||
    sourceText.includes('gendarmeria') ||
    sourceText.includes('tres marias') ||
    sourceText.includes('hospital del cobre')
  ) {
    let locName = 'Antofagasta'
    if (sourceText.includes('calama') || sourceText.includes('hospital del cobre') || sourceText.includes('chiu chiu')) {
      locName = 'Calama'
    } else if (
      sourceText.includes('tocopilla') ||
      sourceText.includes('escuela e-10') ||
      sourceText.includes('gendarmeria') ||
      sourceText.includes('tres marias')
    ) {
      locName = 'Tocopilla'
    } else if (sourceText.includes('sierra gorda')) {
      locName = 'Sierra Gorda'
    } else if (sourceText.includes('mejillones') || sourceText.includes('integra') || sourceText.includes('latorre')) {
      locName = 'Mejillones'
    }
    return { region: 'Región de Antofagasta', locality: finalLoc || locName }
  }

  // 4. Región de Atacama
  if (
    sourceText.includes('copiapo') ||
    sourceText.includes('huasco') ||
    sourceText.includes('tierra amarilla') ||
    sourceText.includes('chanaral') ||
    sourceText.includes('freirina') ||
    sourceText.includes('atacama')
  ) {
    let locName = 'Copiapó'
    if (sourceText.includes('huasco')) locName = 'Huasco'
    else if (sourceText.includes('tierra amarilla')) locName = 'Tierra Amarilla'
    else if (sourceText.includes('chanaral')) locName = 'Chañaral'
    else if (sourceText.includes('freirina')) locName = 'Freirina'
    return { region: 'Región de Atacama', locality: finalLoc || locName }
  }

  // 5. Región de Coquimbo
  if (
    sourceText.includes('coquimbo') ||
    sourceText.includes('andacollo') ||
    sourceText.includes('salamanca') ||
    sourceText.includes('la serena')
  ) {
    let locName = 'Coquimbo'
    if (sourceText.includes('andacollo')) locName = 'Andacollo'
    else if (sourceText.includes('salamanca')) locName = 'Salamanca'
    else if (sourceText.includes('la serena')) locName = 'La Serena'
    return { region: 'Región de Coquimbo', locality: finalLoc || locName }
  }

  // 6. Región de Valparaíso
  if (
    sourceText.includes('valparaiso') ||
    sourceText.includes('vina del mar') ||
    sourceText.includes('quilpue') ||
    sourceText.includes('concon') ||
    sourceText.includes('puchuncavi') ||
    sourceText.includes('quintero') ||
    sourceText.includes('quillota') ||
    sourceText.includes('catemu') ||
    sourceText.includes('panquehue') ||
    sourceText.includes('los vientos') ||
    sourceText.includes('sur') ||
    sourceText.includes('loncura') ||
    sourceText.includes('ventanas') ||
    sourceText.includes('los andes') ||
    sourceText.includes('llay')
  ) {
    let locName = 'Valparaíso'
    if (sourceText.includes('vina del mar')) locName = 'Viña del Mar'
    else if (sourceText.includes('quilpue')) locName = 'Quilpué'
    else if (sourceText.includes('concon')) locName = 'Concón'
    else if (sourceText.includes('puchuncavi') || sourceText.includes('ventanas')) locName = 'Puchuncaví'
    else if (sourceText.includes('quintero') || sourceText.includes('loncura') || sourceText.includes('sur')) locName = 'Quintero'
    else if (sourceText.includes('quillota')) locName = 'Quillota'
    else if (sourceText.includes('catemu')) locName = 'Catemu'
    else if (sourceText.includes('panquehue')) locName = 'Panquehue'
    else if (sourceText.includes('los andes') || sourceText.includes('los vientos')) locName = 'Los Andes'
    return { region: 'Región de Valparaíso', locality: finalLoc || locName }
  }

  // 8. Región de O'Higgins
  if (
    sourceText.includes('rancagua') ||
    sourceText.includes('rengo') ||
    sourceText.includes('machali') ||
    sourceText.includes('san fernando') ||
    sourceText.includes('o\'higgins') ||
    sourceText.includes('ohiggins')
  ) {
    let locName = 'Rancagua'
    if (sourceText.includes('rengo')) locName = 'Rengo'
    else if (sourceText.includes('machali')) locName = 'Machalí'
    else if (sourceText.includes('san fernando')) locName = 'San Fernando'
    return { region: 'Región de O\'Higgins', locality: finalLoc || locName }
  }

  // 9. Región del Maule
  if (
    sourceText.includes('talca') ||
    sourceText.includes('curico') ||
    sourceText.includes('linares') ||
    sourceText.includes('cauquenes') ||
    sourceText.includes('maule')
  ) {
    let locName = 'Talca'
    if (sourceText.includes('curico')) locName = 'Curicó'
    else if (sourceText.includes('linares')) locName = 'Linares'
    else if (sourceText.includes('cauquenes')) locName = 'Cauquenes'
    return { region: 'Región del Maule', locality: finalLoc || locName }
  }

  // 10. Región de Ñuble
  if (
    sourceText.includes('chillan') ||
    sourceText.includes('san carlos') ||
    sourceText.includes('quillon') ||
    sourceText.includes('nueva aldea') ||
    sourceText.includes('colicheu') ||
    sourceText.includes('cayumanqui') ||
    sourceText.includes('nuble') ||
    sourceText.includes('ubb') ||
    sourceText.includes('fdo may')
  ) {
    let locName = 'Chillán'
    if (sourceText.includes('san carlos')) locName = 'San Carlos'
    else if (sourceText.includes('quillon') || sourceText.includes('cayumanqui') || sourceText.includes('nueva aldea')) {
      locName = 'Quillón'
    } else if (sourceText.includes('colicheu')) {
      locName = 'Cabrero'
    }
    return { region: 'Región de Ñuble', locality: finalLoc || locName }
  }

  // 11. Región del Biobío
  if (
    sourceText.includes('concepcion') ||
    sourceText.includes('talcahuano') ||
    sourceText.includes('chiguayante') ||
    sourceText.includes('coronel') ||
    sourceText.includes('hualpen') ||
    sourceText.includes('hualqui') ||
    sourceText.includes('laja') ||
    sourceText.includes('nacimiento') ||
    sourceText.includes('los angeles') ||
    sourceText.includes('curanilahue') ||
    sourceText.includes('lagunillas') ||
    sourceText.includes('progreso') ||
    sourceText.includes('entre rios') ||
    sourceText.includes('biobio') ||
    sourceText.includes('bio-bio')
  ) {
    let locName = 'Concepción'
    if (sourceText.includes('talcahuano')) locName = 'Talcahuano'
    else if (sourceText.includes('chiguayante')) locName = 'Chiguayante'
    else if (sourceText.includes('coronel') || sourceText.includes('lagunillas')) locName = 'Coronel'
    else if (sourceText.includes('hualpen')) locName = 'Hualpén'
    else if (sourceText.includes('hualqui')) locName = 'Hualqui'
    else if (sourceText.includes('laja')) locName = 'Laja'
    else if (sourceText.includes('nacimiento') || sourceText.includes('entre rios')) locName = 'Nacimiento'
    else if (sourceText.includes('los angeles') || sourceText.includes('progreso')) locName = 'Los Ángeles'
    else if (sourceText.includes('curanilahue')) locName = 'Curanilahue'
    return { region: 'Región del Biobío', locality: finalLoc || locName }
  }

  // 12. Región de la Araucanía
  if (
    sourceText.includes('temuco') ||
    sourceText.includes('padre las casas') ||
    sourceText.includes('villarrica') ||
    sourceText.includes('cherquenco') ||
    sourceText.includes('ufro') ||
    sourceText.includes('ferroviario') ||
    sourceText.includes('nielol') ||
    sourceText.includes('idealab') ||
    sourceText.includes('araucania')
  ) {
    let locName = 'Temuco'
    if (sourceText.includes('padre las casas')) locName = 'Padre las Casas'
    else if (sourceText.includes('villarrica')) locName = 'Villarrica'
    else if (sourceText.includes('cherquenco')) locName = 'Cherquenco'
    return { region: 'Región de la Araucanía', locality: finalLoc || locName }
  }

  // 13. Región de Los Ríos
  if (
    sourceText.includes('valdivia') ||
    sourceText.includes('la union') ||
    sourceText.includes('rios')
  ) {
    let locName = 'Valdivia'
    if (sourceText.includes('la union')) locName = 'La Unión'
    return { region: 'Región de Los Ríos', locality: finalLoc || locName }
  }

  // 14. Región de Los Lagos
  if (
    sourceText.includes('puerto montt') ||
    sourceText.includes('osorno') ||
    sourceText.includes('puerto varas') ||
    sourceText.includes('lagos')
  ) {
    let locName = 'Puerto Montt'
    if (sourceText.includes('osorno')) locName = 'Osorno'
    else if (sourceText.includes('puerto varas')) locName = 'Puerto Varas'
    return { region: 'Región de Los Lagos', locality: finalLoc || locName }
  }

  // 15. Región de Aysén
  if (
    sourceText.includes('coyhaique') ||
    sourceText.includes('aysen') ||
    sourceText.includes('cochrane') ||
    sourceText.includes('aisen')
  ) {
    let locName = 'Coyhaique'
    if (sourceText.includes('cochrane')) locName = 'Cochrane'
    else if (sourceText.includes('aysen') || sourceText.includes('aisen')) locName = 'Aysén'
    return { region: 'Región de Aysén', locality: finalLoc || locName }
  }

  // 16. Región de Magallanes
  if (
    sourceText.includes('punta arenas') ||
    sourceText.includes('magallanes') ||
    sourceText.includes('natales')
  ) {
    let locName = 'Punta Arenas'
    if (sourceText.includes('natales')) locName = 'Puerto Natales'
    return { region: 'Región de Magallanes', locality: finalLoc || locName }
  }

  // 7. Región Metropolitana de Santiago (communes & fallbacks)
  if (
    sourceText.includes('santiago') ||
    sourceText.includes('cerrillos') ||
    sourceText.includes('cerro navia') ||
    sourceText.includes('pudahuel') ||
    sourceText.includes('las condes') ||
    sourceText.includes('la florida') ||
    sourceText.includes('quilicura') ||
    sourceText.includes('puente alto') ||
    sourceText.includes('el bosque') ||
    sourceText.includes('talagante') ||
    sourceText.includes('independencia') ||
    sourceText.includes('ohiggins') || // Parque O'Higgins
    sourceText.includes('o\'higgins') || // Parque O'Higgins
    sourceText.includes('metropolitana')
  ) {
    let locName = 'Santiago'
    if (sourceText.includes('cerrillos')) locName = 'Cerrillos'
    else if (sourceText.includes('cerro navia')) locName = 'Cerro Navia'
    else if (sourceText.includes('pudahuel')) locName = 'Pudahuel'
    else if (sourceText.includes('las condes')) locName = 'Las Condes'
    else if (sourceText.includes('la florida')) locName = 'La Florida'
    else if (sourceText.includes('quilicura')) locName = 'Quilicura'
    else if (sourceText.includes('puente alto')) locName = 'Puente Alto'
    else if (sourceText.includes('el bosque')) locName = 'El Bosque'
    else if (sourceText.includes('talagante')) locName = 'Talagante'
    else if (sourceText.includes('independencia')) locName = 'Independencia'
    return { region: 'Región Metropolitana', locality: finalLoc || locName }
  }

  // 8. Coordinate-based regional fallbacks for any unrecognized location
  if (typeof lat === 'number' && typeof lng === 'number' && !isNaN(lat) && !isNaN(lng)) {
    if (lat > -19.0) {
      return { region: 'Región de Arica y Parinacota', locality: finalLoc || 'Arica' }
    }
    if (lat <= -19.0 && lat > -21.4) {
      return { region: 'Región de Tarapacá', locality: finalLoc || 'Iquique' }
    }
    if (lat <= -21.4 && lat > -26.0) {
      return { region: 'Región de Antofagasta', locality: finalLoc || 'Antofagasta' }
    }
    if (lat <= -26.0 && lat > -29.2) {
      return { region: 'Región de Atacama', locality: finalLoc || 'Copiapó' }
    }
    if (lat <= -29.2 && lat > -32.2) {
      return { region: 'Región de Coquimbo', locality: finalLoc || 'Coquimbo' }
    }
    if (lat <= -32.2 && lat > -34.2) {
      if (lat < -33.0 && lng > -71.25) {
        return { region: 'Región Metropolitana', locality: finalLoc || 'Santiago' }
      }
      if (lat < -33.8) {
        return { region: 'Región de O\'Higgins', locality: finalLoc || 'Rancagua' }
      }
      return { region: 'Región de Valparaíso', locality: finalLoc || 'Valparaíso' }
    }
    if (lat <= -34.2 && lat > -34.9) {
      return { region: 'Región de O\'Higgins', locality: finalLoc || 'Rancagua' }
    }
    if (lat <= -34.9 && lat > -36.2) {
      return { region: 'Región del Maule', locality: finalLoc || 'Talca' }
    }
    if (lat <= -36.2 && lat > -37.2) {
      if (lat > -36.8) {
        return { region: 'Región de Ñuble', locality: finalLoc || 'Chillán' }
      }
      return { region: 'Región del Biobío', locality: finalLoc || 'Concepción' }
    }
    if (lat <= -37.2 && lat > -38.3) {
      return { region: 'Región del Biobío', locality: finalLoc || 'Concepción' }
    }
    if (lat <= -38.3 && lat > -39.5) {
      return { region: 'Región de la Araucanía', locality: finalLoc || 'Temuco' }
    }
    if (lat <= -39.5 && lat > -40.5) {
      return { region: 'Región de Los Ríos', locality: finalLoc || 'Valdivia' }
    }
    if (lat <= -40.5 && lat > -43.8) {
      return { region: 'Región de Los Lagos', locality: finalLoc || 'Puerto Montt' }
    }
    if (lat <= -43.8 && lat > -48.5) {
      return { region: 'Región de Aysén', locality: finalLoc || 'Coyhaique' }
    }
    if (lat <= -48.5) {
      return { region: 'Región de Magallanes', locality: finalLoc || 'Punta Arenas' }
    }
  }

  // Universal Fallback
  return { region: 'Región Metropolitana', locality: finalLoc || 'Santiago' }
}
