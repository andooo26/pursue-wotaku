import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

async function getAccessTokenFromRefresh(): Promise<string | null> {
  const cookieStore = await cookies();
  const refreshToken = cookieStore.get('spotify_refresh_token')?.value;
  if (!refreshToken) return null;

  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }).toString(),
  });

  if (!response.ok) return null;
  const data = await response.json();
  return data.access_token ?? null;
}

export async function GET(request: Request) {
  const accessToken = await getAccessTokenFromRefresh();
  if (!accessToken) {
    return NextResponse.json({ error: 'Spotify と連携されていません。' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q')?.trim() ?? '';
  const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') ?? '50', 10) || 50));

  const playlists: { id: string; name: string; uri: string; tracksTotal?: number }[] = [];
  let url: string | null = `https://api.spotify.com/v1/me/playlists?limit=${limit}`;

  while (url) {
    const res: Response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      const err = await res.text();
      console.error('Spotify playlists error:', res.status, err);
      return NextResponse.json(
        { error: 'プレイリスト一覧の取得に失敗しました。' },
        { status: res.status === 401 ? 401 : 500 }
      );
    }
    const data = await res.json();
    const items = (data.items ?? []).filter((p: any) => p && p.id);
    for (const p of items) {
      const name = p.name ?? '';
      if (q && !name.toLowerCase().includes(q.toLowerCase())) continue;
      playlists.push({
        id: p.id,
        name,
        uri: p.uri ?? '',
        tracksTotal: p.tracks?.total,
      });
    }
    url = data.next ? data.next : null;
    if (playlists.length >= 100) break; // 最大100件まで
  }

  return NextResponse.json({ playlists });
}
