import { useEffect, useState } from 'react'
import api from './lib/api'
import { dossierCategoryLabels } from './lib/dossier'
import { formatEuros, fullName, guarantorLabels, situationLabels } from './lib/profile'
import ApplicantDossier from './ApplicantDossier'
import ConfirmButton from './ConfirmButton'
import { MatchBadge, MatchBreakdown } from './MatchScore'
import './Applications.css'

const applicationStatusLabels = {
  pending: 'En attente',
  accepted: 'Acceptée',
  rejected: 'Refusée',
  withdrawn: 'Retirée',
}

function formatDate(value) {
  return value ? new Intl.DateTimeFormat('fr-FR').format(new Date(value)) : ''
}

function StatusBadge({ status }) {
  return <span className={`application-status status-${status}`}>{applicationStatusLabels[status] || status}</span>
}

// Encadré affiché sur la page d'une annonce pour un locataire connecté.
// Le locataire ne peut postuler que si son profil et son dossier sont complets.
export function ApplyBox({ application, busy, error, onApply, onWithdraw, onCompleteDossier, onCompleteProfile }) {
  const [message, setMessage] = useState('')
  const [readiness, setReadiness] = useState(null)
  const [readinessError, setReadinessError] = useState('')
  const hasActiveApplication = Boolean(application && application.status !== 'withdrawn')

  useEffect(() => {
    if (hasActiveApplication) return undefined
    let active = true
    api.get('/applications/readiness')
      .then(({ data }) => { if (active) { setReadiness(data); setReadinessError('') } })
      .catch((requestError) => {
        if (active) setReadinessError(requestError.response?.data?.message || 'Impossible de vérifier ton dossier.')
      })
    return () => { active = false }
    // On revérifie après une erreur d'envoi (par exemple si une pièce a été retirée entre-temps).
  }, [hasActiveApplication, error])

  if (hasActiveApplication) {
    return (
      <div className="apply-box">
        <div className="apply-box-heading">
          <h2>Ta candidature</h2>
          <StatusBadge status={application.status} />
        </div>
        <p className="apply-box-note">Envoyée le {formatDate(application.createdAt)}.</p>
        {application.message && <p className="apply-box-message">« {application.message} »</p>}
        {error && <p className="form-error" role="alert">{error}</p>}
        {application.status === 'pending' && (
          <ConfirmButton
            label="Retirer ma candidature"
            question="Retirer ta candidature ?"
            confirmLabel="Oui, retirer"
            busy={busy}
            busyLabel="Retrait…"
            onConfirm={() => onWithdraw(application)}
          />
        )}
      </div>
    )
  }

  if (readinessError) {
    return <div className="apply-box"><p className="form-error" role="alert">{readinessError}</p></div>
  }

  if (!readiness) {
    return <div className="apply-box"><p className="apply-box-note">Vérification de ton dossier…</p></div>
  }

  if (!readiness.ready) {
    const missing = readiness.dossier?.missing || []
    return (
      <div className="apply-box apply-box-blocked" role="status">
        <h2>Complète ton dossier pour postuler</h2>
        <p className="apply-box-note">{readiness.message}</p>
        {readiness.profileComplete && missing.length > 0 && (
          <ul className="apply-box-missing">
            {missing.map((key) => <li key={key}>{dossierCategoryLabels[key] || key}</li>)}
          </ul>
        )}
        <button
          className="submit-button"
          type="button"
          onClick={readiness.profileComplete ? onCompleteDossier : onCompleteProfile}
        >
          {readiness.profileComplete ? 'Compléter mon dossier' : 'Compléter mon profil'} <span aria-hidden="true">→</span>
        </button>
      </div>
    )
  }

  return (
    <form
      className="apply-box"
      onSubmit={(event) => {
        event.preventDefault()
        onApply(message)
      }}
    >
      <h2>Ce logement t’intéresse ?</h2>
      <p className="apply-box-ready">✓ Ton dossier est complet : le propriétaire pourra le consulter.</p>
      <label htmlFor="application-message">Message au propriétaire (facultatif)</label>
      <textarea
        id="application-message"
        value={message}
        onChange={(event) => setMessage(event.target.value)}
        maxLength={2000}
        rows={4}
        placeholder="Présente-toi en quelques mots : situation, date d’arrivée souhaitée…"
      />
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="submit-button" type="submit" disabled={busy}>
        {busy ? 'Envoi…' : 'Envoyer ma candidature'} {!busy && <span aria-hidden="true">→</span>}
      </button>
    </form>
  )
}

// Résumé du candidat visible par le propriétaire.
function ApplicantFacts({ tenant }) {
  if (!tenant) return null
  const facts = [
    tenant.situation && (situationLabels[tenant.situation] + (tenant.occupationDetail ? ` · ${tenant.occupationDetail}` : '')),
    tenant.monthlyIncome != null && `${formatEuros(tenant.monthlyIncome)} nets / mois`,
    tenant.guarantorType && guarantorLabels[tenant.guarantorType],
    tenant.householdSize && `${tenant.householdSize} occupant${tenant.householdSize > 1 ? 's' : ''}`,
    tenant.desiredMoveIn && `Emménagement le ${formatDate(tenant.desiredMoveIn)}`,
  ].filter(Boolean)
  if (!facts.length) return <p className="application-facts-empty">Profil locataire pas encore complété.</p>
  return <ul className="application-facts">{facts.map((fact) => <li key={fact}>{fact}</li>)}</ul>
}

// État du dossier du candidat, avec la possibilité de l'ouvrir.
function ApplicationDossier({ application }) {
  const [open, setOpen] = useState(false)
  const dossier = application.dossier
  const tenantId = application.tenant?.id
  if (!dossier || !tenantId) return null

  const active = application.status === 'pending' || application.status === 'accepted'
  return (
    <>
      <div className="application-dossier-row">
        <span className={'dossier-badge' + (dossier.complete ? ' complete' : '')}>
          {dossier.complete ? 'Dossier complet' : `Dossier : ${dossier.providedCount} / ${dossier.requiredCount} pièces`}
        </span>
        {active && dossier.documentCount > 0 && (
          <button className="application-dossier-toggle" type="button" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
            {open ? 'Masquer le dossier' : 'Voir le dossier'}
          </button>
        )}
      </div>
      {open && active && <ApplicantDossier tenantId={tenantId} />}
    </>
  )
}

// Liste des candidatures du locataire.
export function TenantApplications({ applications, loading, error, busyId, onWithdraw, onSelectHousing }) {
  const visible = applications.filter((application) => application.status !== 'withdrawn')

  return (
    <section className="listings-panel applications-panel" aria-labelledby="tenant-applications-title">
      <div className="section-heading">
        <div><p className="eyebrow">TON SUIVI</p><h2 id="tenant-applications-title">Mes candidatures</h2></div>
        <span className="listing-count">{visible.length}</span>
      </div>
      {loading ? <p className="listings-feedback">Chargement des candidatures…</p>
        : error ? <p className="listings-feedback form-error" role="alert">{error}</p>
          : !visible.length ? <p className="listings-feedback">Tu n’as pas encore postulé. Ouvre une annonce pour envoyer ta candidature.</p>
            : (
              <ul className="application-list">
                {visible.map((application) => (
                  <li className="application-item" key={application._id}>
                    <div className="application-main">
                      {application.housing ? (
                        <button className="application-title" type="button" onClick={() => onSelectHousing(application.housing)}>
                          {application.housing.title}
                        </button>
                      ) : <span className="application-title">Annonce supprimée</span>}
                      <p className="application-meta">
                        {application.housing?.location?.city} · Envoyée le {formatDate(application.createdAt)}
                      </p>
                    </div>
                    <div className="application-actions">
                      <StatusBadge status={application.status} />
                      {application.status === 'pending' && (
                        <ConfirmButton
                          label="Retirer"
                          ariaLabel={`Retirer ma candidature pour ${application.housing?.title || 'ce logement'}`}
                          question="Retirer ta candidature ?"
                          confirmLabel="Oui, retirer"
                          busy={busyId === application._id}
                          busyLabel="Retrait…"
                          onConfirm={() => onWithdraw(application)}
                        />
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
    </section>
  )
}

// Candidatures reçues par le propriétaire.
// Score du candidat pour ce logement, avec son détail à la demande.
function ApplicationMatch({ match }) {
  const [open, setOpen] = useState(false)
  if (!match || match.score === null) return null
  return (
    <div className="application-match">
      <div className="application-dossier-row">
        <MatchBadge match={match} />
        <span className="application-match-label">{match.level.label}</span>
        <button className="application-dossier-toggle" type="button" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
          {open ? 'Masquer le détail' : 'Voir le détail du score'}
        </button>
      </div>
      {open && <MatchBreakdown match={match} />}
    </div>
  )
}

const sortOptions = {
  match: (a, b) => (b.match?.score ?? -1) - (a.match?.score ?? -1) || new Date(b.createdAt) - new Date(a.createdAt),
  date: (a, b) => new Date(b.createdAt) - new Date(a.createdAt),
}

export function LandlordApplications({ applications, loading, error, busyId, onDecide }) {
  const [sortBy, setSortBy] = useState('match')
  const pendingCount = applications.filter((application) => application.status === 'pending').length
  const sorted = [...applications].sort(sortOptions[sortBy])

  return (
    <section className="listings-panel applications-panel" aria-labelledby="received-applications-title">
      <div className="section-heading">
        <div><p className="eyebrow">TES CANDIDATS</p><h2 id="received-applications-title">Candidatures reçues</h2></div>
        <span className="listing-count" title="En attente de réponse">{pendingCount}</span>
      </div>
      {applications.length > 1 && (
        <div className="applications-sort">
          <label htmlFor="applications-sort">Trier par</label>
          <select id="applications-sort" value={sortBy} onChange={(event) => setSortBy(event.target.value)}>
            <option value="match">Compatibilité</option>
            <option value="date">Date de réception</option>
          </select>
        </div>
      )}
      {loading ? <p className="listings-feedback">Chargement des candidatures…</p>
        : error ? <p className="listings-feedback form-error" role="alert">{error}</p>
          : !applications.length ? <p className="listings-feedback">Les candidatures des locataires apparaîtront ici.</p>
            : (
              <ul className="application-list">
                {sorted.map((application) => (
                  <li className="application-item" key={application._id}>
                    <div className="application-main">
                      <span className="application-title">{fullName(application.tenant) || application.tenant?.email || 'Locataire'}</span>
                      <p className="application-meta">
                        Pour « {application.housing?.title || 'Annonce supprimée'} » · Reçue le {formatDate(application.createdAt)}
                        {fullName(application.tenant) && application.tenant?.email && <> · <a href={`mailto:${application.tenant.email}`}>{application.tenant.email}</a></>}
                      </p>
                      <ApplicationMatch match={application.match} />
                      <ApplicantFacts tenant={application.tenant} />
                      <ApplicationDossier application={application} />
                      {application.message && <p className="application-message">« {application.message} »</p>}
                    </div>
                    <div className="application-actions">
                      <StatusBadge status={application.status} />
                      {application.status === 'pending' && (
                        <div className="application-decision">
                          <button className="decision-accept" type="button" disabled={busyId === application._id} onClick={() => onDecide(application, 'accepted')}>Accepter</button>
                          <button className="decision-reject" type="button" disabled={busyId === application._id} onClick={() => onDecide(application, 'rejected')}>Refuser</button>
                        </div>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
    </section>
  )
}
