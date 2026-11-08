import { useEffect, useState } from 'react'
import api from './lib/api'
import { formatEuros } from './lib/profile'
import { MatchBadge } from './MatchScore'
import './MatchScore.css'

// Les critères les mieux notés, pour dire en un coup d'œil pourquoi l'annonce est recommandée.
function strongPoints(match) {
  return match.criteria
    .filter((criterion) => criterion.score !== null && criterion.score >= 0.9)
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 3)
    .map((criterion) => criterion.label)
}

// « Recommandés pour toi » : les annonces les plus compatibles avec le profil du locataire.
function Recommendations({ user, onSelectListing, onCompleteProfile }) {
  const [recommendations, setRecommendations] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    api.get('/matching/recommendations', { params: { limit: 6 } })
      .then(({ data }) => { if (active) { setRecommendations(data.recommendations || []); setError('') } })
      .catch((requestError) => {
        if (active) setError(requestError.response?.data?.message || 'Impossible de charger les recommandations.')
      })
    return () => { active = false }
  }, [user])

  const lowConfidence = recommendations?.length > 0 && recommendations[0].match.confidence < 0.6

  return (
    <section className="listings-panel tenant-listings recommendations-panel" aria-labelledby="recommendations-title">
      <div className="section-heading">
        <div><p className="eyebrow">SÉLECTION LOGIA</p><h2 id="recommendations-title">Recommandés pour toi</h2></div>
      </div>
      <p className="recommendations-intro">
        Classés selon ta compatibilité : budget, revenus, garant, ville, date d’emménagement, taille du logement et dossier.
        {lowConfidence && <> Ton profil est encore incomplet : <button className="text-button" type="button" onClick={onCompleteProfile}>complète « Ta recherche »</button> pour des recommandations plus précises.</>}
      </p>

      {error ? <p className="listings-feedback form-error" role="alert">{error}</p>
        : recommendations === null ? <p className="listings-feedback">Calcul de tes recommandations…</p>
          : recommendations.length === 0 ? (
            <p className="listings-feedback">
              Indique ton budget, tes revenus ou ta ville dans ton profil pour recevoir des recommandations.{' '}
              <button className="text-button" type="button" onClick={onCompleteProfile}>Compléter mon profil →</button>
            </p>
          ) : (
            <div className="recommendation-grid">
              {recommendations.map(({ listing, match }) => {
                const points = strongPoints(match)
                return (
                  <button className="recommendation-card" type="button" key={listing._id} onClick={() => onSelectListing(listing)}>
                    <span className="recommendation-image">
                      {listing.images?.[0] ? <img src={listing.images[0]} alt="" /> : <span aria-hidden="true">⌂</span>}
                      <MatchBadge match={match} />
                    </span>
                    <span className="recommendation-body">
                      <h3>{listing.title}</h3>
                      <p>{listing.location?.city} · {listing.location?.postalCode}{listing.areaM2 ? ` · ${listing.areaM2} m²` : ''}</p>
                      <strong>{formatEuros(listing.rent)} <small>/ mois</small></strong>
                      {points.length > 0 && <p className="recommendation-reason">✓ {points.join(' · ')}</p>}
                    </span>
                  </button>
                )
              })}
            </div>
          )}
    </section>
  )
}

export default Recommendations
