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
  const limit = 50;
  const headers = { Authorization: `Bearer ${accessToken}` };

  // 現在のユーザーIDを取得（users/{id}/playlists 用）
  const meRes = await fetch('https://api.spotify.com/v1/me', { headers });
  if (!meRes.ok) {
    return NextResponse.json({ error: 'Spotify と連携されていません。' }, { status: 401 });
  }
  const meData = await meRes.json();
  const userId: string | null = meData?.id ?? null;

  const playlists: { id: string; name: string; uri: string; tracksTotal?: number }[] = [];
  const seenIds = new Set<string>();

  const fetchPage = async (baseUrl: string, offset: number): Promise<{ items: any[]; total: number }> => {
    const url = `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}limit=${limit}&offset=${offset}`;
    const res: Response = await fetch(url, { headers });
    if (!res.ok) {
      const err = await res.text();
      console.error('Spotify playlists error:', res.status, err);
      throw new Error(res.status === 401 ? 'Unauthorized' : 'Playlist fetch failed');
    }
    const data = await res.json();
    return {
      items: (data.items ?? []).filter((p: any) => p && p.id),
      total: typeof data.total === 'number' ? data.total : 0,
    };
  };

  try {
    // 1) /me/playlists で全ページ取得
    for (let offset = 0; offset < 1000; offset += limit) {
      const { items, total } = await fetchPage('https://api.spotify.com/v1/me/playlists', offset);
      for (const p of items) {
        if (seenIds.has(p.id)) continue;
        seenIds.add(p.id);
        const name = p.name ?? '';
        if (q && !name.toLowerCase().includes(q.toLowerCase())) continue;
        playlists.push({
          id: p.id,
          name,
          uri: p.uri ?? '',
          tracksTotal: p.tracks?.total,
        });
      }
      if (items.length < limit || (total > 0 && offset + limit >= total)) break;
    }

    // 2) /users/{user_id}/playlists も取得してマージ（API の抜け対策）
    if (userId) {
      for (let offset = 0; offset < 1000; offset += limit) {
        let page: { items: any[]; total: number };
        try {
          page = await fetchPage(
            `https://api.spotify.com/v1/users/${encodeURIComponent(userId)}/playlists`,
            offset
          );
        } catch {
          break;
        }
        const { items, total } = page;
        for (const p of items) {
          if (seenIds.has(p.id)) continue;
          seenIds.add(p.id);
          const name = p.name ?? '';
          if (q && !name.toLowerCase().includes(q.toLowerCase())) continue;
          playlists.push({
            id: p.id,
            name,
            uri: p.uri ?? '',
            tracksTotal: p.tracks?.total,
          });
        }
        if (items.length < limit || (total > 0 && offset + limit >= total)) break;
      }
    }

    // 表示は名前順
    playlists.sort((a, b) => a.name.localeCompare(b.name, 'ja'));

    return NextResponse.json({ playlists });
  } catch (e: any) {
    const is401 = e?.message === 'Unauthorized';
    return NextResponse.json(
      { error: is401 ? 'Spotify の連携が切れています。' : 'プレイリスト一覧の取得に失敗しました。' },
      { status: is401 ? 401 : 500 }
    );
  }
}
