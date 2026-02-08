'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, orderBy, limit, updateDoc, doc } from 'firebase/firestore';
import { GoogleGenerativeAI } from '@google/generative-ai';

interface RekogData {
  id: string;
  title: string;
  artist: string;
  timeText: string;
}

interface RekogProps {
  maxItems?: number;
}

export function Rekog({ maxItems = 15 }: RekogProps) {
  const { user } = useAuth();
  const [rekogList, setRekogList] = useState<RekogData[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  const fetchRekogData = async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    try {
      let q = query(
        collection(db, 'Rekog'),
        where('userId', '==', user.uid),
        orderBy('timeStamp', 'desc')
      );
      if (maxItems) {
        q = query(q, limit(maxItems));
      }
      const querySnapshot = await getDocs(q);
      const data: RekogData[] = [];
      querySnapshot.forEach((docSnapshot) => {
        const docData = docSnapshot.data() as any;
        const ts = docData.timeStamp;
        const date = ts && typeof ts.toDate === 'function' ? ts.toDate() : null;
        const timeText = date ? date.toLocaleString('ja-JP') : '';

        data.push({
          id: docSnapshot.id,
          title: docData.title || '',
          artist: docData.artist || '',
          timeText,
        });
      });
      setRekogList(data);
    } catch (error: any) {
      console.error('Error fetching rekog data:', error);
      console.error('Error code:', error.code);
      console.error('Error message:', error.message);
      if (error.code === 'permission-denied') {
        console.error('security rules');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRekogData();
  }, [user, maxItems]);

  const translateWithGemini = async (title: string, artist: string): Promise<{ title: string; artist: string }> => {
    const genAI = new GoogleGenerativeAI(process.env.NEXT_PUBLIC_GEMINI_API_KEY || '');
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    const prompt = `曲名とアーティスト名が以下のように与えられるので、その楽曲とアーティストの組み合わせで楽曲が存在することを確認したうえで日本語での表記で必ず存在する曲名とアーティスト名を返してください。単に翻訳をするのではなく、インターネット上のソースを確認したうえで、各日な情報を格納するようにしてください
    
曲名: ${title}
アーティスト: ${artist}

JSON形式で以下のように返してください:
{
  "title": "曲名",
  "artist": "アーティスト名"
}`;

    try {
      const result = await model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();
      
      // JSON整形
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          title: parsed.title || title,
          artist: parsed.artist || artist,
        };
      }
      return { title, artist };
    } catch (error) {
      console.error('Error translating with Gemini:', error);
      return { title, artist };
    }
  };

  const handleSync = async () => {
    if (!user || syncing) return;

    setSyncing(true);
    try {
      // analysisがfalseのものを処理
      let q = query(
        collection(db, 'Rekog'),
        where('userId', '==', user.uid),
        orderBy('timeStamp', 'desc')
      );
      if (maxItems) {
        q = query(q, limit(maxItems));
      }
      const querySnapshot = await getDocs(q);
      
      const unanalyzedDocs: Array<{ id: string; title: string; artist: string; trackId?: string }> = [];
      querySnapshot.forEach((docSnapshot) => {
        const docData = docSnapshot.data();
        if (!docData.analysis) {
          unanalyzedDocs.push({
            id: docSnapshot.id,
            title: docData.title || '',
            artist: docData.artist || '',
            trackId: docData.trackId || '',
          });
        }
      });

      // 各ドキュメントを処理
      for (const item of unanalyzedDocs) {
        if (item.trackId) {
          // TrackIdがある場合はSpotify APIから情報を取得
          try {
            const response = await fetch('/api/spotify', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ trackId: item.trackId }),
            });

            if (response.ok) {
              const spotifyData = await response.json();
              await updateDoc(doc(db, 'Rekog', item.id), {
                title: spotifyData.title || item.title,
                artist: spotifyData.artist || item.artist,
                genres: spotifyData.genres || [],
                analysis: true,
              });
            } else {
              // Spotify APIが失敗した場合はGeminiで日本語化
              const translated = await translateWithGemini(item.title, item.artist);
              await updateDoc(doc(db, 'Rekog', item.id), {
                title: translated.title,
                artist: translated.artist,
                analysis: true,
              });
            }
          } catch (error) {
            console.error('Error fetching Spotify data:', error);
            // エラー時はGeminiで日本語化
            const translated = await translateWithGemini(item.title, item.artist);
            await updateDoc(doc(db, 'Rekog', item.id), {
              title: translated.title,
              artist: translated.artist,
              analysis: true,
            });
          }
        } else {
          // TrackIdがない場合はGeminiで日本語化
          const translated = await translateWithGemini(item.title, item.artist);
          await updateDoc(doc(db, 'Rekog', item.id), {
            title: translated.title,
            artist: translated.artist,
            analysis: true,
          });
        }
      }

      // 再取得
      await fetchRekogData();
    } catch (error) {
      console.error('Error syncing:', error);
    } finally {
      setSyncing(false);
    }
  };

  // データがなければありません、あれば title / artist / timeStamp のリスト
  return (
    <div style={{ border: '2px solid #ff8c00', padding: '20px', margin: '40px auto', width: '80%', color: '#fff' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '-10px', marginBottom: '20px' }}>
        <h2 style={{ margin: 0 }}>認識履歴</h2>
        <button
          onClick={handleSync}
          disabled={syncing || loading}
          style={{
            padding: '6px 12px',
            background: syncing ? '#6c757d' : '#28a745',
            color: '#fff',
            border: 'none',
            borderRadius: '4px',
            cursor: syncing || loading ? 'not-allowed' : 'pointer',
            fontSize: '14px',
            fontWeight: '500',
          }}
        >
          {syncing ? '同期中' : '今すぐ同期'}
        </button>
      </div>
      {loading ? (
        <div></div>
      ) : rekogList.length === 0 ? (
        <div>データがありません</div>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {rekogList.map((item, index) => (
            <li key={item.id} style={{ marginBottom: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start' }}>
                <span style={{ marginRight: '8px' }}>{index + 1}.</span>
                <div style={{ flex: 1 }}>
                  <div>{item.title}</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', color: '#ccc', marginTop: '4px' }}>
                    <span>{item.artist}</span>
                    {item.timeText && <span>{item.timeText}</span>}
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
