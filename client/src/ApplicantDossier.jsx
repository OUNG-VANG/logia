import { useEffect, useState } from 'react'
import api from './lib/api'
import { dossierCategories, formatFileSize, openDossierDocument } from './lib/dossier'
import './Dossier.css'

// Dossier d'un candidat, vu par le propriétaire depuis « Candidatures reçues ».
function ApplicantDossier({ tenantId }) {
  const [documents, setDocuments] = useState([])
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    api.get('/dossier/applicants/' + tenantId)
      .then(({ data }) => {
        if (!active) return
        setDocuments(data.documents || [])
        setSummary(data.summary)
      })
      .catch((requestError) => {
        if (active) setError(requestError.response?.data?.message || 'Impossible de charger ce dossier.')
      })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [tenantId])

  async function openDocument(document) {
    setError('')
    try {
      await openDossierDocument(document._id)
    } catch {
      setError('Impossible d’ouvrir ce fichier.')
    }
  }

  if (loading) return <p className="applicant-dossier-feedback">Chargement du dossier…</p>
  if (error && !summary) return <p className="applicant-dossier-feedback form-error" role="alert">{error}</p>

  const required = new Set(summary?.required || [])
  const categories = dossierCategories.filter((category) => (
    required.has(category.key) || documents.some((document) => document.category === category.key)
  ))

  return (
    <div className="applicant-dossier">
      {error && <p className="form-error" role="alert">{error}</p>}
      <ul>
        {categories.map((category) => {
          const files = documents.filter((document) => document.category === category.key)
          return (
            <li key={category.key} className={files.length ? 'provided' : 'missing'}>
              <span className="applicant-dossier-label">
                <span aria-hidden="true">{files.length ? '✓' : '–'}</span> {category.label}
              </span>
              {files.length ? (
                <span className="applicant-dossier-files">
                  {files.map((document) => (
                    <button type="button" key={document._id} onClick={() => openDocument(document)}>
                      {document.originalName} <small>{formatFileSize(document.size)}</small>
                    </button>
                  ))}
                </span>
              ) : <span className="applicant-dossier-missing">Non fourni</span>}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

export default ApplicantDossier
