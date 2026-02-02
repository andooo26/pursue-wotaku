'use client';

import { useAuth } from '@/contexts/AuthContext';

export function Header() {
  const { user } = useAuth();

  return (
    <header
      style={{
        height: '60px',
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        color: '#fff',
      }}
    >
      <div style={{ fontWeight: 600 }}>pursue-wotaku</div>
      <div
        style={{
          position: 'absolute',
          right: '16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px',
        }}
      >
        {user?.photoURL ? (
          <img
            src={user.photoURL}
            alt="User"
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              border: '2px solid #fff',
            }}
          />
        ) : (
          <div
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              border: '2px solid #fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '14px',
            }}
          >
          </div>
        )}
      </div>
    </header>
  );
}

