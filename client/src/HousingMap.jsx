import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import './HousingMap.css'

const streetTiles = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
const satelliteTiles = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
const roadOverlayTiles = 'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}'

function normalize(value = '') {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('fr-FR').trim()
}

function validCoordinate(value, min, max) {
  const number = Number(value)
  return value !== '' && value !== null && value !== undefined && Number.isFinite(number) && number >= min && number <= max
}

function makePopupContent(group, onSelectListing) {
  const container = document.createElement('div')
  container.className = 'housing-map-popup'

  const heading = document.createElement('strong')
  heading.className = 'housing-map-popup-heading'
  heading.textContent = group.precision === 'address'
    ? (group.listings[0].listing.location?.city || 'Logement disponible')
    : (group.listings[0].listing.location?.city || 'Centre-ville')
  container.appendChild(heading)

  const precision = document.createElement('p')
  precision.className = 'housing-map-popup-precision'
  precision.textContent = group.precision === 'address'
    ? 'Repère placé à l’adresse du logement'
    : 'Repère approximatif : centre de la commune'
  container.appendChild(precision)

  group.listings.slice(0, 8).forEach(({ listing }) => {
    const item = document.createElement('div')
    item.className = 'housing-map-popup-item'

    const title = document.createElement('span')
    title.className = 'housing-map-popup-title'
    title.textContent = listing.title || 'Logement disponible'

    const rent = document.createElement('small')
    rent.textContent = new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: 'EUR',
      maximumFractionDigits: 0,
    }).format(listing.rent || 0) + ' / mois'

    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'housing-map-popup-link'
    button.textContent = 'Voir l’annonce'
    button.addEventListener('click', () => onSelectListing?.(listing))

    item.append(title, rent, button)
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

function HousingMap({ listings = [], loading = false, onSelectListing }) {
  const mapHostRef = useRef(null)
  const mapRef = useRef(null)
  const layersRef = useRef(null)
  const markerLayerRef = useRef(null)
  const cityCacheRef = useRef(new Map())
  const [mapMode, setMapMode] = useState('streets')
  const [locatedListings, setLocatedListings] = useState([])

  useEffect(() => {
    if (!mapHostRef.current) return undefined

    const map = L.map(mapHostRef.current, {
      center: [46.6, 2.4],
      zoom: 5,
      minZoom: 4,
      maxZoom: 20,
      zoomControl: true,
      scrollWheelZoom: false,
    })

    const streets = L.tileLayer(streetTiles, {
      minZoom: 4,
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>',
    }).addTo(map)

    const satellite = L.tileLayer(satelliteTiles, {
      minZoom: 4,
      maxZoom: 20,
      attribution: 'Imagery &copy; Esri, Vantor, Earthstar Geographics, and the GIS User Community',
    })
    const roads = L.tileLayer(roadOverlayTiles, {
      minZoom: 4,
      maxZoom: 19,
      opacity: 0.88,
      attribution: 'Road data: Esri, HERE, Garmin, &copy; OpenStreetMap contributors',
    })

    mapRef.current = map
    layersRef.current = { streets, satellite, roads }
    markerLayerRef.current = L.layerGroup().addTo(map)

    const resizeObserver = typeof ResizeObserver === 'function'
      ? new ResizeObserver(() => map.invalidateSize())
      : null
    resizeObserver?.observe(mapHostRef.current)
    window.requestAnimationFrame(() => map.invalidateSize())

    return () => {
      resizeObserver?.disconnect()
      map.remove()
      mapRef.current = null
      layersRef.current = null
      markerLayerRef.current = null
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    const layers = layersRef.current
    if (!map || !layers) return

    if (mapMode === 'satellite') {
      layers.streets.remove()
      layers.satellite.addTo(map)
      layers.roads.addTo(map)
    } else {
      layers.satellite.remove()
      layers.roads.remove()
      layers.streets.addTo(map)
    }
    window.requestAnimationFrame(() => map.invalidateSize())
  }, [mapMode])

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
    const markerLayer = markerLayerRef.current
    if (!map || !markerLayer) return

    markerLayer.clearLayers()
    const groups = new Map()

    locatedListings.forEach((point) => {
      const locationKey = point.precision === 'address'
        ? 'address|' + point.latitude.toFixed(6) + '|' + point.longitude.toFixed(6)
        : 'city|' + normalize(point.listing.location?.city) + '|' + (point.listing.location?.postalCode || '')
      const group = groups.get(locationKey) || { ...point, listings: [], precision: point.precision }
      group.listings.push({ listing: point.listing, precision: point.precision })
      groups.set(locationKey, group)
    })

    const bounds = []
    groups.forEach((group) => {
      const point = [group.latitude, group.longitude]
      bounds.push(point)
      const countLabel = group.listings.length > 1 ? String(group.listings.length) : '⌂'
      const marker = L.marker(point, {
        title: group.listings.length + ' annonce(s) de logement',
        icon: L.divIcon({
          className: 'housing-map-marker-wrap',
          html: '<span class="housing-map-marker"><span>' + countLabel + '</span></span>',
          iconSize: [38, 44],
          iconAnchor: [19, 41],
          popupAnchor: [0, -38],
        }),
      })
      marker.bindPopup(makePopupContent(group, onSelectListing), { maxWidth: 260 })
      marker.addTo(markerLayer)
    })

    if (bounds.length === 1) {
      map.setView(bounds[0], locatedListings[0]?.precision === 'address' ? 15 : 11, { animate: false })
    } else if (bounds.length > 1) {
      map.fitBounds(L.latLngBounds(bounds).pad(0.18), { maxZoom: 13, animate: false })
    }
  }, [locatedListings, onSelectListing])

  const exactCount = locatedListings.filter((item) => item.precision === 'address').length

  return (
    <div className="housing-map">
      <div className="housing-map-toolbar">
        <div className="housing-map-layer-switch" role="group" aria-label="Type de carte">
          <button
            className={mapMode === 'streets' ? 'active' : ''}
            type="button"
            aria-pressed={mapMode === 'streets'}
            onClick={() => setMapMode('streets')}
          >
            Plan des rues
          </button>
          <button
            className={mapMode === 'satellite' ? 'active' : ''}
            type="button"
            aria-pressed={mapMode === 'satellite'}
            onClick={() => setMapMode('satellite')}
          >
            Satellite
          </button>
        </div>
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
        <span><i className="housing-map-legend-pin" /> Chaque repère ouvre les annonces à cet endroit.</span>
        <span>{exactCount} logement{exactCount === 1 ? '' : 's'} avec une position exacte · les anciennes annonces peuvent être approximatives.</span>
      </div>
    </div>
  )
}

export default HousingMap
