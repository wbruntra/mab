import type { ReactNode } from 'react'
import { useAuth } from './AuthContext'
import { LoginModal } from './LoginModal'

interface AuthGuardProps {
  children: ReactNode
}

export const AuthGuard = ({ children }: AuthGuardProps) => {
  const { isAuthenticated, loading } = useAuth()

  if (loading) {
    return (
      <div className="d-flex justify-content-center align-items-center" style={{ minHeight: '100vh' }}>
        <div className="text-center">
          <div className="spinner-border text-primary mb-3" role="status">
            <span className="visually-hidden">Loading...</span>
          </div>
          <div>Checking authentication...</div>
        </div>
      </div>
    )
  }

  return (
    <>
      {children}
      <LoginModal show={!isAuthenticated} />
    </>
  )
}
