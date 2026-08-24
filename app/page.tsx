"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const COLORS = ["#ff6b6b", "#ffd43b", "#5c7cfa", "#51cf66", "#cc5de8"];
const SIZE = 6;
const GRID = SIZE * SIZE;
const FINISH = 100;

type Move = { a: number; b: number; matches: number[] };
type Bot = {
  name: string;
  score: number;
  progress: number;
  chains: number;
  cleared: number;
  board: string[];
  pendingBoard: string[] | null;
  burst: number[];
  swapped: number[];
};

function seededRandom(seed: number) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

function swap(board: string[], a: number, b: number) {
  const next = [...board];
  [next[a], next[b]] = [next[b], next[a]];
  return next;
}

function findMatches(board: string[]) {
  const found = new Set<number>();
  for (let row = 0; row < SIZE; row += 1) {
    let start = 0;
    for (let col = 1; col <= SIZE; col += 1) {
      if (col < SIZE && board[row * SIZE + col] === board[row * SIZE + start]) continue;
      if (col - start >= 3) for (let x = start; x < col; x += 1) found.add(row * SIZE + x);
      start = col;
    }
  }
  for (let col = 0; col < SIZE; col += 1) {
    let start = 0;
    for (let row = 1; row <= SIZE; row += 1) {
      if (row < SIZE && board[row * SIZE + col] === board[start * SIZE + col]) continue;
      if (row - start >= 3) for (let y = start; y < row; y += 1) found.add(y * SIZE + col);
      start = row;
    }
  }
  return [...found];
}

function validMoves(board: string[]): Move[] {
  const moves: Move[] = [];
  for (let index = 0; index < GRID; index += 1) {
    const col = index % SIZE;
    const neighbors = [col < SIZE - 1 ? index + 1 : -1, index + SIZE < GRID ? index + SIZE : -1];
    for (const other of neighbors) {
      if (other < 0 || board[index] === board[other]) continue;
      const matches = findMatches(swap(board, index, other));
      if (matches.length) moves.push({ a: index, b: other, matches });
    }
  }
  return moves;
}

function makePlayableBoard(seed: number) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const random = seededRandom(seed + attempt * 97);
    const board: string[] = [];
    for (let index = 0; index < GRID; index += 1) {
      const row = Math.floor(index / SIZE);
      const col = index % SIZE;
      let options = [...COLORS];
      if (col >= 2 && board[index - 1] === board[index - 2]) options = options.filter((color) => color !== board[index - 1]);
      if (row >= 2 && board[index - SIZE] === board[index - SIZE * 2]) options = options.filter((color) => color !== board[index - SIZE]);
      board.push(options[Math.floor(random() * options.length)]);
    }
    if (validMoves(board).length) return board;
  }
  return Array.from({ length: GRID }, (_, index) => COLORS[(index * 2 + Math.floor(index / SIZE)) % COLORS.length]);
}

function collapse(board: string[], matched: number[], random: () => number) {
  const removed = new Set(matched);
  const next = Array<string>(GRID);
  for (let col = 0; col < SIZE; col += 1) {
    const survivors: string[] = [];
    for (let row = SIZE - 1; row >= 0; row -= 1) {
      const index = row * SIZE + col;
      if (!removed.has(index)) survivors.push(board[index]);
    }
    for (let row = SIZE - 1, slot = 0; row >= 0; row -= 1, slot += 1) {
      next[row * SIZE + col] = slot < survivors.length ? survivors[slot] : COLORS[Math.floor(random() * COLORS.length)];
    }
  }
  return next;
}

function resolveCascades(swapped: string[], firstMatch: number[], seed: number) {
  const random = seededRandom(seed);
  let board = swapped;
  let matches = firstMatch;
  let cleared = 0;
  let chains = 0;
  while (matches.length && chains < 8) {
    cleared += matches.length;
    chains += 1;
    board = collapse(board, matches, random);
    matches = findMatches(board);
  }
  if (!validMoves(board).length) board = makePlayableBoard(seed + 131);
  return { board, cleared, chains };
}

function makeBot(name: string, seed: number): Bot {
  return { name, score: 0, progress: 0, chains: 0, cleared: 0, board: makePlayableBoard(seed), pendingBoard: null, burst: [], swapped: [] };
}

function settle(bot: Bot) {
  return bot.pendingBoard ? { ...bot, board: bot.pendingBoard, pendingBoard: null, burst: [], swapped: [] } : { ...bot, burst: [], swapped: [] };
}

function playMove(bot: Bot, turnNumber: number) {
  let board = bot.board;
  let moves = validMoves(board);
  if (!moves.length) {
    board = makePlayableBoard(turnNumber * 71 + bot.score + 9);
    moves = validMoves(board);
  }
  moves.sort((x, y) => y.matches.length - x.matches.length);
  const shortlist = moves.slice(0, Math.min(4, moves.length));
  const chosen = shortlist[(turnNumber + bot.score) % shortlist.length];
  const swappedBoard = swap(board, chosen.a, chosen.b);
  const result = resolveCascades(swappedBoard, chosen.matches, turnNumber * 997 + bot.score + 17);
  const points = result.cleared * 20 + Math.max(0, result.chains - 1) * 40;
  const thrust = 2.7 + result.cleared * 0.72 + result.chains * 0.6;
  return {
    ...bot,
    board: swappedBoard,
    pendingBoard: result.board,
    burst: chosen.matches,
    swapped: [chosen.a, chosen.b],
    cleared: result.cleared,
    chains: result.chains,
    score: bot.score + points,
    progress: Math.min(FINISH, bot.progress + thrust),
  };
}

function MatchBoard({ bot, side }: { bot: Bot; side: "coral" | "blue" }) {
  return (
    <section className={`player-panel ${side}`} aria-label={`${bot.name} 的自动消除棋盘`}>
      <div className="player-head">
        <div><span className="bot-status"><i /> MATCH-3 BOT</span><h2>{bot.name}</h2></div>
        <div className="score-box"><strong>{bot.score.toLocaleString()}</strong><span>积分</span></div>
      </div>
      <div className="board-shell">
        <div className="board">
          {bot.board.map((color, index) => (
            <div
              className={`gem ${bot.burst.includes(index) ? "burst" : ""} ${bot.swapped.includes(index) ? "swapped" : ""}`}
              style={{ "--gem": color, "--delay": `${Math.max(0, bot.burst.indexOf(index)) * 42}ms` } as React.CSSProperties}
              key={index}
            ><span /></div>
          ))}
        </div>
        {bot.burst.length > 0 && (
          <div className="pop-callout" key={`${bot.score}-${bot.cleared}`}>
            +{bot.cleared * 20 + Math.max(0, bot.chains - 1) * 40}
            <small>{bot.chains > 1 ? `${bot.chains} 连锁 · ${bot.cleared}颗` : `三连消除 · ${bot.cleared}颗`}</small>
          </div>
        )}
      </div>
      <div className="power-row"><span>屁能量</span><div className="power-track"><i style={{ width: `${bot.progress}%` }} /></div><strong>{Math.round(bot.progress)}%</strong></div>
    </section>
  );
}

function Racer({ bot, lane }: { bot: Bot; lane: "top" | "bottom" }) {
  const gasScale = Math.min(2.8, 1.05 + bot.cleared * 0.15 + bot.chains * 0.2);
  const left = Math.min(91, 4 + bot.progress * 0.87);
  const farting = bot.burst.length > 0;
  return (
    <div className={`racer ${lane} ${farting ? "farting" : ""}`} style={{ left: `${left}%` }}>
      <div className="gas-jet" style={{ "--gas-scale": gasScale } as React.CSSProperties}>
        <i className="gas g1" /><i className="gas g2" /><i className="gas g3" /><i className="gas g4" />
        <b>噗</b>
      </div>
      <div className="runner"><span className="hair" /><span className="head" /><span className="body" /><span className="arm" /><span className="leg one" /><span className="leg two" /></div>
      <span className="racer-name">{bot.name}</span>
    </div>
  );
}

function playFart(context: AudioContext, power: number) {
  if (context.state !== "running") return;
  const now = context.currentTime;
  const duration = 0.3 + power * 0.012;
  const compressor = context.createDynamicsCompressor();
  compressor.threshold.value = -16;
  compressor.knee.value = 14;
  compressor.ratio.value = 5;
  compressor.attack.value = 0.004;
  compressor.release.value = 0.16;
  compressor.connect(context.destination);

  const oscillator = context.createOscillator();
  const filter = context.createBiquadFilter();
  const gain = context.createGain();
  oscillator.type = "sawtooth";
  oscillator.frequency.setValueAtTime(112 + power * 3, now);
  oscillator.frequency.exponentialRampToValueAtTime(36, now + duration);
  filter.type = "lowpass";
  filter.frequency.value = 285;
  filter.Q.value = 1.6;
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.25, now + 0.018);
  gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
  oscillator.connect(filter).connect(gain).connect(compressor);
  oscillator.start(now);
  oscillator.stop(now + duration);

  const noiseLength = Math.floor(context.sampleRate * duration);
  const noiseBuffer = context.createBuffer(1, noiseLength, context.sampleRate);
  const noiseData = noiseBuffer.getChannelData(0);
  for (let index = 0; index < noiseLength; index += 1) {
    const fade = Math.pow(1 - index / noiseLength, 1.25);
    const flutter = 0.55 + 0.45 * Math.sin(index / 43);
    noiseData[index] = (Math.random() * 2 - 1) * fade * flutter;
  }
  const noise = context.createBufferSource();
  const noiseFilter = context.createBiquadFilter();
  const noiseGain = context.createGain();
  noise.buffer = noiseBuffer;
  noiseFilter.type = "bandpass";
  noiseFilter.frequency.value = 170 + power * 5;
  noiseFilter.Q.value = 0.75;
  noiseGain.gain.setValueAtTime(0.16, now);
  noiseGain.gain.exponentialRampToValueAtTime(0.001, now + duration);
  noise.connect(noiseFilter).connect(noiseGain).connect(compressor);
  noise.start(now);
}

function playExplosion(context: AudioContext) {
  if (context.state !== "running") return;
  const now = context.currentTime;
  const duration = 0.72;
  const compressor = context.createDynamicsCompressor();
  compressor.threshold.value = -18; compressor.ratio.value = 7; compressor.connect(context.destination);
  const buffer = context.createBuffer(1, Math.floor(context.sampleRate * duration), context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let index = 0; index < data.length; index += 1) {
    const decay = Math.pow(1 - index / data.length, 2.3);
    data[index] = (Math.random() * 2 - 1) * decay;
  }
  const source = context.createBufferSource();
  const filter = context.createBiquadFilter();
  const gain = context.createGain();
  source.buffer = buffer; filter.type = "lowpass"; filter.frequency.setValueAtTime(900, now); filter.frequency.exponentialRampToValueAtTime(80, now + duration);
  gain.gain.setValueAtTime(0.42, now); gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
  source.connect(filter).connect(gain).connect(compressor); source.start(now);
  const boom = context.createOscillator(); const boomGain = context.createGain();
  boom.type = "sine"; boom.frequency.setValueAtTime(82, now); boom.frequency.exponentialRampToValueAtTime(28, now + 0.55);
  boomGain.gain.setValueAtTime(0.36, now); boomGain.gain.exponentialRampToValueAtTime(0.001, now + 0.58);
  boom.connect(boomGain).connect(compressor); boom.start(now); boom.stop(now + 0.6);
}

function playSongNote(context: AudioContext, pitch: "low" | "high", step: number) {
  if (context.state !== "running") return;
  const lowScale = [196, 220, 247, 262, 294, 262, 247, 220];
  const highScale = [523, 587, 659, 784, 698, 659, 587, 523];
  const frequency = (pitch === "high" ? highScale : lowScale)[step % 8];
  const now = context.currentTime;
  const oscillator = context.createOscillator();
  const filter = context.createBiquadFilter();
  const gain = context.createGain();
  oscillator.type = pitch === "high" ? "triangle" : "sine";
  oscillator.frequency.setValueAtTime(frequency, now);
  filter.type = "lowpass"; filter.frequency.value = pitch === "high" ? 1450 : 720;
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.045, now + 0.018);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
  oscillator.connect(filter).connect(gain).connect(context.destination);
  oscillator.start(now); oscillator.stop(now + 0.3);
}

function Match3Arena({ onFart }: { onFart: (power: number) => void }) {
  const [bots, setBots] = useState<[Bot, Bot]>(() => [makeBot("橙子选手", 2049), makeBot("蓝莓选手", 4098)]);
  const [running, setRunning] = useState(true);
  const [winner, setWinner] = useState<string | null>(null);
  const turn = useRef(0);

  const reset = useCallback(() => {
    setBots([makeBot("橙子选手", 2049), makeBot("蓝莓选手", 4098)]);
    setWinner(null); setRunning(true); turn.current = 0;
  }, []);

  useEffect(() => {
    if (!running || winner) return;
    const timer = window.setInterval(() => {
      turn.current += 1;
      const active = turn.current % 2;
      onFart(3 + (turn.current % 7));
      setBots((current) => {
        const updated: [Bot, Bot] = [settle(current[0]), settle(current[1])];
        updated[active] = playMove(updated[active], turn.current);
        if (updated[active].progress >= FINISH) {
          setWinner(updated[active].name);
          setRunning(false);
        }
        return updated;
      });
    }, 470);
    return () => window.clearInterval(timer);
  }, [running, winner, onFart]);

  return (
    <>
      <div className="game-wrap">
        <div className="title-row">
          <div><p>交换成三连 · 消得越多 · 屁得越猛</p><h1>谁会成为今天的<br /><span>史诗级大屁王？</span></h1></div>
          <div className="rules"><span>比赛规则</span><p><b>01</b> 相邻交换组成三连</p><p><b>02</b> 消除转化为屁能量</p><p><b>03</b> 屁的反冲推动前进</p></div>
        </div>
        <div className="versus-grid"><MatchBoard bot={bots[0]} side="coral" /><div className="versus"><span>V</span><span>S</span></div><MatchBoard bot={bots[1]} side="blue" /></div>
        <section className="race-card" aria-label="屁能量竞速赛道">
          <div className="race-head"><div><span className="live-dot" /> 屁能量竞速实况 <small>绿色气团越大，本次推进越远</small></div><button onClick={() => setRunning((value) => !value)} disabled={!!winner}>{running ? "暂停" : "继续"}</button></div>
          <div className="track"><div className="lane-line first" /><div className="lane-line second" /><div className="start-line"><span>START</span></div><div className="finish-line"><span>FINISH</span><i /></div><Racer bot={bots[0]} lane="top" /><Racer bot={bots[1]} lane="bottom" /></div>
        </section>
        <footer className="footer-note"><span>当前模式：真实 Match‑3 自动对战</span><span className="future">交换 → 三连 → 下落补位 → 连锁 → 放屁推进</span><button onClick={reset}>↻ 重新开赛</button></footer>
      </div>
      {winner && <div className="winner-overlay" role="dialog" aria-modal="true" aria-label="比赛结果"><div className="confetti c1">◆</div><div className="confetti c2">●</div><div className="confetti c3">▲</div><div className="winner-card"><span className="crown">♛</span><p>比赛结束</p><h2>{winner}</h2><h3>史诗级大屁王</h3><div className="final-score">{bots[0].score} <span>:</span> {bots[1].score}</div><button onClick={reset}>再来一局</button></div></div>}
    </>
  );
}

type BattleMode = "local" | "solo" | "demo";
type WellTargetKind = "mole" | "gold" | "bomb";
type WellTarget = { id: number; lane: number; kind: WellTargetKind; hit: boolean };
type WellPlayer = { name: string; height: number; combo: number; score: number; status: "idle" | "hit" | "miss" | "bomb"; fartId: number };

const makeWellPlayer = (name: string): WellPlayer => ({ name, height: 0, combo: 0, score: 0, status: "idle", fartId: 0 });

function makeTarget(player: number, round: number): WellTarget {
  const random = seededRandom(8069 + round * 733 + player * 977);
  const roll = random();
  const kind: WellTargetKind = round > 2 && roll < 0.18
    ? "bomb"
    : round > 2 && roll > 0.88 ? "gold" : "mole";
  return { id: round * 10 + player, lane: Math.floor(random() * 3), kind, hit: false };
}

function WellColumn({ player, target, side, keys, controller }: { player: WellPlayer; target: WellTarget | null; side: "coral" | "blue"; keys: string[]; controller: string }) {
  return (
    <section className={`well-column ${side}`} aria-label={`${player.name} 的井底赛道`}>
      <div className="well-player-head">
        <div><span>{controller}</span><h2>{player.name}</h2></div>
        <div className="well-stats"><strong>{player.score}</strong><small>分 · 连击 ×{player.combo}</small></div>
      </div>
      <div className="shaft">
        <div className="shaft-sky"><span>出口</span><i /></div>
        <div className="depth-marks"><i>100</i><i>75</i><i>50</i><i>25</i></div>
        <div className={`well-avatar ${player.status === "hit" ? "boost" : ""} ${player.status === "miss" ? "dropping" : ""} ${player.status === "bomb" ? "bombed" : ""}`} style={{ bottom: `calc(78px + ${player.height * 2.72}px)` }}>
          <div className="vertical-gas" key={player.fartId}><i /><i /><i /><b>噗!</b></div>
          {player.status === "bomb" && <div className="bomb-blast" key={`bomb-${player.fartId}`}><b>BOOM!</b><i>💥</i></div>}
          <div className="well-person"><span className="wp-hair" /><span className="wp-head" /><span className="wp-body" /><span className="wp-leg l1" /><span className="wp-leg l2" /></div>
          <em>{Math.round(player.height)}m</em>
        </div>
        <div className="hole-deck">
          {[0, 1, 2].map((lane) => {
            const active = target?.lane === lane && !target.hit;
            const whacked = target?.lane === lane && target.hit;
            return (
              <div className={`mole-hole ${active ? "active" : ""} ${target?.kind === "gold" && active ? "gold" : ""} ${target?.kind === "bomb" && active ? "bomb" : ""} ${whacked ? "whacked" : ""}`} key={lane}>
                {active && <span className="mole">{target.kind === "gold" ? "★" : "•ᴗ•"}{target.kind === "bomb" && <i className="secret-fuse" />}</span>}
                {whacked && <span className={`hit-star ${target?.kind === "bomb" ? "exploded" : ""}`}>{target?.kind === "bomb" ? "炸飞!" : "啪!"}</span>}
                <kbd>{keys[lane]}</kbd>
              </div>
            );
          })}
        </div>
      </div>
      <div className="height-bar"><span>井底</span><div><i style={{ width: `${player.height}%` }} /></div><strong>井口</strong></div>
    </section>
  );
}

function WellArena({ onFart, onExplosion }: { onFart: (power: number) => void; onExplosion: () => void }) {
  const [mode, setMode] = useState<BattleMode>("local");
  const [players, setPlayers] = useState<[WellPlayer, WellPlayer]>(() => [makeWellPlayer("橙子选手"), makeWellPlayer("蓝莓选手")]);
  const [targets, setTargets] = useState<[WellTarget | null, WellTarget | null]>([null, null]);
  const [running, setRunning] = useState(false);
  const [winner, setWinner] = useState<string | null>(null);
  const round = useRef(0);
  const targetsRef = useRef(targets);
  const playersRef = useRef(players);
  useEffect(() => { targetsRef.current = targets; }, [targets]);
  useEffect(() => { playersRef.current = players; }, [players]);

  const reset = useCallback(() => {
    round.current = 0;
    setPlayers([makeWellPlayer("橙子选手"), makeWellPlayer("蓝莓选手")]);
    setTargets([null, null]); setWinner(null); setRunning(false);
  }, []);

  const start = useCallback(() => {
    round.current = 1;
    setPlayers([makeWellPlayer("橙子选手"), makeWellPlayer("蓝莓选手")]);
    setTargets([makeTarget(0, 1), makeTarget(1, 1)]);
    setWinner(null); setRunning(true);
  }, []);

  const changeMode = useCallback((next: BattleMode) => {
    setMode(next); reset();
  }, [reset]);

  const attempt = useCallback((playerIndex: number, lane: number) => {
    if (!running || winner) return;
    const target = targetsRef.current[playerIndex];
    if (!target || target.hit) return;
    if (lane === target.lane) {
      if (target.kind === "bomb") {
        setTargets((current) => current.map((item, index) => index === playerIndex && item ? { ...item, hit: true } : item) as [WellTarget | null, WellTarget | null]);
        setPlayers((current) => current.map((player, index) => index === playerIndex
          ? { ...player, height: 0, combo: 0, score: Math.max(0, player.score - 200), status: "bomb", fartId: player.fartId + 1 }
          : player) as [WellPlayer, WellPlayer]);
        onExplosion();
        return;
      }
      const currentCombo = playersRef.current[playerIndex].combo;
      const nextCombo = currentCombo + 1;
      const thrust = (target.kind === "gold" ? 14 : 4.8) + Math.min(nextCombo, 12) * 0.48;
      const points = (target.kind === "gold" ? 350 : 100) + Math.min(nextCombo, 12) * 15;
      setTargets((current) => current.map((item, index) => index === playerIndex && item ? { ...item, hit: true } : item) as [WellTarget | null, WellTarget | null]);
      setPlayers((current) => current.map((player, index) => {
        if (index !== playerIndex) return player;
        const height = Math.min(100, player.height + thrust);
        if (height >= 100) { setWinner(player.name); setRunning(false); }
        return { ...player, height, combo: nextCombo, score: player.score + points, status: "hit", fartId: player.fartId + 1 };
      }) as [WellPlayer, WellPlayer]);
      onFart(target.kind === "gold" ? 15 : 4 + Math.min(nextCombo, 9));
    } else {
      setPlayers((current) => current.map((player, index) => index === playerIndex ? { ...player, height: Math.max(0, player.height - 4), combo: 0, status: "miss" } : player) as [WellPlayer, WellPlayer]);
    }
  }, [onExplosion, onFart, running, winner]);

  useEffect(() => {
    if (!running || winner) return;
    const timer = window.setInterval(() => {
      const previous = targetsRef.current;
      setPlayers((current) => current.map((player, index) => previous[index] && !previous[index]?.hit && previous[index]?.kind !== "bomb"
        ? { ...player, height: Math.max(0, player.height - 5.5), combo: 0, status: "miss" }
        : { ...player, status: "idle" }) as [WellPlayer, WellPlayer]);
      round.current += 1;
      setTargets([makeTarget(0, round.current), makeTarget(1, round.current)]);
    }, 720);
    const gravity = window.setInterval(() => {
      setPlayers((current) => current.map((player) => ({ ...player, height: Math.max(0, player.height - 0.2) })) as [WellPlayer, WellPlayer]);
    }, 100);
    return () => { window.clearInterval(timer); window.clearInterval(gravity); };
  }, [running, winner]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) return;
      const p1: Record<string, number> = { KeyA: 0, KeyS: 1, KeyD: 2 };
      const p2: Record<string, number> = { KeyJ: 0, KeyK: 1, KeyL: 2 };
      if (event.code in p1 && mode !== "demo") { event.preventDefault(); attempt(0, p1[event.code]); }
      if (event.code in p2 && mode === "local") { event.preventDefault(); attempt(1, p2[event.code]); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [attempt, mode]);

  useEffect(() => {
    if (!running || winner) return;
    const timers: number[] = [];
    targets.forEach((target, playerIndex) => {
      const robot = mode === "demo" || (mode === "solo" && playerIndex === 1);
      if (!robot || !target || target.hit) return;
      if (target.kind === "bomb") {
        const blunder = ((target.id * 17 + playerIndex * 41) % 100) < 12;
        if (blunder) timers.push(window.setTimeout(() => attempt(playerIndex, target.lane), 350));
        return;
      }
      const accuracy = ((target.id * 37 + playerIndex * 19) % 100) < (playerIndex === 0 ? 88 : 84);
      const reaction = 180 + ((target.id * 29 + playerIndex * 83) % 310);
      timers.push(window.setTimeout(() => attempt(playerIndex, accuracy ? target.lane : (target.lane + 1) % 3), reaction));
    });
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [attempt, mode, running, targets, winner]);

  const controllers = mode === "local" ? ["HUMAN · A S D", "HUMAN · J K L"] : mode === "solo" ? ["HUMAN · A S D", "REACTION BOT"] : ["REACTION BOT", "REACTION BOT"];

  return (
    <>
      <div className="game-wrap well-wrap">
        <div className="title-row well-title">
          <div><p>看准目标 · 连续命中 · 一屁升天</p><h1>从井底一路屁到<br /><span>天空去！</span></h1></div>
          <div className="well-rules"><p><b>命中</b> 放屁上升</p><p><b>连击</b> 推力增强</p><p><b>漏掉</b> 断连下坠</p><p className="gold-rule"><b>★</b> 超级大屁</p><p className="bomb-rule"><b>?</b> 小心伪装炸弹</p></div>
        </div>
        <div className="well-toolbar">
          <div className="battle-modes" aria-label="对战方式">
            <button className={mode === "local" ? "active" : ""} onClick={() => changeMode("local")}>双人键盘</button>
            <button className={mode === "solo" ? "active" : ""} onClick={() => changeMode("solo")}>1P 对机器人</button>
            <button className={mode === "demo" ? "active" : ""} onClick={() => changeMode("demo")}>机器人演示</button>
          </div>
          <div className="well-actions"><span>{running ? "比赛进行中" : winner ? "比赛结束" : "准备好后开始"}</span><button className="start-well" onClick={running ? reset : start}>{running ? "停止" : winner ? "再来一局" : "开始比赛"}</button></div>
        </div>
        <div className="well-grid">
          <WellColumn player={players[0]} target={targets[0]} side="coral" keys={["A", "S", "D"]} controller={controllers[0]} />
          <div className="well-vs">VS</div>
          <WellColumn player={players[1]} target={targets[1]} side="blue" keys={["J", "K", "L"]} controller={controllers[1]} />
        </div>
        <footer className="footer-note well-note"><span>地图 2：井底屁升 · 隐藏炸弹</span><span className="future">炸弹伪装成普通目标，只能从细小引线判断；误打直接回到井底</span><button onClick={reset}>↻ 重置比赛</button></footer>
      </div>
      {winner && <div className="winner-overlay" role="dialog" aria-modal="true" aria-label="比赛结果"><div className="confetti c1">◆</div><div className="confetti c2">●</div><div className="confetti c3">▲</div><div className="winner-card well-win"><span className="crown">♛</span><p>成功冲出井口</p><h2>{winner}</h2><h3>史诗级升天大屁王</h3><div className="final-score">{players[0].score} <span>:</span> {players[1].score}</div><button onClick={start}>再来一局</button></div></div>}
    </>
  );
}

type PullPlayer = { name: string; score: number; combo: number; lastKey: number | null; fartId: number; status: "idle" | "pull" | "stumble" | "bomb" };
const makePullPlayer = (name: string): PullPlayer => ({ name, score: 0, combo: 0, lastKey: null, fartId: 0, status: "idle" });

function PullArena({ onFart, onExplosion }: { onFart: (power: number) => void; onExplosion: () => void }) {
  const [mode, setMode] = useState<BattleMode>("local");
  const [players, setPlayers] = useState<[PullPlayer, PullPlayer]>(() => [makePullPlayer("橙子选手"), makePullPlayer("蓝莓选手")]);
  const [position, setPosition] = useState(0);
  const [running, setRunning] = useState(false);
  const [winner, setWinner] = useState<string | null>(null);
  const [bombActive, setBombActive] = useState(false);
  const [bombedPlayer, setBombedPlayer] = useState<number | null>(null);
  const playersRef = useRef(players);
  const bombRef = useRef(false);
  useEffect(() => { playersRef.current = players; }, [players]);

  const reset = useCallback(() => {
    setPlayers([makePullPlayer("橙子选手"), makePullPlayer("蓝莓选手")]);
    bombRef.current = false; setBombActive(false); setBombedPlayer(null);
    setPosition(0); setRunning(false); setWinner(null);
  }, []);
  const start = useCallback(() => {
    setPlayers([makePullPlayer("橙子选手"), makePullPlayer("蓝莓选手")]);
    bombRef.current = false; setBombActive(false); setBombedPlayer(null);
    setPosition(0); setWinner(null); setRunning(true);
  }, []);
  const changeMode = useCallback((next: BattleMode) => { setMode(next); reset(); }, [reset]);

  const pull = useCallback((playerIndex: number, keyIndex: number) => {
    if (!running || winner) return;
    const player = playersRef.current[playerIndex];
    if (bombRef.current) {
      bombRef.current = false; setBombActive(false); setBombedPlayer(playerIndex);
      window.setTimeout(() => setBombedPlayer(null), 1050);
      setPlayers((current) => current.map((item, index) => index === playerIndex
        ? { ...item, combo: 0, score: Math.max(0, item.score - 200), status: "bomb", fartId: item.fartId + 1 }
        : item) as [PullPlayer, PullPlayer]);
      setPosition((current) => {
        // The full playable rope spans -100 to +100, so 1/5 of its total length is 40.
        // A bomb is a penalty: move the rope toward the opponent, not toward the player who pressed.
        const next = Math.max(-100, Math.min(100, current + (playerIndex === 0 ? -40 : 40)));
        if (Math.abs(next) >= 100) { setWinner(playersRef.current[1 - playerIndex].name); setRunning(false); }
        return next;
      });
      onExplosion();
      return;
    }
    if (player.lastKey === keyIndex) {
      setPlayers((current) => current.map((item, index) => index === playerIndex ? { ...item, combo: 0, status: "stumble" } : item) as [PullPlayer, PullPlayer]);
      return;
    }
    const combo = Math.min(12, player.combo + 1);
    const force = 3.2 + combo * 0.12;
    setPlayers((current) => current.map((item, index) => index === playerIndex
      ? { ...item, score: item.score + 10 + combo * 2, combo, lastKey: keyIndex, fartId: item.fartId + 1, status: "pull" }
      : item) as [PullPlayer, PullPlayer]);
    setPosition((current) => {
      const next = Math.max(-100, Math.min(100, current + (playerIndex === 0 ? force : -force)));
      if (Math.abs(next) >= 100) { setWinner(playersRef.current[playerIndex].name); setRunning(false); }
      return next;
    });
    onFart(3 + combo * 0.65);
  }, [onExplosion, onFart, running, winner]);

  useEffect(() => {
    if (!running || winner) return;
    let expireTimer: number | undefined;
    const hazardTimer = window.setInterval(() => {
      if (bombRef.current || Math.random() >= 0.14) return;
      bombRef.current = true; setBombActive(true);
      expireTimer = window.setTimeout(() => { bombRef.current = false; setBombActive(false); }, 1150);
    }, 720);
    return () => { window.clearInterval(hazardTimer); if (expireTimer) window.clearTimeout(expireTimer); bombRef.current = false; };
  }, [running, winner]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) return;
      const p1: Record<string, number> = { KeyZ: 0, KeyX: 1 };
      const p2: Record<string, number> = { ArrowLeft: 0, ArrowRight: 1 };
      if (event.code in p1 && mode !== "demo") { event.preventDefault(); pull(0, p1[event.code]); }
      if (event.code in p2 && mode === "local") { event.preventDefault(); pull(1, p2[event.code]); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mode, pull]);

  useEffect(() => {
    if (!running || winner) return;
    const botKeys: [number, number] = [0, 0];
    let tick = 0;
    const timer = window.setInterval(() => {
      tick += 1;
      const bot0 = () => { pull(0, botKeys[0]); botKeys[0] = 1 - botKeys[0]; };
      const bot1 = () => { pull(1, botKeys[1]); botKeys[1] = 1 - botKeys[1]; };
      if (mode === "demo" && tick % 2 === 0) bot0();
      if (mode === "solo" || (mode === "demo" && tick % 3 !== 0)) bot1();
      if (mode === "demo" && tick % 2 !== 0) bot0();
    }, 185);
    return () => window.clearInterval(timer);
  }, [mode, pull, running, winner]);

  const controllers = mode === "local" ? ["HUMAN · Z X", "HUMAN · ← →"] : mode === "solo" ? ["HUMAN · Z X", "SPEED BOT"] : ["SPEED BOT", "SPEED BOT"];
  const flagLeft = 50 - position * 0.37;
  return (
    <>
      <div className="game-wrap pull-wrap">
        <div className="title-row mini-title"><div><p>左右交替 · 越快越猛 · 小心炸弹</p><h1>用屁把对手<br /><span>拔过来！</span></h1></div><div className="mini-rules"><p><b>Z X</b> 橙子交替按</p><p><b>← →</b> 蓝莓交替按</p><p><b>💣</b> 误触倒退 1/5</p></div></div>
        <div className="well-toolbar">
          <div className="battle-modes" aria-label="对战方式">
            <button className={mode === "local" ? "active" : ""} onClick={() => changeMode("local")}>双人键盘</button>
            <button className={mode === "solo" ? "active" : ""} onClick={() => changeMode("solo")}>1P 对机器人</button>
            <button className={mode === "demo" ? "active" : ""} onClick={() => changeMode("demo")}>机器人演示</button>
          </div>
          <div className="well-actions"><span>{running ? "疯狂输出中" : winner ? "比赛结束" : "准备好后开始"}</span><button className="start-well" onClick={running ? reset : start}>{running ? "停止" : winner ? "再来一局" : "开始比赛"}</button></div>
        </div>
        <section className="pull-stage" aria-label="屁力拔河赛场">
          <div className="pull-sky"><i /><i /><i /></div>
          <div className="pull-player left"><div className={`pull-person ${players[0].status}`}><span className="pull-gas" key={players[0].fartId}>噗!</span>{bombedPlayer === 0 && <div className="pull-bomb-blast">💥</div>}<div className="well-person"><span className="wp-hair" /><span className="wp-head" /><span className="wp-body" /><span className="wp-leg l1" /><span className="wp-leg l2" /></div></div><h2>橙子选手</h2><p>{controllers[0]} · 连击 ×{players[0].combo}</p><div className="key-pair"><kbd>Z</kbd><kbd>X</kbd></div></div>
          <div className="pull-player right blue"><div className={`pull-person ${players[1].status}`}><span className="pull-gas" key={players[1].fartId}>噗!</span>{bombedPlayer === 1 && <div className="pull-bomb-blast">💥</div>}<div className="well-person"><span className="wp-hair" /><span className="wp-head" /><span className="wp-body" /><span className="wp-leg l1" /><span className="wp-leg l2" /></div></div><h2>蓝莓选手</h2><p>{controllers[1]} · 连击 ×{players[1].combo}</p><div className="key-pair"><kbd>←</kbd><kbd>→</kbd></div></div>
          <div className={`rope ${bombedPlayer !== null ? "rope-penalty" : ""}`}><i /><span style={{ left: `${flagLeft}%` }}>屁力旗</span></div>
          <div className={`pull-center ${bombedPlayer !== null ? "penalty" : ""}`} style={{ left: `${flagLeft}%` }}><b>💨</b></div>
          {bombedPlayer !== null && <div className={`pull-penalty ${bombedPlayer === 1 ? "blue" : ""}`} key={`penalty-${players[bombedPlayer].fartId}`}><b>-20%</b><span>{players[bombedPlayer].name} 被炸退整条绳子的 1/5！</span></div>}
          <div className={`pull-hazard ${bombActive ? "active" : ""}`}><i>{bombActive ? "💣" : ""}</i><span>{bombActive ? "危险！下一个按键会倒退 1/5" : "随机炸弹尚未出现"}</span></div>
        </section>
        <div className="tug-meter"><span>橙子胜区</span><div><i style={{ left: `${flagLeft}%` }} /></div><span>蓝莓胜区</span></div>
        <footer className="footer-note"><span>地图 3：屁力拔河</span><span className="future">炸弹出现时，下一位操作者会被炸退整条绳子的 1/5，同时清空连击并扣 200 分</span><button onClick={reset}>↻ 重置比赛</button></footer>
      </div>
      {winner && <div className="winner-overlay" role="dialog" aria-modal="true" aria-label="比赛结果"><div className="winner-card pull-win"><span className="crown">♛</span><p>屁力压倒性胜利</p><h2>{winner}</h2><h3>史诗级屁力士</h3><div className="final-score">{players[0].score} <span>:</span> {players[1].score}</div><button onClick={start}>再来一局</button></div></div>}
    </>
  );
}

type RhythmPitch = "low" | "high";
type RhythmPlayer = { name: string; score: number; combo: number; status: "idle" | "hit" | "bomb"; hitBeat: number };
const RHYTHM_GOAL = 16;
const MELODY: RhythmPitch[] = ["low", "low", "high", "low", "high", "high", "low", "high", "low", "high", "low", "low", "high", "low", "high", "high"];
const makeRhythmPlayer = (name: string): RhythmPlayer => ({ name, score: 0, combo: 0, status: "idle", hitBeat: -1 });

function RhythmArena({ onFart, onExplosion, onSongNote, onEnsureSound }: { onFart: (power: number) => void; onExplosion: () => void; onSongNote: (pitch: RhythmPitch, step: number) => void; onEnsureSound: () => Promise<void> }) {
  const [mode, setMode] = useState<BattleMode>("local");
  const [players, setPlayers] = useState<[RhythmPlayer, RhythmPlayer]>(() => [makeRhythmPlayer("橙子选手"), makeRhythmPlayer("蓝莓选手")]);
  const [beat, setBeat] = useState(0);
  const [running, setRunning] = useState(false);
  const [winner, setWinner] = useState<string | null>(null);
  const beatAt = useRef(0);
  const playersRef = useRef(players);
  const winnerRef = useRef<string | null>(null);
  const pitch = MELODY[Math.max(0, beat - 1) % MELODY.length];
  useEffect(() => { playersRef.current = players; }, [players]);
  useEffect(() => { winnerRef.current = winner; }, [winner]);

  const reset = useCallback(() => { setPlayers([makeRhythmPlayer("橙子选手"), makeRhythmPlayer("蓝莓选手")]); setBeat(0); setRunning(false); winnerRef.current = null; setWinner(null); }, []);
  const start = useCallback(() => { void onEnsureSound(); setPlayers([makeRhythmPlayer("橙子选手"), makeRhythmPlayer("蓝莓选手")]); beatAt.current = Date.now(); setBeat(1); winnerRef.current = null; setWinner(null); setRunning(true); }, [onEnsureSound]);
  const changeMode = useCallback((next: BattleMode) => { setMode(next); reset(); }, [reset]);

  const tap = useCallback((playerIndex: number, selectedPitch: RhythmPitch, forcedOffset?: number) => {
    if (!running || winnerRef.current || playersRef.current[playerIndex].hitBeat === beat) return;
    const offset = forcedOffset ?? Math.abs(Date.now() - beatAt.current - 480);
    const hit = selectedPitch === pitch && offset <= 78;
    const projectedScore = Math.min(RHYTHM_GOAL, playersRef.current[playerIndex].score + (hit ? 1 : 0));
    if (projectedScore >= RHYTHM_GOAL && !winnerRef.current) {
      winnerRef.current = playersRef.current[playerIndex].name; setWinner(playersRef.current[playerIndex].name); setRunning(false);
    }
    setPlayers((current) => current.map((player, index) => index === playerIndex ? {
      ...player,
      score: hit ? projectedScore : Math.max(0, player.score - 2),
      combo: hit ? player.combo + 1 : 0,
      status: hit ? "hit" : "bomb",
      hitBeat: beat,
    } : player) as [RhythmPlayer, RhythmPlayer]);
    if (hit) onFart(7 + Math.min(playersRef.current[playerIndex].combo, 8)); else onExplosion();
  }, [beat, onExplosion, onFart, pitch, running]);

  useEffect(() => {
    if (!running || winner || beat < 1) return;
    onSongNote(pitch, beat);
    const timer = window.setTimeout(() => {
      const missed = playersRef.current.some((player) => player.hitBeat !== beat);
      if (missed) onExplosion();
      setPlayers((current) => current.map((player) => player.hitBeat === beat
        ? { ...player, status: "idle" }
        : { ...player, score: Math.max(0, player.score - 2), combo: 0, status: "bomb" }) as [RhythmPlayer, RhythmPlayer]);
      beatAt.current = Date.now(); setBeat((current) => current + 1);
    }, 720);
    return () => window.clearTimeout(timer);
  }, [beat, onExplosion, onSongNote, pitch, running, winner]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) return;
      const p1: Record<string, RhythmPitch> = { KeyF: "low", KeyG: "high" };
      const p2: Record<string, RhythmPitch> = { KeyJ: "low", KeyK: "high" };
      if (event.code in p1 && mode !== "demo") { event.preventDefault(); tap(0, p1[event.code]); }
      if (event.code in p2 && mode === "local") { event.preventDefault(); tap(1, p2[event.code]); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mode, tap]);

  useEffect(() => {
    if (!running || winner || beat < 1) return;
    const timers: number[] = [];
    if (mode === "demo") timers.push(window.setTimeout(() => tap(0, beat % 7 === 0 ? (pitch === "high" ? "low" : "high") : pitch, 50), 480));
    if (mode === "demo" || mode === "solo") timers.push(window.setTimeout(() => tap(1, beat % 5 === 0 ? (pitch === "high" ? "low" : "high") : pitch, 62), 480));
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [beat, mode, pitch, running, tap, winner]);

  const controllers = mode === "local" ? ["HUMAN · F低 G高", "HUMAN · J低 K高"] : mode === "solo" ? ["HUMAN · F低 G高", "RHYTHM BOT"] : ["RHYTHM BOT", "RHYTHM BOT"];
  return (
    <>
      <div className="game-wrap rhythm-wrap">
        <div className="title-row mini-title"><div><p>原创循环曲《屁之二重奏》· 分辨高低音</p><h1>跟着旋律<br /><span>精准放屁！</span></h1></div><div className="mini-rules"><p><b>低音</b> F / J</p><p><b>高音</b> G / K</p><p><b>MISS</b> 立刻爆炸</p></div></div>
        <div className="well-toolbar"><div className="battle-modes" aria-label="对战方式"><button className={mode === "local" ? "active" : ""} onClick={() => changeMode("local")}>双人键盘</button><button className={mode === "solo" ? "active" : ""} onClick={() => changeMode("solo")}>1P 对机器人</button><button className={mode === "demo" ? "active" : ""} onClick={() => changeMode("demo")}>机器人演示</button></div><div className="song-status"><span>♪ 屁之二重奏</span><b>{running ? (pitch === "high" ? "当前：高音" : "当前：低音") : "开始后自动播放"}</b></div><div className="well-actions"><span>{running ? `第 ${beat} 拍` : winner ? "比赛结束" : "准备好后开始"}</span><button className="start-well" onClick={running ? reset : start}>{running ? "停止" : winner ? "再来一局" : "播放并开始"}</button></div></div>
        <div className="rhythm-grid">
          {players.map((player, index) => <section className={`rhythm-player ${index === 1 ? "blue" : ""}`} key={player.name} aria-label={`${player.name} 的节奏赛道`}><header><div><span>{controllers[index]}</span><h2>{player.name}</h2></div><strong>{player.score}<small>/{RHYTHM_GOAL}</small></strong></header><div className={`beat-lane pitch-${pitch}`}><div className="pitch-rail high"><span>高音</span></div><div className="pitch-rail low"><span>低音</span></div><div className="beat-target"><span>判定区</span></div>{running && <i className={`beat-orb note-${pitch}`} key={`${beat}-${index}`}>♪</i>}{player.status === "bomb" && <div className="rhythm-bomb" key={`bomb-${beat}-${index}`}>💥</div>}<b className={`grade ${player.status}`}>{player.status === "hit" ? "HIT!" : player.status === "bomb" ? "炸飞!" : running ? (pitch === "high" ? "准备高音" : "准备低音") : "等待歌曲"}</b></div><div className="rhythm-foot"><div className="rhythm-keys"><kbd>{index === 0 ? "F" : "J"}<small>低</small></kbd><kbd>{index === 0 ? "G" : "K"}<small>高</small></kbd></div><span>连击 ×{player.combo}</span><div><i style={{ width: `${player.score / RHYTHM_GOAL * 100}%` }} /></div></div></section>)}
        </div>
        <footer className="footer-note"><span>地图 4：高低音节奏屁</span><span className="future">音符进入狭窄判定区时按对应高/低音键；按错、过早、过晚或漏拍都会爆炸</span><button onClick={reset}>↻ 重置比赛</button></footer>
      </div>
      {winner && <div className="winner-overlay" role="dialog" aria-modal="true" aria-label="比赛结果"><div className="winner-card rhythm-win"><span className="crown">♛</span><p>旋律全部拿捏</p><h2>{winner}</h2><h3>史诗级音准屁王</h3><div className="final-score">{players[0].score} <span>:</span> {players[1].score}</div><button onClick={start}>再来一曲</button></div></div>}
    </>
  );
}

export default function Home() {
  const [map, setMap] = useState<"match3" | "well" | "pull" | "rhythm">("match3");
  const [soundOn, setSoundOn] = useState(false);
  const audio = useRef<AudioContext | null>(null);

  const ensureSound = useCallback(async () => {
    let context = audio.current;
    if (!context || context.state === "closed") {
      const AudioCtor = window.AudioContext || (window as typeof window & { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      context = new AudioCtor(); audio.current = context;
    }
    if (context.state === "suspended") await context.resume();
    setSoundOn(true);
  }, []);

  const toggleSound = useCallback(async () => {
    if (soundOn) {
      const current = audio.current; audio.current = null;
      if (current && current.state !== "closed") await current.close();
      setSoundOn(false); return;
    }
    await ensureSound();
  }, [ensureSound, soundOn]);

  const emitFart = useCallback((power: number) => {
    if (soundOn && audio.current) playFart(audio.current, power);
  }, [soundOn]);

  const emitExplosion = useCallback(() => {
    if (soundOn && audio.current) playExplosion(audio.current);
  }, [soundOn]);

  const emitSongNote = useCallback((pitch: RhythmPitch, step: number) => {
    if (soundOn && audio.current) playSongNote(audio.current, pitch, step);
  }, [soundOn]);

  useEffect(() => () => {
    const current = audio.current; audio.current = null;
    if (current && current.state !== "closed") void current.close();
  }, []);

  return (
    <main>
      <header className="topbar">
        <div className="brand"><span className="brand-mark">屁!</span><strong>大屁竞速王</strong><em>PARTY ARENA</em></div>
        <nav className="map-switch" aria-label="选择地图">
          <button className={map === "match3" ? "active" : ""} onClick={() => setMap("match3")}><span>01</span> 消消屁跑</button>
          <button className={map === "well" ? "active" : ""} onClick={() => setMap("well")}><span>02</span> 井底屁升</button>
          <button className={map === "pull" ? "active" : ""} onClick={() => setMap("pull")}><span>03</span> 屁力拔河</button>
          <button className={map === "rhythm" ? "active" : ""} onClick={() => setMap("rhythm")}><span>04</span> 节奏放屁</button>
        </nav>
        <button className={`sound ${soundOn ? "on" : ""}`} onClick={toggleSound} aria-pressed={soundOn} aria-label={soundOn ? "关闭声音" : "开启声音"}>{soundOn ? (map === "rhythm" ? "🎵💨 声音已开" : "💨 屁声已开") : (map === "rhythm" ? "🔇 开启歌曲" : "🔇 开启屁声")}</button>
      </header>
      {map === "match3" && <Match3Arena onFart={emitFart} />}
      {map === "well" && <WellArena onFart={emitFart} onExplosion={emitExplosion} />}
      {map === "pull" && <PullArena onFart={emitFart} onExplosion={emitExplosion} />}
      {map === "rhythm" && <RhythmArena onFart={emitFart} onExplosion={emitExplosion} onSongNote={emitSongNote} onEnsureSound={ensureSound} />}
    </main>
  );
}
