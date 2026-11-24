import { useState } from 'react'
import api from './lib/api'
import { fileToDataUrl, geocodeListingAddress, optimizePhoto } from './lib/listing'
import './EditListingPanel.css'

function dateValue(value) {
  return value ? String(value).slice(0, 10) : ''
}

// Formulaire de modification d'une annonce existante (propriétaire).
function EditListingPanel({ listing, onSaved, onCancel }) {
  const [form, setForm] = useState({
    title: listing.title || '',
    description: listing.description || '',
    propertyType: listing.propertyType || 'apartment',
    city: listing.location?.city || '',
    postalCode: listing.location?.postalCode || '',
    address: '',
    rent: listing.rent ?? '',
    charges: listing.charges ?? 0,
    areaM2: listing.areaM2 ?? '',
    bedrooms: listing.bedrooms ?? 0,
    availableFrom: dateValue(listing.availableFrom),
    status: listing.status || 'published',
  })
  const [removedImages, setRemovedImages] = useState([])
  const [newPhotos, setNewPhotos] = useState([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const keptImages = (listing.images || []).filter((image) => !removedImages.includes(image))
  const remainingSlots = 5 - keptImages.length - newPhotos.length
  const id = (name) => `edit-${listing._id}-${name}`

  function update(event) {
    setForm((current) => ({ ...current, [event.target.name]: event.target.value }))
  }

  async function addPhotos(event) {
    const files = Array.from(event.target.files || []).slice(0, Math.max(remainingSlots, 0))
    event.target.value = ''
    setError('')
    for (const file of files) {
      if (!file.type.startsWith('image/')) {
        setError('Choisis uniquement des fichiers image.')
        continue
      }
      try {
        const optimized = await optimizePhoto(file)
        setNewPhotos((current) => [...current, { id: crypto.randomUUID(), file: optimized, preview: URL.createObjectURL(optimized) }])
      } catch (photoError) {
        setError(photoError.message)
      }
    }
  }

  function removeNewPhoto(photoId) {
    setNewPhotos((current) => {
      const photo = current.find((item) => item.id === photoId)
      if (photo) URL.revokeObjectURL(photo.preview)
      return current.filter((item) => item.id !== photoId)
    })
  }

  async function save(event) {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      const payload = { ...form, removeImages: removedImages }
      delete payload.address
      if (form.address.trim()) {
        Object.assign(payload, await geocodeListingAddress(form.address, form.postalCode, form.city))
      }
      if (newPhotos.length) payload.images = await Promise.all(newPhotos.map(({ file }) => fileToDataUrl(file)))
      const { data } = await api.patch('/housing/' + listing._id, payload)
      newPhotos.forEach(({ preview }) => URL.revokeObjectURL(preview))
      onSaved(data.listing, data.closedApplications || 0)
    } catch (requestError) {
      setError(requestError.response?.data?.message || requestError.message || 'Impossible d’enregistrer l’annonce.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form className="listing-form-panel edit-listing-panel" onSubmit={save} aria-labelledby={id('title-heading')}>
      <div className="section-heading">
        <div>
          <p className="eyebrow">MODIFIER L’ANNONCE</p>
          <h2 id={id('title-heading')}>{listing.title}</h2>
        </div>
        <button className="text-button" type="button" onClick={onCancel}>Annuler</button>
      </div>

      <label htmlFor={id('status')}>Statut</label>
      <select id={id('status')} name="status" value={form.status} onChange={update}>
        <option value="published">En ligne : visible par les locataires</option>
        <option value="rented">Louée : retirée des recherches</option>
        <option value="draft">Hors ligne : masquée temporairement</option>
      </select>
      {listing.status === 'published' && form.status !== 'published' && (
        <p className="edit-listing-note">Les candidatures encore en attente seront clôturées et les locataires le verront.</p>
      )}

      <label htmlFor={id('title')}>Titre de l’annonce</label>
      <input id={id('title')} name="title" value={form.title} onChange={update} maxLength={120} required />
      <div className="form-row">
        <div>
          <label htmlFor={id('type')}>Type de logement</label>
          <select id={id('type')} name="propertyType" value={form.propertyType} onChange={update}>
            <option value="room">Chambre</option>
            <option value="studio">Studio</option>
            <option value="apartment">Appartement</option>
            <option value="house">Maison</option>
          </select>
        </div>
        <div>
          <label htmlFor={id('city')}>Ville</label>
          <input id={id('city')} name="city" value={form.city} onChange={update} maxLength={80} required />
        </div>
      </div>
      <div className="form-row">
        <div>
          <label htmlFor={id('postal')}>Code postal</label>
          <input id={id('postal')} name="postalCode" value={form.postalCode} onChange={update} maxLength={10} required />
        </div>
        <div>
          <label htmlFor={id('address')}>Nouvelle adresse <span className="optional-hint">facultatif</span></label>
          <input id={id('address')} name="address" value={form.address} onChange={update} maxLength={180} placeholder="Vide = adresse inchangée" autoComplete="street-address" />
        </div>
      </div>
      <div className="form-row three-columns">
        <div>
          <label htmlFor={id('rent')}>Loyer (€ / mois)</label>
          <input id={id('rent')} name="rent" type="number" min="1" step="1" value={form.rent} onChange={update} required />
        </div>
        <div>
          <label htmlFor={id('charges')}>Charges (€)</label>
          <input id={id('charges')} name="charges" type="number" min="0" step="1" value={form.charges} onChange={update} />
        </div>
        <div>
          <label htmlFor={id('area')}>Surface (m²)</label>
          <input id={id('area')} name="areaM2" type="number" min="1" step="1" value={form.areaM2} onChange={update} />
        </div>
      </div>
      <div className="form-row">
        <div>
          <label htmlFor={id('bedrooms')}>Chambres</label>
          <input id={id('bedrooms')} name="bedrooms" type="number" min="0" step="1" value={form.bedrooms} onChange={update} />
        </div>
        <div>
          <label htmlFor={id('date')}>Disponible à partir du</label>
          <input id={id('date')} name="availableFrom" type="date" value={form.availableFrom} onChange={update} />
        </div>
      </div>

      <span className="photo-upload-label">Photos ({keptImages.length + newPhotos.length} / 5)</span>
      <div className="photo-preview-grid edit-photo-grid">
        {(listing.images || []).map((image) => {
          const removed = removedImages.includes(image)
          return (
            <figure className={'photo-preview' + (removed ? ' removed' : '')} key={image}>
              <img src={image} alt="" />
              <button
                type="button"
                onClick={() => setRemovedImages((current) => removed ? current.filter((item) => item !== image) : [...current, image])}
                aria-label={removed ? 'Garder cette photo' : 'Retirer cette photo'}
              >
                {removed ? '↺' : '×'}
              </button>
            </figure>
          )
        })}
        {newPhotos.map((photo) => (
          <figure className="photo-preview new" key={photo.id}>
            <img src={photo.preview} alt="Nouvelle photo" />
            <button type="button" onClick={() => removeNewPhoto(photo.id)} aria-label="Retirer cette nouvelle photo">×</button>
          </figure>
        ))}
      </div>
      {remainingSlots > 0 && (
        <>
          <input className="photo-file-input" id={id('photos')} type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={addPhotos} />
          <label className="photo-picker" htmlFor={id('photos')}>
            <span className="photo-picker-icon" aria-hidden="true">＋</span>
            <span><strong>Ajouter des photos</strong><small>Encore {remainingSlots} possible{remainingSlots > 1 ? 's' : ''}</small></span>
          </label>
        </>
      )}

      <label htmlFor={id('description')}>Description</label>
      <textarea id={id('description')} name="description" value={form.description} onChange={update} maxLength={5000} rows={4} />

      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="submit-button" type="submit" disabled={saving}>
        {saving ? 'Enregistrement…' : 'Enregistrer les modifications'} {!saving && <span aria-hidden="true">→</span>}
      </button>
    </form>
  )
}

export default EditListingPanel
