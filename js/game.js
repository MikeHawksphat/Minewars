const MineWars = (() => {
    let peer, connMap = {}, players = [];
    let state = { isHost: false, code: '', myId: '', config: { size: 'medium', mode: 'turn', max: 4, noGuess: false }, gameActive: false, board: [], turnIndex: 0, minesLeft: 0 };

    const ui = {
        lobby: document.getElementById('lobby-view'), hub: document.getElementById('hub-view'), game: document.getElementById('game-view'),
        roster: document.getElementById('lobby-roster'), codeDisp: document.getElementById('lobby-code-display'),
        hostCtrls: document.getElementById('host-controls'), guestCtrls: document.getElementById('guest-controls'),
        startBtn: document.getElementById('start-btn-container'), grid: document.getElementById('game-grid'),
        gameEnd: document.getElementById('end-screen'), mineCount: document.getElementById('game-mine-count'),
        exitModal: document.getElementById('exit-modal')
    };

    // --- CORE FUNCTIONS ---

    function reset() {
        if (peer) peer.destroy();
        peer = null; connMap = {}; players = []; state.gameActive = false;
        ui.lobby.classList.add('hidden'); ui.game.classList.add('hidden'); ui.exitModal.classList.add('hidden');
        ui.hub.classList.remove('hidden'); ui.gameEnd.classList.add('hidden'); ui.grid.innerHTML = '';
    }

    function showExitModal() { ui.exitModal.classList.remove('hidden'); }

    function initHost() {
        state.isHost = true; state.code = Math.random().toString(36).substring(2, 6).toUpperCase(); state.myId = 'mw-' + state.code + '-host';
        ui.hub.classList.add('hidden'); ui.lobby.classList.remove('hidden'); setupLobbyUI();
        peer = new Peer(state.myId);
        peer.on('open', () => addPlayer({ id: state.myId, name: App.username, host: true, ready: true }));
        peer.on('connection', (conn) => {
            if (players.length >= state.config.max || state.gameActive) { conn.on('open', () => conn.send({ type: 'ERROR', msg: 'Full/Active' })); return; }
            connMap[conn.peer] = conn;
            conn.on('data', (d) => handleHostData(d, conn.peer));
            conn.on('close', () => removePlayer(conn.peer));
            conn.on('error', () => removePlayer(conn.peer));
        });
    }

    function joinInput() {
        const c = document.getElementById('direct-code-input').value.trim();
        if (c.length < 3) return alert("Invalid Code");
        state.isHost = false; state.code = c.toUpperCase();
        peer = new Peer('mw-' + Math.random().toString(36).substring(2, 8));
        peer.on('open', () => {
            ui.hub.classList.add('hidden'); ui.lobby.classList.remove('hidden'); setupLobbyUI();
            const conn = peer.connect('mw-' + state.code + '-host');
            conn.on('open', () => conn.send({ type: 'JOIN', name: App.username }));
            conn.on('data', handleClientData);
            conn.on('close', () => { alert("Connection Lost"); reset(); });
            connMap['host'] = conn;
        });
        peer.on('error', () => { alert("Lobby not found"); reset(); });
    }

    function broadcast(msg) { Object.values(connMap).forEach(c => { if (c.open) c.send(msg); }); }

    // --- DATA HANDLING ---

    function handleHostData(data, peerId) {
        if (data.type === 'JOIN') addPlayer({ id: peerId, name: data.name.substring(0, 12), host: false, ready: true });
        if (data.type === 'MOVE') processMove(data.r, data.c, peerId);
        if (data.type === 'FLAG') broadcast({ type: 'FLAG', r: data.r, c: data.c });
        if (data.type === 'REMATCH') startRematch();
        if (data.type === 'CURSOR') {
            renderGhost(data.x, data.y, peerId);
            broadcast({ type: 'CURSOR', x: data.x, y: data.y, id: peerId });
        }
    }

    function handleClientData(data) {
        if (data.type === 'LOBBY_UPDATE') { players = data.players; state.config = data.config; renderLobby(); }
        if (data.type === 'GAME_START') {
            state.board = data.board; state.turnIndex = data.turnIndex; state.minesLeft = data.mines;
            state.config.rows = data.rows; state.config.cols = data.cols;
            startGameClient();
        }
        if (data.type === 'UPDATE_GRID') { state.board[data.r][data.c] = data.tile; updateTileUI(data.r, data.c); updateGameHeader(); }
        if (data.type === 'TURN_CHANGE') { state.turnIndex = data.idx; updateGameHeader(); }
        if (data.type === 'FLAG') {
            const t = ui.grid.children[data.r * state.config.cols + data.c];
            if (t) {
                const icon = t.querySelector('.fa-flag');
                if (icon) { icon.remove(); updateMineCount(1); } else { t.innerHTML += '<i class="fas fa-flag text-red-500 text-xs absolute"></i>'; updateMineCount(-1); }
            }
        }
        if (data.type === 'GAME_OVER') endGame(data.win, data.msg);
        if (data.type === 'CURSOR') renderGhost(data.x, data.y, data.id);
    }

    // --- LOBBY LOGIC ---

    function setupLobbyUI() { document.getElementById('direct-code-input').value = ''; }
    function addPlayer(p) { p.color = COLORS[players.length % COLORS.length]; players.push(p); syncLobby(); }
    function removePlayer(id) { players = players.filter(p => p.id !== id); state.gameActive ? broadcast({ type: 'MSG', txt: 'Disconnect' }) : syncLobby(); }
    function syncLobby() { broadcast({ type: 'LOBBY_UPDATE', players, config: state.config }); renderLobby(); }

    function renderLobby() {
        ui.codeDisp.innerText = state.code; ui.roster.innerHTML = ''; document.getElementById('lobby-count').innerText = `${players.length}/${state.config.max}`;
        players.forEach(p => {
            ui.roster.innerHTML += `<div class="glass-panel p-4 rounded-xl flex items-center justify-between border-l-4" style="border-left-color:${p.color}">
                <div class="flex items-center gap-3"><div class="w-10 h-10 rounded-lg bg-white/10 flex items-center justify-center font-bold text-sm" style="color:${p.color}">${p.name.substring(0, 2)}</div>
                <div><div class="font-bold text-white text-sm">${p.name} ${p.id === peer.id ? '(You)' : ''}</div><div class="text-[10px] text-slate-400 uppercase">${p.host ? 'HOST' : 'PLAYER'}</div></div></div>
                ${p.host ? '<i class="fas fa-crown text-amber-400"></i>' : ''}</div>`;
        });
        if (state.isHost) { ui.hostCtrls.classList.remove('hidden'); ui.guestCtrls.classList.add('hidden'); ui.startBtn.classList.remove('hidden'); }
        else { ui.hostCtrls.classList.add('hidden'); ui.guestCtrls.classList.remove('hidden'); ui.startBtn.classList.add('hidden'); }
        document.getElementById('toggle-safe').checked = state.config.noGuess;
    }

    function setConfig(key, val) {
        if (!state.isHost) return; state.config[key] = val;
        if (key === 'size') {
            document.querySelectorAll('.cfg-btn-size').forEach(b => { b.classList.remove('ring-1', 'ring-indigo-500', 'text-indigo-300'); if (b.dataset.val === val) b.classList.add('ring-1', 'ring-indigo-500', 'text-indigo-300'); });
            const customInputs = document.getElementById('custom-size-inputs');
            if (val === 'custom') customInputs.classList.remove('hidden'); else customInputs.classList.add('hidden');
        }
        syncLobby();
    }

    function toggleSafeStart(el) { setConfig('noGuess', el.checked); }

    function updateSlider(el) {
        const val = el.value; const per = ((val - el.min) * 100) / (el.max - el.min);
        document.getElementById('pl-limit').innerText = val; el.style.background = `linear-gradient(to right, #6366f1 ${per}%, rgba(255,255,255,0.1) ${per}%)`;
        setConfig('max', parseInt(val));
    }
    function toggleModeDD() { document.getElementById('mode-menu').classList.toggle('open'); }
    function selectModeUI(m) {
        document.getElementById('mode-text').innerText = { 'turn': 'Turn Based', 'race': 'Race', 'coop': 'Co-op' }[m];
        document.getElementById('mode-menu').classList.remove('open'); setConfig('mode', m);
    }
    document.addEventListener('click', e => { if (!e.target.closest('.relative')) document.getElementById('mode-menu').classList.remove('open'); });
    function copyCode() { navigator.clipboard.writeText(state.code); ui.codeDisp.style.color = '#4ade80'; setTimeout(() => ui.codeDisp.style.color = '', 500); }

    // --- GAME LOGIC ---

    function startGame() {
        let cfg;
        if (state.config.size === 'custom') {
            cfg = {
                r: parseInt(document.getElementById('custom-rows').value) || 20,
                c: parseInt(document.getElementById('custom-cols').value) || 30,
                m: parseInt(document.getElementById('custom-mines').value) || 100
            };
            // Clamp values
            cfg.r = Math.max(5, Math.min(50, cfg.r));
            cfg.c = Math.max(5, Math.min(50, cfg.c));
            cfg.m = Math.max(1, Math.min(cfg.r * cfg.c - 9, cfg.m));
        } else {
            cfg = PRESETS[state.config.size];
        }
        state.config.rows = cfg.r; state.config.cols = cfg.c;
        let mines = [], board = [];
        let attempts = 0;

        // Improved Generation Logic
        while (true) {
            mines = [];
            while (mines.length < cfg.m) {
                let r = Math.floor(Math.random() * cfg.r), c = Math.floor(Math.random() * cfg.c);
                if (!mines.some(m => m.r === r && m.c === c)) mines.push({ r, c });
            }
            board = [];
            let hasSafeOpening = false;

            // Build board to check for safe opening
            for (let r = 0; r < cfg.r; r++) {
                let row = [];
                for (let c = 0; c < cfg.c; c++) {
                    let isMine = mines.some(m => m.r === r && m.c === c), count = 0;
                    if (!isMine) for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) if (mines.some(m => m.r === r + i && m.c === c + j)) count++;
                    row.push({ isMine, count, isOpen: false });
                    if (!isMine && count === 0) hasSafeOpening = true;
                }
                board.push(row);
            }

            attempts++;

            if (state.config.noGuess) {
                if (hasSafeOpening) break;
                if (attempts > 100) {
                    // Force create a safe opening if we can't find one naturally
                    forceSafeOpening(board, mines, cfg);
                    break;
                }
            } else {
                break;
            }
        }

        state.board = board; state.minesLeft = mines.length; state.turnIndex = 0; state.gameActive = true;
        players.forEach(p => p.eliminated = false);
        broadcast({ type: 'GAME_START', board, turnIndex: 0, mines: mines.length, rows: cfg.r, cols: cfg.c });
        startGameClient();
    }

    function forceSafeOpening(board, mines, cfg) {
        // Pick a random spot
        const r = Math.floor(Math.random() * cfg.r);
        const c = Math.floor(Math.random() * cfg.c);

        // Clear mines in 3x3 area
        for (let i = -1; i <= 1; i++) {
            for (let j = -1; j <= 1; j++) {
                const nr = r + i, nc = c + j;
                if (nr >= 0 && nc >= 0 && nr < cfg.r && nc < cfg.c) {
                    // Remove mine if present
                    const mIdx = mines.findIndex(m => m.r === nr && m.c === nc);
                    if (mIdx !== -1) mines.splice(mIdx, 1);
                    board[nr][nc].isMine = false;
                }
            }
        }

        // Recalculate counts for the whole board (safest way)
        for (let row = 0; row < cfg.r; row++) {
            for (let col = 0; col < cfg.c; col++) {
                if (board[row][col].isMine) continue;
                let count = 0;
                for (let i = -1; i <= 1; i++) {
                    for (let j = -1; j <= 1; j++) {
                        if (mines.some(m => m.r === row + i && m.c === col + j)) count++;
                    }
                }
                board[row][col].count = count;
            }
        }
    }

    function startGameClient() {
        ui.lobby.classList.add('hidden'); ui.game.classList.remove('hidden'); ui.gameEnd.classList.add('hidden');
        if (!state.config.cols) { const p = PRESETS[state.config.size]; state.config.rows = p.r; state.config.cols = p.c; }

        ui.grid.style.setProperty('--rows', state.config.rows);
        ui.grid.style.setProperty('--cols', state.config.cols);

        ui.grid.innerHTML = ''; ui.mineCount.innerText = state.minesLeft;
        ui.grid.style.position = 'relative'; // Ensure relative positioning for cursors
        ui.grid.onmousemove = (e) => sendCursor(e);
        ui.grid.onmouseleave = () => sendCursor(null);

        state.board.forEach((row, r) => {
            row.forEach((tile, c) => {
                const div = document.createElement('div');
                div.className = 'tile flex items-center justify-center cursor-pointer';
                div.onmousedown = (e) => {
                    if (e.button === 0) clickTile(r, c);
                    if (e.button === 2) rightClickTile(r, c);
                };
                div.oncontextmenu = (e) => e.preventDefault();
                ui.grid.appendChild(div);
            });
        });
        updateGameHeader();
    }

    function clickTile(r, c) {
        if (state.config.mode === 'turn' && players[state.turnIndex].id !== peer.id) return;
        const t = state.board[r][c];

        // CHORDING LOGIC
        if (t.isOpen && t.count > 0) {
            attemptChord(r, c);
            return;
        }

        if (t.isOpen) return;
        // Normal click
        state.isHost ? processMove(r, c, peer.id) : connMap['host'].send({ type: 'MOVE', r, c });
    }

    function attemptChord(r, c) {
        const t = state.board[r][c];
        // Count flags around
        let flags = 0;
        const neighbors = [];
        for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
            if (i === 0 && j === 0) continue;
            const nr = r + i, nc = c + j;
            if (nr >= 0 && nc >= 0 && nr < state.config.rows && nc < state.config.cols) {
                const div = ui.grid.children[nr * state.config.cols + nc];
                if (div.querySelector('.fa-flag')) flags++;
                neighbors.push({ r: nr, c: nc });
            }
        }

        // If flags match number, open neighbors
        if (flags === t.count) {
            neighbors.forEach(n => {
                const neighborTile = state.board[n.r][n.c];
                const neighborDiv = ui.grid.children[n.r * state.config.cols + n.c];
                // Only click if closed and unflagged
                if (!neighborTile.isOpen && !neighborDiv.querySelector('.fa-flag')) {
                    state.isHost ? processMove(n.r, n.c, peer.id) : connMap['host'].send({ type: 'MOVE', r: n.r, c: n.c });
                }
            });
        }
    }

    function rightClickTile(r, c) {
        if (state.board[r][c].isOpen) return;
        if (!state.isHost) return; // Only host can place flags
        const t = ui.grid.children[r * state.config.cols + c];
        const hasFlag = t.querySelector('.fa-flag');
        if (hasFlag) { hasFlag.remove(); updateMineCount(1); } else { t.innerHTML += '<i class="fas fa-flag text-red-500 text-xs absolute drop-shadow-md"></i>'; updateMineCount(-1); }
        state.isHost ? broadcast({ type: 'FLAG', r, c }) : connMap['host'].send({ type: 'FLAG', r, c });
    }

    function processMove(r, c, pid) {
        const tile = state.board[r][c];
        if (tile.isOpen) return;
        if (state.config.mode === 'turn' && players[state.turnIndex].id !== pid) return;

        if (tile.isMine) {
            tile.isOpen = true;
            const p = players.find(pl => pl.id === pid);
            p.eliminated = true;
            const payload = { type: 'UPDATE_GRID', r, c, tile };
            handleClientData(payload); broadcast(payload);
            checkWin(true, p);
        } else {
            floodFill(r, c);
            checkWin(false, null);
        }
        if (state.gameActive) advanceTurn();
    }

    function floodFill(r, c) {
        const q = [{ r, c }], changes = [];
        while (q.length) {
            const curr = q.pop();
            if (curr.r < 0 || curr.c < 0 || curr.r >= state.config.rows || curr.c >= state.config.cols) continue;
            const t = state.board[curr.r][curr.c];
            if (t.isOpen || t.isMine) continue;

            t.isOpen = true; changes.push({ r: curr.r, c: curr.c, tile: t });
            if (t.count === 0) for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) q.push({ r: curr.r + i, c: curr.c + j });
        }
        changes.forEach(ch => { handleClientData({ type: 'UPDATE_GRID', ...ch }); broadcast({ type: 'UPDATE_GRID', ...ch }); });
    }

    function checkWin(boom, victim) {
        let safe = 0; state.board.forEach(r => r.forEach(t => { if (!t.isMine && !t.isOpen) safe++; }));
        if (safe === 0) return endGameAll(true, "Sector Cleared");
        if (boom) {
            if (state.config.mode === 'coop') endGameAll(false, `${victim.name} Detonated`);
            else if (state.config.mode === 'turn') {
                const s = players.filter(p => !p.eliminated);
                if (s.length === 1) endGameAll(true, `${s[0].name} Wins`);
                else if (s.length === 0) endGameAll(false, "Draw");
            }
        }
    }

    function advanceTurn() {
        if (state.config.mode !== 'turn') return;
        let tries = 0;
        do { state.turnIndex = (state.turnIndex + 1) % players.length; tries++; } while (players[state.turnIndex].eliminated && tries < players.length);
        const msg = { type: 'TURN_CHANGE', idx: state.turnIndex };
        state.turnIndex = msg.idx; broadcast(msg); updateGameHeader();
    }

    function endGameAll(w, m) { state.gameActive = false; broadcast({ type: 'GAME_OVER', win: w, msg: m }); endGame(w, m); }
    function endGame(w, m) {
        ui.gameEnd.classList.remove('hidden');
        document.getElementById('end-title').innerText = w ? "VICTORY" : "DEFEAT";
        document.getElementById('end-title').className = `text-4xl font-bold mb-2 tracking-tight ${w ? 'text-emerald-400' : 'text-red-400'}`;
        document.getElementById('end-icon').innerHTML = w ? '<i class="fas fa-trophy text-emerald-400"></i>' : '<i class="fas fa-bomb text-red-400"></i>';
        document.getElementById('end-msg').innerText = m;
        document.getElementById('btn-rematch').style.display = state.isHost ? 'block' : 'none';
        document.getElementById('rematch-status').innerText = state.isHost ? '' : 'Waiting for Host...';
    }

    function startRematch() { if (state.isHost) startGame(); }
    function updateMineCount(d) { ui.mineCount.innerText = parseInt(ui.mineCount.innerText) + d; }

    function updateTileUI(r, c) {
        const el = ui.grid.children[r * state.config.cols + c];
        const t = state.board[r][c];
        if (t.isOpen) {
            el.className = `tile tile-open flex items-center justify-center font-bold cursor-default`;
            if (el.querySelector('.ghost-cursor')) { const g = el.querySelector('.ghost-cursor'); el.innerHTML = ''; el.appendChild(g); } else el.innerHTML = '';
            if (t.isMine) { el.classList.add('bg-red-500/40'); el.innerHTML += '<i class="fas fa-bomb text-white drop-shadow"></i>'; }
            else if (t.count > 0) { el.classList.add(`num-${t.count}`); el.innerText = t.count; }
        }
    }

    function updateGameHeader() {
        const bar = document.getElementById('game-player-bar'); bar.innerHTML = '';
        players.forEach((p, i) => {
            bar.innerHTML += `<div class="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold border border-white/10 transition-all ${p.eliminated ? 'opacity-25 grayscale' : ''} ${state.config.mode === 'turn' && i === state.turnIndex ? 'ring-2 ring-white scale-110' : ''}" style="background:${p.color}20; color:${p.color}">${p.name.substring(0, 1)}</div>`;
        });
        const ind = document.getElementById('game-turn-indicator');
        if (state.config.mode === 'turn') {
            ind.classList.remove('hidden'); const myTurn = players[state.turnIndex].id === peer.id;
            ind.innerText = myTurn ? "YOUR TURN" : `${players[state.turnIndex].name}'s TURN`;
            ind.className = `px-3 py-1 rounded text-xs font-bold border ${myTurn ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30 animate-pulse' : 'bg-slate-700/50 text-slate-400 border-slate-600'}`;
            ui.grid.style.opacity = myTurn ? '1' : '0.5'; ui.grid.style.pointerEvents = myTurn ? 'auto' : 'none';
        } else { ind.classList.add('hidden'); ui.grid.style.opacity = '1'; ui.grid.style.pointerEvents = 'auto'; }
    }

    let lastSent = 0;
    function sendCursor(e) {
        if (Date.now() - lastSent > 30) {
            let payload;
            if (e) {
                const rect = ui.grid.getBoundingClientRect();
                const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
                payload = { type: 'CURSOR', x, y, id: peer.id };
            } else {
                // Cursor left grid
                payload = { type: 'CURSOR', x: -1, y: -1, id: peer.id };
            }
            state.isHost ? broadcast(payload) : connMap['host'].send(payload);
            lastSent = Date.now();
        }
    }

    function renderGhost(x, y, id) {
        if (id === peer.id) return;
        let el = document.getElementById(`cursor-${id}`);

        if (x < 0 || y < 0) {
            if (el) el.remove();
            return;
        }

        if (!el) {
            const p = players.find(pl => pl.id === id);
            if (!p) return;
            el = document.createElement('div');
            el.id = `cursor-${id}`;
            el.className = 'real-cursor';
            el.innerHTML = `<i class="fas fa-mouse-pointer" style="color:${p.color}"></i><span class="ml-2 text-xs font-bold bg-black/50 px-1 rounded text-white whitespace-nowrap">${p.name}</span>`;
            ui.grid.appendChild(el);
        }
        el.style.left = (x * 100) + '%';
        el.style.top = (y * 100) + '%';
    }

    return { initHost, joinInput, reset, copyCode, setConfig, updateSlider, toggleModeDD, selectModeUI, startGame, toggleSafeStart, showExitModal, requestRematch: () => { state.isHost ? startRematch() : (connMap['host'].send({ type: 'REMATCH' }), document.getElementById('rematch-status').innerText = "Sent...") }, leaveGame: () => { reset() } };
})();
