'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, orderBy, limit } from 'firebase/firestore';

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

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    // userIdがログイン中のユーザのもの, titleとartistを取得
    const fetchRekogData = async () => {
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
        querySnapshot.forEach((doc) => {
          const docData = doc.data() as any;
          const ts = docData.timeStamp;
          const date = ts && typeof ts.toDate === 'function' ? ts.toDate() : null;
          const timeText = date ? date.toLocaleString('ja-JP') : '';

          data.push({
            id: doc.id,
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

    fetchRekogData();
  }, [user]);

  // データがなければありません、あれば title / artist / timeStamp のリスト
  return (
    <div style={{ border: '2px solid #ff8c00', padding: '20px', margin: '40px auto', width: '80%', color: '#fff' }}>
      <h2 style={{ marginTop: '-10px' }}>認識履歴</h2>
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
