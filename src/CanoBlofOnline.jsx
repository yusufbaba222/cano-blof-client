import React, { useEffect, useMemo, useRef, useState, useLayoutEffect } from 'react';

const WS_URL =
  import.meta.env.VITE_WS_URL ||
  (location.protocol === 'https:' ? `wss://${location.host}` : 'ws://localhost:8080');


export default function CanoBlofOnline() {
  document.title = 'Cano Blöf – Red Oval Casino';

  // ---- Bağlantı / kimlik
  const [roomId, setRoomId] = useState('ROOM1');
  const [name, setName] = useState('Oyuncu');
  const [connected, setConnected] = useState(false);
  const [ws, setWs] = useState(null);
  const [myId, setMyId] = useState(null);

  // ---- Oyun state
  const [state, setState] = useState({
    phase: 'lobby', // 'lobby'|'hinting'|'voteChoice'|'votePlayer'|'spyGuess'|'end'
    players: [],
    order: [],
    hostId: null,
    starterId: null,
    turnOwner: null,
    hintRound: 0,
    result: null,
  });

  // ---- Rol / kart / kelime
  const [myRole, setMyRole] = useState(null); // 'WORD' | 'SPY' | null
  const [secretWord, setSecretWord] = useState(null);
  const [myCard, setMyCard] = useState(null); // {role, title, words?}

  // ---- İpucu & oylama
  const [hints, setHints] = useState([]);
  const [choiceTally, setChoiceTally] = useState({ player: 0, round4: 0 });
  const [playerTally, setPlayerTally] = useState({});

  // ---- Masa & animasyon
  const [dealing, setDealing] = useState(false);
  const [flyingCards, setFlyingCards] = useState([]);
  const [showCardModal, setShowCardModal] = useState(false);

  // ---- Fokus refs
  const nameInputRef = useRef(null);
  const hintInputRef = useRef(null);

  // ---- Masa ölçümü (eliptik yerleşim)
  const tableRef = useRef(null);
  const seatsRef = useRef([]);
  const [radX, setRadX] = useState(360);
  const [radY, setRadY] = useState(240);

  useLayoutEffect(() => {
    function recalc() {
      const el = tableRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      // Kenarlardan güvenlik payı
      setRadX(Math.max(180, Math.floor(r.width / 2 - 160)));
      setRadY(Math.max(140, Math.floor(r.height / 2 - 130)));
    }
    recalc();
    window.addEventListener('resize', recalc);
    return () => window.removeEventListener('resize', recalc);
  }, []);

  // ---- Bitiş videosu (max 5 sn + hata olursa kapan)
  const [showWin, setShowWin] = useState(false);
  useEffect(() => {
    if (state.phase === 'end' && state.result) {
      setShowWin(true);
      const t = setTimeout(() => setShowWin(false), 5000);
      return () => clearTimeout(t);
    }
  }, [state.phase, state.result]);

  // ---- WS bağlan
  useEffect(() => {
  if (!connected) return;

  const sock = new WebSocket(WS_URL);
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
    sock.send(JSON.stringify(payload));
  };

  sock.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);

    if (msg.type === 'error') {
      alert(msg.message || 'Hata');
      return;
    }

    if (msg.type === 'hello') {
      // Sunucu kimliğimizi verdiğinde
      setMyId(msg.you);
    }

    if (msg.type === 'state') {
      // Oda/oyun anlık durumu
      setState(msg);
    }

    if (msg.type === 'your_card') {
      // Kartım ve rolüm
      // Örn: { role: 'WORD'|'SPY', title: 'MASUM'|'CASUS', words?:[] }
      setMyRole(msg.role || null);
      // İstersen burada myCard state’i de set edebilirsin:
      // setMyCard({ role: msg.role, title: msg.title, words: msg.words || null });
    }

    if (msg.type === 'round_started') {
      // Yeni round başlangıcında lokal resetler
      setSecretWord(null);
      setHints([]);
      setChoiceTally({ player: 0, round4: 0 });
      setPlayerTally({});
    }

    if (msg.type === 'secret_word') {
      // MASUM isen kelime burada gelir (CASUS’a gelmez)
      setSecretWord(msg.word);
    }

    if (msg.type === 'deal_start') {
      // Dağıtım animasyonu tetikle
      setDealing(true);
      // İstemcide koltuk koordinatlarını kullanan bir animasyonun varsa,
      // burada state ile ilgili uçuş kartlarını ayarlıyorsun.
      // Bu örnekte sadece başlatıp 1.6sn sonra kapatıyoruz:
      setTimeout(() => {
        setDealing(false);
        setFlyingCards([]);
      }, 1600);
    }

    if (msg.type === 'hint_posted') {
      // Yeni ipucu geldi
      setHints((prev) => [
        ...prev,
        { by: msg.by, text: msg.text, round: msg.round, ts: Date.now() },
      ]);
    }

    if (msg.type === 'phase_change') {
      // Faz geçişi
      setState((s) => ({ ...s, phase: msg.phase }));
      if (msg.phase === 'voteChoice') setChoiceTally({ player: 0, round4: 0 });
      if (msg.phase === 'votePlayer') setPlayerTally({});
    }

    if (msg.type === 'vote_choice_update') {
      setChoiceTally(msg.tally || { player: 0, round4: 0 });
    }

    if (msg.type === 'vote_player_update') {
      setPlayerTally(msg.tally || {});
    }

    if (msg.type === 'game_result') {
      // Sunucu sonuç yayınladı (winner, spyId, secretWord)
      setState((s) => ({
        ...s,
        result: {
          winner: msg.winner,
          spyId: msg.spyId,
          secretWord: msg.secretWord,
        },
      }));
    }

    if (msg.type === 'reveal') {
      // (Opsiyonel) Açılan oyuncu bildirimi
      // console.log('Açıldı:', msg.playerId, 'Rol:', msg.role);
    }

    if (msg.type === 'spy_guess_result') {
      // (Opsiyonel) Casus tahmin sonucu log
      // console.log(msg.ok ? 'Casus doğru bildi' : 'Casus yanlış', '=>', msg.guess);
    }
  };

  sock.onclose = () => {
    setWs(null);
    setConnected(false);
  };

  // Cleanup: effect bitince/yenilenince soketi kapat
  return () => {
    try { sock.close(); } catch {}
  };
}, [connected, roomId, name]);


  // ---- Otomatik fokus
  useEffect(() => {
    if (!connected) { setTimeout(() => nameInputRef.current?.focus(), 0); }
  }, [connected]);
  useEffect(() => {
    if (connected && state.phase === 'hinting') {
      setTimeout(() => hintInputRef.current?.focus(), 0);
    }
  }, [state.phase, connected]);

  const me = state.players.find((p) => p.id === myId);
  const isHost = state.hostId && myId && state.hostId === myId;
  const myTurn = state.turnOwner && myId && state.turnOwner === myId;

  // ---- Aksiyonlar
  const startRound = () => ws?.send(JSON.stringify({ type: 'start_round' }));
  const sendHint = () => {
    const text = hintInputRef.current?.value || '';
    if (!text.trim()) return;
    ws?.send(JSON.stringify({ type: 'post_hint', text }));
    if (hintInputRef.current) hintInputRef.current.value = '';
  };
  const voteChoice = (choice) => ws?.send(JSON.stringify({ type: 'vote_choice', choice })); // 'player' | 'round4'
  const votePlayer = (targetId) => ws?.send(JSON.stringify({ type: 'vote_player', target: targetId }));
  const spyGuess = (word) => ws?.send(JSON.stringify({ type: 'spy_guess', word }));

  // ---- Koltuk yerleşimi (eliptik)
  const seats = useMemo(() => {
    const n = state.players.length || 1;
    if (n === 1) {
      return state.players.map((p) => ({ id: p.id, name: p.name, x: 0, y: -40 }));
    }
    return state.players.map((p, idx) => {
      const angle = (2 * Math.PI * idx) / n - Math.PI / 2; // tepe noktadan başla
      const x = Math.cos(angle) * radX;
      const y = Math.sin(angle) * radY;
      return { id: p.id, name: p.name, x, y };
    });
  }, [state.players, radX, radY]);
  useEffect(() => { seatsRef.current = seats; }, [seats]);

  // ---- Hints scroll to bottom
  const hintsBoxRef = useRef(null);
  useEffect(() => {
    const el = hintsBoxRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [hints]);

  // ---- Blur
  const appBlur = state.phase === 'end' && showWin;
  const boardBlur = state.phase === 'voteChoice' || state.phase === 'votePlayer';

  // ---- Kısayol: Host iken R → Round
  useEffect(() => {
    function onKey(e) {
      if (!isHost) return;
      if (e.key.toLowerCase() === 'r' && (state.phase === 'lobby' || state.phase === 'end')) startRound();
      if (e.key === 'Enter' && state.phase === 'hinting' && myTurn) sendHint();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isHost, state.phase, ws, myTurn]);

  return (
    <div className="root">
      <style>{cssStyles}</style>

      {/* HOST BAR */}
      {connected && isHost && (state.phase === 'lobby' || state.phase === 'end') && (
        <div className="hostBar">
          <button className="btnPrimary" onClick={startRound}>Yeni Round (Host)</button>
          <span className="kbd">R</span>
        </div>
      )}

      {/* BLUR altında kalan içerik */}
      <div className={appBlur ? 'appBlur' : ''}>
        <header className="header">
          <div className="logo">♠ Cano Blöf</div>
          <div className="roomTag">Oda: {roomId.toUpperCase()}</div>
        </header>

        {!connected && (
          <div className="panel glass">
            <div className="row">
              <input
                value={roomId}
                onChange={(e) => setRoomId(e.target.value)}
                placeholder="Oda Kodu"
                onKeyDown={(e) => { if (e.key === 'Enter') setConnected(true); }}
              />
              <input
                ref={nameInputRef}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="İsim"
                autoFocus
                onKeyDown={(e) => { if (e.key === 'Enter') setConnected(true); }}
              />
              <button className="btnPrimary" onClick={() => setConnected(true)}>Bağlan</button>
            </div>
            <div className="hint">Sunucu: <code>{WS_URL}</code></div>
          </div>
        )}

        {connected && (
          <div className="layout">
            {/* MASA */}
            <div className={`tableWrap ${boardBlur ? 'blurred' : ''}`}>
              {/* Kırmızı oval masa */}
              <div className="tableOval">
                <div className="felt" ref={tableRef}>
                  {/* Deste + dağıtım */}
                  <div className={`deck ${dealing ? 'deal' : ''}`} />
                  {flyingCards.map(fc => (
                    <div key={fc.key} className="flying" style={{ '--tx': `${fc.x}px`, '--ty': `${fc.y}px` }} />
                  ))}

                  {/* Masa HUD */}
                  <div className="tableHUD glass">
                    <div><b>Faz:</b> {state.phase}</div>
                    <div><b>Tur:</b> {state.hintRound || 0}</div>
                    <div><b>Sıra:</b> {state.turnOwner || '-'}</div>
                  </div>

                  {/* Oyuncu koltukları (elips çevresi) */}
                  {seats.map((s) => (
                    <div
                      key={s.id}
                      className="seat"
                      style={{ transform: `translate(-50%,-50%) translate(${s.x}px, ${s.y}px)` }}
                    >
                      <div className={`avatar ${state.turnOwner === s.id ? 'turn' : ''}`}>{s.name?.[0]?.toUpperCase() || '?'}</div>
                      <div className="nameTag">
                        {s.name}{s.id === state.hostId ? ' (Host)' : ''}{s.id === myId ? ' ← Ben' : ''}
                      </div>
                      <div
                        className={`card ${s.id === myId ? 'clickable' : ''}`}
                        onClick={() => { if (s.id === myId) setShowCardModal(true); }}
                      >
                        {s.id === myId ? (myCard?.title || 'KART') : 'KART'}
                      </div>
                      <div className="chipStack">
                        <span className="chip c1" />
                        <span className="chip c2" />
                        <span className="chip c3" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Lobi bilgisi */}
              {state.phase === 'lobby' && (
                <div className="panel glass" style={{ marginTop: 10 }}>
                  <div className="panelTitle">Oyuncular</div>
                  <ul>
                    {state.players.map((p) => (
                      <li key={p.id}>
                        {p.name} {p.id === state.hostId ? '(Host)' : ''} {p.id === myId ? '← Ben' : ''}
                      </li>
                    ))}
                  </ul>
                  {isHost ? (
                    <button className="btnPrimary" onClick={startRound}>Round Başlat (Host)</button>
                  ) : (
                    <div className="hint">Host başlatınca oyun başlayacak.</div>
                  )}
                </div>
              )}
            </div>

            {/* SAĞ PANEL */}
            <div className="side">
              {/* Bilgiler */}
              <div className="panel glass">
                <div className="panelTitle">Bilgiler</div>
                <div className="meta"><b>Ben:</b> {name}</div>
                <div className="meta"><b>Kimlik:</b> {myId || '-'}</div>
                <div className="meta"><b>Rol:</b> {myRole || '-'}</div>
                <div className="meta"><b>Gizli Kelime:</b> {myRole === 'WORD' ? (secretWord ?? '—') : 'CASUS görmez'}</div>
                <div className="meta"><b>Oda:</b> {roomId.toUpperCase()}</div>
                <div className="meta"><b>Oyuncular:</b></div>
                <ul>
                  {state.players.map((p) => (
                    <li key={p.id}>
                      {p.name} {p.id === myId ? '← Ben' : ''} {p.id === state.hostId ? '(Host)' : ''}
                    </li>
                  ))}
                </ul>
              </div>

              {/* İPUÇLARI – Bilgilerin hemen altında, auto-scroll */}
              <div className="panel glass">
                <div className="panelTitle">İpuçları</div>
                <div className="hintsBox" ref={hintsBoxRef}>
                  {hints.length === 0 ? (
                    <div className="hint">Henüz ipucu yok.</div>
                  ) : (
                    <ul className="hintsUl">
                      {hints.map((h, idx) => {
                        const byName = state.players.find((p) => p.id === h.by)?.name || h.by;
                        return (
                          <li key={idx}><b>R{h.round}</b> – <b>{byName}:</b> {h.text}</li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              </div>

              {/* Oylama – seçim */}
              {state.phase === 'voteChoice' && (
                <div className="panel glass">
                  <div className="panelTitle">Oylama</div>
                  <div className="row">
                    <button className="btnRaise" onClick={() => voteChoice('player')}>Oyuncu Oylama</button>
                    <button className="btnCheck" onClick={() => voteChoice('round4')}>4. Tur Oynansın</button>
                  </div>
                  <div className="hint">
                    Oylar — Oyuncu: {choiceTally.player || 0} • 4. Tur: {choiceTally.round4 || 0}
                  </div>
                </div>
              )}

              {/* Oylama – oyuncu */}
              {state.phase === 'votePlayer' && (
                <div className="panel glass">
                  <div className="panelTitle">Kimi açalım?</div>
                  <div className="wrap">
                    {state.players.map((p) => (
                      <button key={p.id} className="btnPlayer" onClick={() => votePlayer(p.id)}>
                        {p.name} <span className="pill">{playerTally[p.id] || 0}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Casus tahmini */}
              {state.phase === 'spyGuess' && (
                <div className="panel glass">
                  <div className="panelTitle">Casus Tahmini</div>
                  <SpyGuess onGuess={(w) => spyGuess(w)} myRole={myRole} />
                </div>
              )}

              {/* Video sonrası özet */}
              {state.phase === 'end' && state.result && !showWin && (
                <div className="panel glass">
                  <div className={`winner ${state.result.winner === 'CIVIL' ? 'civ' : 'spy'}`}>
                    {state.result.winner === 'CIVIL' ? 'MASUMLAR KAZANDI' : 'CASUS KAZANDI'}
                  </div>
                  <div className="hint" style={{ marginTop: 6 }}>
                    Casus: <b>{state.players.find(p => p.id === state.result.spyId)?.name || state.result.spyId}</b>
                    {' • '}Kelime: <b>{state.result.secretWord}</b>
                  </div>
                  {isHost && (
                    <button className="btnPrimary" style={{ marginTop: 8 }} onClick={startRound}>
                      Yeni Round Başlat
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* İPUCU GÖNDER – MASANIN ALTINA SABİT BAR (her fazda görünmez, sadece hinting) */}
      {connected && state.phase === 'hinting' && (
        <div className="hintDock">
          <div className="dockInner">
            <input
              ref={hintInputRef}
              placeholder="İpucu yaz ve Enter'a bas"
              onKeyDown={(e) => { if (e.key === 'Enter') sendHint(); }}
            />
            <button className="btnCall" onClick={sendHint} disabled={!myTurn}>İpucu Gönder</button>
            {!myTurn && <div className="dockHint">Sıranı bekle…</div>}
          </div>
        </div>
      )}

      {/* SONUÇ VİDEO OVERLAY */}
      {state.phase === 'end' && state.result && showWin && (
        <div className="winOverlay">
          <video
            src={state.result.winner === 'CIVIL' ? '/masum.mp4' : '/casus.mp4'}
            autoPlay
            muted
            playsInline
            onError={() => setShowWin(false)}
            onEnded={() => setShowWin(false)}
          />
          <div className="winCaption">
            {state.result.winner === 'CIVIL' ? 'MASUMLAR KAZANDI' : 'CASUS KAZANDI'}
          </div>
          {isHost && (
            <button className="overlayBtn" onClick={startRound}>Yeni Round</button>
          )}
        </div>
      )}

      {/* KART MODALI */}
      {showCardModal && myCard && (
        <div className="modal" onClick={() => setShowCardModal(false)}>
          <div className="modalCard" onClick={(e) => e.stopPropagation()}>
            <div className="modalTitle">{myCard.title}</div>
            {myCard.role === 'WORD' && (
              <>
                <div className="badge ok">MASUM</div>
                <div className="wordList">
                  {myCard.words?.map((w, i) => (
                    <div key={i} className="wordItem">
                      {i + 1}. {w}
                    </div>
                  ))}
                </div>
              </>
            )}
            {myCard.role === 'SPY' && <div className="spyCard">CASUS</div>}
            <button className="btnGhost" onClick={() => setShowCardModal(false)} style={{ marginTop: 10 }}>
              Kapat
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function SpyGuess({ onGuess, myRole }) {
  const inputRef = useRef(null);
  return (
    <div className="row">
      <input
        ref={inputRef}
        placeholder="Kelime tahmini"
        onKeyDown={(e) => { if (e.key === 'Enter') onGuess(inputRef.current?.value || ''); }}
      />
      <button className="btnRaise" disabled={myRole !== 'SPY'} onClick={() => onGuess(inputRef.current?.value || '')}>
        Tahmin Gönder
      </button>
    </div>
  );
}

const cssStyles = `
*{box-sizing:border-box}
:root{ --card-w:96px; --card-h:134px; }
html,body,#root{height:100%}
body{ background:#1c1b22; font-family: Inter, system-ui, sans-serif; color:#e9e9ee; }
.root{ padding: 12px; width: 100vw; max-width: 100vw; margin: 0 auto; }

.header{display:flex; align-items:center; justify-content:space-between; margin:4px 0 8px}
.logo{font-weight:900; font-size:28px; letter-spacing:.3px}
.roomTag{opacity:.8; font-weight:600}

input{padding:10px;border:1px solid #45424f;border-radius:10px;background:#fff;color:#111; min-width:160px}
button{cursor:pointer}
.btnPrimary{
  padding:10px 16px; border:none; border-radius:12px;
  background: linear-gradient(180deg,#ff4d4d,#b71212); color:#fff; font-weight:800;
  box-shadow: 0 6px 14px rgba(255,77,77,.25), inset 0 1px 0 rgba(255,255,255,.2);
}
.btnCall{
  padding:10px 16px; border:none; border-radius:12px;
  background: linear-gradient(180deg,#3ddc84,#0f9b4f);
  color:#0a120e; font-weight:800; box-shadow: 0 6px 14px rgba(61,220,132,.25), inset 0 1px 0 rgba(255,255,255,.2);
}
.btnRaise{
  padding:10px 16px; border:none; border-radius:12px;
  background: linear-gradient(180deg,#ffb54d,#c7780e);
  color:#2d1a00; font-weight:800; box-shadow:0 6px 14px rgba(255,181,77,.25), inset 0 1px 0 rgba(255,255,255,.2);
}
.btnCheck{
  padding:10px 16px; border:none; border-radius:12px;
  background: linear-gradient(180deg,#58a6ff,#1556b0);
  color:#031b39; font-weight:800; box-shadow: 0 6px 14px rgba(88,166,255,.25), inset 0 1px 0 rgba(255,255,255,.2);
}
.btnGhost{
  padding:10px 14px; border:1px solid #444; border-radius:10px;
  background: #22252f; color:#e9e9ee;
}

.kbd{font-size:12px;padding:2px 6px;border:1px solid #333;border-radius:6px;background:#111;color:#fff}

.panel{
  border:1px solid #2e2b36; padding:12px; border-radius:14px; background:#24222b; color:#e9e9ee;
}
.panel.glass{
  background: rgba(255,255,255,.08);
  border:1px solid rgba(255,255,255,.15);
  box-shadow: inset 0 0 0 1px rgba(255,255,255,.05);
  backdrop-filter: blur(6px);
}
.panelTitle{font-weight:900; margin-bottom:6px}
.hint{font-size:12px;opacity:.8;margin-top:6px}
.row{display:flex;gap:8px;flex-wrap:wrap; align-items:center}
.rowBetween{justify-content:space-between}
.wrap{display:flex;gap:8px;flex-wrap:wrap}
.meta{opacity:.9; margin:2px 0}

.layout{
  display:grid;
  grid-template-columns: 5fr 1.35fr;
  gap:12px;
  height: calc(100vh - 84px);
}

/* OVAL MASA KIRMIZI */
.tableWrap{position:relative; height:100%;}
.tableWrap.blurred .felt{filter: blur(4px)}
.tableOval{
  position:relative; height:100%;
  background: radial-gradient(closest-side at 50% 50%, #8a1e14 0%, #5f160f 58%, #3b0f0a 100%);
  border-radius: 30px;
  padding: 18px;
  box-shadow: inset 0 0 50px rgba(0,0,0,.7), 0 8px 40px rgba(0,0,0,.45);
  border: 2px solid #e84b3a;
}
.felt{
  position:relative; width:100%; height:100%;
  background: radial-gradient(ellipse at center, #2f6a48 0%, #124a33 55%, #0b3324 100%);
  border-radius: 24px;
  box-shadow: inset 0 0 40px rgba(0,0,0,.55);
  overflow:hidden;
}
.tableHUD{
  position:absolute; top:12px; left:12px; z-index:2;
  padding:8px 10px; border-radius:12px; font-size:13px;
}
.tableHUD.glass{
  background: rgba(255,255,255,.18);
  border:1px solid rgba(255,255,255,.25);
  color:#fff;
}

/* Deste + dağıtım */
.deck{
  width:64px;height:90px;border-radius:12px;background:#111;box-shadow:0 6px 20px rgba(0,0,0,.45);
  position:absolute; left:calc(50% - 32px); top:calc(50% - 45px);
  border:2px solid #e7dccb;
}
.deck.deal{animation:dealPulse .4s ease-in-out 0s 4}
@keyframes dealPulse { 0%{transform:scale(1)} 50%{transform:scale(1.06)} 100%{transform:scale(1)} }

.flying{
  position:absolute; left:calc(50% - 32px); top:calc(50% - 45px);
  width:64px;height:90px;border-radius:12px;background:#111;border:2px solid #e7dccb;box-shadow:0 6px 20px rgba(0,0,0,.45);
  animation:flyCard .8s ease forwards;
}
@keyframes flyCard {
  from{ transform: translate(0,0) rotate(0deg); opacity:1 }
  to{ transform: translate(var(--tx), var(--ty)) rotate(10deg); opacity:1 }
}

/* Koltuk + kişi kartı hissi */
.seat{
  position:absolute; left:50%; top:50%;
  transform: translate(-50%,-50%);
  display:flex; flex-direction:column; align-items:center; gap:6px;
}
.avatar{
  width:58px; height:58px; border-radius:12px; background:#2b2a33; border:2px solid #c4c4c9;
  display:flex; align-items:center; justify-content:center; font-weight:900; color:#fff; font-size:22px;
  box-shadow: 0 6px 14px rgba(0,0,0,.35), inset 0 1px 0 rgba(255,255,255,.2);
}
.avatar.turn{outline:3px solid #35f28a; outline-offset:3px}
.nameTag{color:#fff; text-shadow:0 1px 2px rgba(0,0,0,.6); font-size:12px; opacity:.95}

.card{
  width: var(--card-w);
  height: var(--card-h);
  border-radius:12px;background:#f7f3e9;border:2px solid #222;
  display:flex; align-items:center; justify-content:center; font-weight:800; font-size:12px; letter-spacing:.5px;
  box-shadow:0 10px 26px rgba(0,0,0,.45);
  transition:transform .2s ease, box-shadow .2s ease;
}
.card.clickable:hover{transform:translateY(-6px); box-shadow:0 16px 40px rgba(0,0,0,.55)}

.chipStack{display:flex; gap:6px; margin-top:6px}
.chip{width:18px;height:18px;border-radius:50%; display:inline-block; box-shadow:0 2px 6px rgba(0,0,0,.35), inset 0 0 0 2px #fff}
.chip.c1{background:#1ecf5f}
.chip.c2{background:#ffbf3d}
.chip.c3{background:#ff4d4d}

/* Sağ panel */
.side{display:flex;flex-direction:column;gap:12px}
.wrap{display:flex;gap:8px;flex-wrap:wrap}
.btnPlayer{
  padding:10px 12px; border-radius:12px; border:1px solid #3e3a47; background:#2b2932; color:#e9e9ee;
}
.pill{margin-left:6px; padding:2px 6px; border-radius:10px; background:#111; border:1px solid #444}

.hintsBox{
  max-height: 32vh;
  overflow:auto;
  padding-right:6px;
}
.hintsUl{margin:6px 0; padding-left:18px}

/* Sonuç özeti */
.winner{font-weight:900; text-align:center; padding:8px 0; border-radius:10px}
.winner.civ{background:linear-gradient(180deg,#2ee08d,#0f8a53); color:#041b12}
.winner.spy{background:linear-gradient(180deg,#ff6b6b,#ae1717); color:#2b0202}

/* İpucu sabit alt bar */
.hintDock{
  position:fixed; left:0; right:0; bottom:10px; display:flex; justify-content:center; z-index:40;
  pointer-events:none; /* iç panel dışında tıklama geçmesin */
}
.dockInner{
  pointer-events:auto;
  display:flex; gap:8px; align-items:center;
  background: rgba(20,20,24,.85);
  border:1px solid rgba(255,255,255,.15);
  border-radius:14px; padding:10px;
  backdrop-filter: blur(8px);
}
.dockInner input{min-width:320px}
.dockHint{color:#ddd; font-size:12px; opacity:.8}

/* Modal */
.modal{
  position:fixed; inset:0; background:rgba(0,0,0,.55); display:flex; align-items:center; justify-content:center; z-index:50;
  backdrop-filter: blur(4px);
}
.modalCard{
  width:560px; max-height:72vh; overflow:auto; background:#23222a; border-radius:16px; border:1px solid #3a3845; padding:16px; color:#f1f1f6;
  box-shadow: 0 18px 60px rgba(0,0,0,.6);
}
.modalTitle{font-size:18px; font-weight:900; margin-bottom:8px}
.spyCard{font-size:72px; text-align:center; padding:24px 0; letter-spacing:4px}
.badge.ok{display:inline-block; padding:4px 8px; border-radius:10px; background:#14d87a; color:#0a2017; font-weight:900; margin-bottom:8px}
.wordList{display:grid; grid-template-columns:1fr 1fr; gap:6px}
.wordItem{padding:6px; border:1px solid #3a3845; border-radius:8px; background:#1e1d24}

.appBlur{ filter: blur(6px); pointer-events:none; user-select:none; }

/* Video overlay */
.winOverlay{
  position:fixed; inset:0; display:flex; align-items:center; justify-content:center; z-index:100;
  background: rgba(0,0,0,.75);
}
.winOverlay video{
  max-width: min(92vw, 1000px);
  max-height: 82vh;
  border-radius: 16px;
  box-shadow: 0 10px 40px rgba(0,0,0,.7);
}
.winCaption{
  position:absolute; bottom:6vh; left:0; right:0;
  text-align:center; color:#fff; font-weight:900; font-size:28px;
  text-shadow: 0 2px 8px rgba(0,0,0,.7);
}
.overlayBtn{
  position:absolute; top:16px; right:16px;
  padding:10px 14px; border:1px solid #fff; background:rgba(0,0,0,.35);
  color:#fff; border-radius:12px; font-weight:800;
}
.overlayBtn:hover{ background:rgba(0,0,0,.5); }

/* Host bar */
.hostBar{
  position:sticky; top:8px; z-index:5; display:flex; align-items:center; gap:8px;
  margin:8px 0; padding:8px; border:1px solid rgba(255,255,255,.15); border-radius:10px; background:rgba(255,255,255,.06);
  backdrop-filter: blur(6px);
}
`;
