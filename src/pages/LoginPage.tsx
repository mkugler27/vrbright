import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Button } from '../components/ui/Button'
import { useOnlineStatus } from '../hooks/useOnlineStatus'
import { supabase } from '../services/supabase'
import { getSupabaseUserByEmail } from '../services/chatApi'
import { fetchUserProfileByEmail } from '../services/authApi'
import { BUBBLE_TOKEN } from '../config/api'
import { useAuth } from '../context/AuthContext'
import { syncBubbleRolesToUsers } from '../services/teamSync'

export function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const isOnline = useOnlineStatus()
  const navigate = useNavigate()
  const { setUser } = useAuth()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (authError) {
        setError(authError.message)
        setLoading(false)
        return
      }

      if (!authData.user) {
        setError('Login failed. Please try again.')
        setLoading(false)
        return
      }

      const profile = await getSupabaseUserByEmail(email)
      if (!profile) {
        setError('User profile not found. Please sign up first.')
        await supabase.auth.signOut()
        setLoading(false)
        return
      }

      let profilePicture = profile.avatar_url
      try {
        const bubbleProfile = await fetchUserProfileByEmail(email, BUBBLE_TOKEN)
        if (bubbleProfile?.profile_picture) {
          profilePicture = bubbleProfile.profile_picture
        }
      } catch {
        // best-effort
      }

      // Sync Bubble roles → Supabase users in the background.
      // Fire-and-forget; failures are non-fatal.
      syncBubbleRolesToUsers()
        .then(({ synced }) => {
          if (synced > 0) {
            // Re-fetch the current user's row so the cached AuthUser
            // gets the new tipo_user_bubble value.
            return getSupabaseUserByEmail(email)
          }
          return null
        })
        .then(updated => {
          if (updated) {
            try {
              const stored = localStorage.getItem('vrbright_user')
              if (stored) {
                const u = JSON.parse(stored)
                u.tipo_user_bubble = (updated as any).tipo_user_bubble
                localStorage.setItem('vrbright_user', JSON.stringify(u))
              }
            } catch {
              // ignore
            }
          }
        })
        .catch(() => {
          // ignore
        })

      setUser({
        id: profile.id,
        email: profile.email,
        nome: profile.nome,
        role: profile.role as 'worker' | 'supervisor' | 'admin',
        profile_picture: profilePicture,
        tipo_user_bubble: (profile as any).tipo_user_bubble,
      })

      navigate('/')
    } catch (err) {
      setError('Connection error. Please try again.')
      console.error('Login error:', err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header / Branding */}
      <div className="bg-gradient-to-r from-primary-dark to-primary px-6 pt-12 pb-10 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
              <svg className="w-6 h-6 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
                <polyline points="9 22 9 12 15 12 15 22" />
              </svg>
            </div>
            <span className="text-white text-xl font-bold tracking-tight">VRBright</span>
          </div>
          <p className="text-white/80 text-sm font-medium">Workers Area</p>
        </div>
        {/* Online/Offline indicator */}
        <div
          className={`w-3 h-3 rounded-full ring-2 ring-white/30 ${isOnline ? 'bg-green-300' : 'bg-red-400'}`}
          title={isOnline ? 'Online' : 'Offline'}
        />
      </div>

      {/* Form */}
      <div className="flex-1 px-6 pt-8 pb-6">
        <h2 className="text-2xl font-bold text-gray-800 mb-1">Sign In</h2>
        <p className="text-sm text-gray-500 mb-6">Enter your credentials to continue.</p>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          {/* Email */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              required
              autoComplete="email"
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all placeholder:text-gray-400"
            />
          </div>

          {/* Password */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5" htmlFor="password">
              Password
            </label>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                autoComplete="current-password"
                className="w-full border border-gray-200 rounded-xl px-4 py-3 pr-11 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all placeholder:text-gray-400"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 p-1 active:scale-90 transition-transform"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? (
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          {/* Forgot password */}
          <div className="text-right">
            <button type="button" className="text-xs text-primary-dark font-medium hover:underline">
              Forgot password
            </button>
          </div>

          {/* Submit */}
          <Button
            type="submit"
            variant="primary"
            size="lg"
            disabled={loading}
            className="w-full mt-2"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Signing in...
              </span>
            ) : (
              'Sign In'
            )}
          </Button>
        </form>

        {/* Sign up link */}
        <p className="text-center text-sm text-gray-500 mt-6">
          Don&apos;t have an account?{' '}
          <Link to="/signup" className="text-primary-dark font-semibold hover:underline">
            Sign up
          </Link>
        </p>
      </div>

      {/* Footer */}
      <div className="px-6 pb-8 text-center">
        <p className="text-xs text-gray-400">
          VRBright v1.0 &mdash; &copy; {new Date().getFullYear()}
        </p>
      </div>
    </div>
  )
}