import { AuthProvider } from '@/contexts/AuthContext';
import './globals.css';

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja" style={{ margin: 0, padding: 0, height: '100%', background: '#000' }}>
      <body style={{ margin: 0, padding: 0, height: '100%', background: '#000' }}>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
