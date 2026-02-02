import { AuthProvider } from '@/contexts/AuthContext';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import './globals.css';

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja" style={{ margin: 0, padding: 0, height: '100%', background: '#000' }}>
      <body style={{ margin: 0, padding: 0, minHeight: '100vh', background: '#000' }}>
        <AuthProvider>
          <Header />
          <main style={{ paddingBottom: '60px' }}>{children}</main>
          <Footer />
        </AuthProvider>
      </body>
    </html>
  );
}
