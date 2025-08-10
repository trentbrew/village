import React, { useEffect, useState } from 'react';
import { getIdentity, setIdentity, type Identity } from '../identity';

export default function Profile() {
  const [identity, setState] = useState<Identity>(getIdentity());
  const [preview, setPreview] = useState<string | undefined>(identity.avatar);

  useEffect(() => {
    const onUpdate = (e: any) => setState(e.detail as Identity);
    window.addEventListener('pk-identity-updated' as any, onUpdate);
    return () =>
      window.removeEventListener('pk-identity-updated' as any, onUpdate);
  }, []);

  const onAvatarChange = (file: File | null) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      setPreview(dataUrl);
      const updated = setIdentity({ avatar: dataUrl });
      setState(updated);
    };
    reader.readAsDataURL(file);
  };

  return (
    <section>
      <h2>Profile</h2>
      <div
        style={{
          display: 'flex',
          gap: 16,
          alignItems: 'flex-start',
          marginTop: 8,
        }}
      >
        <div>
          <div
            style={{
              width: 96,
              height: 96,
              borderRadius: 12,
              background: identity.color,
              overflow: 'hidden',
              display: 'grid',
              placeItems: 'center',
              color: '#fff',
              fontWeight: 700,
            }}
          >
            {preview ? (
              <img
                src={preview}
                alt="avatar"
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            ) : (
              identity.name.slice(0, 1).toUpperCase()
            )}
          </div>
          <label style={{ display: 'block', marginTop: 8 }}>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => onAvatarChange(e.target.files?.[0] ?? null)}
            />
          </label>
        </div>
        <div style={{ flex: 1, display: 'grid', gap: 8 }}>
          <label>
            <div>Name</div>
            <input
              value={identity.name}
              onChange={(e) => {
                const updated = setIdentity({ name: e.target.value });
                setState(updated);
              }}
              style={{
                width: '100%',
                padding: 8,
                borderRadius: 8,
                border: '1px solid #ccc',
              }}
            />
          </label>
          <label>
            <div>Color</div>
            <input
              value={identity.color}
              onChange={(e) => {
                const updated = setIdentity({ color: e.target.value });
                setState(updated);
              }}
              style={{
                width: 160,
                padding: 8,
                borderRadius: 8,
                border: '1px solid #ccc',
              }}
            />
          </label>
          <div style={{ fontSize: 12, opacity: 0.7 }}>
            User ID: {identity.userId}
          </div>
        </div>
      </div>
    </section>
  );
}
