@@ -1,4 +1,6 @@
import React, { useEffect, useMemo, useRef, useState, useLayoutEffect } from 'react';
const ALLOWED_ROOMS = ['ROOM1', 'ROOM2', 'ROOM3'];


const WS_URL =
  import.meta.env.VITE_WS_URL ||
@@ -14,6 +16,8 @@ export default function CanoBlofOnline() {
  const [connected, setConnected] = useState(false);
  const [ws, setWs] = useState(null);
  const [myId, setMyId] = useState(null);
  const [roomId, setRoomId] = useState('ROOM1'); // oda seçimi


  // ---- Oyun state
  const [state, setState] = useState({
@@ -84,14 +88,16 @@ export default function CanoBlofOnline() {
  setWs(sock);

  sock.onopen = () => {
    // Konsol ve gerektiğinde manuel kullanım için:
    window.ws = sock;
    // Odaya katıl
    const payload = {
      type: 'join',
      roomId: roomId.trim().toUpperCase(),
      name: name.trim(),
    };
  // (İsteğe bağlı) global erişim istersen:
  // window.ws = sock;

  sock.send(JSON.stringify({
    type: 'join',
    roomId: roomId.toUpperCase(),   // <-- ODA BURADA GÖNDERİLİYOR
    name
  }));
};

    sock.send(JSON.stringify(payload));
  };

@@ -103,6 +109,12 @@ export default function CanoBlofOnline() {
      return;
    }

    if (msg.type === 'error') {
  alert(msg.message || 'Hata');
  return;
}


    if (msg.type === 'hello') {
      // Sunucu kimliğimizi verdiğinde
      setMyId(msg.you);
@@ -290,12 +302,14 @@ export default function CanoBlofOnline() {
        {!connected && (
          <div className="panel glass">
            <div className="row">
              <input
                value={roomId}
                onChange={(e) => setRoomId(e.target.value)}
                placeholder="Oda Kodu"
                onKeyDown={(e) => { if (e.key === 'Enter') setConnected(true); }}
              />
              <select
  value={roomId}
  onChange={(e) => setRoomId(e.target.value)}
>
  {ALLOWED_ROOMS.map(r => (
    <option key={r} value={r}>{r}</option>
  ))}
</select>  
              <input
                ref={nameInputRef}
                value={name}
