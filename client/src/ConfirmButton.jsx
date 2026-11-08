import { useState } from 'react'
import './ConfirmButton.css'

// Bouton à confirmer dans la page : un premier clic affiche la question avec « Oui » et « Annuler ».
// Remplace window.confirm, que certains navigateurs intégrés bloquent sans rien afficher.
function ConfirmButton({ label, question, confirmLabel = 'Oui', busy = false, busyLabel = 'Un instant…', onConfirm, className = 'text-button', ariaLabel }) {
  const [confirming, setConfirming] = useState(false)

  // Évite d'ouvrir la carte d'annonce qui contient parfois le bouton.
  const stop = (event) => event.stopPropagation()

  if (busy) {
    return <button className={className} type="button" disabled>{busyLabel}</button>
  }

  if (!confirming) {
    return (
      <button
        className={className}
        type="button"
        aria-label={ariaLabel}
        onClick={(event) => { stop(event); setConfirming(true) }}
        onKeyDown={stop}
      >
        {label}
      </button>
    )
  }

  return (
    <span className="confirm-inline" role="group" aria-label={question} onClick={stop} onKeyDown={stop}>
      <span className="confirm-question">{question}</span>
      <button
        className="confirm-yes"
        type="button"
        onClick={() => { setConfirming(false); onConfirm() }}
      >
        {confirmLabel}
      </button>
      <button className="confirm-no" type="button" autoFocus onClick={() => setConfirming(false)}>Annuler</button>
    </span>
  )
}

export default ConfirmButton
