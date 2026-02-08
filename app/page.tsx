'use client';

import { useEffect, useState, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { Rekog } from '@/components/Rekog';
import { db } from '@/lib/firebase';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';

export default function Home() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [isRecording, setIsRecording] = useState(false);
  const [result, setResult] = useState<{ title: string; artist: string } | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const subscriptionRef = useRef<PushSubscription | null>(null);

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
  }, [user, loading, router]);

  // プッシュ通知の登録
  useEffect(() => {
    if ('serviceWorker' in navigator && 'PushManager' in window) {
      registerServiceWorker();
    }
        return () => {
    };
  }, []);

  const registerServiceWorker = async () => {
    try {
      // 既存のServiceWorker登録を確認
      let registration = await navigator.serviceWorker.getRegistration();
      
      if (!registration) {
        // 登録が存在しないなら新規登録
        registration = await navigator.serviceWorker.register('/sw.js');
        console.log('Service Worker registered:', registration);
      } else {
        console.log('Service Worker already registered:', registration);
      }

      // プッシュ通知の許可を取得
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        // VAPID公開鍵の確認
        const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
        if (!vapidPublicKey) {
          console.error('VAPID公開鍵が設定されていません');
          return;
        }

        try {
          // 既存の購読を確認
          let subscription = await registration.pushManager.getSubscription();
          
          if (!subscription) {
            // 購読が存在しない場合新規購読
            const vapidKey = urlBase64ToUint8Array(vapidPublicKey);
            subscription = await registration.pushManager.subscribe({
              userVisibleOnly: true,
              applicationServerKey: vapidKey as BufferSource,
            });
            console.log('Push subscription created:', subscription);
          } else {
            console.log('Push subscription already exists:', subscription);
          }
          
          subscriptionRef.current = subscription;
        } catch (pushError: any) {
          if (pushError.name === 'AbortError') {
            console.log('Push subscription aborted (may already exist)');
            const existingSubscription = await registration.pushManager.getSubscription();
            if (existingSubscription) {
              subscriptionRef.current = existingSubscription;
            }
          } else {
            console.error('Push subscription failed:', pushError);
          }
        }
      } else {
        console.log('プッシュ通知の許可が得られませんでした:', permission);
      }
    } catch (error: any) {
      if (error.name === 'AbortError') {
        console.log('Service Worker registration aborted');
      } else {
        console.error('Service Worker registration failed:', error);
      }
    }
  };

  // VAPID公開鍵をUint8Arrayに変換
  const urlBase64ToUint8Array = (base64String: string): Uint8Array => {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  };

  // プッシュ通知を送信
  const sendPushNotification = async (title: string, artist: string) => {
    if (!subscriptionRef.current) {
      console.log('Push subscription not available');
      return;
    }

    try {
      await fetch('/api/push', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          subscription: subscriptionRef.current,
          title,
          artist,
        }),
      });
    } catch (error) {
      console.error('Error sending push notification:', error);
    }
  };

  // 録音
  const startRecognition = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        await sendToAudd(audioBlob);
        stream.getTracks().forEach((track) => track.stop());
      };

      setIsRecording(true);
      setResult(null);
      mediaRecorder.start();

      setTimeout(() => {
        if (mediaRecorder.state === 'recording') {
          mediaRecorder.stop();
          setIsRecording(false);
        }
      }, 8000); // 秒数
    } catch (error) {
      console.error('Error starting recognition:', error);
      setIsRecording(false);
    }
  };

  // audd叩く
  const sendToAudd = async (audioBlob: Blob) => {
    try {
      const formData = new FormData();
      formData.append('file', audioBlob, 'audio.webm');
      formData.append('return', 'spotify');
      formData.append('api_token', process.env.NEXT_PUBLIC_AUDD_API_KEY || '');

      const response = await fetch('https://api.audd.io/', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (data.status === 'success' && data.result) {
        const title = data.result.title || '';
        const artist = data.result.artist || '';
        // SpotifyIDを取得
        const trackId = data.result.spotify?.id || 
                       data.result.spotify?.track_id || 
                       data.result.spotify_id || 
                       data.result.id || 
                       '';

        setResult({ title, artist });

        // DBに保存
        if (user) {
          try {
            await addDoc(collection(db, 'Rekog'), {
              title,
              artist,
              trackId,
              userId: user.uid,
              timeStamp: serverTimestamp(),
              analysis: false,
            });
            
            // プッシュ通知を送信
            await sendPushNotification(title, artist);
            
            // 保存完了後リロード
            window.location.reload();
          } catch (e) {
            console.error('Error:', e);
          }
        }
      } else {
        setResult({ title: '音楽を認識できませんでした', artist: '' });
      }
    } catch (error) {
      console.error('Error sending to audd:', error);
      setResult({ title: 'エラーが発生しました', artist: '' });
    }
  };

  if (loading) {
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
      }}
    >
      <div
        style={{
          marginTop: '40px',
          width: '220px',
          height: '220px',
          borderRadius: '50%',
          border: '3px solid #fff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <button
          onClick={startRecognition}
          disabled={isRecording}
          className="rekog-button"
          style={{ 
            cursor: isRecording ? 'not-allowed' : 'pointer',
            background: 'transparent',
            outline: 'none',
          }}
        >
          {isRecording ? '認識中...' : '認識開始'}
        </button>
      </div>
      {result && (
        <div style={{ marginTop: '20px', color: '#fff', textAlign: 'center' }}>
          {result.title} / {result.artist}
        </div>
      )}
      <Rekog />
    </div>
  );
}
