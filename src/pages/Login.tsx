import { useState, type FormEvent } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/Button';
import { ApiError } from '@/lib/api';

export function Login() {
  const { user, login } = useAuth();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/';

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (user) {
    if (user.role !== 'super_admin') {
      const home = user.brandSlugs?.[0] ? `/${user.brandSlugs[0]}/events` : '/';
      const allowed = user.brandSlugs?.some((s) => from.startsWith(`/${s}/`));
      return <Navigate to={allowed ? from : home} replace />;
    }
    return <Navigate to={from} replace />;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await login(username.trim(), password);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '登入失敗,請稍後再試');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(160deg, var(--color-primary-soft) 0%, var(--color-bg) 45%)',
        padding: 24,
      }}
    >
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        style={{
          width: '100%',
          maxWidth: 400,
          background: 'var(--color-bg)',
          border: '1px solid var(--color-border)',
          borderRadius: 16,
          padding: '36px 32px',
          boxShadow: '0 8px 32px rgba(0,0,0,0.06)',
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--color-primary-dark)' }}>GO</div>
          <h1 style={{ fontSize: 20, fontWeight: 700, marginTop: 4 }}>行銷中心</h1>
          <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginTop: 6 }}>
            請輸入帳號密碼登入
          </p>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 14 }}>
          <label style={{ display: 'grid', gap: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>帳號</span>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              required
              style={inputStyle}
              placeholder="Admin"
            />
          </label>
          <label style={{ display: 'grid', gap: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>密碼</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
              style={inputStyle}
            />
          </label>

          {error && (
            <div style={{ fontSize: 13, color: '#B85454', background: '#FDF0F0', padding: '8px 12px', borderRadius: 8 }}>
              {error}
            </div>
          )}

          <Button type="submit" variant="primary" disabled={submitting} style={{ width: '100%', justifyContent: 'center', marginTop: 4 }}>
            {submitting ? '登入中…' : '登入'}
          </Button>
        </form>
      </motion.div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  padding: '10px 12px',
  borderRadius: 10,
  border: '1px solid var(--color-border)',
  fontSize: 14,
  background: 'var(--color-bg-soft)',
  outline: 'none',
};
