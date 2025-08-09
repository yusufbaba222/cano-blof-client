import React, { useEffect, useRef, useState } from 'react';

// PROD için sabitle (istersen env ile de çalışır)
const WS_URL = import.meta.env?.VITE_WS_URL || 'wss://cano-blof-server2.onrender.com';
// Sadece bu 3 oda
const ALLOWED_ROOMS = ['ROOM1', 'ROOM2', 'ROOM3'];

export default function CanoBlofOnline() {
  const [roomId, setRoomId] = useState('ROOM1');
  const [name, setName] = useState('Oyuncu');
  const [ws, setWs] = useState(null);
  const [connected, setConnected] = useState(false);
  const [myId, setMyId] = useState(null);

  const [state, setState] = useState({
    phase: 'lobby',
    players: [],
    order: [],
    hostId: null,
    starterId: null,
    turnOwner: null,
    hintRound: 0,
    result: null,
  });

  const [myRole, setMyRole] = useState(null);       // 'SPY' | 'WORD' | null
  const [secretWord, setSecretWord] = useState(null);
  const [hints, setHints] = useState([]);

  const connect = () => {
    if (ws) try { ws.close(); } catch {}
    const sock = new WebSocket(WS_URL);
    setWs(sock);

    sock.onopen = () => {
      sock.send(JSON.stringify({
        type: 'join',
        roomId: (ALLOWED_ROOMS.includes(roomId) ? roomId : 'ROOM1'),
        name: name.trim() || 'Oyuncu',
      }));
      setConnected(true);
      console.log('WS opened:', WS_URL);
    };

    sock.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);

      if (msg.type === 'hello' && msg.you) setMyId(msg.you);

      if (msg.type === 'error') {
        alert(msg.message || 'Hata');
        return;
      }

      if (msg.type === 'state') setState(msg);

      if (msg.type === 'your_card') {
        setMyRole(msg.role || null);
      }

      if (msg.type === 'secret_word') {
        setSecretWord(msg.word || null);
      }

      if (msg.type === 'deal_start') {
        setHints([]);
        setSecretWord(null);
      }

      if (msg.type === 'hint_posted') {
        setHints((prev) => [...prev, { by: msg.by, text: msg.text, round: msg.round, ts: Date.now() }]);
      }

      if (msg.type === 'phase_change') {
        setState((s) => ({ ...s, phase: msg.phase }));
      }

      if (msg.type === 'game_result') {
        // sonuç geldiğinde istersen toast/video gösterebilirsin
        console.log('RESULT:', msg);
      }
    };

    sock.onclose = () => {
      setConnected(false); setWs(null); setMyId(null); setMyRole(null); setSecretWord(null);
    };
    sock.onerror = (e) => console.log('WS error', e);
  };

  // Enter kısayolu: bağlı değilken bağlan; bağlıyken ipucu gönder
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Enter') {
        if (!connected) connect();
        else sendHint();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [connected, name, roomId, ws]);

  const iAmHost = state.hostId && myId && state.hostId === myId;
  const myTurn = state.turnOwner && myId && state.turnOwner === myId;

  const hintRef = useRef(null);
  const sendHint = () => {
    if (!ws || state.phase !== 'hinting' || !myTurn) return;
    const text = (hintRef.current?.value || '').trim();
    if (!text) return;
    ws.send(JSON.stringify({ type: 'post_hint', text }));
    if (hintRef.current) hintRef.current.value = '';
  };

  const startRound = () => {
    if (!ws || !iAmHost) return;
    ws.send(JSON.stringify({ type: 'start_round' }));
  };

  return (
    <div style={{minHeight:'100vh', display:'flex', flexDirection:'column', gap:12, background:'#f6f7fb', padding:'16px'}}>
      {/* Üst bar */}
      <div style={{display:'flex', alignItems:'center', justifyContent:'space-between'}}>
        <div style={{fontWeight:700}}>Cano Blöf — Oda: {roomId}</div>
        <div>
          {connected && iAmHost && (
            <button onClick={startRound} style={{padding:'8px 12px', borderRadius:10, border:'1px solid #999', background:'#fff'}}>
              Yeni Round (Host)
            </button>
          )}
        </div>
      </div>

      {/* Bağlan paneli */}
      {!connected && (
        <div style={{display:'flex', gap:12, alignItems:'center', background:'#fff', padding:12, borderRadius:12, border:'1px solid #e5e7eb'}}>
          <label>Oda:&nbsp;</label>
          <select value={roomId} onChange={(e)=>setRoomId(e.target.value)}>
            {ALLOWED_ROOMS.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
          <input
            value={name}
            onChange={(e)=>setName(e.target.value)}
            placeholder="İsmin"
            style={{padding:'10px', border:'1px solid #ccc', borderRadius:10}}
          />
          <button onClick={connect} style={{padding:'10px 14px', borderRadius:10, border:'1px solid #999', background:'#fff'}}>Bağlan</button>
          <div style={{opacity:.7, fontSize:12}}>(Enter ile bağlan)</div>
        </div>
      )}

      {/* Masa + Sağ panel */}
      {connected && (
        <div style={{display:'grid', gridTemplateColumns:'1fr 320px', gap:12}}>
          {/* Masa (kırmızı oval) */}
          <div style={{display:'flex', alignItems:'center', justifyContent:'center'}}>
            <div style={{
              width:'min(100%, 980px)',
              height: 520,
              background:'radial-gradient(ellipse at center, #a90e2b 0%, #7f0b1f 70%, #4c0813 100%)',
              borderRadius:'200px',
              boxShadow:'0 20px 60px rgba(0,0,0,.25) inset, 0 6px 18px rgba(0,0,0,.15)',
              position:'relative',
              border:'8px solid #5e0c1a'
            }}>
              <TablePlayers players={state.players} myId={myId} />
              <div style={{position:'absolute', left:20, bottom:20, color:'#ffd', fontWeight:600, opacity:.9}}>
                Faz: {state.phase} {state.hintRound ? `(tur ${state.hintRound})` : ''}
              </div>
            </div>
          </div>

          {/* Sağ panel */}
          <div style={{display:'flex', flexDirection:'column', gap:12}}>
            <div style={{background:'#fff', border:'1px solid #e5e7eb', borderRadius:12, padding:12}}>
              <div style={{fontWeight:700, marginBottom:6}}>Oyuncular</div>
              <ul style={{margin:0, paddingLeft:18}}>
                {state.players.map(p => (
                  <li key={p.id} style={{margin:'6px 0', fontWeight: p.id===state.hostId ? 700:500}}>
                    {p.name} {p.id===state.hostId ? '👑' : ''}
                    {p.id===state.turnOwner ? ' 🔔' : ''}
                    {p.id===myId ? ' (sen)' : ''}
                  </li>
                ))}
              </ul>
            </div>

            <div style={{background:'#fff', border:'1px solid #e5e7eb', borderRadius:12, padding:12}}>
              <div style={{fontWeight:700, marginBottom:6}}>Gizli Kelime</div>
              {myRole === 'WORD' ? (
                <div style={{fontSize:20, fontWeight:700}}>{secretWord || '— (bekleniyor)'}</div>
              ) : (
                <div style={{opacity:.7}}>CASUS kelimeyi göremez</div>
              )}
            </div>

            <div style={{background:'#fff', border:'1px solid #e5e7eb', borderRadius:12, padding:12, display:'flex', gap:8}}>
              <input ref={hintRef} placeholder={myTurn ? 'İpucunu yaz (Enter gönderir)' : 'Sıra sende değil'} disabled={!myTurn} style={{flex:1, padding:'10px', border:'1px solid #ccc', borderRadius:10}} />
              <button onClick={sendHint} disabled={!myTurn} style={{padding:'10px 14px', borderRadius:10, border:'1px solid #999', background:'#fff'}}>Gönder</button>
            </div>

            <div style={{background:'#fff', border:'1px solid #e5e7eb', borderRadius:12, padding:12, maxHeight:220, overflowY:'auto'}}>
              <div style={{fontWeight:700, marginBottom:6}}>İpuçları</div>
              {hints.length === 0 && <div style={{opacity:.6}}>Henüz ipucu yok</div>}
              {hints.map((h, i) => {
                const u = state.players.find(p=>p.id===h.by);
                return <div key={i} style={{padding:'6px 0', borderBottom:'1px dashed #eee'}}><b>{u?.name || '??'}</b>: {h.text}</div>;
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TablePlayers({ players, myId }) {
  const N = players.length || 1;
  const R = 210;
  const center = { x: 490, y: 260 };

  return (
    <>
      {players.map((p, idx) => {
        const angle = (2*Math.PI * idx)/N - Math.PI/2;
        const x = center.x + R*Math.cos(angle);
        const y = center.y + R*Math.sin(angle);
        return (
          <div key={p.id} style={{
            position:'absolute',
            left: x-56,
            top: y-34,
            width:112,
            height:68,
            background:'#fff',
            border:'2px solid #222',
            borderRadius:14,
            display:'flex',
            alignItems:'center',
            justifyContent:'center',
            fontWeight:700,
            boxShadow:'0 6px 18px rgba(0,0,0,.15)'
          }}>
            {p.name}{p.id===myId?' (sen)':''}
          </div>
        );
      })}
    </>
  );
}
