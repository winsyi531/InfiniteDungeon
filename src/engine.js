// 戰鬥引擎：純邏輯，不碰 DOM。
// battle() 是一個 generator，每一步 yield 一個事件，讓 UI 依自己的節奏播放動畫。

const FLOOR_NODES = ['battle', 'battle', 'camp', 'boss'];

function createPlayer() {
  return {
    hp: 120, maxHp: 120,
    atk: 12, def: 4,
    cri: 5, crd: 150,   // 爆擊率 %、爆擊傷害 %
    dod: 5,             // 閃避 %
    ls: 0,              // 吸血 %
    thorn: 0,           // 反彈 %
    double: 0,          // 追擊機率 %
    revive: 0,          // 復活次數
    poison: 0,          // 中毒剩餘回合
  };
}

const ENEMY_TYPES = {
  slime:    { name: '史萊姆',   sprite: 'slime',    minFloor: 1, hp: 1.3, atk: .8,  def: .6, dod: 0,
              trait: 'regen',  tag: '再生' },
  bat:      { name: '吸血蝙蝠', sprite: 'bat',      minFloor: 1, hp: .75, atk: .9, def: .4, dod: 18,
              trait: 'leech',  tag: '吸血・敏捷' },
  mushroom: { name: '毒菇怪',   sprite: 'mushroom', minFloor: 1, hp: 1.0, atk: .8, def: .8, dod: 0,
              trait: 'poison', tag: '劇毒' },
  skeleton: { name: '骷髏劍士', sprite: 'skeleton', minFloor: 2, hp: 1.0, atk: 1.1, def: 1.9, dod: 5,
              trait: null,     tag: '重甲' },
  ghost:    { name: '幽靈',     sprite: 'ghost',    minFloor: 3, hp: .8,  atk: 1.0, def: .5, dod: 25,
              trait: 'pierce', tag: '穿透・虛體' },
};

// 十隻神獸首領。血量過半會「覺醒變形」：換上新外型，並獲得各自的能力
const BOSSES = {
  dragon:   { name: '赤焰龍', awakeName: '煉獄・赤焰龍',   skill: '龍息',     power: '重擊附帶灼燒',
              awaken: e => { e.atk *= 1.3; e.smashBurn = true; } },
  phoenix:  { name: '鳳凰',   awakeName: '涅槃・冰焰鳳凰', skill: '涅槃之火', power: '覺醒時回復 15% 生命',
              awaken: e => { e.atk *= 1.15; e.hp = Math.min(e.maxHp, e.hp + e.maxHp * .15); } },
  tiger:    { name: '白虎',   awakeName: '雷霆・白虎',     skill: '迅雷爪',   power: '30% 機率連擊',
              awaken: e => { e.atk *= 1.2; e.double = 30; } },
  tortoise: { name: '玄武',   awakeName: '深淵・玄武',     skill: '鐵甲衝撞', power: '防禦大幅提升', hp: 1.1,
              awaken: e => { e.atk *= 1.15; e.def *= 1.7; } },
  fox:      { name: '九尾狐', awakeName: '妖月・九尾',     skill: '狐火',     power: '閃避 +20%',
              awaken: e => { e.atk *= 1.25; e.dod += 20; } },
  qilin:    { name: '麒麟',   awakeName: '聖焰・麒麟',     skill: '天雷',     power: '每回合再生 3%',
              awaken: e => { e.atk *= 1.15; e.regen = 3; } },
  azure:    { name: '青龍',   awakeName: '蒼穹・青龍',     skill: '龍捲風暴', power: '每 3 回合重擊一次',
              awaken: e => { e.atk *= 1.25; e.smashEvery = 3; } },
  hydra:    { name: '九頭蛇', awakeName: '劇毒・九頭蛇',   skill: '毒牙齊咬', power: '攻擊 40% 機率中毒',
              awaken: e => { e.atk *= 1.2; e.poisonChance = 40; } },
  griffin:  { name: '獅鷲',   awakeName: '風暴・獅鷲',     skill: '俯衝',     power: '爆擊率 35%',
              awaken: e => { e.atk *= 1.25; e.cri = 35; } },
  kraken:   { name: '克拉肯', awakeName: '深淵・克拉肯',   skill: '纏繞',     power: '攻擊吸血 25%',
              awaken: e => { e.atk *= 1.15; e.leech = 25; } },
};

function floorScale(floor) {
  // 前期線性成長、後期緩慢指數，確保「無限」地城終究會打倒你
  return (1 + .3 * (floor - 1)) * Math.pow(1.14, floor - 1);
}

// 一般怪物的特性轉成數值欄位，戰鬥邏輯只看這些欄位
const TRAIT_FIELDS = {
  regen: { regen: 5 }, leech: { leech: 50 }, poison: { poisonChance: 45 }, pierce: { pierce: true },
};

function createEnemy(floor, node, bossKey) {
  const s = floorScale(floor) * (node === 1 ? 1.08 : 1);
  const base = { turn: 0, regen: 0, leech: 0, poisonChance: 0, double: 0, pierce: false, smashEvery: 0 };
  if (FLOOR_NODES[node] === 'boss') {
    const key = bossKey || Object.keys(BOSSES)[Math.floor(Math.random() * 10)];
    const b = BOSSES[key];
    return {
      ...base, boss: true, key, sprite: 'boss_' + key,
      name: b.name, tag: `${b.skill}・會覺醒`,
      maxHp: Math.round(38 * 2.1 * s * (b.hp || 1)), atk: Math.round(8 * 1.05 * s), def: Math.round(3 * 1.4 * s),
      cri: 10, dod: 5, awake: false, smashEvery: 4,
    };
  }
  const types = Object.entries(ENEMY_TYPES).filter(([, t]) => floor >= t.minFloor);
  const [, t] = types[Math.floor(Math.random() * types.length)];
  const elite = floor >= 3 && Math.random() < Math.min(.4, .06 + floor * .03);
  const em = elite ? { hp: 1.5, atk: 1.25 } : { hp: 1, atk: 1 };
  return {
    ...base, ...(TRAIT_FIELDS[t.trait] || {}),
    boss: false, elite, sprite: t.sprite,
    name: (elite ? '菁英・' : '') + t.name, tag: t.tag,
    maxHp: Math.round(38 * t.hp * em.hp * s),
    atk: Math.round(8 * t.atk * em.atk * s),
    def: Math.round(3 * t.def * s),
    cri: 5, dod: t.dod,
  };
}

const rand = (a, b) => a + Math.random() * (b - a);
const chance = pct => Math.random() * 100 < pct;

// 平滑的減傷公式：防禦等於攻擊力時傷害減半，不會出現「堆防禦就無敵」的斷層
function calcDamage(atk, def, mult = 1) {
  const raw = atk * mult * rand(.9, 1.1);
  return Math.max(1, Math.round(raw * raw / (raw + Math.max(0, def))));
}

function* battle(p, e) {
  e.hp = e.maxHp;
  p.poison = 0;
  yield { type: 'start', enemy: e };

  while (true) {
    // ---- 玩家回合 ----
    const swings = chance(p.double) ? 2 : 1;
    for (let i = 0; i < swings && e.hp > 0; i++) {
      if (chance(e.dod)) { yield { type: 'miss', who: 'player', extra: i > 0 }; continue; }
      const crit = chance(p.cri);
      const dmg = calcDamage(p.atk, e.def, crit ? p.crd / 100 : 1);
      e.hp = Math.max(0, e.hp - dmg);
      const heal = p.ls ? Math.min(p.maxHp - p.hp, Math.round(dmg * p.ls / 100)) : 0;
      p.hp += heal;
      yield { type: 'hit', who: 'player', dmg, crit, heal, extra: i > 0 };
    }
    if (e.hp <= 0) { yield { type: 'win' }; return 'win'; }

    if (e.boss && !e.awake && e.hp < e.maxHp / 2) {
      const b = BOSSES[e.key];
      const before = e.hp;
      e.awake = true;
      b.awaken(e);
      e.atk = Math.round(e.atk); e.def = Math.round(e.def); e.hp = Math.round(e.hp);
      e.name = b.awakeName; e.sprite = 'boss_' + e.key + '_2';
      e.tag = b.power;
      yield { type: 'transform', heal: e.hp - before, power: b.power };
    }

    // ---- 敵人回合 ----
    e.turn++;
    if (p.poison > 0) {
      const pd = Math.max(1, Math.round(p.maxHp * .04));
      p.hp = Math.max(0, p.hp - pd);
      p.poison--;
      yield { type: 'poison', dmg: pd };
      if (p.hp <= 0) { const r = yield* tryRevive(p); if (!r) return 'lose'; }
    }

    const smash = e.boss && e.turn % e.smashEvery === 0;
    if (e.boss && e.turn % e.smashEvery === e.smashEvery - 1) yield { type: 'charge', skill: BOSSES[e.key].skill };

    const foeSwings = smash ? 1 : chance(e.double) ? 2 : 1;
    for (let i = 0; i < foeSwings; i++) {
      if (!smash && chance(p.dod)) { yield { type: 'miss', who: 'enemy' }; continue; }
      const crit = !smash && chance(e.cri);
      const dmg = calcDamage(e.atk, e.pierce ? p.def / 2 : p.def, smash ? 2 : crit ? 1.5 : 1);
      p.hp = Math.max(0, p.hp - dmg);
      const ev = { type: 'hit', who: 'enemy', dmg, crit, smash, extra: i > 0, skill: smash ? BOSSES[e.key].skill : null };
      if (e.leech) { const h = Math.min(e.maxHp - e.hp, Math.round(dmg * e.leech / 100)); if (h > 0) { e.hp += h; ev.heal = h; } }
      if ((smash && e.smashBurn) || (e.poisonChance && chance(e.poisonChance))) {
        p.poison = 3; ev.poisoned = true; ev.burn = smash && e.smashBurn;
      }
      yield ev;
      if (p.thorn && p.hp > 0) {
        const td = Math.max(1, Math.round(dmg * p.thorn / 100));
        e.hp = Math.max(0, e.hp - td);
        yield { type: 'thorn', dmg: td };
        if (e.hp <= 0) { yield { type: 'win' }; return 'win'; }
      }
      if (p.hp <= 0) { const r = yield* tryRevive(p); if (!r) return 'lose'; }
    }

    if (e.regen && e.hp < e.maxHp) {
      const h = Math.min(e.maxHp - e.hp, Math.round(e.maxHp * e.regen / 100));
      e.hp += h;
      yield { type: 'regen', heal: h };
    }
  }
}

function* tryRevive(p) {
  if (p.revive > 0) {
    p.revive--;
    p.hp = Math.round(p.maxHp * .5);
    p.poison = 0;
    yield { type: 'revive' };
    return true;
  }
  yield { type: 'lose' };
  return false;
}

// 給 node 跑平衡模擬用
if (typeof module !== 'undefined') {
  module.exports = { createPlayer, createEnemy, battle, floorScale, FLOOR_NODES, ENEMY_TYPES, BOSSES };
}
