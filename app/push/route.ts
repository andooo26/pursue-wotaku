import { NextResponse } from 'next/server';
import webpush from 'web-push';

const VAPID_KEYS = {
  publicKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
  privateKey: process.env.VAPID_PRIVATE_KEY!,
};

webpush.setVapidDetails(
  'mailto:it252231@trident.ac.jp',
  VAPID_KEYS.publicKey,
  VAPID_KEYS.privateKey
);
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const subscription = body.subscription;
    const title = body.title || '曲を検知しました';
    const artist = body.artist || '';

    const payload = JSON.stringify({
      title: '曲を検知しました',
      body: artist ? `${title} / ${artist}` : title,
    });

    await webpush.sendNotification(subscription, payload);

    return NextResponse.json({ message: '送信成功' });
  } catch (error) {
    console.error('送信エラー:', error);
    return NextResponse.json({ error: '送信失敗' }, { status: 500 });
  }
}