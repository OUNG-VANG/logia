import { useEffect, useRef, useState } from 'react'
import * as maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'
import './HousingMap.css'

// MapLibre charge son « worker » à part : on indique à Vite où le trouver.
maplibregl.setWorkerUrl(maplibreWorkerUrl)

// Fond « Plan » : carte vectorielle OpenFreeMap (gratuite, sans clé), avec les bâtiments en relief.
const planStyle = 'https://tiles.openfreemap.org/styles/liberty'

// Fond « Satellite » : photos Esri, routes par-dessus, et bâtiments OpenFreeMap affichés en vue 3D.
const satelliteStyle = {
  version: 8,
  sources: {
    imagery: {
      type: 'raster',
      tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
      tileSize: 256,
      maxzoom: 19,
      attribution: 'Imagery &copy; Esri, Vantor, Earthstar Geographics, and the GIS User Community',
    },
    roads: {
      type: 'raster',
      tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}'],
      tileSize: 256,
      maxzoom: 19,
      attribution: 'Road data: Esri, HERE, Garmin, &copy; OpenStreetMap contributors',
    },
    openmaptiles: { type: 'vector', url: 'https://tiles.openfreemap.org/planet' },
  },
  layers: [
    { id: 'imagery', type: 'raster', source: 'imagery' },
    { id: 'roads', type: 'raster', source: 'roads', paint: { 'raster-opacity': 0.85 } },
    {
      id: 'building-3d',
      type: 'fill-extrusion',
      source: 'openmaptiles',
      'source-layer': 'building',
      minzoom: 14,
      filter: ['!', ['has', 'hide_3d']],
      layout: { visibility: 'none' },
      paint: {
        'fill-extrusion-base': ['get', 'render_min_height'],
        'fill-extrusion-height': ['get', 'render_height'],
        'fill-extrusion-color': '#f4eff8',
        'fill-extrusion-opacity': 0.55,
      },
    },
  ],
}

const franceView = { center: [2.4, 46.6], zoom: 4.6 }
const pitch3D = 60

function normalize(value = '') {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase('fr-FR').trim()
}

function validCoordinate(value, min, max) {
  const number = Number(value)
  return value !== '' && value !== null && value !== undefined && Number.isFinite(number) && number >= min && number <= max
}

function formatRent(value) {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(value || 0)
}

function makePopupContent(group, onSelectListing) {
  const container = document.createElement('div')
  container.className = 'housing-map-popup'

  const heading = document.createElement('strong')
  heading.className = 'housing-map-popup-heading'
  heading.textContent = group.listings[0].location?.city || 'Logement disponible'
  container.appendChild(heading)

  const precision = document.createElement('p')
  precision.className = 'housing-map-popup-precision'
  precision.textContent = group.precision === 'address'
    ? 'Repère placé à l’adresse du logement'
    : 'Repère approximatif : centre de la commune'
  container.appendChild(precision)

  group.listings.slice(0, 8).forEach((listing) => {
    const item = document.createElement('button')
    item.type = 'button'
    item.className = 'housing-map-popup-item'

    if (listing.images?.[0]) {
      const image = document.createElement('img')
      image.src = listing.images[0]
      image.alt = ''
      item.appendChild(image)
    } else {
      const placeholder = document.createElement('span')
      placeholder.className = 'housing-map-popup-placeholder'
      placeholder.textContent = '⌂'
      item.appendChild(placeholder)
    }

    const text = document.createElement('span')
    text.className = 'housing-map-popup-text'
    const title = document.createElement('span')
    title.className = 'housing-map-popup-title'
    title.textContent = listing.title || 'Logement disponible'
    const details = document.createElement('small')
    details.textContent = formatRent(listing.rent) + ' / mois' + (listing.areaM2 ? ' · ' + listing.areaM2 + ' m²' : '')
    const link = document.createElement('span')
    link.className = 'housing-map-popup-link'
    link.textContent = 'Voir l’annonce →'
    text.append(title, details, link)
    item.appendChild(text)

    item.addEventListener('click', () => onSelectListing?.(listing))
    container.appendChild(item)
  })

  if (group.listings.length > 8) {
    const more = document.createElement('small')
    more.className = 'housing-map-popup-more'
    more.textContent = 'Et ' + (group.listings.length - 8) + ' autre(s) annonce(s)'
    container.appendChild(more)
  }

  return container
}

function makeMarkerElement(group) {
  const element = document.createElement('button')
  element.type = 'button'
  element.className = 'housing-map-price' + (group.precision === 'address' ? '' : ' approximate')
  const cheapest = Math.min(...group.listings.map((listing) => listing.rent || 0))
  element.textContent = group.listings.length > 1
    ? group.listings.length + ' logements · dès ' + formatRent(cheapest)
    : formatRent(cheapest)
  element.setAttribute('aria-label', group.listings.length + ' annonce(s) à ' + (group.listings[0].location?.city || 'cet endroit'))
  return element
}

// Affiche ou masque les bâtiments en relief selon la vue choisie.
function applyBuildingVisibility(map, mode, is3D) {
  if (!map.getLayer('building-3d')) return
  const visible = mode === 'streets' || is3D
  map.setLayoutProperty('building-3d', 'visibility', visible ? 'visible' : 'none')
}

function HousingMap({ listings = [], loading = false, onSelectListing }) {
  const mapHostRef = useRef(null)
  const mapRef = useRef(null)
  const markersRef = useRef([])
  const pointsRef = useRef([])
  const viewRef = useRef({ mode: 'streets', is3D: false })
  const cityCacheRef = useRef(new Map())
  const [mapMode, setMapMode] = useState('streets')
  const [is3D, setIs3D] = useState(false)
  const [locatedListings, setLocatedListings] = useState([])

  useEffect(() => {
    if (!mapHostRef.current) return undefined

    const map = new maplibregl.Map({
      container: mapHostRef.current,
      style: planStyle,
      ...franceView,
      minZoom: 3,
      maxZoom: 19,
      maxPitch: 70,
      cooperativeGestures: true,
      attributionControl: { compact: true },
      locale: {
        'CooperativeGesturesHandler.WindowsHelpText': 'Utilise Ctrl + molette pour zoomer sur la carte',
        'CooperativeGesturesHandler.MacHelpText': 'Utilise ⌘ + molette pour zoomer sur la carte',
        'CooperativeGesturesHandler.MobileHelpText': 'Utilise deux doigts pour déplacer la carte',
        'NavigationControl.ZoomIn': 'Zoomer',
        'NavigationControl.ZoomOut': 'Dézoomer',
        'NavigationControl.ResetBearing': 'Réorienter vers le nord',
        'FullscreenControl.Enter': 'Plein écran',
        'FullscreenControl.Exit': 'Quitter le plein écran',
      },
    })
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right')
    map.addControl(new maplibregl.FullscreenControl(), 'top-right')
    map.on('style.load', () => applyBuildingVisibility(map, viewRef.current.mode, viewRef.current.is3D))
    map.on('pitchend', () => setIs3D(map.getPitch() > 10))
    // Le bandeau des crédits reste replié (icône « i ») pour laisser la place à la carte.
    map.once('load', () => {
      mapHostRef.current?.querySelector('.maplibregl-ctrl-attrib')?.classList.remove('maplibregl-compact-show')
    })
    mapRef.current = map

    return () => {
      markersRef.current.forEach((marker) => marker.remove())
      markersRef.current = []
      map.remove()
      mapRef.current = null
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map || viewRef.current.mode === mapMode) return
    viewRef.current.mode = mapMode
    map.setStyle(mapMode === 'satellite' ? satelliteStyle : planStyle)
  }, [mapMode])

  useEffect(() => {
    viewRef.current.is3D = is3D
    const map = mapRef.current
    if (map?.isStyleLoaded()) applyBuildingVisibility(map, viewRef.current.mode, is3D)
  }, [is3D])

  function toggle3D() {
    const map = mapRef.current
    if (!map) return
    if (is3D) {
      setIs3D(false)
      map.easeTo({ pitch: 0, bearing: 0, duration: 900 })
      return
    }

    setIs3D(true)
    // En vue France entière, on se rapproche du logement le plus proche pour voir les bâtiments.
    const center = map.getCenter()
    const closest = [...pointsRef.current].sort((a, b) => (
      center.distanceTo(new maplibregl.LngLat(a.longitude, a.latitude))
        - center.distanceTo(new maplibregl.LngLat(b.longitude, b.latitude))
    ))[0]
    const target = map.getZoom() < 14 && closest
      ? { center: [closest.longitude, closest.latitude], zoom: 16.2 }
      : { zoom: Math.max(map.getZoom(), 15.5) }
    map.easeTo({ ...target, pitch: pitch3D, bearing: -25, duration: 1400 })
  }

  useEffect(() => {
    let cancelled = false

    async function locateInCommune(listing) {
      const city = listing.location?.city || ''
      const postalCode = listing.location?.postalCode || ''
      if (!city && !postalCode) return null

      const cacheKey = normalize(city) + '|' + postalCode
      if (cityCacheRef.current.has(cacheKey)) return cityCacheRef.current.get(cacheKey)

      const query = new URLSearchParams({
        q: [city, postalCode].filter(Boolean).join(' '),
        limit: '1',
        type: 'municipality',
      })
      const request = fetch('https://data.geopf.fr/geocodage/search?' + query.toString())
        .then((response) => response.ok ? response.json() : null)
        .then((result) => {
          const coordinates = result?.features?.[0]?.geometry?.coordinates
          if (!Array.isArray(coordinates) || coordinates.length < 2) return null
          return { longitude: coordinates[0], latitude: coordinates[1] }
        })
        .catch(() => null)

      cityCacheRef.current.set(cacheKey, request)
      return request
    }

    async function resolveListing(listing) {
      const location = listing.location || {}
      const latitude = location.latitude ?? location.coordinates?.latitude ?? location.coordinates?.[1]
      const longitude = location.longitude ?? location.coordinates?.longitude ?? location.coordinates?.[0]
      if (validCoordinate(latitude, -90, 90) && validCoordinate(longitude, -180, 180)) {
        return {
          listing,
          latitude: Number(latitude),
          longitude: Number(longitude),
          precision: location.precision === 'address' ? 'address' : 'city',
        }
      }

      const point = await locateInCommune(listing)
      if (!point) return null
      return { listing, ...point, precision: 'city' }
    }

    async function locateAll() {
      const located = []
      for (let index = 0; index < listings.length; index += 6) {
        const batch = await Promise.all(listings.slice(index, index + 6).map(resolveListing))
        located.push(...batch.filter(Boolean))
      }
      if (!cancelled) setLocatedListings(located)
    }

    locateAll()
    return () => { cancelled = true }
  }, [listings])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    markersRef.current.forEach((marker) => marker.remove())
    markersRef.current = []

    // Les annonces au même endroit partagent un seul repère.
    const groups = new Map()
    locatedListings.forEach((point) => {
      const key = point.precision === 'address'
        ? 'address|' + point.latitude.toFixed(6) + '|' + point.longitude.toFixed(6)
        : 'city|' + normalize(point.listing.location?.city) + '|' + (point.listing.location?.postalCode || '')
      const group = groups.get(key) || { latitude: point.latitude, longitude: point.longitude, precision: point.precision, listings: [] }
      group.listings.push(point.listing)
      groups.set(key, group)
    })
    pointsRef.current = [...groups.values()]

    groups.forEach((group) => {
      const popup = new maplibregl.Popup({ offset: 18, maxWidth: '280px', closeButton: true })
        .setDOMContent(makePopupContent(group, onSelectListing))
      const marker = new maplibregl.Marker({ element: makeMarkerElement(group), anchor: 'bottom' })
        .setLngLat([group.longitude, group.latitude])
        .setPopup(popup)
        .addTo(map)
      markersRef.current.push(marker)
    })

    const points = pointsRef.current
    if (points.length === 1) {
      map.jumpTo({ center: [points[0].longitude, points[0].latitude], zoom: points[0].precision === 'address' ? 15 : 11 })
    } else if (points.length > 1) {
      const bounds = new maplibregl.LngLatBounds()
      points.forEach((point) => bounds.extend([point.longitude, point.latitude]))
      map.fitBounds(bounds, { padding: 70, maxZoom: 13, duration: 0 })
    }
  }, [locatedListings, onSelectListing])

  const exactCount = locatedListings.filter((item) => item.precision === 'address').length

  return (
    <div className="housing-map">
      <div className="housing-map-toolbar">
        <div className="housing-map-layer-switch" role="group" aria-label="Type de carte">
          <button className={mapMode === 'streets' ? 'active' : ''} type="button" aria-pressed={mapMode === 'streets'} onClick={() => setMapMode('streets')}>
            Plan
          </button>
          <button className={mapMode === 'satellite' ? 'active' : ''} type="button" aria-pressed={mapMode === 'satellite'} onClick={() => setMapMode('satellite')}>
            Satellite
          </button>
        </div>
        <button className={'housing-map-3d' + (is3D ? ' active' : '')} type="button" aria-pressed={is3D} onClick={toggle3D}>
          {is3D ? 'Vue 2D' : 'Vue 3D'}
        </button>
        <span className="housing-map-count">
          {loading ? 'Chargement des annonces…' : listings.length + ' logement' + (listings.length === 1 ? '' : 's')}
        </span>
      </div>

      <div
        className="housing-map-canvas"
        ref={mapHostRef}
        role="region"
        aria-label="Carte interactive des logements disponibles en France"
      />

      <div className="housing-map-legend">
        <span><i className="housing-map-legend-pin" /> Chaque étiquette indique le loyer ; clique dessus pour voir l’annonce.</span>
        <span>{exactCount} logement{exactCount === 1 ? '' : 's'} à l’adresse exacte · Clic droit + glisser pour incliner ou tourner la carte.</span>
      </div>
    </div>
  )
}

export default HousingMap
