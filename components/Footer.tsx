'use client';

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
      <div style={{ flex: 1, cursor: 'pointer', textAlign: 'center' }}>認識履歴</div>
      <div style={{ flex: 1, cursor: 'pointer', textAlign: 'center' }}>ホーム</div>
      <div style={{ flex: 1, cursor: 'pointer', textAlign: 'center' }}>プレイリスト</div>
    </footer>
  );
}
