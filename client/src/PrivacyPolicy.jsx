import './PrivacyPolicy.css'

// Politique de confidentialité (RGPD). Logia est un projet de mémoire : à relire et compléter
// (hébergeur, adresse du responsable) avant une mise en ligne publique.
function PrivacyPolicy({ onBack }) {
  return (
    <main className="app-shell privacy-page">
      <header className="topbar">
        <a className="wordmark" href="/" aria-label="Logia, accueil">
          <img className="brand-logo" src="/logia-logo.png" alt="Logia" />
        </a>
        <button className="text-button" type="button" onClick={onBack}>← Retour</button>
      </header>

      <article className="privacy-content">
        <p className="eyebrow">TES DONNÉES</p>
        <h1>Politique de confidentialité</h1>
        <p className="privacy-updated">Dernière mise à jour : novembre 2026</p>

        <section>
          <h2>Qui est responsable de tes données ?</h2>
          <p>
            Logia est une plateforme développée dans le cadre d’un mémoire de fin d’études. Pour toute question sur tes données,
            écris à <a href="mailto:logiaservice@gmail.com">logiaservice@gmail.com</a>.
          </p>
        </section>

        <section>
          <h2>Quelles données collectons-nous ?</h2>
          <ul>
            <li><strong>Ton compte :</strong> adresse e-mail et mot de passe (jamais stocké en clair : seule une empreinte irréversible, hachée avec bcrypt, est conservée).</li>
            <li><strong>Ton identité :</strong> prénom, nom et civilité.</li>
            <li><strong>Ton profil locataire :</strong> date de naissance, situation professionnelle, revenus, garant, ville, budget, date d’emménagement et nombre d’occupants.</li>
            <li><strong>Ton dossier :</strong> les pièces justificatives que tu déposes (identité, domicile, situation, ressources, garant, avis d’imposition).</li>
            <li><strong>Tes annonces</strong> si tu es propriétaire : description, loyer, adresse (utilisée pour placer le repère sur la carte, jamais affichée en texte) et photos.</li>
            <li><strong>Tes candidatures :</strong> message, statut et score de compatibilité au moment de l’envoi.</li>
          </ul>
        </section>

        <section>
          <h2>Pourquoi les utilisons-nous ?</h2>
          <ul>
            <li><strong>Faire fonctionner le service</strong> (publier des annonces, postuler, constituer un dossier) : c’est nécessaire à l’exécution du service que tu demandes.</li>
            <li><strong>Calculer un score de compatibilité</strong> entre ton profil et un logement, pour te recommander des annonces ou aider un propriétaire à lire les candidatures.</li>
            <li><strong>Produire des statistiques agrégées</strong> (loyers moyens, taux d’acceptation) et entraîner un modèle d’apprentissage, sans jamais afficher de donnée personnelle.</li>
          </ul>
        </section>

        <section>
          <h2>Qui peut voir tes données ?</h2>
          <p>
            Quand tu postules à une annonce, <strong>seul le propriétaire de cette annonce</strong> voit ton nom, ton e-mail, ta situation,
            tes revenus, ton garant, ta date d’emménagement, ton message et ton score. Il peut consulter les pièces de ton dossier
            <strong> uniquement tant que ta candidature est en attente ou acceptée</strong>.
          </p>
          <p>
            Ta date de naissance et ta civilité ne sont <strong>jamais</strong> transmises aux propriétaires ni utilisées dans le score :
            l’âge et le sexe ne doivent pas servir à choisir un locataire (article 225-1 du Code pénal).
            Tes données ne sont ni vendues ni cédées à des tiers.
          </p>
        </section>

        <section>
          <h2>Le score de compatibilité décide-t-il à ta place ?</h2>
          <p>
            Non. Le score est une aide à la lecture, expliquée critère par critère. La décision d’accepter ou de refuser une candidature
            appartient toujours au propriétaire : Logia ne prend aucune décision automatisée te concernant.
          </p>
        </section>

        <section>
          <h2>Combien de temps les gardons-nous ?</h2>
          <p>
            Tant que ton compte existe. Quand tu supprimes ton compte, ton profil, ton dossier (fichiers compris), tes candidatures
            et, pour un propriétaire, ses annonces et leurs photos sont effacés immédiatement.
          </p>
        </section>

        <section>
          <h2>Comment sont-elles protégées ?</h2>
          <p>
            Les mots de passe sont hachés avec bcrypt (on ne peut pas les retrouver à partir de ce qui est stocké). Les pièces de
            dossier sont stockées hors de tout accès public : chaque ouverture de fichier vérifie que la personne y a droit.
          </p>
        </section>

        <section>
          <h2>Quels sont tes droits ?</h2>
          <ul>
            <li><strong>Accès et portabilité :</strong> télécharge toutes tes données depuis « Mon profil » → « Mes données ».</li>
            <li><strong>Rectification :</strong> modifie ton profil et ton dossier à tout moment.</li>
            <li><strong>Effacement :</strong> supprime ton compte depuis « Mon profil » → « Mes données ».</li>
            <li><strong>Opposition et questions :</strong> écris à <a href="mailto:logiaservice@gmail.com">logiaservice@gmail.com</a>.</li>
          </ul>
          <p>
            Si tu estimes que tes droits ne sont pas respectés, tu peux adresser une réclamation à la CNIL
            (<a href="https://www.cnil.fr" target="_blank" rel="noreferrer">cnil.fr</a>).
          </p>
        </section>
      </article>
    </main>
  )
}

export default PrivacyPolicy
