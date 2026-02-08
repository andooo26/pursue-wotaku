'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';

interface PlaylistData {
  id: string;
  title: string;
  artist: string;
  timeText: string;
  genres: string[];
}

interface GenreGroup {
  genre: string;
  songs: PlaylistData[];
}

export default function PlaylistPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [genreGroups, setGenreGroups] = useState<GenreGroup[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [expandedGenres, setExpandedGenres] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
  }, [user, loading, router]);

  useEffect(() => {
    if (user) {
      fetchPlaylistData();
    }
  }, [user]);

  const fetchPlaylistData = async () => {
    if (!user) {
      setLoadingData(false);
      return;
    }

    try {
      const q = query(
        collection(db, 'Rekog'),
        where('userId', '==', user.uid),
        orderBy('timeStamp', 'desc')
      );

      const querySnapshot = await getDocs(q);
      const allSongs: PlaylistData[] = [];

      querySnapshot.forEach((docSnapshot) => {
        const docData = docSnapshot.data() as any;
        const ts = docData.timeStamp;
        const date = ts && typeof ts.toDate === 'function' ? ts.toDate() : null;
        const timeText = date ? date.toLocaleString('ja-JP') : '';
        const genres = docData.genres || [];

        // ジャンルがある楽曲のみを追加
        if (genres.length > 0) {
          allSongs.push({
            id: docSnapshot.id,
            title: docData.title || '',
            artist: docData.artist || '',
            timeText,
            genres,
          });
        }
      });

      // ジャンルごとにグループ化
      const genreMap = new Map<string, PlaylistData[]>();

      allSongs.forEach((song) => {
        song.genres.forEach((genre) => {
          if (!genreMap.has(genre)) {
            genreMap.set(genre, []);
          }
          genreMap.get(genre)!.push(song);
        });
      });

      // ジャンル名でソートして配列に変換
      const groups: GenreGroup[] = Array.from(genreMap.entries())
        .map(([genre, songs]) => ({
          genre,
          songs: songs.sort((a, b) => {
            // タイムスタンプでソート（新しい順）
            return b.timeText.localeCompare(a.timeText);
          }),
        }))
        .sort((a, b) => a.genre.localeCompare(b.genre));

      setGenreGroups(groups);
    } catch (error: any) {
      console.error('Error fetching playlist data:', error);
    } finally {
      setLoadingData(false);
    }
  };

  if (loading || loadingData) {
    return null;
  }

  if (!user) {
    return null;
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        overflowX: 'hidden',
        paddingTop: '40px',
        paddingBottom: '80px',
        color: '#fff',
      }}
    >
      {genreGroups.length === 0 ? (
        <div>ジャンル別のデータがありません</div>
      ) : (
        <div style={{ width: '90%', maxWidth: '800px' }}>
          {genreGroups.map((group) => (
            <div
              key={group.genre}
              style={{
                marginBottom: '40px',
                border: '2px solid #ff0000',
                padding: '20px',
                borderRadius: '8px',
              }}
            >
              <h2
                style={{
                  margin: '0 0 20px 0',
                  fontSize: '20px',
                  fontWeight: '600',
                  borderBottom: '1px solid #333',
                  paddingBottom: '10px',
                }}
              >
                # {group.genre}
              </h2>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {(expandedGenres.has(group.genre) ? group.songs : group.songs.slice(0, 5)).map((song, index) => (
                  <li key={`${song.id}-${index}`} style={{ marginBottom: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start' }}>
                      <span style={{ marginRight: '8px' }}>{index + 1}.</span>
                      <div style={{ flex: 1 }}>
                        <div>{song.title}</div>
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            fontSize: '14px',
                            color: '#ccc',
                            marginTop: '4px',
                          }}
                        >
                          <span>{song.artist}</span>
                          {song.timeText && <span>{song.timeText}</span>}
                        </div>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
              {group.songs.length > 5 && !expandedGenres.has(group.genre) && (
                <button
                  onClick={() => {
                    setExpandedGenres((prev) => new Set(prev).add(group.genre));
                  }}
                  style={{
                    marginTop: '12px',
                    padding: '6px 12px',
                    background: 'transparent',
                    color: '#808080',
                    border: '1px solid #808080',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontWeight: '500',
                  }}
                >
                  もっと見る
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
