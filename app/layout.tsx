import { AuthProvider } from '@/contexts/AuthContext';

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja" style={{ margin: 0, padding: 0, height: '100%', background: '#808080' }}>
      <body style={{ margin: 0, padding: 0, height: '100%', background: '#808080' }}>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
