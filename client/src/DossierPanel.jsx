import { useEffect, useState } from 'react'
import api from './lib/api'
import {
  dossierCategories, fileToDataUrl, forbiddenDocuments, formatFileSize, openDossierDocument,
} from './lib/dossier'
import './Dossier.css'

const maxFileBytes = 5 * 1024 * 1024
const acceptedTypes = ['application/pdf', 'image/jpeg', 'image/png']

// « Mon dossier » : le locataire dépose les pièces que les propriétaires peuvent consulter quand il postule.
function DossierPanel({ guarantorType }) {
  const [documents, setDocuments] = useState([])
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busyCategory, setBusyCategory] = useState('')
  const [busyDocumentId, setBusyDocumentId] = useState('')

  useEffect(() => {
    let active = true
    api.get('/dossier/mine')
      .then(({ data }) => {
        if (!active) return
        setDocuments(data.documents || [])
        setSummary(data.summary)
      })
      .catch((requestError) => {
        if (active) setError(requestError.response?.data?.message || 'Impossible de charger ton dossier.')
      })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [guarantorType])

  async function addFiles(category, event) {
    const files = Array.from(event.target.files || [])
    event.target.value = ''
    if (!files.length) return

    setBusyCategory(category)
    setError('')
    for (const file of files) {
      if (!acceptedTypes.includes(file.type)) {
        setError(`« ${file.name} » n’est pas un PDF, un JPG ou un PNG.`)
        continue
      }
      if (file.size > maxFileBytes) {
        setError(`« ${file.name} » dépasse 5 Mo. Compresse-le ou scanne-le en plus basse qualité.`)
        continue
      }
      try {
        const data = await fileToDataUrl(file)
        const response = await api.post('/dossier/documents', { category, fileName: file.name, data })
        setDocuments((current) => [...current, response.data.document])
        setSummary(response.data.summary)
      } catch (requestError) {
        setError(requestError.response?.data?.message || requestError.message || 'Impossible d’ajouter ce fichier.')
        break
      }
    }
    setBusyCategory('')
  }

  async function removeDocument(document) {
    if (!window.confirm(`Retirer « ${document.originalName} » de ton dossier ?`)) return
    setBusyDocumentId(document._id)
    setError('')
    try {
      const { data } = await api.delete('/dossier/documents/' + document._id)
      setDocuments((current) => current.filter((item) => item._id !== document._id))
      setSummary(data.summary)
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Impossible de retirer ce fichier.')
    } finally {
      setBusyDocumentId('')
    }
  }

  async function openDocument(document) {
    setError('')
    try {
      await openDossierDocument(document._id)
    } catch {
      setError('Impossible d’ouvrir ce fichier.')
    }
  }

  const required = new Set(summary?.required || [])
  const progress = summary?.requiredCount ? Math.round((summary.providedCount / summary.requiredCount) * 100) : 0

  return (
    <section className="listings-panel dossier-panel" aria-labelledby="dossier-title">
      <div className="section-heading">
        <div><p className="eyebrow">TA CANDIDATURE</p><h2 id="dossier-title">Mon dossier</h2></div>
        {summary && (
          <span className={'dossier-badge' + (summary.complete ? ' complete' : '')}>
            {summary.complete ? 'Dossier complet' : `${summary.providedCount} / ${summary.requiredCount} pièces`}
          </span>
        )}
      </div>
      <p className="dossier-intro">
        Dépose une fois tes justificatifs : les propriétaires des logements auxquels tu postules pourront les consulter
        tant que ta candidature est en cours. Personne d’autre n’y a accès.
      </p>

      {summary && (
        <div className="dossier-progress" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} aria-label="Complétude du dossier">
          <span style={{ width: progress + '%' }} />
        </div>
      )}

      {error && <p className="form-error" role="alert">{error}</p>}

      {loading ? <p className="listings-feedback">Chargement de ton dossier…</p> : (
        <ul className="dossier-list">
          {dossierCategories.map((category) => {
            const files = documents.filter((document) => document.category === category.key)
            const inputId = 'dossier-file-' + category.key
            const isRequired = required.has(category.key)
            return (
              <li className={'dossier-item' + (files.length ? ' provided' : '')} key={category.key}>
                <div className="dossier-item-heading">
                  <span className="dossier-check" aria-hidden="true">{files.length ? '✓' : ''}</span>
                  <div>
                    <h3>
                      {category.label}
                      <span className={'dossier-tag' + (isRequired ? ' required' : '')}>{isRequired ? 'Obligatoire' : 'Facultatif'}</span>
                    </h3>
                    <p>{category.help}</p>
                    {category.key === 'guarantor' && isRequired && <p className="dossier-note">Obligatoire car tu as indiqué avoir un garant dans ton profil.</p>}
                  </div>
                  <input
                    className="dossier-file-input"
                    id={inputId}
                    type="file"
                    accept="application/pdf,image/jpeg,image/png"
                    multiple
                    disabled={Boolean(busyCategory) || files.length >= 5}
                    onChange={(event) => addFiles(category.key, event)}
                  />
                  <label className="dossier-add" htmlFor={inputId} aria-disabled={Boolean(busyCategory) || files.length >= 5}>
                    {busyCategory === category.key ? 'Envoi…' : files.length ? 'Ajouter' : 'Déposer'}
                  </label>
                </div>
                {files.length > 0 && (
                  <ul className="dossier-files">
                    {files.map((document) => (
                      <li key={document._id}>
                        <button className="dossier-file-name" type="button" onClick={() => openDocument(document)}>
                          {document.originalName}
                        </button>
                        <small>{document.mimeType === 'application/pdf' ? 'PDF' : 'Image'} · {formatFileSize(document.size)}</small>
                        <button className="dossier-file-remove" type="button" disabled={busyDocumentId === document._id} onClick={() => removeDocument(document)} aria-label={`Retirer ${document.originalName}`}>
                          Retirer
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            )
          })}
        </ul>
      )}

      <p className="dossier-legal">
        PDF, JPG ou PNG, 5 Mo maximum par fichier. Un propriétaire n’a pas le droit de te demander : {forbiddenDocuments.join(', ')}.
      </p>
    </section>
  )
}

export default DossierPanel
