// =====================================================
//  無限地城 — UI 與遊戲流程
//  邏輯在 src/engine.js、卡牌在 src/cards.js、像素圖在 src/sprites.js
// =====================================================

const $ = id => document.getElementById(id);
const store = {
  get(k, d) { try { const v = localStorage.getItem('idg_' + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('idg_' + k, JSON.stringify(v)); } catch { /* 無痕模式等情況就略過 */ } },
};

// ---------------- 像素圖 ----------------
const spriteCache = {};
function spriteCanvas(name) {
  const sp = SPRITES[name];
  const h = sp.px.length, w = sp.px[0].length;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  sp.px.forEach((row, y) => {
    for (let x = 0; x < w; x++) {
      const ch = row[x];
      if (ch === '.') continue;
      ctx.fillStyle = sp.pal[ch];
      ctx.fillRect(x, y, 1, 1);
    }
  });
  return c;
}
function spriteURL(name) {
  return spriteCache[name] || (spriteCache[name] = spriteCanvas(name).toDataURL());
}
function spriteEl(name, scale) {
  const c = spriteCanvas(name);
  c.style.width = c.width * scale + 'px';
  c.style.height = c.height * scale + 'px';
  return c;
}
function paintIcons(root = document) {
  root.querySelectorAll('.icon[data-icon]').forEach(el => {
    el.style.background = `url(${spriteURL('ic_' + el.dataset.icon)}) center / contain no-repeat`;
  });
}
const iconHTML = name => `<i class="icon" data-icon="${name}"></i>`;

// ---------------- 音效（WebAudio 小合成器，不需要音檔） ----------------
const sfx = (() => {
  let ac = null, on = store.get('sound', true);
  function tone(freq, dur, type = 'square', vol = .06, slide = 0) {
    if (!on) return;
    try {
      ac = ac || new (window.AudioContext || window.webkitAudioContext)();
      const o = ac.createOscillator(), g = ac.createGain(), t = ac.currentTime;
      o.type = type; o.frequency.setValueAtTime(freq, t);
      if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
      g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
      o.connect(g).connect(ac.destination); o.start(t); o.stop(t + dur);
    } catch { /* 沒有音訊也沒關係 */ }
  }
  return {
    get on() { return on; },
    toggle() { on = !on; store.set('sound', on); return on; },
    hit: () => tone(180, .09, 'square', .05, -90),
    crit: () => { tone(520, .08, 'square', .05, 300); setTimeout(() => tone(260, .14, 'sawtooth', .05, -150), 50); },
    hurt: () => tone(120, .14, 'sawtooth', .06, -60),
    miss: () => tone(700, .07, 'triangle', .04, 400),
    heal: () => tone(660, .12, 'triangle', .04, 220),
    pick: () => { tone(440, .06, 'square', .04); setTimeout(() => tone(880, .1, 'square', .04), 60); },
    win: () => [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => tone(f, .12, 'square', .045), i * 90)),
    lose: () => [392, 330, 262, 196].forEach((f, i) => setTimeout(() => tone(f, .22, 'triangle', .06), i * 160)),
    boss: () => [110, 104, 98].forEach((f, i) => setTimeout(() => tone(f, .3, 'sawtooth', .06), i * 220)),
  };
})();

// ---------------- 背景（低解析度畫布，依樓層換主題） ----------------
const THEMES = [
  { wall: '#3b3350', wall2: '#2e2742', mortar: '#1e1a2b', floor: '#4a3f5e', floor2: '#3d3450', sky: '#140f1d' }, // 石牢
  { wall: '#2f4a3a', wall2: '#253b2e', mortar: '#152219', floor: '#3e5a42', floor2: '#334b37', sky: '#0d1610' }, // 苔蘚
  { wall: '#5a2f36', wall2: '#47252b', mortar: '#25121a', floor: '#6a3a3a', floor2: '#552f30', sky: '#180a0e' }, // 熔岩
  { wall: '#334a66', wall2: '#283b52', mortar: '#141f2e', floor: '#46607d', floor2: '#3a5068', sky: '#0b1220' }, // 冰窟
  { wall: '#2a2238', wall2: '#211a2d', mortar: '#0d0a14', floor: '#352a48', floor2: '#2b223b', sky: '#07050c' }, // 虛空
];
const bg = (() => {
  const cv = $('bg'), ctx = cv.getContext('2d');
  let theme = THEMES[0], frame = 0;
  function draw() {
    const W = cv.width, H = cv.height, horizon = 64;
    ctx.fillStyle = theme.mortar; ctx.fillRect(0, 0, W, horizon);
    for (let row = 0; row * 8 < horizon; row++) {
      const off = row % 2 ? 8 : 0;
      for (let x = -16 + off; x < W; x += 16) {
        ctx.fillStyle = (Math.sin(x * 3.1 + row * 7.7) > .6) ? theme.wall2 : theme.wall;
        ctx.fillRect(x + 1, row * 8 + 1, 14, 6);
      }
    }
    // 拱門
    ctx.fillStyle = theme.sky;
    ctx.fillRect(66, 22, 28, 42); ctx.fillRect(68, 18, 24, 4); ctx.fillRect(72, 16, 16, 2);
    ctx.fillStyle = theme.mortar; ctx.fillRect(66, 22, 1, 42); ctx.fillRect(93, 22, 1, 42);
    // 地板
    for (let y = horizon; y < H; y += 6) {
      for (let x = 0; x < W; x += 12) {
        ctx.fillStyle = ((x / 12 + (y - horizon) / 6) % 2) ? theme.floor : theme.floor2;
        ctx.fillRect(x, y, 12, 6);
      }
    }
    ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(0, horizon, W, 2);
    // 火把
    [24, 136].forEach((tx, i) => {
      ctx.fillStyle = '#3a2414'; ctx.fillRect(tx - 1, 34, 3, 10);
      ctx.fillStyle = '#6b4a2a'; ctx.fillRect(tx - 2, 32, 5, 3);
      const f = (frame + i) % 3;
      ctx.fillStyle = '#ff8a2a'; ctx.fillRect(tx - 2, 26 - f, 5, 6 + f);
      ctx.fillStyle = '#ffd23a'; ctx.fillRect(tx - 1, 28 - f, 3, 4 + f);
      ctx.fillStyle = '#fff3c4'; ctx.fillRect(tx, 30, 1, 2);
      const glow = ctx.createRadialGradient(tx, 30, 1, tx, 30, 22);
      glow.addColorStop(0, 'rgba(255,160,60,.22)'); glow.addColorStop(1, 'rgba(255,160,60,0)');
      ctx.fillStyle = glow; ctx.fillRect(tx - 24, 6, 48, 48);
    });
    // 暗角
    const v = ctx.createRadialGradient(W / 2, H / 2, 30, W / 2, H / 2, 100);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,.55)');
    ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
  }
  setInterval(() => { frame++; draw(); }, 180);
  return { setFloor(f) { theme = THEMES[Math.floor((f - 1) / 3) % THEMES.length]; draw(); } };
})();

// ---------------- 狀態 ----------------
const SPEEDS = [1, 2, 4];
let speedIdx = Math.min(store.get('speed', 0), SPEEDS.length - 1);
let P = null;           // 玩家
let run = null;         // { floor, node, kills, cards, dmg }
let currentFoe = null;

const wait = ms => new Promise(r => setTimeout(r, ms / SPEEDS[speedIdx]));
const pxScale = () => Math.max(3, Math.min(5, Math.floor($('scene').clientWidth / 100)));

// ---------------- 介面更新 ----------------
const lastStats = {};
function renderStats() {
  const vals = { atk: P.atk, def: P.def, cri: P.cri + '%', dod: P.dod + '%' };
  for (const [k, v] of Object.entries(vals)) {
    const el = $('s-' + k);
    if (lastStats[k] !== undefined && lastStats[k] !== v) {
      const box = el.parentElement; box.classList.remove('bump'); void box.offsetWidth; box.classList.add('bump');
    }
    lastStats[k] = v; el.textContent = v;
  }
  const perks = [];
  if (P.crd !== 150) perks.push(['crd', '爆傷', P.crd + '%']);
  if (P.ls) perks.push(['ls', '吸血', P.ls + '%']);
  if (P.thorn) perks.push(['thorn', '反彈', P.thorn + '%']);
  if (P.double) perks.push(['sword', '追擊', P.double + '%']);
  if (P.revive) perks.push(['revive', '復活', 'x' + P.revive]);
  $('perks').innerHTML = perks.map(([i, k, v]) => `<span>${iconHTML(i)}${k}<b>${v}</b></span>`).join('');
  paintIcons($('perks'));
}

function setBar(prefix, hp, max) {
  const pct = Math.max(0, hp / max * 100) + '%';
  $(prefix + '-hp').style.width = pct;
  $(prefix + '-hp-lag').style.width = pct;
  $(prefix + '-hp-text').textContent = `${Math.max(0, Math.ceil(hp))} / ${max}`;
}
function renderHero() {
  setBar('hero', P.hp, P.maxHp);
  $('hero-hp').parentElement.classList.toggle('low', P.hp / P.maxHp < .3);
  const st = [];
  if (P.poison > 0) st.push(`<span class="st-poison">☠ 中毒 ${P.poison}</span>`);
  if (P.revive) st.push(`<span class="st-revive">${iconHTML('revive')} 鳳凰羽</span>`);
  $('hero-status').innerHTML = st.join('');
  paintIcons($('hero-status'));
  $('hero').classList.toggle('poisoned', P.poison > 0);
}
function renderFoe() {
  const e = currentFoe; if (!e) return;
  setBar('foe', e.hp, e.maxHp);
  const st = [];
  if (e.enraged) st.push('<span class="st-enrage">狂暴</span>');
  if (e.boss) st.push(`<span class="st-charge">重擊倒數 ${4 - (e.turn % 4)}</span>`);
  $('foe-status').innerHTML = st.join('');
}

function renderTrack() {
  const icons = { battle: 'atk', camp: 'camp', boss: 'skull' };
  $('track').innerHTML = FLOOR_NODES.map((t, i) => {
    const cls = i < run.node ? 'done' : i === run.node ? 'now' : '';
    const line = i < FLOOR_NODES.length - 1 ? '<span class="line"></span>' : '';
    return `<li class="${cls}"><span class="node" title="${{ battle: '戰鬥', camp: '營火', boss: '首領' }[t]}">${iconHTML(icons[t])}</span>${line}</li>`;
  }).join('');
  paintIcons($('track'));
  $('floor-num').textContent = run.floor;
}

function log(msg, cls = '') {
  const p = document.createElement('p');
  if (cls) p.className = cls;
  p.textContent = msg;
  const box = $('log');
  box.appendChild(p);
  while (box.children.length > 6) box.firstChild.remove();
}

function retrigger(el, cls) { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); }
function shake(big) { retrigger($('scene'), big ? 'shake-big' : 'shake'); }

function floatText(target, text, cls) {
  const scene = $('scene').getBoundingClientRect();
  const r = $(target).querySelector('canvas').getBoundingClientRect();
  const d = document.createElement('div');
  d.className = 'float ' + cls;
  d.textContent = text;
  d.style.left = (r.left - scene.left + r.width / 2 + (Math.random() * 24 - 12)) + 'px';
  d.style.top = (r.top - scene.top + r.height * .25) + 'px';
  $('fx').appendChild(d);
  setTimeout(() => d.remove(), 1000);
}

function burst(target, colors) {
  const scene = $('scene').getBoundingClientRect();
  const r = $(target).querySelector('canvas').getBoundingClientRect();
  for (let i = 0; i < 16; i++) {
    const d = document.createElement('div');
    d.className = 'particle';
    const a = Math.random() * Math.PI * 2, dist = 30 + Math.random() * 50;
    d.style.left = (r.left - scene.left + r.width / 2) + 'px';
    d.style.top = (r.top - scene.top + r.height / 2) + 'px';
    d.style.background = colors[i % colors.length];
    d.style.setProperty('--dx', Math.cos(a) * dist + 'px');
    d.style.setProperty('--dy', Math.sin(a) * dist + 'px');
    $('fx').appendChild(d);
    setTimeout(() => d.remove(), 800);
  }
}

async function banner(html, cls) {
  const b = $('banner');
  b.className = cls; b.innerHTML = html;
  b.classList.remove('hidden');
  await wait(1400);
  b.classList.add('hidden');
}

function placeHero() {
  const w = $('hero').querySelector('.sprite-wrap');
  w.innerHTML = ''; w.appendChild(spriteEl('hero', pxScale()));
  $('hero').className = 'fighter';
}

// ---------------- 覆蓋層 ----------------
function showModal(html) {
  $('modal').innerHTML = html;
  paintIcons($('modal'));
  $('overlay').classList.remove('hidden');
}
function hideModal() { $('overlay').classList.add('hidden'); }

// 讓玩家從選項中選一個；options: [{ html, cls, color, value }]
function choose(title, sub, options) {
  return new Promise(resolve => {
    showModal(`<h2>${title}</h2><p class="sub">${sub}</p><div class="cards">${
      options.map((o, i) => `<button class="card ${o.cls || ''}" style="--rc:${o.color}" data-i="${i}">${o.html}<span class="key">${i + 1}</span></button>`).join('')
    }</div>`);
    const done = i => {
      document.removeEventListener('keydown', onKey);
      sfx.pick(); hideModal(); resolve(options[i].value);
    };
    const onKey = e => { const i = parseInt(e.key, 10) - 1; if (i >= 0 && i < options.length) done(i); };
    document.addEventListener('keydown', onKey);
    $('modal').querySelectorAll('.card').forEach(b => b.addEventListener('click', () => done(+b.dataset.i)));
    $('modal').querySelector('.card')?.focus({ preventScroll: true });
  });
}

function cardOption(card) {
  const r = RARITY[card.rarity];
  return {
    cls: card.rarity, color: r.color, value: card,
    html: `<span class="art">${iconHTML(card.icon)}</span><span class="body"><span class="name">${card.name}<span class="rar">${r.name}</span></span><span class="desc">${card.desc(cardScale(run.floor))}</span></span>`,
  };
}

async function pickCard(source, extra = []) {
  const cards = drawCards(P, run.floor, source, source === 'camp' ? 2 : 3);
  const titles = { battle: '戰利品', camp: '營火', boss: '首領寶箱' };
  const subs = { battle: '選一張卡強化自己', camp: '休息，或是鍛鍊自己', boss: '擊敗首領！挑選一件稀有寶物' };
  const pick = await choose(titles[source], subs[source], [...extra, ...cards.map(cardOption)]);
  if (typeof pick === 'function') { pick(); return; }
  pick.apply(P, cardScale(run.floor));
  run.cards++;
  log(`獲得「${pick.name}」：${pick.desc(cardScale(run.floor))}`, 'c-good');
  renderStats(); renderHero();
}

// ---------------- 戰鬥播放 ----------------
async function fight(enemy) {
  currentFoe = enemy;
  const foe = $('foe'), plate = $('foe-plate');
  const wrap = foe.querySelector('.sprite-wrap');
  wrap.innerHTML = '';
  const cv = spriteEl(enemy.sprite, pxScale());
  if (enemy.hue) cv.style.filter = `hue-rotate(${enemy.hue}deg)`;
  wrap.appendChild(cv);
  foe.className = 'fighter enter' + (enemy.boss ? ' boss' : '') + (enemy.elite ? ' elite' : '') +
    (['bat', 'ghost'].includes(enemy.sprite) ? ' flying' : '');
  plate.className = 'plate' + (enemy.boss ? ' boss' : enemy.elite ? ' elite' : '');
  $('foe-name').textContent = enemy.name;
  $('foe-tag').textContent = enemy.tag;
  $('camp').classList.add('hidden');

  if (enemy.boss) { sfx.boss(); await banner(`首領出現！<small>${enemy.name}</small>`, 'boss'); }
  else log(`${enemy.name} 擋住了去路！`, 'c-sys');

  const gen = battle(P, enemy);
  let step, result = null;
  while (!(step = gen.next()).done) {
    const ev = step.value;
    renderFoe();
    switch (ev.type) {
      case 'start': renderFoe(); await wait(500); break;

      case 'hit':
        if (ev.who === 'player') {
          retrigger($('hero'), 'lunge-r'); await wait(120);
          retrigger(foe, 'hurt');
          floatText('foe', ev.dmg, ev.crit ? 'crit' : '');
          if (ev.crit) { sfx.crit(); shake(); } else sfx.hit();
          run.dmg += ev.dmg;
          log(`${ev.extra ? '追擊！' : ''}你${ev.crit ? '爆擊' : '攻擊'}造成 ${ev.dmg} 傷害`, ev.crit ? 'c-crit' : '');
          if (ev.heal) { floatText('hero', '+' + ev.heal, 'heal'); }
        } else {
          foe.classList.remove('charging');
          retrigger(foe, 'lunge-l'); await wait(120);
          retrigger($('hero'), 'hurt');
          floatText('hero', ev.dmg, ev.smash ? 'smash' : 'foe-dmg');
          sfx.hurt(); if (ev.smash || ev.crit) shake(ev.smash);
          log(`${enemy.name}${ev.smash ? '使出重擊' : ev.crit ? '爆擊' : '攻擊'}，造成 ${ev.dmg} 傷害`, 'c-bad');
          if (ev.heal) { floatText('foe', '+' + ev.heal, 'heal'); log(`${enemy.name} 吸取了 ${ev.heal} 生命`, 'c-bad'); }
          if (ev.poisoned) log('你中毒了！（3 回合）', 'c-poison');
        }
        break;

      case 'miss':
        sfx.miss();
        if (ev.who === 'player') { retrigger($('hero'), 'lunge-r'); retrigger(foe, 'dodge-r'); floatText('foe', 'MISS', 'miss'); log(`${enemy.name} 閃過了攻擊`); }
        else { retrigger(foe, 'lunge-l'); retrigger($('hero'), 'dodge-l'); floatText('hero', 'MISS', 'miss'); log('你閃避了攻擊！', 'c-good'); }
        break;

      case 'poison': floatText('hero', ev.dmg, 'poison'); log(`毒性發作，損失 ${ev.dmg} 生命`, 'c-poison'); break;
      case 'thorn': retrigger(foe, 'hurt'); floatText('foe', ev.dmg, 'thorn'); log(`荊棘反彈 ${ev.dmg} 傷害`, 'c-good'); break;
      case 'regen': floatText('foe', '+' + ev.heal, 'heal'); log(`${enemy.name} 再生了 ${ev.heal} 生命`); break;
      case 'enrage': foe.classList.add('enraged'); shake(true); sfx.boss(); log(`${enemy.name} 進入狂暴狀態！攻擊大幅提升`, 'c-bad'); break;
      case 'charge': foe.classList.add('charging'); log(`${enemy.name} 正在蓄力……下一擊無法閃避！`, 'c-bad'); break;
      case 'revive': retrigger($('hero'), 'revive'); sfx.heal(); burst('hero', ['#ffd23a', '#ff8a2a', '#fff3c4']); log('鳳凰羽燃燒！你從灰燼中復活', 'c-crit'); break;

      case 'win':
        result = 'win';
        run.kills++;
        burst('foe', ['#fff', '#ffd23a', '#ff8a2a', '#c66bff']);
        foe.classList.add('die'); sfx.win();
        log(`擊敗了 ${enemy.name}！`, 'c-good');
        break;
      case 'lose':
        result = 'lose';
        $('hero').classList.add('fall'); sfx.lose();
        log('你倒下了……', 'c-bad');
        break;
    }
    renderHero(); renderFoe();
    await wait(ev.type === 'hit' || ev.type === 'miss' ? 520 : 420);
  }
  renderStats();
  await wait(500);
  foe.classList.add('hidden');
  plate.classList.add('hidden');
  currentFoe = null;
  return result;
}

// ---------------- 主流程 ----------------
async function playRun() {
  P = createPlayer();
  run = { floor: 1, node: 0, kills: 0, cards: 0, dmg: 0 };
  Object.keys(lastStats).forEach(k => delete lastStats[k]);
  $('log').innerHTML = '';
  placeHero();
  bg.setFloor(1);
  renderStats(); renderHero(); renderTrack();
  log('布丁小雞踏入了無限地城……', 'c-sys');

  while (true) {
    renderTrack();
    const type = FLOOR_NODES[run.node];

    if (type === 'camp') {
      const camp = $('camp');
      camp.querySelector('.sprite-wrap').innerHTML = '';
      camp.querySelector('.sprite-wrap').appendChild(spriteEl('ic_camp', pxScale() + 2));
      camp.classList.remove('hidden');
      log('發現了一處營火。', 'c-sys');
      await wait(600);
      const heal = Math.round(P.maxHp * .5);
      await pickCard('camp', [{
        color: '#ff8a2a', value: () => {
          const h = Math.min(heal, P.maxHp - P.hp); P.hp += h; P.poison = 0;
          floatText('hero', '+' + h, 'heal'); sfx.heal(); log(`在營火旁休息，回復 ${h} 生命`, 'c-good'); renderHero();
        },
        html: `<span class="art">${iconHTML('camp')}</span><span class="body"><span class="name">休息<span class="rar" style="color:#ff8a2a">營火</span></span><span class="desc">回復 50% 生命（${heal}）並解除中毒</span></span>`,
      }]);
      camp.classList.add('hidden');
      run.node++;
      continue;
    }

    $('foe').classList.remove('hidden');
    $('foe-plate').classList.remove('hidden');
    const enemy = createEnemy(run.floor, run.node);
    const result = await fight(enemy);
    if (result === 'lose') return gameOver();

    if (type === 'boss') {
      P.hp = P.maxHp; P.poison = 0; renderHero();
      await pickCard('boss');
      run.floor++; run.node = 0;
      bg.setFloor(run.floor);
      renderTrack();
      await banner(`第 ${run.floor} 層<small>生命已完全恢復・怪物變得更強了</small>`, 'clear');
      log(`進入第 ${run.floor} 層`, 'c-sys');
    } else {
      const h = Math.min(Math.round(P.maxHp * .15), P.maxHp - P.hp);
      if (h > 0) { P.hp += h; floatText('hero', '+' + h, 'heal'); renderHero(); }
      await pickCard(enemy.elite ? 'camp' : 'battle');
      run.node++;
    }
  }
}

function gameOver() {
  const best = store.get('best', 0);
  const isNew = run.floor > best;
  if (isNew) store.set('best', run.floor);
  showModal(`
    <h2>冒險結束</h2>
    <p class="sub">布丁小雞在第 ${run.floor} 層倒下了</p>
    <div class="summary">
      <div>抵達樓層<b class="${isNew ? 'new' : ''}">${run.floor}F${isNew ? ' NEW!' : ''}</b></div>
      <div>最佳紀錄<b>${Math.max(best, run.floor)}F</b></div>
      <div>擊敗怪物<b>${run.kills}</b></div>
      <div>總傷害<b>${run.dmg.toLocaleString()}</b></div>
    </div>
    <button id="btn-again" class="px-btn primary">再挑戰一次</button>`);
  $('btn-again').onclick = () => { hideModal(); playRun(); };
  $('btn-again').focus();
}

function titleScreen() {
  const best = store.get('best', 0);
  showModal(`
    <h1 class="logo">無限地城</h1>
    <p class="logo-en">INFINITE DUNGEON</p>
    <div class="title-art"></div>
    <div class="how">
      每層有 <b>2 場戰鬥 → 營火 → 首領</b>。<br>
      戰鬥自動進行，勝利後從 3 張卡中挑 1 張強化。<br>
      首領血量過半會<b>狂暴</b>，每 4 回合施放<b>無法閃避的重擊</b>。<br>
      快捷鍵：<b>1 / 2 / 3</b> 選卡、<b>S</b> 切換速度、<b>M</b> 音效
    </div>
    ${best ? `<div class="best">最佳紀錄 <b>${best}F</b></div>` : ''}
    <button id="btn-start" class="px-btn primary">開始冒險</button>`);
  const art = $('modal').querySelector('.title-art');
  art.append(spriteEl('hero', 4), spriteEl('slime', 3), spriteEl('boss', 4));
  $('btn-start').onclick = () => { hideModal(); playRun(); };
  $('btn-start').focus();
}

// ---------------- 控制 ----------------
function renderControls() {
  $('btn-speed').textContent = 'x' + SPEEDS[speedIdx];
  $('btn-sound').classList.toggle('off', !sfx.on);
}
$('btn-speed').onclick = () => { speedIdx = (speedIdx + 1) % SPEEDS.length; store.set('speed', speedIdx); renderControls(); };
$('btn-sound').onclick = () => { sfx.toggle(); renderControls(); };
document.addEventListener('keydown', e => {
  if (e.key === 's' || e.key === 'S') $('btn-speed').click();
  if (e.key === 'm' || e.key === 'M') $('btn-sound').click();
});

// ---------------- 啟動 ----------------
paintIcons();
renderControls();
bg.setFloor(1);
placeHero();
P = createPlayer();
run = { floor: 1, node: 0, kills: 0, cards: 0, dmg: 0 };
renderStats(); renderHero(); renderTrack();
titleScreen();
