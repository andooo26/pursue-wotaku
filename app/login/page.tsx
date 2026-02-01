'use client';

import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

export default function LoginPage() {
  const [error, setError] = useState('');
  const { loginWithGoogle, user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user) {
      router.push('/');
    }
  }, [user, loading, router]);

  const handleGoogleLogin = async () => {
    setError('');
    try {
      await loginWithGoogle();
    } catch (err: any) {
      setError(err.message || 'ログインに失敗しました');
    }
  };

  if (loading) {
    return null;
  }

  if (user) {
    return null;
  }

  return (
    <div>
      <h1>ログイン</h1>
      {error && <div style={{ color: 'red' }}>{error}</div>}
      <button onClick={handleGoogleLogin}>Googleで続ける</button>
    </div>
  );
}
