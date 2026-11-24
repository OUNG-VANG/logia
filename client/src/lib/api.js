import axios from 'axios'

const api = axios.create({ baseURL: '/api' })

api.interceptors.request.use((config) => {
  const token = sessionStorage.getItem('logia-token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// Session refusée par le serveur (jeton expiré, compte supprimé, mot de passe changé ailleurs) :
// on oublie le jeton et on prévient l'application, qui ramène à l'écran de connexion.
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && error.response.data?.code === 'SESSION_INVALID' && sessionStorage.getItem('logia-token')) {
      sessionStorage.removeItem('logia-token')
      window.dispatchEvent(new CustomEvent('logia:session-expired', { detail: error.response.data.message }))
    }
    return Promise.reject(error)
  },
)

export default api
