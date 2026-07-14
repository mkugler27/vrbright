import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '../components/ui/Button'
import { useOnlineStatus } from '../hooks/useOnlineStatus'
import { supabase } from '../services/supabase'
import { getSupabaseUserByEmail } from '../services/chatApi'
import { useAuth } from '../context/AuthContext'

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
        setError('User profile not found. Please contact your administrator.')
        await supabase.auth.signOut()
        setLoading(false)
        return
      }

      if (profile.ativo === false) {
        setError('Sua conta está bloqueada pelo Administrador.')
        await supabase.auth.signOut()
        setLoading(false)
        return
      }

      setUser({
        id: authData.user.id,
        email: email,
        nome: profile.nome || email.split('@')[0],
        profile_picture: profile.avatar_url,
        tipo_user_bubble: profile.tipo_user_bubble,
        bubble_id: profile.bubble_id
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
    <div className="min-h-dvh bg-gray-100 flex items-stretch">
      {/* LEFT SIDE: Form Container */}
      <div className="w-full lg:w-[45%] flex flex-col justify-between bg-white px-8 py-10 md:px-16 md:py-16 relative">
        {/* Header / Branding */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img 
              src="/vr1logo.png" 
              alt="VR Bright Logo" 
              className="w-10 h-10 object-contain bg-white rounded-xl shadow-md p-1" 
            />
            <span className="text-gray-900 text-2xl font-bold tracking-tight">VRBright</span>
          </div>
          {/* Online/Offline indicator */}
          <div
            className={`w-3.5 h-3.5 rounded-full ring-4 ring-gray-100 ${isOnline ? 'bg-green-500' : 'bg-red-500'}`}
            title={isOnline ? 'Online' : 'Offline'}
          />
        </div>

        {/* Form Body */}
        <div className="my-auto max-w-md w-full mx-auto pt-10 pb-6">
          <h2 className="text-3xl font-extrabold text-gray-900 leading-tight tracking-tight mb-2">Welcome Back</h2>
          <p className="text-sm text-gray-500 mb-8 font-medium">Please enter your credentials to access the portal.</p>

          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-100 rounded-2xl text-sm text-red-600 font-semibold leading-relaxed">
              {error}
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-5">
            {/* Email */}
            <div>
              <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2" htmlFor="email">
                Email Address
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                required
                autoComplete="email"
                className="w-full border border-gray-200 rounded-2xl px-4 py-3.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-primary focus:bg-white focus:border-transparent transition-all placeholder:text-gray-400 font-medium"
              />
            </div>

            {/* Password */}
            <div>
              <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2" htmlFor="password">
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
                  className="w-full border border-gray-200 rounded-2xl px-4 py-3.5 pr-11 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-primary focus:bg-white focus:border-transparent transition-all placeholder:text-gray-400 font-medium"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 p-1.5 active:scale-90 transition-transform"
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
              <button type="button" className="text-xs text-primary-dark font-bold hover:underline">
                Forgot password?
              </button>
            </div>

            {/* Submit */}
            <Button
              type="submit"
              variant="primary"
              size="lg"
              disabled={loading}
              className="w-full mt-4 h-12 rounded-2xl font-bold uppercase tracking-wider shadow-md shadow-primary/20"
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
        </div>

        {/* Footer */}
        <div className="text-center lg:text-left mt-auto">
          <p className="text-xs text-gray-400 font-semibold">
            VRBright &mdash; &copy; {new Date().getFullYear()} · All rights reserved.
          </p>
        </div>
      </div>

      {/* RIGHT SIDE: Immersive Theme Image */}
      <div 
        className="hidden lg:block lg:w-[55%] bg-cover bg-center relative"
        style={{ backgroundImage: 'url("/painter_login.png")' }}
      >
        {/* Soft overlay gradient to look premium */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-black/30" />
        
        {/* Branding text overlay inside image */}
        <div className="absolute bottom-16 left-16 right-16 text-white max-w-lg">
          <h2 className="text-4xl font-extrabold tracking-tight mb-3 drop-shadow-md">Professional Quality & Care</h2>
          <p className="text-lg text-white/90 font-medium leading-relaxed drop-shadow-sm">
            Empowering painters and field workers with the best operational and management tools.
          </p>
        </div>
      </div>
    </div>
  );
}