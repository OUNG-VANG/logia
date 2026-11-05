import { useEffect, useMemo, useState } from 'react'
import HousingMap from './HousingMap'
import './LandingPage.css'

function normalize(value = '') {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('fr-FR').trim()
}

function ListingCarousel({ listings, loading, error, activeCity, onSelectListing, onCreateAccount }) {
  const [activeIndex, setActiveIndex] = useState(0)
  const [paused, setPaused] = useState(false)
  const filteredListings = activeCity
    ? listings.filter((listing) => normalize(listing.location?.city) === normalize(activeCity))
    : listings

  useEffect(() => { setActiveIndex(0) }, [activeCity])

  useEffect(() => {
    if (paused || filteredListings.length < 2) return undefined
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reducedMotion) return undefined
    const timer = window.setTimeout(() => {
      setActiveIndex((index) => (index + 1) % filteredListings.length)
    }, 6200)
    return () => window.clearTimeout(timer)
  }, [activeIndex, filteredListings.length, paused])

  const current = filteredListings[activeIndex]
  const changeSlide = (direction) => {
    setActiveIndex((index) => (index + direction + filteredListings.length) % filteredListings.length)
  }

  return (
    <div className="home-carousel-wrap" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onFocusCapture={() => setPaused(true)} onBlurCapture={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget)) setPaused(false)
    }}>
      {loading ? (
        <div className="carousel-empty"><span className="carousel-empty-icon">⌂</span><strong>On prépare les annonces…</strong><span>Les logements disponibles vont bientôt apparaître.</span></div>
      ) : error ? (
        <div className="carousel-empty"><span className="carousel-empty-icon">⌂</span><strong>Les annonces ne sont pas accessibles pour le moment.</strong><span>Tu peux réessayer en rechargeant la page.</span></div>
      ) : !current ? (
        <div className="carousel-empty"><span className="carousel-empty-icon">⌂</span><strong>{activeCity ? `Pas encore d’annonce à ${activeCity}.` : 'Les premières annonces arrivent bientôt.'}</strong><span>Les logements publiés par les propriétaires défileront ici automatiquement.</span><button className="home-button home-button-outline" type="button" onClick={onCreateAccount}>Créer mon compte</button></div>
      ) : (
        <>
          <article className="featured-listing" aria-live="polite">
            <div className="featured-listing-image">
              {current.images?.[0] ? <img src={current.images[0]} alt={`Aperçu de ${current.title}`} /> : <div className="featured-placeholder"><span>⌂</span><small>Nouvelle annonce Logia</small></div>}
              <span className="featured-badge"><i /> Disponible</span>
              <div className="featured-image-count">{String(activeIndex + 1).padStart(2, '0')} <span>/ {String(filteredListings.length).padStart(2, '0')}</span></div>
            </div>
            <div className="featured-listing-content">
              <div className="featured-listing-kicker"><span>{current.propertyType === 'room' ? 'CHAMBRE' : current.propertyType === 'studio' ? 'STUDIO' : current.propertyType === 'house' ? 'MAISON' : 'APPARTEMENT'}</span><span>RÉCEMMENT PUBLIÉ</span></div>
              <h3>{current.title}</h3>
              <p className="featured-location"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2.5" /></svg>{current.location?.city}{current.location?.postalCode ? ` · ${current.location.postalCode}` : ''}</p>
              <p className="featured-description">{current.description || 'Un nouveau logement à découvrir sur Logia.'}</p>
              <div className="featured-details">
                {current.areaM2 && <span>{current.areaM2} m²</span>}
                {current.bedrooms > 0 && <span>{current.bedrooms} chambre{current.bedrooms > 1 ? 's' : ''}</span>}
                <strong>{new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(current.rent || 0)}<small> / mois</small></strong>
              </div>
              <button className="featured-cta" type="button" onClick={() => onSelectListing(current)}>Voir le logement <span aria-hidden="true">↗</span></button>
            </div>
          </article>
          <div className="carousel-controls">
            <span className="carousel-hint"><i /> {filteredListings.length > 1 ? 'Défilement automatique' : 'Annonce en vedette'}</span>
            <div className="carousel-control-buttons">
              {filteredListings.length > 1 && <button type="button" className="carousel-pause" onClick={() => setPaused((value) => !value)} aria-label={paused ? 'Relancer le diaporama' : 'Mettre le diaporama en pause'}>{paused ? '▶' : 'Ⅱ'}</button>}
              <button type="button" className="carousel-arrow" onClick={() => changeSlide(-1)} disabled={filteredListings.length < 2} aria-label="Annonce précédente">←</button>
              <button type="button" className="carousel-arrow" onClick={() => changeSlide(1)} disabled={filteredListings.length < 2} aria-label="Annonce suivante">→</button>
              <span className="carousel-position">{String(activeIndex + 1).padStart(2, '0')} / {String(filteredListings.length).padStart(2, '0')}</span>
            </div>
          </div>
          {filteredListings.length > 1 && (
            <div className="carousel-progress" aria-hidden="true"><span style={{ width: `${((activeIndex + 1) / filteredListings.length) * 100}%` }} /></div>
          )}
        </>
      )}
    </div>
  )
}

function LandingPage({ listings, loading, error, onSignIn, onRegister, onSelectListing }) {
  const [activeCity, setActiveCity] = useState('')
  const cities = useMemo(() => [...new Set(listings.map((listing) => listing.location?.city).filter(Boolean))], [listings])

  return (
    <main className="landing-page">
      <header className="landing-header">
        <a className="landing-logo" href="#accueil" aria-label="Logia, accueil"><img src="/logia-logo.png" alt="Logia" /></a>
        <nav className="landing-nav" aria-label="Navigation principale">
          <a href="#carte">La carte</a>
          <a href="#annonces">Les annonces</a>
          <a href="#guides">Guides & conseils</a>
          <a href="#contact">Contact</a>
        </nav>
        <div className="landing-header-actions">
          <button className="landing-login" type="button" onClick={onSignIn}>Connexion</button>
          <button className="home-button home-button-small" type="button" onClick={() => onRegister('tenant')}>Créer un compte</button>
        </div>
      </header>

      <section className="landing-hero" id="accueil">
        <div className="landing-hero-glow landing-glow-one" />
        <div className="landing-hero-glow landing-glow-two" />
        <div className="landing-hero-inner">
          <div className="landing-hero-copy">
            <p className="home-eyebrow"><span className="hero-eyebrow-mark">✦</span> TON PROCHAIN CHAPITRE COMMENCE ICI</p>
            <h1>Le bon logement.<br /><em>Le bon endroit.</em></h1>
            <p className="landing-hero-text">Découvre des logements publiés par des propriétaires, explore les villes et avance à ton rythme vers un nouveau chez-toi.</p>
            <div className="landing-hero-actions">
              <button className="home-button home-button-primary" type="button" onClick={() => document.getElementById('annonces')?.scrollIntoView({ behavior: 'smooth' })}>Explorer les logements <span aria-hidden="true">→</span></button>
              <button className="home-button home-button-text" type="button" onClick={() => onRegister('landlord')}>Je suis propriétaire <span aria-hidden="true">↗</span></button>
            </div>
            <div className="landing-trust-line"><span className="trust-avatars"><i>L</i><i>O</i><i>G</i></span><span>Un espace pour les locataires et les propriétaires</span></div>
          </div>
          <div className="landing-hero-visual" aria-label="Aperçu d'un logement Logia">
            <div className="hero-orbit hero-orbit-large" />
            <div className="hero-orbit hero-orbit-small" />
            <div className="hero-image-card">
              {listings[0]?.images?.[0] ? <img src={listings[0].images[0]} alt={`Logement à ${listings[0].location?.city || 'découvrir'}`} /> : (
                <div className="hero-house-scene" aria-hidden="true">
                  <div className="hero-window-light" />
                  <div className="hero-room-art"><span className="hero-room-window" /><span className="hero-room-couch" /><span className="hero-room-table" /><span className="hero-room-plant">✦</span></div>
                  <div className="hero-scene-caption"><span>un nouveau départ</span><strong>commence chez soi.</strong></div>
                </div>
              )}
              <div className="hero-image-overlay"><span className="hero-image-kicker">LOGIA · LOGEMENT & VOUS</span><strong>Un lieu où se sentir bien.</strong></div>
            </div>
            <div className="hero-floating-note hero-note-top"><span className="hero-note-icon">⌖</span><span><small>À travers la France</small><strong>{cities.length ? `${cities.length} ville${cities.length > 1 ? 's avec des annonces' : ' avec une annonce'}` : 'Toute la France à explorer'}</strong></span></div>
            <div className="hero-floating-note hero-note-bottom"><span className="hero-note-icon orange">⌂</span><span><small>À découvrir maintenant</small><strong>{listings.length} logement{listings.length === 1 ? '' : 's'} disponible{listings.length === 1 ? '' : 's'}</strong></span><i className="hero-note-spark">✦</i></div>
            <div className="hero-sun-shape" />
          </div>
        </div>
        <div className="landing-hero-bottom"><span><i /> DES LOGEMENTS PUBLIÉS PAR LEURS PROPRIÉTAIRES</span><a href="#carte">Explorer la carte <b aria-hidden="true">↓</b></a></div>
      </section>

      <section className="home-map-section" id="carte">
        <div className="home-section-heading">
          <div><p className="home-eyebrow">PRENDS TES REPÈRES</p><h2>La France est à portée de clic.</h2></div>
          <p>Zoome sur les rues ou passe en satellite pour repérer chaque logement disponible.</p>
        </div>
        <HousingMap listings={listings} loading={loading} onSelectListing={onSelectListing} />
      </section>

      <section className="home-listing-section" id="annonces">
        <div className="home-section-heading listing-section-heading">
          <div><p className="home-eyebrow">LES DERNIÈRES PÉPITES</p><h2>{activeCity ? `À découvrir à ${activeCity}.` : 'Un nouveau chez-toi t’attend peut-être.'}</h2></div>
          <div className="listing-heading-side"><p>Des annonces ajoutées par les propriétaires sur Logia.</p>{activeCity && <button type="button" onClick={() => setActiveCity('')}>Toutes les villes <span aria-hidden="true">↗</span></button>}</div>
        </div>
        <ListingCarousel listings={listings} loading={loading} error={error} activeCity={activeCity} onSelectListing={onSelectListing} onCreateAccount={() => onRegister('tenant')} />
      </section>

      <section className="home-guide-section" id="guides">
        <div className="home-guide-intro"><p className="home-eyebrow">LES CLÉS POUR AVANCER</p><h2>Simple, à chaque étape.</h2><p>Que tu cherches un logement ou que tu en proposes un, Logia rassemble les informations essentielles au même endroit.</p></div>
        <div className="home-guide-grid">
          <article className="home-guide-card guide-card-purple">
            <span className="guide-card-number">01</span><span className="guide-card-icon">⌕</span>
            <h3>Tu cherches un logement ?</h3><p>Crée ton espace locataire, explore les annonces par ville et budget, puis consulte les détails des logements.</p>
            <button type="button" onClick={() => onRegister('tenant')}>Commencer ma recherche <span aria-hidden="true">→</span></button>
          </article>
          <article className="home-guide-card guide-card-orange">
            <span className="guide-card-number">02</span><span className="guide-card-icon">⌂</span>
            <h3>Tu as un logement ?</h3><p>Présente ton bien en quelques étapes : localisation, loyer, surface et photos pour le mettre en valeur.</p>
            <button type="button" onClick={() => onRegister('landlord')}>Publier une annonce <span aria-hidden="true">→</span></button>
          </article>
          <article className="home-guide-card guide-card-sand">
            <span className="guide-card-number">03</span><span className="guide-card-icon">✳</span>
            <h3>Prépare ton dossier</h3><p>Anticipe les questions sur ton budget, tes dates et les documents généralement demandés pour une location.</p>
            <a href="#ressources">Lire les conseils <span aria-hidden="true">→</span></a>
          </article>
        </div>
        <div className="home-faq" id="ressources">
          <div className="home-faq-heading"><p className="home-eyebrow">RESSOURCES LOGIA</p><h3>Les premières réponses, juste ici.</h3><p>Quelques repères pour savoir par où commencer.</p></div>
          <div className="home-faq-list">
            <details open>
              <summary>Comment commencer ma recherche de logement ?</summary>
              <p>Crée un compte locataire, explore la carte ou les annonces, puis ouvre les fiches des logements qui t’intéressent pour comparer les informations.</p>
            </details>
            <details>
              <summary>Que préparer avant une visite ?</summary>
              <p>Note ton budget mensuel, ta date d’emménagement souhaitée et les questions à poser. Tu peux aussi commencer à rassembler les pièces de ton dossier de location.</p>
            </details>
            <details>
              <summary>Comment publier un logement ?</summary>
              <p>Choisis le profil propriétaire à la création du compte, complète les informations du logement et ajoute jusqu’à cinq photos avant de publier l’annonce.</p>
            </details>
            <details>
              <summary>Comment joindre l’équipe Logia ?</summary>
              <p>Écris-nous à logiaservice@gmail.com. Indique le sujet de ta demande et l’adresse e-mail de ton compte si elle concerne ton espace.</p>
            </details>
          </div>
        </div>
      </section>

      <section className="home-contact-section" id="contact">
        <div className="contact-decoration" aria-hidden="true"><span /><span /><span /></div>
        <div className="home-contact-copy"><p className="home-eyebrow">BESOIN D’UN COUP DE MAIN ?</p><h2>On est là pour t’aider à avancer.</h2><p>Une question sur ton compte, une annonce ou l’utilisation de Logia ? Écris-nous, on te répondra avec plaisir.</p></div>
        <a className="contact-email-card" href="mailto:logiaservice@gmail.com?subject=Question%20sur%20Logia"><span className="contact-mail-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="3" /><path d="m4 7 8 6 8-6" /></svg></span><span><small>ÉCRIS-NOUS</small><strong>logiaservice@gmail.com</strong></span><b aria-hidden="true">↗</b></a>
      </section>

      <footer className="landing-footer">
        <a className="landing-logo" href="#accueil" aria-label="Logia, retour en haut"><img src="/logia-logo.png" alt="Logia" /></a>
        <p>Le logement, plus simplement.</p>
        <nav aria-label="Liens de pied de page"><a href="#carte">Explorer</a><a href="#guides">Guides</a><a href="#contact">Contact</a><button type="button" onClick={onSignIn}>Mon espace</button></nav>
        <span className="landing-copyright">© {new Date().getFullYear()} Logia</span>
      </footer>
    </main>
  )
}

export default LandingPage
