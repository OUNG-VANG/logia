import { useEffect, useState } from 'react'
import api from './lib/api'
import { formatEuros, situationLabels } from './lib/profile'
import './Analytics.css'

const statusSegments = [
  { key: 'accepted', label: 'Acceptées', className: 'status-good' },
  { key: 'pending', label: 'En attente', className: 'status-warning' },
  { key: 'rejected', label: 'Refusées', className: 'status-critical' },
  { key: 'withdrawn', label: 'Retirées', className: 'status-neutral' },
]

const formatPercent = (value) => (value === null || value === undefined ? '—' : Math.round(value * 100) + ' %')
const plural = (count, word) => `${count} ${word}${count > 1 ? 's' : ''}`

function StatTile({ label, value, note }) {
  return (
    <div className="stat-tile">
      <span className="stat-label">{label}</span>
      <strong className="stat-value">{value}</strong>
      {note && <span className="stat-note">{note}</span>}
    </div>
  )
}

// Tableau des données sous chaque graphique (accessibilité, et pour reprendre les chiffres ailleurs).
function DataTable({ caption, columns, rows }) {
  return (
    <details className="chart-table">
      <summary>Voir les données</summary>
      <table>
        <caption>{caption}</caption>
        <thead><tr>{columns.map((column) => <th key={column} scope="col">{column}</th>)}</tr></thead>
        <tbody>{rows.map((row, index) => <tr key={index}>{row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}</tr>)}</tbody>
      </table>
    </details>
  )
}

// Barre avec info-bulle au survol et au focus clavier.
function HoverBar({ tooltip, ariaLabel, className, style, children }) {
  return (
    <div className={'hover-bar ' + (className || '')} style={style} tabIndex={0} aria-label={ariaLabel}>
      {children}
      <span className="chart-tooltip" role="tooltip">{tooltip}</span>
    </div>
  )
}

// Graphique principal : taux d'acceptation par tranche de score (colonnes, une seule teinte).
function AcceptanceByScore({ bands }) {
  return (
    <div className="column-chart" role="group" aria-label="Taux d’acceptation par tranche de score">
      <div className="column-plot">
        {[100, 50, 0].map((tick) => (
          <span className="column-gridline" key={tick} style={{ bottom: tick + '%' }}><small>{tick} %</small></span>
        ))}
        {bands.map((band) => (
          <div className="column-slot" key={band.key}>
            {band.acceptanceRate === null ? (
              <span className="column-empty">Aucune décision</span>
            ) : (
              <HoverBar
                className="column"
                style={{ height: Math.max(band.acceptanceRate * 100, 1.5) + '%' }}
                ariaLabel={`Score ${band.label} : ${formatPercent(band.acceptanceRate)} d’acceptation, ${band.accepted} sur ${band.decided}`}
                tooltip={<><strong>{formatPercent(band.acceptanceRate)}</strong> acceptées<br />{band.accepted} sur {plural(band.decided, 'décision')}</>}
              >
                <span className="column-value">{formatPercent(band.acceptanceRate)}</span>
              </HoverBar>
            )}
          </div>
        ))}
      </div>
      <div className="column-axis">
        {bands.map((band) => (
          <span key={band.key}>
            {band.label}
            <small>{plural(band.decided, 'décision')}</small>
          </span>
        ))}
      </div>
      <p className="axis-title">Score de compatibilité au moment de la candidature</p>
    </div>
  )
}

// Barres horizontales classées, une seule teinte, valeur au bout de la barre.
function RankedBars({ rows, max, ariaLabel }) {
  return (
    <ul className="ranked-bars" aria-label={ariaLabel}>
      {rows.map((row) => (
        <li key={row.label}>
          <span className="ranked-label">{row.label}</span>
          <div className="ranked-track">
            {/* La barre la plus longue s'arrête à 78 % de la piste pour laisser la place à sa valeur. */}
            <HoverBar className="ranked-bar" style={{ width: Math.max((row.value / max) * 78, 1) + '%' }} ariaLabel={row.ariaLabel} tooltip={row.tooltip} />
            <span className="ranked-value">{row.display}</span>
          </div>
        </li>
      ))}
    </ul>
  )
}

// Barre segmentée : répartition des candidatures par statut.
function StatusBar({ byStatus, total }) {
  const segments = statusSegments.filter((segment) => byStatus[segment.key] > 0)
  return (
    <div>
      <div className="status-bar" role="img" aria-label={segments.map((segment) => `${segment.label} : ${byStatus[segment.key]}`).join(', ')}>
        {segments.map((segment) => {
          const share = byStatus[segment.key] / total
          return (
            <HoverBar
              key={segment.key}
              className={'status-segment ' + segment.className}
              style={{ flexGrow: byStatus[segment.key] }}
              ariaLabel={`${segment.label} : ${byStatus[segment.key]}`}
              tooltip={<><strong>{byStatus[segment.key]}</strong> {segment.label.toLowerCase()} · {formatPercent(share)}</>}
            >
              {share >= 0.12 && <span className="status-figure">{byStatus[segment.key]}</span>}
            </HoverBar>
          )
        })}
      </div>
      <ul className="chart-legend">
        {statusSegments.map((segment) => (
          <li key={segment.key}><i className={segment.className} aria-hidden="true" /> {segment.label} · {byStatus[segment.key]}</li>
        ))}
      </ul>
    </div>
  )
}

function Analytics({ onBack }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    api.get('/analytics')
      .then(({ data: result }) => { if (active) setData(result) })
      .catch((requestError) => {
        if (active) setError(requestError.response?.data?.message || 'Impossible de charger les statistiques.')
      })
    return () => { active = false }
  }, [])

  const heading = (
    <div className="dashboard-heading analytics-heading">
      <div>
        <p className="eyebrow">OBSERVATOIRE LOGIA</p>
        <h1>Ce que disent les données.</h1>
        <p className="welcome-copy">Statistiques agrégées de la plateforme : aucune donnée personnelle n’est affichée.</p>
      </div>
      <button className="text-button" type="button" onClick={onBack}>← Retour à mon espace</button>
    </div>
  )

  if (error) return <section className="dashboard-section">{heading}<p className="form-error" role="alert">{error}</p></section>
  if (!data) return <section className="dashboard-section">{heading}<p className="listings-feedback">Calcul des statistiques…</p></section>

  const { overview, market, applications, applicantSituations } = data
  const marketRows = market.slice(0, 8)
  const maxRent = Math.max(...marketRows.map((row) => row.averageRent), 1)
  const maxSituation = Math.max(...applicantSituations.map((row) => row.count), 1)
  const smallSample = applications.decided < 20

  return (
    <section className="dashboard-section analytics">
      {heading}

      <div className="stat-row">
        <StatTile label="Annonces publiées" value={overview.publishedListings} note={`${plural(overview.landlords, 'propriétaire')} · ${plural(overview.tenants, 'locataire')}`} />
        <StatTile label="Loyer moyen" value={overview.averageRent ? formatEuros(overview.averageRent) : '—'} note="hors charges, annonces publiées" />
        <StatTile label="Taux d’acceptation" value={formatPercent(applications.acceptanceRate)} note={`sur ${plural(applications.decided, 'décision')}`} />
        <StatTile
          label="Délai de réponse"
          value={applications.averageResponseDays === null ? '—' : `${String(applications.averageResponseDays).replace('.', ',')} j`}
          note="en moyenne, avant acceptation ou refus"
        />
      </div>

      <article className="analytics-card analytics-card-wide">
        <div className="chart-heading">
          <div>
            <h2>Le score de compatibilité prédit-il l’acceptation ?</h2>
            <p>Part des candidatures acceptées parmi celles qui ont reçu une réponse, par tranche de score.</p>
          </div>
          <div className="score-compare">
            <span><small>Score moyen des acceptées</small><strong>{applications.averageScoreAccepted ?? '—'}</strong></span>
            <span><small>des refusées</small><strong>{applications.averageScoreRejected ?? '—'}</strong></span>
          </div>
        </div>
        <AcceptanceByScore bands={applications.scoreBands} />
        {smallSample && (
          <p className="chart-note">
            Échantillon encore faible ({plural(applications.decided, 'décision')}) : à interpréter avec prudence, il faudrait au moins une vingtaine de réponses de propriétaires.
          </p>
        )}
        {applications.estimatedScores > 0 && (
          <p className="chart-note">{plural(applications.estimatedScores, 'candidature')} envoyée{applications.estimatedScores > 1 ? 's' : ''} avant l’enregistrement du score : score estimé avec le profil actuel.</p>
        )}
        <DataTable
          caption="Taux d’acceptation par tranche de score"
          columns={['Score', 'Décisions', 'Acceptées', 'Taux d’acceptation']}
          rows={applications.scoreBands.map((band) => [band.label, band.decided, band.accepted, formatPercent(band.acceptanceRate)])}
        />
      </article>

      <div className="analytics-grid">
        <article className="analytics-card">
          <div className="chart-heading">
            <div>
              <h2>Loyer moyen par ville</h2>
              <p>Annonces publiées, hors charges{market.length > 8 ? ' · 8 villes les plus chères' : ''}.</p>
            </div>
          </div>
          {marketRows.length ? (
            <RankedBars
              ariaLabel="Loyer moyen par ville"
              max={maxRent}
              rows={marketRows.map((row) => ({
                label: row.city,
                value: row.averageRent,
                display: formatEuros(row.averageRent),
                ariaLabel: `${row.city} : ${formatEuros(row.averageRent)} en moyenne, ${plural(row.listings, 'annonce')}`,
                tooltip: <><strong>{formatEuros(row.averageRent)}</strong> en moyenne<br />{plural(row.listings, 'annonce')}{row.averageRentPerM2 ? ` · ${String(row.averageRentPerM2).replace('.', ',')} €/m²` : ''}</>,
              }))}
            />
          ) : <p className="listings-feedback">Aucune annonce publiée pour l’instant.</p>}
          <DataTable
            caption="Loyers par ville"
            columns={['Ville', 'Annonces', 'Loyer moyen', 'Loyer médian', '€/m²']}
            rows={market.map((row) => [row.city, row.listings, formatEuros(row.averageRent), formatEuros(row.medianRent), row.averageRentPerM2 === null ? '—' : String(row.averageRentPerM2).replace('.', ',')])}
          />
        </article>

        <article className="analytics-card">
          <div className="chart-heading">
            <div>
              <h2>Candidatures par statut</h2>
              <p>{plural(applications.total, 'candidature')} au total{applications.averageScore !== null ? ` · score moyen ${applications.averageScore}` : ''}.</p>
            </div>
          </div>
          {applications.total ? <StatusBar byStatus={applications.byStatus} total={applications.total} /> : <p className="listings-feedback">Aucune candidature pour l’instant.</p>}
          <DataTable
            caption="Candidatures par statut"
            columns={['Statut', 'Nombre']}
            rows={statusSegments.map((segment) => [segment.label, applications.byStatus[segment.key]])}
          />

          <div className="chart-heading chart-heading-spaced">
            <div>
              <h2>Situation des candidats</h2>
              <p>Chaque candidat compté une fois.</p>
            </div>
          </div>
          {applicantSituations.length ? (
            <RankedBars
              ariaLabel="Situation des candidats"
              max={maxSituation}
              rows={applicantSituations.map((row) => ({
                label: situationLabels[row.key] || row.key,
                value: row.count,
                display: row.count,
                ariaLabel: `${situationLabels[row.key] || row.key} : ${row.count}`,
                tooltip: <><strong>{row.count}</strong> candidat{row.count > 1 ? 's' : ''}</>,
              }))}
            />
          ) : <p className="listings-feedback">Aucun candidat pour l’instant.</p>}
        </article>
      </div>

      <p className="analytics-method">
        Méthode : le score de compatibilité est enregistré au moment de chaque candidature. Le taux d’acceptation ne compte que les
        candidatures acceptées ou refusées (pas celles en attente ou retirées). Données mises à jour à chaque visite.
      </p>
    </section>
  )
}

export default Analytics
