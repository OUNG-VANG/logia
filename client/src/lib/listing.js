// Outils partagés pour les annonces : géocodage de l'adresse et préparation des photos.

export const propertyTypeLabels = {
  room: 'Chambre',
  studio: 'Studio',
  apartment: 'Appartement',
  house: 'Maison',
}

export const listingStatusLabels = {
  published: 'En ligne',
  rented: 'Louée',
  draft: 'Hors ligne',
}

export function normalizeCityName(value) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('fr-FR').trim()
}

export async function geocodeListingAddress(address, postalCode, city) {
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

export function optimizePhoto(file) {
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

export function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(new Error('Impossible de lire une photo sélectionnée.'))
    reader.readAsDataURL(file)
  })
}
