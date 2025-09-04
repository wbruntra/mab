import { useState } from 'react'
import { useAuth } from './AuthContext'

interface LoginModalProps {
  show: boolean
}

export const LoginModal = ({ show }: LoginModalProps) => {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { login } = useAuth()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    const success = await login(password)
    
    if (!success) {
      setError('Invalid password')
    }
    
    setLoading(false)
  }

  if (!show) return null

  return (
    <div className="modal d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
      <div className="modal-dialog modal-sm modal-dialog-centered">
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title">Authentication Required</h5>
          </div>
          <div className="modal-body">
            <form onSubmit={handleSubmit}>
              <div className="mb-3">
                <label htmlFor="password" className="form-label">Password</label>
                <input
                  type="password"
                  className={`form-control ${error ? 'is-invalid' : ''}`}
                  id="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoFocus
                  required
                />
                {error && (
                  <div className="invalid-feedback">
                    {error}
                  </div>
                )}
              </div>
              <div className="d-grid">
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={loading}
                >
                  {loading ? (
                    <>
                      <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                      Signing In...
                    </>
                  ) : (
                    'Sign In'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}
