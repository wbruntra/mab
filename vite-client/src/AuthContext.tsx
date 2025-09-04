import { createContext, useContext, useState, useEffect } from 'react'
import type { ReactNode } from 'react'

interface AuthContextType {
  isAuthenticated: boolean
  login: (password: string) => Promise<boolean>
  logout: () => Promise<void>
  checkAuth: () => Promise<void>
  loading: boolean
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

interface AuthProviderProps {
  children: ReactNode
}

export const AuthProvider = ({ children }: AuthProviderProps) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [loading, setLoading] = useState(true)

  const checkAuth = async () => {
    try {
      const response = await fetch('/api/auth/status', {
        credentials: 'include'
      })
      const data = await response.json()
      setIsAuthenticated(data.authenticated)
    } catch (error) {
      console.error('Auth check failed:', error)
      setIsAuthenticated(false)
    } finally {
      setLoading(false)
    }
  }

  const login = async (password: string): Promise<boolean> => {
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({ password })
      })

      if (response.ok) {
        setIsAuthenticated(true)
        return true
      } else {
        return false
      }
    } catch (error) {
      console.error('Login failed:', error)
      return false
    }
  }

  const logout = async () => {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include'
      })
    } catch (error) {
      console.error('Logout failed:', error)
    } finally {
      setIsAuthenticated(false)
    }
  }

  useEffect(() => {
    checkAuth()
  }, [])

  return (
    <AuthContext.Provider value={{
      isAuthenticated,
      login,
      logout,
      checkAuth,
      loading
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
