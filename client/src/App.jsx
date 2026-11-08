import { useEffect, useRef, useState } from 'react'
import api from './lib/api'
import LandingPage from './LandingPage'
import HousingMap from './HousingMap'
import { ApplyBox, LandlordApplications, TenantApplications } from './Applications'
import './App.css'

const emptyHousingForm = {
  title: '',
  description: '',
  propertyType: 'apartment',
  address: '',
  city: '',
  postalCode: '',
  rent: '',
  charges: '0',
  areaM2: '',
  bedrooms: '0',
  availableFrom: '',
}

const propertyTypeLabels = {
  room: 'Chambre',
  studio: 'Studio',
  apartment: 'Appartement',
  house: 'Maison',
}

function normalizeCityName(value) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('fr-FR').trim()
}

async function geocodeListingAddress(address, postalCode, city) {
  const query = new URLSearchParams({
    q: [address, postalCode, city].filter(Boolean).join(' '),
    limit: '5',
    type: 'housenumber',
  })
  const response = await fetch('https://data.geopf.fr/geocodage/search?' + query.toString())
  if (!response.ok) throw new Error('Le service de localisation ne répond pas. Réessaie dans un instant.')

  const result = await response.json()
  const cityKey = normalizeCityName(city)
  const feature = result.features?.find((candidate) => {
    const properties = candidate.properties || {}
    return properties.type === 'housenumber'
      && normalizeCityName(properties.city || properties.municipality || '') === cityKey
      && (!postalCode || String(properties.postcode || '') === String(postalCode).trim())
  })
  const coordinates = feature?.geometry?.coordinates
  if (!Array.isArray(coordinates) || coordinates.length < 2) {
    throw new Error('Adresse introuvable avec un point précis. Vérifie le numéro, la rue, le code postal et la ville.')
  }

  return { longitude: coordinates[0], latitude: coordinates[1] }
}

function optimizePhoto(file) {
  return new Promise((resolve, reject) => {
    const sourceUrl = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      URL.revokeObjectURL(sourceUrl)
      const scale = Math.min(1, 1600 / Math.max(image.naturalWidth, image.naturalHeight))
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
      const context = canvas.getContext('2d')
      if (!context) return reject(new Error('Impossible de préparer cette photo.'))
      context.fillStyle = '#ffffff'
      context.fillRect(0, 0, canvas.width, canvas.height)
      context.drawImage(image, 0, 0, canvas.width, canvas.height)
      canvas.toBlob((blob) => {
        if (!blob) return reject(new Error('Impossible de préparer cette photo.'))
        resolve(new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' }))
      }, 'image/jpeg', 0.82)
    }
    image.onerror = () => {
      URL.revokeObjectURL(sourceUrl)
      reject(new Error('Ce fichier ne peut pas être lu comme une image.'))
    }
    image.src = sourceUrl
  })
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(new Error('Impossible de lire une photo sélectionnée.'))
    reader.readAsDataURL(file)
  })
}

function formatRent(value) {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(value || 0)
}

function App() {
  const [mode, setMode] = useState('register')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [role, setRole] = useState('tenant')
  const [user, setUser] = useState(null)
  const [showAuth, setShowAuth] = useState(false)
  const [loading, setLoading] = useState(false)
  const [checkingSession, setCheckingSession] = useState(true)
  const [error, setError] = useState('')
  const [listings, setListings] = useState([])
  const [selectedHousing, setSelectedHousing] = useState(null)
  const [listingsLoading, setListingsLoading] = useState(false)
  const [housingError, setHousingError] = useState('')
  const [searchCity, setSearchCity] = useState('')
  const selectedCityRef = useRef('')
  const [citySuggestions, setCitySuggestions] = useState([])
  const [suggestionsOpen, setSuggestionsOpen] = useState(false)
  const [suggestionsLoading, setSuggestionsLoading] = useState(false)
  const [activeSuggestion, setActiveSuggestion] = useState(-1)
  const [maxRent, setMaxRent] = useState('')
  const [housingForm, setHousingForm] = useState(emptyHousingForm)
  const [publishing, setPublishing] = useState(false)
  const [selectedPhotos, setSelectedPhotos] = useState([])
  const [photoProcessing, setPhotoProcessing] = useState(false)
  const [photoError, setPhotoError] = useState('')
  const [publishMessage, setPublishMessage] = useState('')
  const [locationDrafts, setLocationDrafts] = useState({})
  const [locationSavingId, setLocationSavingId] = useState('')
  const [locationUpdateError, setLocationUpdateError] = useState('')
  const [locationUpdateMessage, setLocationUpdateMessage] = useState('')
  const [applications, setApplications] = useState([])
  const [applicationsLoadedFor, setApplicationsLoadedFor] = useState(null)
  const [applicationsError, setApplicationsError] = useState('')
  const [applicationBusyId, setApplicationBusyId] = useState('')
  const [applyError, setApplyError] = useState('')
  const [deletingListingId, setDeletingListingId] = useState('')
  const [deleteListingError, setDeleteListingError] = useState('')
  const [deleteListingMessage, setDeleteListingMessage] = useState('')

  useEffect(() => {
    const token = sessionStorage.getItem('logia-token')
    if (!token) {
      setCheckingSession(false)
      return
    }

    api.get('/auth/me')
      .then(({ data }) => setUser(data.user))
      .catch(() => sessionStorage.removeItem('logia-token'))
      .finally(() => setCheckingSession(false))
  }, [])

  useEffect(() => {
    const query = searchCity.trim()
    if (query === selectedCityRef.current) return
    if (query.length < 1) {
      setCitySuggestions([])
      setSuggestionsOpen(false)
      setSuggestionsLoading(false)
      setActiveSuggestion(-1)
      return
    }

    const controller = new AbortController()
    const timeout = window.setTimeout(async () => {
      setSuggestionsLoading(true)
      try {
        const params = new URLSearchParams({
          nom: query,
          fields: 'nom,code,codeDepartement',
          boost: 'population',
          limit: '100',
        })
        const response = await fetch(`https://geo.api.gouv.fr/communes?${params}`, {
          signal: controller.signal,
        })
        if (!response.ok) throw new Error('La recherche de communes a échoué.')
        const communes = await response.json()
        const normalizedQuery = normalizeCityName(query)
        setCitySuggestions(communes.filter((city) => normalizeCityName(city.nom).startsWith(normalizedQuery)))
        setSuggestionsOpen(true)
        setActiveSuggestion(-1)
      } catch (requestError) {
        if (requestError.name !== 'AbortError') {
          setCitySuggestions([])
          setSuggestionsOpen(false)
        }
      } finally {
        if (!controller.signal.aborted) setSuggestionsLoading(false)
      }
    }, 250)

    return () => {
      window.clearTimeout(timeout)
      controller.abort()
    }
  }, [searchCity])

  useEffect(() => {
    let active = true
    setListingsLoading(true)
    setHousingError('')
    const endpoint = user?.role === 'landlord' ? '/housing/mine' : '/housing'

    api.get(endpoint)
      .then(({ data }) => { if (active) setListings(data.listings || []) })
      .catch((requestError) => {
        if (active) setHousingError(requestError.response?.data?.message || 'Impossible de charger les logements.')
      })
      .finally(() => { if (active) setListingsLoading(false) })

    return () => { active = false }
  }, [user])

  useEffect(() => {
    if (!user) return

    let active = true
    const endpoint = user.role === 'landlord' ? '/applications/received' : '/applications/mine'

    api.get(endpoint)
      .then(({ data }) => {
        if (!active) return
        setApplications(data.applications || [])
        setApplicationsError('')
      })
      .catch((requestError) => {
        if (active) setApplicationsError(requestError.response?.data?.message || 'Impossible de charger les candidatures.')
      })
      .finally(() => { if (active) setApplicationsLoadedFor(user.id) })

    return () => { active = false }
  }, [user])

  function replaceApplication(updated) {
    setApplications((current) => {
      const exists = current.some((item) => item._id === updated._id)
      return exists
        ? current.map((item) => item._id === updated._id ? updated : item)
        : [updated, ...current]
    })
  }

  function selectHousing(housing) {
    setApplyError('')
    setSelectedHousing(housing)
  }

  async function openHousingFromApplication(housing) {
    selectHousing(housing)
    try {
      const { data } = await api.get('/housing/' + housing._id)
      setSelectedHousing((current) => current?._id === housing._id ? data.listing : current)
    } catch {
      // L'annonce n'est plus publiée : on garde les informations résumées.
    }
  }

  async function applyToHousing(housingId, message) {
    setApplicationBusyId(housingId)
    setApplyError('')
    try {
      const { data } = await api.post('/applications', { housingId, message })
      replaceApplication(data.application)
    } catch (requestError) {
      setApplyError(requestError.response?.data?.message || 'Impossible d’envoyer la candidature.')
    } finally {
      setApplicationBusyId('')
    }
  }

  async function updateApplicationStatus(application, status) {
    if (status === 'withdrawn' && !window.confirm('Retirer ta candidature pour « ' + (application.housing?.title || 'ce logement') + ' » ?')) return

    setApplicationBusyId(application._id)
    setApplyError('')
    setApplicationsError('')
    try {
      const { data } = await api.patch('/applications/' + application._id + '/status', { status })
      replaceApplication(data.application)
    } catch (requestError) {
      const message = requestError.response?.data?.message || 'Impossible de mettre à jour la candidature.'
      if (selectedHousing) setApplyError(message)
      else setApplicationsError(message)
    } finally {
      setApplicationBusyId('')
    }
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    setLoading(true)

    try {
      const endpoint = mode === 'register' ? '/auth/register' : '/auth/login'
      const payload = mode === 'register' ? { email, password, role } : { email, password }
      const { data } = await api.post(endpoint, payload)
      sessionStorage.setItem('logia-token', data.token)
      setUser(data.user)
      setShowAuth(false)
      setPassword('')
    } catch (requestError) {
      setError(
        requestError.response?.data?.message ||
          'Impossible de joindre le serveur Logia. Vérifie que le serveur est démarré dans le terminal server.',
      )
    } finally {
      setLoading(false)
    }
  }

  function switchMode(nextMode) {
    setMode(nextMode)
    setError('')
    setPassword('')
    setShowPassword(false)
  }

  function openAuth(nextMode, nextRole = 'tenant') {
    setMode(nextMode)
    setRole(nextRole)
    setError('')
    setPassword('')
    setShowPassword(false)
    setSelectedHousing(null)
    setShowAuth(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function logout() {
    sessionStorage.removeItem('logia-token')
    setUser(null)
    setShowAuth(false)
    setMode('login')
    setEmail('')
    setPassword('')
    setError('')
    setListings([])
    setApplications([])
    setApplicationsLoadedFor(null)
    setSelectedHousing(null)
  }

  function chooseCity(city) {
    selectedCityRef.current = city
    setSearchCity(city)
    setCitySuggestions([])
    setSuggestionsOpen(false)
    setActiveSuggestion(-1)
  }

  function handleCityKeyDown(event) {
    if (event.key === 'Escape') {
      setSuggestionsOpen(false)
      setActiveSuggestion(-1)
      return
    }

    if (!suggestionsOpen || citySuggestions.length === 0) return
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActiveSuggestion((current) => (current + 1) % citySuggestions.length)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveSuggestion((current) => (current <= 0 ? citySuggestions.length - 1 : current - 1))
    } else if (event.key === 'Enter' && activeSuggestion >= 0) {
      event.preventDefault()
      chooseCity(citySuggestions[activeSuggestion].nom)
    }
  }

  async function searchHousing(event) {
    event.preventDefault()
    setListingsLoading(true)
    setHousingError('')

    try {
      const params = {}
      if (searchCity.trim()) params.city = searchCity.trim()
      if (maxRent) params.maxRent = maxRent
      const { data } = await api.get('/housing', { params })
      setListings(data.listings || [])
    } catch (requestError) {
      setHousingError(requestError.response?.data?.message || 'Impossible de lancer la recherche.')
    } finally {
      setListingsLoading(false)
    }
  }

  async function publishHousing(event) {
    event.preventDefault()
    setPublishing(true)
    setHousingError('')
    setPublishMessage('')

    try {
      const coordinates = await geocodeListingAddress(housingForm.address, housingForm.postalCode, housingForm.city)
      const images = await Promise.all(selectedPhotos.map(({ file }) => fileToDataUrl(file)))
      const housingDetails = { ...housingForm }
      delete housingDetails.address
      const { data } = await api.post('/housing', { ...housingDetails, ...coordinates, images })
      setListings((current) => [data.listing, ...current])
      selectedPhotos.forEach(({ preview }) => URL.revokeObjectURL(preview))
      setSelectedPhotos([])
      setPhotoError('')
      setHousingForm(emptyHousingForm)
      setPublishMessage('Ton annonce est publiée.')
    } catch (requestError) {
      setHousingError(requestError.response?.data?.message || requestError.message || 'Impossible de publier cette annonce.')
    } finally {
      setPublishing(false)
    }
  }

  async function saveExistingListingLocation(event, listing) {
    event.preventDefault()
    setLocationSavingId(listing._id)
    setLocationUpdateError('')
    setLocationUpdateMessage('')

    try {
      const coordinates = await geocodeListingAddress(
        locationDrafts[listing._id],
        listing.location?.postalCode,
        listing.location?.city,
      )
      const { data } = await api.patch('/housing/' + listing._id + '/location', coordinates)
      setListings((current) => current.map((item) => item._id === listing._id ? data.listing : item))
      setLocationDrafts((current) => ({ ...current, [listing._id]: '' }))
      setLocationUpdateMessage('Le repère de « ' + listing.title + ' » est maintenant précis.')
    } catch (requestError) {
      setLocationUpdateError(requestError.response?.data?.message || requestError.message || 'Impossible de mettre à jour cette localisation.')
    } finally {
      setLocationSavingId('')
    }
  }

  async function deleteListing(listing) {
    const warning = 'Supprimer définitivement l’annonce « ' + listing.title + ' » ?\n\nSes photos et les candidatures reçues seront aussi supprimées.'
    if (!window.confirm(warning)) return

    setDeletingListingId(listing._id)
    setDeleteListingError('')
    setDeleteListingMessage('')
    try {
      await api.delete('/housing/' + listing._id)
      setListings((current) => current.filter((item) => item._id !== listing._id))
      setApplications((current) => current.filter((item) => item.housing?._id !== listing._id))
      if (selectedHousing?._id === listing._id) setSelectedHousing(null)
      setDeleteListingMessage('L’annonce « ' + listing.title + ' » a été supprimée.')
    } catch (requestError) {
      setDeleteListingError(requestError.response?.data?.message || 'Impossible de supprimer cette annonce.')
    } finally {
      setDeletingListingId('')
    }
  }

  async function handlePhotoChange(event) {
    const files = Array.from(event.target.files || [])
    event.target.value = ''
    const remainingSlots = 5 - selectedPhotos.length
    if (files.length > remainingSlots) {
      setPhotoError('Tu peux ajouter jusqu’à 5 photos par annonce.')
    } else {
      setPhotoError('')
    }
    if (remainingSlots <= 0) return

    setPhotoProcessing(true)
    for (const file of files.slice(0, remainingSlots)) {
      if (!file.type.startsWith('image/')) {
        setPhotoError('Choisis uniquement des fichiers image.')
        continue
      }
      try {
        const optimized = await optimizePhoto(file)
        setSelectedPhotos((current) => [...current, {
          id: crypto.randomUUID(),
          name: file.name,
          file: optimized,
          preview: URL.createObjectURL(optimized),
        }])
      } catch (error) {
        setPhotoError(error.message)
      }
    }
    setPhotoProcessing(false)
  }

  function removePhoto(photoId) {
    const photo = selectedPhotos.find(({ id }) => id === photoId)
    if (photo) URL.revokeObjectURL(photo.preview)
    setSelectedPhotos((current) => current.filter(({ id }) => id !== photoId))
  }

  function updateHousingForm(event) {
    const { name, value } = event.target
    setHousingForm((current) => ({ ...current, [name]: value }))
  }

  const applicationsLoading = Boolean(user) && applicationsLoadedFor !== user.id

  if (checkingSession) {
    return <main className="loading-screen" aria-live="polite">Ouverture de ton espace…</main>
  }

  if (selectedHousing) {
    return (
      <main className="app-shell">
        <header className="topbar housing-detail-topbar">
          <button className="detail-back" type="button" onClick={() => setSelectedHousing(null)}>{user ? '← Retour aux logements' : '← Retour à l’accueil'}</button>
          <a className="wordmark" href="/" aria-label="Logia, accueil">
            <img className="brand-logo" src="/logia-logo.png" alt="Logia" />
          </a>
          {user ? (
            <button className="text-button" type="button" onClick={logout}>Se déconnecter</button>
          ) : (
            <div className="detail-public-actions">
              <button className="text-button" type="button" onClick={() => openAuth('login')}>Connexion</button>
              <button className="home-button home-button-small" type="button" onClick={() => openAuth('register', 'tenant')}>Créer un compte</button>
            </div>
          )}
        </header>
        <section className="housing-detail-section">
          <article className="housing-detail-panel">
            {selectedHousing.images?.length ? (
              <div className="housing-detail-gallery">
                {selectedHousing.images.map((image, index) => <img src={image} alt={`${selectedHousing.title} — photo ${index + 1}`} key={image} />)}
              </div>
            ) : <div className="housing-detail-art" aria-hidden="true">⌂</div>}
            <div className="housing-detail-content">
              <p className="listing-type">{propertyTypeLabels[selectedHousing.propertyType] || 'Logement'}</p>
              <h1>{selectedHousing.title}</h1>
              <p className="listing-location">{selectedHousing.location?.city} · {selectedHousing.location?.postalCode}</p>
              <p className="housing-detail-rent">{formatRent(selectedHousing.rent)} <small>par mois</small></p>
              <div className="housing-detail-facts">
                {selectedHousing.charges > 0 && <span>Charges : {formatRent(selectedHousing.charges)} / mois</span>}
                {selectedHousing.areaM2 && <span>{selectedHousing.areaM2} m²</span>}
                <span>{selectedHousing.bedrooms > 0 ? `${selectedHousing.bedrooms} chambre${selectedHousing.bedrooms > 1 ? 's' : ''}` : 'Nombre de chambres non précisé'}</span>
                <span>Disponible {selectedHousing.availableFrom ? `à partir du ${new Intl.DateTimeFormat('fr-FR').format(new Date(selectedHousing.availableFrom))}` : 'immédiatement'}</span>
              </div>
              <h2>Description</h2>
              <p className="housing-detail-description">{selectedHousing.description || 'Aucune description complémentaire.'}</p>
              {user?.role === 'tenant' && (() => {
                const application = applications.find((item) => item.housing?._id === selectedHousing._id)
                return (
                  <ApplyBox
                    key={selectedHousing._id}
                    application={application}
                    busy={applicationBusyId === selectedHousing._id || (application && applicationBusyId === application._id)}
                    error={applyError}
                    onApply={(message) => applyToHousing(selectedHousing._id, message)}
                    onWithdraw={(item) => updateApplicationStatus(item, 'withdrawn')}
                  />
                )
              })()}
              {!user && <div className="public-detail-cta"><p>Crée ton espace locataire pour postuler à ce logement.</p><button className="home-button home-button-primary" type="button" onClick={() => openAuth('register', 'tenant')}>Créer mon compte <span aria-hidden="true">→</span></button></div>}
            </div>
          </article>
        </section>
      </main>
    )
  }

  if (!user && !showAuth) {
    return <LandingPage
      listings={listings}
      loading={listingsLoading}
      error={housingError}
      onSignIn={() => openAuth('login')}
      onRegister={(nextRole) => openAuth('register', nextRole)}
      onSelectListing={selectHousing}
    />
  }

  if (user) {
    const isLandlord = user.role === 'landlord'
    return (
      <main className="app-shell">
        <header className="topbar">
          <a className="wordmark" href="/" aria-label="Logia, accueil">
            <img className="brand-logo" src="/logia-logo.png" alt="Logia" />
          </a>
          <button className="text-button" type="button" onClick={logout}>Se déconnecter</button>
        </header>
        <section className="dashboard-section">
          <div className="dashboard-heading">
            <div>
              <p className="eyebrow">TON ESPACE LOGIA</p>
              <h1>{isLandlord ? 'Tes logements.' : 'Trouvons ton prochain chez-toi.'}</h1>
              <p className="welcome-copy">Connecté·e avec <strong>{user.email}</strong></p>
            </div>
            <span className="role-pill">{isLandlord ? 'Propriétaire' : 'Locataire'}</span>
          </div>

          {isLandlord ? (
            <div className="landlord-layout">
              <form className="listing-form-panel" onSubmit={publishHousing}>
                <div className="form-heading">
                  <p className="eyebrow">NOUVELLE ANNONCE</p>
                  <h2>Présente ton logement</h2>
                </div>
                <label htmlFor="listing-title">Titre de l’annonce</label>
                <input id="listing-title" name="title" value={housingForm.title} onChange={updateHousingForm} maxLength={120} placeholder="Ex. Studio lumineux près du centre" required />
                <div className="form-row">
                  <div>
                    <label htmlFor="listing-type">Type de logement</label>
                    <select id="listing-type" name="propertyType" value={housingForm.propertyType} onChange={updateHousingForm}>
                      <option value="room">Chambre</option>
                      <option value="studio">Studio</option>
                      <option value="apartment">Appartement</option>
                      <option value="house">Maison</option>
                    </select>
                  </div>
                  <div>
                    <label htmlFor="listing-city">Ville</label>
                    <input id="listing-city" name="city" value={housingForm.city} onChange={updateHousingForm} maxLength={80} placeholder="Paris" required />
                  </div>
                </div>
                <div className="listing-address-field">
                  <label htmlFor="listing-address">Adresse exacte du logement</label>
                  <input id="listing-address" name="address" value={housingForm.address} onChange={updateHousingForm} maxLength={180} placeholder="Ex. 12 rue Victor-Hugo" autoComplete="street-address" required />
                  <p>Cette adresse sert à placer le repère exact sur la carte visible par les locataires. Elle n’est pas affichée en texte dans l’annonce.</p>
                </div>
                <div className="form-row three-columns">
                  <div>
                    <label htmlFor="listing-postal">Code postal</label>
                    <input id="listing-postal" name="postalCode" value={housingForm.postalCode} onChange={updateHousingForm} maxLength={10} placeholder="75011" required />
                  </div>
                  <div>
                    <label htmlFor="listing-rent">Loyer (€ / mois)</label>
                    <input id="listing-rent" name="rent" type="number" min="1" step="1" value={housingForm.rent} onChange={updateHousingForm} required />
                  </div>
                  <div>
                    <label htmlFor="listing-charges">Charges (€)</label>
                    <input id="listing-charges" name="charges" type="number" min="0" step="1" value={housingForm.charges} onChange={updateHousingForm} />
                  </div>
                </div>
                <div className="form-row three-columns">
                  <div>
                    <label htmlFor="listing-area">Surface (m²)</label>
                    <input id="listing-area" name="areaM2" type="number" min="1" step="1" value={housingForm.areaM2} onChange={updateHousingForm} />
                  </div>
                  <div>
                    <label htmlFor="listing-bedrooms">Chambres</label>
                    <input id="listing-bedrooms" name="bedrooms" type="number" min="0" step="1" value={housingForm.bedrooms} onChange={updateHousingForm} />
                  </div>
                  <div>
                    <label htmlFor="listing-date">Disponible à partir du</label>
                    <input id="listing-date" name="availableFrom" type="date" value={housingForm.availableFrom} onChange={updateHousingForm} />
                  </div>
                </div>
                <div className="photo-upload-field">
                  <span className="photo-upload-label">Photos du logement</span>
                  <p className="photo-upload-help">Ajoute jusqu’à 5 photos des pièces et des différents angles.</p>
                  <input
                    className="photo-file-input"
                    id="listing-photos"
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    multiple
                    onChange={handlePhotoChange}
                    disabled={photoProcessing || selectedPhotos.length >= 5}
                  />
                  <label className="photo-picker" htmlFor="listing-photos">
                    <span className="photo-picker-icon" aria-hidden="true">＋</span>
                    <span><strong>{photoProcessing ? 'Préparation des photos…' : 'Ajouter des photos'}</strong><small>JPG, PNG ou WebP · 5 maximum</small></span>
                  </label>
                  {selectedPhotos.length > 0 && (
                    <div className="photo-preview-grid">
                      {selectedPhotos.map((photo) => (
                        <figure className="photo-preview" key={photo.id}>
                          <img src={photo.preview} alt={`Aperçu : ${photo.name}`} />
                          <button type="button" onClick={() => removePhoto(photo.id)} aria-label={`Retirer ${photo.name}`}>×</button>
                        </figure>
                      ))}
                    </div>
                  )}
                  {photoError && <p className="form-error" role="alert">{photoError}</p>}
                </div>
                <label htmlFor="listing-description">Description</label>
                <textarea id="listing-description" name="description" value={housingForm.description} onChange={updateHousingForm} maxLength={5000} rows={4} placeholder="Décris les atouts du logement…" />
                {housingError && <p className="form-error" role="alert">{housingError}</p>}
                {publishMessage && <p className="form-success" role="status">{publishMessage}</p>}
                <button className="submit-button" type="submit" disabled={publishing || photoProcessing}>
                  {photoProcessing ? 'Préparation des photos…' : publishing ? 'Publication…' : 'Publier l’annonce'} {!publishing && !photoProcessing && <span aria-hidden="true">→</span>}
                </button>
              </form>

              <section className="listings-panel" aria-labelledby="my-listings-title">
                <div className="section-heading">
                  <div><p className="eyebrow">TON CATALOGUE</p><h2 id="my-listings-title">Mes annonces</h2></div>
                  <span className="listing-count">{listings.length}</span>
                </div>
                {listings.filter((listing) => listing.location?.precision !== 'address').length > 0 && (
                  <div className="location-correction-list">
                    <p>Ajoute l’adresse exacte des anciennes annonces pour déplacer leur repère au bon endroit. Le point sera visible par les locataires ; l’adresse ne sera pas écrite dans l’annonce.</p>
                    {listings.filter((listing) => listing.location?.precision !== 'address').map((listing) => (
                      <form className="location-correction-item" key={listing._id} onSubmit={(event) => saveExistingListingLocation(event, listing)}>
                        <label htmlFor={'location-address-' + listing._id}>{listing.title} · {listing.location?.city}</label>
                        <div className="location-correction-controls">
                          <input
                            id={'location-address-' + listing._id}
                            value={locationDrafts[listing._id] || ''}
                            onChange={(event) => setLocationDrafts((current) => ({ ...current, [listing._id]: event.target.value }))}
                            placeholder="Numéro et nom de rue"
                            autoComplete="street-address"
                            required
                          />
                          <button type="submit" disabled={locationSavingId === listing._id}>
                            {locationSavingId === listing._id ? 'Recherche…' : 'Placer le repère'}
                          </button>
                        </div>
                      </form>
                    ))}
                    {locationUpdateError && <p className="form-error" role="alert">{locationUpdateError}</p>}
                    {locationUpdateMessage && <p className="form-success" role="status">{locationUpdateMessage}</p>}
                  </div>
                )}
                {deleteListingError && <p className="form-error" role="alert">{deleteListingError}</p>}
                {deleteListingMessage && <p className="form-success" role="status">{deleteListingMessage}</p>}
                <ListingResults
                  listings={listings}
                  loading={listingsLoading}
                  error={housingError}
                  emptyMessage="Tes annonces publiées apparaîtront ici."
                  onSelect={selectHousing}
                  onDelete={deleteListing}
                  deletingId={deletingListingId}
                />
                <LandlordApplications
                  applications={applications}
                  loading={applicationsLoading}
                  error={applicationsError}
                  busyId={applicationBusyId}
                  onDecide={updateApplicationStatus}
                />
              </section>
            </div>
          ) : (
            <>
              <section className="tenant-map-section" aria-labelledby="tenant-map-title">
                <div className="section-heading">
                  <div><p className="eyebrow">LOGEMENTS À PROXIMITÉ</p><h2 id="tenant-map-title">Explore la carte</h2></div>
                  <p className="tenant-map-intro">Zoome sur les rues ou passe en satellite. Sélectionne un repère pour ouvrir l’annonce.</p>
                </div>
                <HousingMap listings={listings} loading={listingsLoading} onSelectListing={selectHousing} />
              </section>

              <section className="listings-panel tenant-listings" aria-labelledby="housing-search-title">
                <div className="section-heading">
                  <div><p className="eyebrow">ANNONCES DISPONIBLES</p><h2 id="housing-search-title">Les logements à découvrir</h2></div>
                </div>
                <form className="search-bar" onSubmit={searchHousing}>
                <div className="city-autocomplete">
                  <label htmlFor="search-city">Ville</label>
                  <input
                    id="search-city"
                    role="combobox"
                    aria-autocomplete="list"
                    aria-expanded={suggestionsOpen && citySuggestions.length > 0}
                    aria-controls="city-suggestions"
                    aria-activedescendant={activeSuggestion >= 0 ? `city-option-${activeSuggestion}` : undefined}
                    autoComplete="off"
                    value={searchCity}
                    onChange={(event) => {
                      selectedCityRef.current = ''
                      setSearchCity(event.target.value)
                    }}
                    onKeyDown={handleCityKeyDown}
                    onFocus={() => citySuggestions.length > 0 && setSuggestionsOpen(true)}
                    onBlur={() => window.setTimeout(() => setSuggestionsOpen(false), 120)}
                    placeholder="Saisis une lettre ou plus"
                  />
                  {suggestionsOpen && citySuggestions.length > 0 && (
                    <ul className="city-suggestions" id="city-suggestions" role="listbox" aria-label="Villes suggérées">
                      {citySuggestions.map((city, index) => (
                        <li key={city.code} role="option" aria-selected={activeSuggestion === index}>
                          <button
                            id={`city-option-${index}`}
                            type="button"
                            className={activeSuggestion === index ? 'city-suggestion active' : 'city-suggestion'}
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => chooseCity(city.nom)}
                          >
                            <span>{city.nom}</span>
                            {city.codeDepartement && <small>{city.codeDepartement}</small>}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  {suggestionsLoading && <span className="suggestions-status" role="status">Recherche de villes…</span>}
                </div>
                <div><label htmlFor="search-rent">Loyer maximum</label><input id="search-rent" type="number" min="0" value={maxRent} onChange={(event) => setMaxRent(event.target.value)} placeholder="€ / mois" /></div>
                <button className="submit-button" type="submit" disabled={listingsLoading}>Rechercher <span aria-hidden="true">→</span></button>
                </form>
                <ListingResults listings={listings} loading={listingsLoading} error={housingError} emptyMessage="Aucun logement ne correspond encore à ta recherche. Essaie une autre ville ou un autre budget." onSelect={selectHousing} />
              </section>

              <TenantApplications
                applications={applications}
                loading={applicationsLoading}
                error={applicationsError}
                busyId={applicationBusyId}
                onWithdraw={(application) => updateApplicationStatus(application, 'withdrawn')}
                onSelectHousing={openHousingFromApplication}
              />
            </>
          )}
        </section>
      </main>
    )
  }

  const registering = mode === 'register'

  return (
    <main className="app-shell auth-shell">
      <header className="topbar">
        <a className="wordmark" href="/" aria-label="Logia, accueil">
          <img className="brand-logo" src="/logia-logo.png" alt="Logia" />
        </a>
        <button className="text-button auth-back-home" type="button" onClick={() => { setShowAuth(false); setPassword(''); setError('') }}>← Retour à l’accueil</button>
      </header>

      <section className="auth-layout" aria-labelledby="auth-title">
        <div className="intro-panel">
          <p className="eyebrow">UN NOUVEAU DÉPART COMMENCE ICI</p>
          <h1>Trouvons le lieu où la suite s’écrit.</h1>
          <p className="intro-copy">
            Logia t’aide à avancer dans ta recherche de logement, avec plus de clarté à chaque étape.
          </p>
          <div className="trust-note">
            <span className="trust-dot" aria-hidden="true" />
            <span>Un espace pensé pour les locataires et les propriétaires.</span>
          </div>
          <div className="decorative-house" aria-hidden="true">
            <div className="house-sun" />
            <div className="house-roof" />
            <div className="house-body"><span /><span /><i /></div>
            <div className="house-ground" />
          </div>
        </div>

        <div className="form-panel">
          <div className="form-heading">
            <p className="eyebrow">{registering ? 'REJOINDRE LOGIA' : 'HEUREUX DE TE REVOIR'}</p>
            <h2 id="auth-title">{registering ? 'Créer mon compte' : 'Me connecter'}</h2>
            <p>{registering ? 'Quelques informations et tu pourras commencer.' : 'Connecte-toi pour retrouver ton espace.'}</p>
          </div>

          <div className="mode-switch" role="tablist" aria-label="Choisir une action">
            <button
              className={registering ? 'mode-button active' : 'mode-button'}
              type="button" role="tab" aria-selected={registering}
              onClick={() => switchMode('register')}
            >Créer un compte</button>
            <button
              className={!registering ? 'mode-button active' : 'mode-button'}
              type="button" role="tab" aria-selected={!registering}
              onClick={() => switchMode('login')}
            >Connexion</button>
          </div>

          <form className="auth-form" onSubmit={handleSubmit}>
            <label htmlFor="email">Adresse e-mail</label>
            <input
              id="email" type="email" autoComplete="email" placeholder="toi@exemple.fr"
              value={email} onChange={(event) => setEmail(event.target.value)} required
            />
            <label htmlFor="password">Mot de passe</label>
            <div className="password-field">
              <input
                id="password" type={showPassword ? 'text' : 'password'}
                autoComplete={registering ? 'new-password' : 'current-password'}
                placeholder={registering ? '8 caractères minimum' : 'Ton mot de passe'}
                minLength={registering ? 8 : undefined} maxLength={72}
                value={password} onChange={(event) => setPassword(event.target.value)} required
              />
              <button
                className="password-toggle" type="button"
                aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                aria-pressed={showPassword}
                onClick={() => setShowPassword((visible) => !visible)}
>
                <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                  {showPassword ? (
                    <>
                      <path d="M3 3l18 18" />
                      <path d="M10.6 10.6a2 2 0 002.8 2.8" />
                      <path d="M9.9 5.2A10.8 10.8 0 0112 5c5 0 8.5 4.2 9.5 6-.4.8-1.3 2.1-2.7 3.3" />
                      <path d="M6.2 6.2C4.2 7.4 2.9 9.2 2.5 11c.8 1.8 4.3 7 9.5 7 1.1 0 2.1-.2 3-.6" />
                    </>
                  ) : (
                    <>
                      <path d="M2.5 12s3.5-7 9.5-7 9.5 7 9.5 7-3.5 7-9.5 7-9.5-7-9.5-7z" />
                      <circle cx="12" cy="12" r="3" />
                    </>
                  )}
                </svg>
              </button>
            </div>

            {registering && (
              <>
                <label htmlFor="role">Je suis</label>
                <select id="role" value={role} onChange={(event) => setRole(event.target.value)}>
                  <option value="tenant">À la recherche d’un logement</option>
                  <option value="landlord">Propriétaire d’un logement</option>
                </select>
              </>
            )}

            {error && <p className="form-error" role="alert">{error}</p>}
            <button className="submit-button" type="submit" disabled={loading}>
              {loading ? 'Un instant…' : registering ? 'Créer mon compte' : 'Me connecter'}
              {!loading && <span aria-hidden="true">→</span>}
            </button>
          </form>
          <p className="privacy-note">Tes informations servent à créer et sécuriser ton compte Logia.</p>
        </div>
      </section>
      <footer className="site-footer"><span>logia.</span> Une recherche de logement plus humaine.</footer>
    </main>
  )
}

function ListingResults({ listings, loading, error, emptyMessage, onSelect, onDelete, deletingId }) {
  if (loading) return <p className="listings-feedback">Chargement des logements…</p>
  if (error) return <p className="listings-feedback form-error" role="alert">{error}</p>
  if (!listings.length) return <p className="listings-feedback">{emptyMessage}</p>

  return (
    <div className="listing-grid">
      {listings.map((listing) => (
        <article
          className="housing-card"
          key={listing._id}
          role="button"
          tabIndex={0}
          aria-label={`Voir le détail : ${listing.title}`}
          onClick={() => onSelect(listing)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              onSelect(listing)
            }
          }}
        >
          <div className="listing-art" aria-hidden="true">
            {listing.images?.[0] ? <img src={listing.images[0]} alt="" /> : <span>⌂</span>}
          </div>
          <div className="housing-card-content">
            <p className="listing-type">{propertyTypeLabels[listing.propertyType] || 'Logement'}{listing.status === 'published' ? ' · Publiée' : ''}</p>
            <h3>{listing.title}</h3>
            <p className="listing-location">{listing.location?.city} · {listing.location?.postalCode}</p>
            <p className="listing-description">{listing.description || 'Une nouvelle annonce logement sur Logia.'}</p>
            <div className="listing-meta">
              <strong>{formatRent(listing.rent)}<small> / mois</small></strong>
              {listing.areaM2 && <span>{listing.areaM2} m²</span>}
              {listing.bedrooms > 0 && <span>{listing.bedrooms} ch.</span>}
            </div>
            {listing.status && listing.status !== 'published' && <p className="draft-note">Brouillon</p>}
            <div className="housing-card-footer">
              <p className="housing-card-link">Voir le détail <span aria-hidden="true">→</span></p>
              {onDelete && (
                <button
                  className="housing-card-delete"
                  type="button"
                  disabled={deletingId === listing._id}
                  aria-label={`Supprimer l’annonce : ${listing.title}`}
                  onClick={(event) => {
                    event.stopPropagation()
                    onDelete(listing)
                  }}
                  onKeyDown={(event) => event.stopPropagation()}
                >
                  {deletingId === listing._id ? 'Suppression…' : 'Supprimer'}
                </button>
              )}
            </div>
          </div>
        </article>
      ))}
    </div>
  )
}

export default App
