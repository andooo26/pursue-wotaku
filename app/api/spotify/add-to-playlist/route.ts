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

export async function POST(request: Request) {
  const accessToken = await getAccessTokenFromRefresh();
  if (!accessToken) {
    return NextResponse.json({ error: 'Spotify と連携されていません。' }, { status: 401 });
  }

  let body: { trackUris?: string[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const trackUris = body.trackUris;
  if (!Array.isArray(trackUris) || trackUris.length === 0) {
    return NextResponse.json({ error: 'trackUris を指定してください。' }, { status: 400 });
  }

  const validUris = trackUris.filter((u) => typeof u === 'string' && u.startsWith('spotify:track:'));
  if (validUris.length === 0) {
    return NextResponse.json({ error: '有効なトラック URI がありません。' }, { status: 400 });
  }

  const headers = { Authorization: `Bearer ${accessToken}` };

  const meRes = await fetch('https://api.spotify.com/v1/me', { headers });
  if (!meRes.ok) {
    return NextResponse.json({ error: 'Spotify ユーザー情報の取得に失敗しました。' }, { status: 401 });
  }
  const me = await meRes.json();
  const userId = me.id;
  if (!userId) {
    return NextResponse.json({ error: 'ユーザーIDを取得できませんでした。' }, { status: 500 });
  }

  const playlistName = `Pursue Wotaku - ${new Date().toLocaleDateString('ja-JP')}`;
  const createRes = await fetch(`https://api.spotify.com/v1/users/${userId}/playlists`, {
    method: 'POST',
    headers: {
      ...headers,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: playlistName,
      description: '認識履歴から追加したプレイリスト',
      public: true,
    }),
  });

  if (!createRes.ok) {
    const errText = await createRes.text();
    console.error('Create playlist failed:', createRes.status, errText);
    return NextResponse.json(
      { error: 'プレイリストの作成に失敗しました。' },
      { status: 500 }
    );
  }

  const playlist = await createRes.json();
  const playlistId = playlist.id;
  if (!playlistId) {
    return NextResponse.json({ error: 'プレイリストIDを取得できませんでした。' }, { status: 500 });
  }

  // 最大100曲ずつ追加（Spotify API の制限）
  const chunkSize = 100;
  let addedCount = 0;
  for (let i = 0; i < validUris.length; i += chunkSize) {
    const chunk = validUris.slice(i, i + chunkSize);
    const addRes = await fetch(`https://api.spotify.com/v1/playlists/${playlistId}/tracks`, {
      method: 'POST',
      headers: {
        ...headers,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ uris: chunk }),
    });
    if (!addRes.ok) {
      const errText = await addRes.text();
      console.error('Add tracks failed:', addRes.status, errText);
      return NextResponse.json(
        { error: 'トラックの追加に失敗しました。', addedCount },
        { status: 500 }
      );
    }
    addedCount += chunk.length;
  }

  return NextResponse.json({
    playlistId,
    playlistUrl: playlist.external_urls?.spotify,
    addedCount,
  });
}
