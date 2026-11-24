import { useState } from 'react'
import api from './lib/api'
import './PrivacyPolicy.css'

// « Mes données » : téléchargement de toutes ses données et suppression du compte (droits RGPD).
function AccountData({ role, onDeleted, onShowPrivacy }) {
  const [downloading, setDownloading] = useState(false)
  const [showDelete, setShowDelete] = useState(false)
  const [password, setPassword] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')
  const [showPasswordForm, setShowPasswordForm] = useState(false)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [changingPassword, setChangingPassword] = useState(false)
  const [passwordMessage, setPasswordMessage] = useState('')
  const [passwordError, setPasswordError] = useState('')

  async function changePassword(event) {
    event.preventDefault()
    setChangingPassword(true)
    setPasswordError('')
    setPasswordMessage('')
    try {
      const { data } = await api.patch('/account/password', { currentPassword, newPassword })
      // Le serveur remet un nouveau jeton : les autres sessions ouvertes sont déconnectées.
      if (data.token) sessionStorage.setItem('logia-token', data.token)
      setPasswordMessage(data.message)
      setCurrentPassword('')
      setNewPassword('')
      setShowPasswordForm(false)
    } catch (requestError) {
      setPasswordError(requestError.response?.data?.message || 'Impossible de modifier le mot de passe.')
    } finally {
      setChangingPassword(false)
    }
  }

  async function download() {
    setDownloading(true)
    setError('')
    try {
      const { data } = await api.get('/account/export', { responseType: 'blob' })
      const url = URL.createObjectURL(data)
      const link = document.createElement('a')
      link.href = url
      link.download = `logia-mes-donnees-${new Date().toISOString().slice(0, 10)}.json`
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 10_000)
    } catch {
      setError('Impossible de télécharger tes données pour le moment.')
    } finally {
      setDownloading(false)
    }
  }

  async function deleteAccount(event) {
    event.preventDefault()
    setDeleting(true)
    setError('')
    try {
      await api.delete('/account', { data: { password } })
      onDeleted()
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Impossible de supprimer le compte pour le moment.')
      setDeleting(false)
    }
  }

  return (
    <section className="listing-form-panel profile-panel account-data" aria-labelledby="account-data-title">
      <h3 id="account-data-title">Mes données</h3>
      <p>
        Télécharge toutes les données liées à ton compte, change ton mot de passe ou supprime ton compte définitivement.{' '}
        <button className="inline-link" type="button" onClick={onShowPrivacy}>Lire la politique de confidentialité</button>
      </p>
      <div className="account-actions">
        <button className="account-button" type="button" onClick={download} disabled={downloading}>
          {downloading ? 'Préparation…' : 'Télécharger mes données'}
        </button>
        {!showPasswordForm && (
          <button className="account-button" type="button" onClick={() => { setShowPasswordForm(true); setPasswordMessage('') }}>Changer mon mot de passe</button>
        )}
        {!showDelete && (
          <button className="account-button danger" type="button" onClick={() => setShowDelete(true)}>Supprimer mon compte</button>
        )}
      </div>
      {passwordMessage && <p className="form-success account-message" role="status">{passwordMessage}</p>}

      {showPasswordForm && (
        <form className="account-delete account-password" onSubmit={changePassword}>
          <p>Tes sessions ouvertes sur d’autres appareils seront déconnectées.</p>
          <label htmlFor="current-password">Mot de passe actuel</label>
          <input id="current-password" type="password" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} required />
          <label htmlFor="new-password">Nouveau mot de passe (8 caractères minimum)</label>
          <input id="new-password" type="password" autoComplete="new-password" minLength={8} maxLength={72} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} required />
          {passwordError && <p className="form-error" role="alert">{passwordError}</p>}
          <div className="account-actions">
            <button className="account-button" type="submit" disabled={changingPassword}>{changingPassword ? 'Enregistrement…' : 'Enregistrer'}</button>
            <button className="text-button" type="button" onClick={() => { setShowPasswordForm(false); setPasswordError('') }}>Annuler</button>
          </div>
        </form>
      )}

      {showDelete && (
        <form className="account-delete" onSubmit={deleteAccount}>
          <p>
            <strong>Cette action est définitive.</strong>{' '}
            {role === 'tenant'
              ? 'Ton profil, ton dossier (fichiers compris) et toutes tes candidatures seront effacés.'
              : 'Ton profil, tes annonces, leurs photos et les candidatures reçues seront effacés.'}
          </p>
          <label htmlFor="delete-password">Confirme avec ton mot de passe</label>
          <input
            id="delete-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
          <div className="account-actions">
            <button className="account-button danger" type="submit" disabled={deleting || !password}>
              {deleting ? 'Suppression…' : 'Supprimer définitivement mon compte'}
            </button>
            <button className="text-button" type="button" onClick={() => { setShowDelete(false); setPassword(''); setError('') }}>Annuler</button>
          </div>
        </form>
      )}
      {error && <p className="form-error" role="alert">{error}</p>}
    </section>
  )
}

export default AccountData
