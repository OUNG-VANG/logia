import api from './api'

// Pièces du dossier, dans l'ordre d'affichage. Liste fondée sur le décret n° 2015-1437.
export const dossierCategories = [
  {
    key: 'identity',
    label: 'Pièce d’identité',
    help: 'Carte d’identité, passeport, titre de séjour ou permis de conduire.',
  },
  {
    key: 'address',
    label: 'Justificatif de domicile actuel',
    help: 'Tes 3 dernières quittances de loyer, une attestation d’hébergement ou ton dernier avis de taxe foncière.',
  },
  {
    key: 'activity',
    label: 'Justificatif de situation',
    help: 'Contrat de travail ou attestation employeur, carte d’étudiant ou certificat de scolarité, extrait Kbis, carte professionnelle…',
  },
  {
    key: 'income',
    label: 'Justificatifs de ressources',
    help: 'Tes 3 derniers bulletins de salaire, attestation de bourse, de pension ou d’allocations, derniers bilans…',
  },
  {
    key: 'tax',
    label: 'Dernier avis d’imposition',
    help: 'Recommandé : ton dernier avis d’imposition ou de non-imposition.',
  },
  {
    key: 'guarantor',
    label: 'Dossier du garant',
    help: 'Certificat Visale, ou pour un garant : pièce d’identité, justificatif de domicile, de situation et de ressources.',
  },
]

export const dossierCategoryLabels = Object.fromEntries(dossierCategories.map(({ key, label }) => [key, label]))

// Pièces qu'un propriétaire n'a pas le droit de demander (décret n° 2015-1437).
export const forbiddenDocuments = [
  'photo d’identité',
  'carte Vitale',
  'relevé de compte bancaire',
  'attestation de bonne tenue de compte',
  'chèque de réservation',
  'dossier médical',
  'extrait de casier judiciaire',
]

export function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(new Error('Impossible de lire ce fichier.'))
    reader.readAsDataURL(file)
  })
}

export function formatFileSize(bytes) {
  if (bytes < 1024 * 1024) return Math.max(1, Math.round(bytes / 1024)) + ' Ko'
  return (bytes / (1024 * 1024)).toFixed(1).replace('.', ',') + ' Mo'
}

// Les fichiers sont protégés par le jeton : on les télécharge avec l'API puis on les ouvre dans un onglet.
export async function openDossierDocument(documentId) {
  const preview = window.open('', '_blank')
  try {
    const { data } = await api.get('/dossier/documents/' + documentId + '/file', { responseType: 'blob' })
    const url = URL.createObjectURL(data)
    if (preview) preview.location.href = url
    else window.location.assign(url)
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
  } catch (error) {
    preview?.close()
    throw error
  }
}
