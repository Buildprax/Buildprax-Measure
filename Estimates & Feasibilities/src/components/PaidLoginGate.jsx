import React from 'react'

export default function PaidLoginGate({ visible, onAuthenticated, licenseType = 'trial' }) {
  const [mode, setMode] = React.useState('create')
  const [email, setEmail] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [stayLoggedIn, setStayLoggedIn] = React.useState(true)
  const [isLoading, setIsLoading] = React.useState(false)
  const [error, setError] = React.useState('')
  const [hasAnyAccount, setHasAnyAccount] = React.useState(false)

  React.useEffect(() => {
    if (!visible || !window.electronAPI?.getAppAuthState) return
    window.electronAPI.getAppAuthState().then((state) => {
      const hasAccount = !!state?.hasAnyAccount
      setHasAnyAccount(hasAccount)
      setMode(hasAccount ? 'login' : 'create')
    }).catch(() => {
      setHasAnyAccount(false)
      setMode('create')
    })
  }, [visible])

  if (!visible) return null

  const submit = async (e) => {
    e.preventDefault()
    setIsLoading(true)
    setError('')
    try {
      const payload = { email, password, stayLoggedIn }
      const result = mode === 'create'
        ? await window.electronAPI.createAppAccount(payload)
        : await window.electronAPI.loginAppAccount(payload)
      if (!result?.success) {
        setError(result?.error || 'Authentication failed.')
        return
      }
      onAuthenticated?.()
    } catch (_) {
      setError('Authentication failed. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(15,23,42,0.82)',
      zIndex: 200000,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 20,
    }}>
      <div style={{ width: '100%', maxWidth: 520, background: '#fff', borderRadius: 12, padding: 24 }}>
        <h2 style={{ margin: 0, marginBottom: 10, color: '#0f172a' }}>Login Required</h2>
        <p style={{ marginTop: 0, color: '#475569' }}>
          {licenseType === 'subscription'
            ? `This device has a paid subscription. Please ${mode === 'create' ? 'create' : 'sign in to'} your account to continue.`
            : `Please ${mode === 'create' ? 'create' : 'sign in to'} your account to start and track your trial period.`}
        </p>
        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          <button type="button" onClick={() => setMode('create')} className="btn-app" disabled={isLoading} style={{ opacity: mode === 'create' ? 1 : 0.7 }}>
            Create Account
          </button>
          <button type="button" onClick={() => setMode('login')} className="btn-app" disabled={isLoading || !hasAnyAccount} style={{ opacity: mode === 'login' ? 1 : 0.7 }}>
            Sign In
          </button>
        </div>
        <form onSubmit={submit}>
          <div style={{ marginBottom: 10 }}>
            <label style={{ display: 'block', marginBottom: 6 }}>Email</label>
            <input value={email} onChange={(e) => setEmail(e.target.value)} required type="email" style={{ width: '100%', padding: 10, border: '1px solid #cbd5e1', borderRadius: 6 }} />
          </div>
          <div style={{ marginBottom: 10 }}>
            <label style={{ display: 'block', marginBottom: 6 }}>Password</label>
            <input value={password} onChange={(e) => setPassword(e.target.value)} required type="password" minLength={6} style={{ width: '100%', padding: 10, border: '1px solid #cbd5e1', borderRadius: 6 }} />
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, color: '#334155', fontSize: 14 }}>
            <input type="checkbox" checked={stayLoggedIn} onChange={(e) => setStayLoggedIn(e.target.checked)} />
            Stay logged in until this period ends
          </label>
          {error ? <p style={{ color: '#b91c1c', marginBottom: 10 }}>{error}</p> : null}
          <button type="submit" disabled={isLoading} className="btn-app" style={{ width: '100%' }}>
            {isLoading ? 'Please wait...' : mode === 'create' ? 'Create Account and Continue' : 'Sign In and Continue'}
          </button>
        </form>
      </div>
    </div>
  )
}
