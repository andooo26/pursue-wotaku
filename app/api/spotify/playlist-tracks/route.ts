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
  const playlistId = searchParams.get('playlistId')?.trim();
  if (!playlistId) {
    return NextResponse.json({ error: 'playlistId を指定してください。' }, { status: 400 });
  }

  const headers = { Authorization: `Bearer ${accessToken}` };

  // プレイリストのトラックを全件取得（最大100件ずつ）
  type TrackItem = { id: string; name: string; artists: { id: string; name: string }[] };
  const rawTracks: TrackItem[] = [];
  let offset = 0;
  const limit = 100;

  while (true) {
    const res = await fetch(
      `https://api.spotify.com/v1/playlists/${encodeURIComponent(playlistId)}/tracks?limit=${limit}&offset=${offset}&fields=items(track(id,name,artists(id,name)))`,
      { headers }
    );
    if (!res.ok) {
      if (res.status === 404) {
        return NextResponse.json({ error: 'プレイリストが見つかりません。' }, { status: 404 });
      }
      const err = await res.text();
      console.error('Spotify playlist tracks error:', res.status, err);
      return NextResponse.json(
        { error: 'トラックの取得に失敗しました。' },
        { status: res.status === 401 ? 401 : 500 }
      );
    }
    const data = await res.json();
    const items = data.items ?? [];
    for (const item of items) {
      const t = item?.track;
      if (!t?.id) continue;
      rawTracks.push({
        id: t.id,
        name: t.name ?? '',
        artists: (t.artists ?? []).map((a: any) => ({ id: a.id ?? '', name: a.name ?? '' })).filter((a: any) => a.id),
      });
    }
    if (items.length < limit) break;
    offset += limit;
    if (rawTracks.length >= 500) break; // 最大500曲
  }

  const artistIds = [...new Set(rawTracks.flatMap((t) => t.artists.map((a) => a.id).filter(Boolean)))];

  const genreByArtistId: Record<string, string[]> = {};
  for (let i = 0; i < artistIds.length; i += 50) {
    const batch = artistIds.slice(i, i + 50);
    const res = await fetch(`https://api.spotify.com/v1/artists?ids=${batch.join(',')}`, { headers });
    if (!res.ok) continue;
    const data = await res.json();
    const artists = data.artists ?? [];
    for (let j = 0; j < batch.length; j++) {
      const a = artists[j];
      if (a?.genres?.length) genreByArtistId[batch[j]] = a.genres;
    }
  }

  const tracks: { id: string; title: string; artist: string; trackId: string; genres: string[] }[] = rawTracks.map(
    (t) => {
      const genresSet = new Set<string>();
      for (const a of t.artists) {
        for (const g of genreByArtistId[a.id] ?? []) genresSet.add(g);
      }
      return {
        id: t.id,
        title: t.name,
        artist: t.artists.map((a) => a.name).join(', '),
        trackId: t.id,
        genres: [...genresSet],
      };
    }
  );

  return NextResponse.json({ tracks });
}
