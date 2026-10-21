"use client";
import { useEffect, useRef, useState } from 'react';
type Video = { id: string | number; platform: string; channelAvatar?: string };
export function useChannelAvatars(items: Video[]) {
  const [avatars, setAvatars] = useState<Record<string, string>>({});
  const attempted = useRef(new Set<string>());
  const ids = [...new Set(items.filter(v => v.platform === 'YouTube' && !v.channelAvatar && /^yt-[\w-]{11}$/.test(String(v.id))).map(v => String(v.id)))].join(',');
  useEffect(() => {
    let mounted = true;
    const attempts = attempted.current;
    const completed = new Set<string>();
    const pending = ids.split(',').filter(id => id && !attempts.has(id));
    pending.forEach(id => attempts.add(id));
    void (async () => {
      for (let offset = 0; offset < pending.length && mounted; offset += 50) {
        try {
          const response = await fetch(`/api/youtube/avatars?ids=${pending.slice(offset, offset + 50).map(id => id.slice(3)).join(',')}`);
          const body = await response.json();
          if (response.ok && mounted) setAvatars(old => ({ ...old, ...body.avatars }));
        } catch { /* Initials remain available when the API cannot load an avatar. */ }
        pending.slice(offset, offset + 50).forEach(id => completed.add(id));
      }
    })();
    return () => { mounted = false; pending.filter(id => !completed.has(id)).forEach(id => attempts.delete(id)); };
  }, [ids]);
  return avatars;
}
