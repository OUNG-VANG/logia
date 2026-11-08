import { useEffect, useState } from 'react'
import api from './lib/api'
import './MatchScore.css'

// Pastille du score de compatibilité (0 à 100).
export function MatchBadge({ match, size = 'normal' }) {
  if (!match || match.score === null || match.score === undefined) return null
  return (
    <span className={`match-badge level-${match.level?.key || 'low'} size-${size}`} title={match.level?.label}>
      <strong>{match.score}</strong>
      <small>% compatible</small>
    </span>
  )
}

// Détail du score : chaque critère avec sa note, son poids et son explication.
export function MatchBreakdown({ match }) {
  if (!match) return null
  return (
    <div className="match-breakdown">
      <ul>
        {match.criteria.map((criterion) => (
          <li key={criterion.key} className={criterion.score === null ? 'unknown' : ''}>
            <div className="match-criterion-heading">
              <span>{criterion.label} <small>· poids {criterion.weight}</small></span>
              <strong>{criterion.score === null ? '—' : Math.round(criterion.score * 100) + ' %'}</strong>
            </div>
            <div className="match-bar" aria-hidden="true">
              <span style={{ width: (criterion.score ?? 0) * 100 + '%' }} />
            </div>
            <p>{criterion.detail}</p>
          </li>
        ))}
      </ul>
      <p className="match-method">
        Score calculé sur {Math.round(match.confidence * 100)} % des critères renseignés. L’âge, le sexe et la civilité ne sont jamais pris en compte.
      </p>
    </div>
  )
}

// Encadré « Ta compatibilité » sur la page d'une annonce (locataire connecté).
export function ListingMatch({ housingId, onCompleteProfile }) {
  const [match, setMatch] = useState(null)
  const [error, setError] = useState('')
  const [open, setOpen] = useState(false)

  useEffect(() => {
    let active = true
    api.get('/matching/listings/' + housingId)
      .then(({ data }) => { if (active) setMatch(data.match) })
      .catch((requestError) => {
        if (active) setError(requestError.response?.data?.message || 'Score indisponible.')
      })
    return () => { active = false }
  }, [housingId])

  if (error || !match) return null

  if (match.score === null) {
    return (
      <div className="listing-match">
        <p className="listing-match-empty">
          Renseigne ton budget, tes revenus et ta ville dans ton profil pour voir ta compatibilité avec ce logement.
        </p>
        <button className="text-button" type="button" onClick={onCompleteProfile}>Compléter mon profil →</button>
      </div>
    )
  }

  return (
    <div className="listing-match">
      <div className="listing-match-heading">
        <MatchBadge match={match} size="large" />
        <div>
          <strong>{match.level.label}</strong>
          <button className="text-button" type="button" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
            {open ? 'Masquer le détail' : 'Pourquoi ce score ?'}
          </button>
        </div>
      </div>
      {open && <MatchBreakdown match={match} />}
    </div>
  )
}
