import { useState } from 'react'
import api from './lib/api'

// « Mot de passe oublié » : demande d'un lien de réinitialisation par e-mail.
export function ForgotPasswordForm({ initialEmail = '', onBack }) {
  const [email, setEmail] = useState(initialEmail)
  const [sending, setSending] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  async function submit(event) {
    event.preventDefault()
    setSending(true)
    setError('')
    setMessage('')
    try {
      const { data } = await api.post('/auth/forgot-password', { email })
      setMessage(data.message)
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Impossible d’envoyer le lien pour le moment.')
    } finally {
      setSending(false)
    }
  }

  return (
    <>
      <div className="form-heading">
        <p className="eyebrow">MOT DE PASSE OUBLIÉ</p>
        <h2 id="auth-title">Réinitialiser mon mot de passe</h2>
        <p>Indique ton adresse e-mail : tu recevras un lien pour choisir un nouveau mot de passe.</p>
      </div>
      <form className="auth-form recovery-form" onSubmit={submit}>
        <label htmlFor="forgot-email">Adresse e-mail</label>
        <input id="forgot-email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
        {error && <p className="form-error" role="alert">{error}</p>}
        {message && <p className="form-success" role="status">{message}</p>}
        <button className="submit-button" type="submit" disabled={sending}>
          {sending ? 'Envoi…' : 'Recevoir le lien'} {!sending && <span aria-hidden="true">→</span>}
        </button>
      </form>
      <button className="text-button recovery-back" type="button" onClick={onBack}>← Retour à la connexion</button>
    </>
  )
}

// Page ouverte depuis le lien reçu par e-mail (?reset=…) : choix du nouveau mot de passe.
export function ResetPasswordPage({ token, onDone }) {
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function submit(event) {
    event.preventDefault()
    if (password !== confirmation) {
      setError('Les deux mots de passe ne sont pas identiques.')
      return
    }
    setSaving(true)
    setError('')
    try {
      const { data } = await api.post('/auth/reset-password', { token, password })
      onDone(data.message)
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Impossible de modifier le mot de passe pour le moment.')
      setSaving(false)
    }
  }

  return (
    <main className="app-shell auth-shell">
      <header className="topbar">
        <a className="wordmark" href="/" aria-label="Logia, accueil">
          <img className="brand-logo" src="/logia-logo.png" alt="Logia" />
        </a>
      </header>
      <section className="recovery-layout" aria-labelledby="reset-title">
        <div className="form-panel">
          <div className="form-heading">
            <p className="eyebrow">NOUVEAU MOT DE PASSE</p>
            <h2 id="reset-title">Choisis ton nouveau mot de passe</h2>
            <p>8 caractères minimum. Tes sessions ouvertes sur d’autres appareils seront déconnectées.</p>
          </div>
          <form className="auth-form recovery-form" onSubmit={submit}>
            <label htmlFor="reset-password">Nouveau mot de passe</label>
            <input id="reset-password" type="password" autoComplete="new-password" minLength={8} maxLength={72} value={password} onChange={(event) => setPassword(event.target.value)} required />
            <label htmlFor="reset-confirmation">Confirme le mot de passe</label>
            <input id="reset-confirmation" type="password" autoComplete="new-password" minLength={8} maxLength={72} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} required />
            {error && <p className="form-error" role="alert">{error}</p>}
            <button className="submit-button" type="submit" disabled={saving}>
              {saving ? 'Enregistrement…' : 'Enregistrer le mot de passe'} {!saving && <span aria-hidden="true">→</span>}
            </button>
          </form>
          <button className="text-button recovery-back" type="button" onClick={() => onDone('')}>Annuler</button>
        </div>
      </section>
    </main>
  )
}
