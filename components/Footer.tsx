'use client';

import Link from 'next/link';

export function Footer() {
  return (
    <footer
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        height: '60px',
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        background: '#000',
        borderTop: '1px solid #333',
        color: '#fff',
      }}
    >
      <Link href="/result" style={{ flex: 1, cursor: 'pointer', textAlign: 'center', textDecoration: 'none', color: '#fff' }}>
        認識履歴
      </Link>
      <Link href="/" style={{ flex: 1, cursor: 'pointer', textAlign: 'center', textDecoration: 'none', color: '#fff' }}>
        ホーム
      </Link>
      <Link href="/playlist" style={{ flex: 1, cursor: 'pointer', textAlign: 'center', textDecoration: 'none', color: '#fff' }}>
        プレイリスト
      </Link>
    </footer>
  );
}
