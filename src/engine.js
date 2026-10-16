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

const BOSS_NAMES = ['毛帽大王', '毛帽大王・怒', '毛帽皇帝', '永夜毛帽'];

function floorScale(floor) {
  // 前期線性成長、後期緩慢指數，確保「無限」地城終究會打倒你
  return (1 + .3 * (floor - 1)) * Math.pow(1.14, floor - 1);
}

function createEnemy(floor, node) {
  const s = floorScale(floor) * (node === 1 ? 1.08 : 1);
  if (FLOOR_NODES[node] === 'boss') {
    const tier = Math.floor((floor - 1) / 3);
    return {
      boss: true, sprite: 'boss',
      name: BOSS_NAMES[Math.min(tier, BOSS_NAMES.length - 1)],
      tag: '狂暴・重擊',
      hue: (tier * 70) % 360,
      maxHp: Math.round(38 * 2.1 * s), atk: Math.round(8 * 1.05 * s), def: Math.round(3 * 1.4 * s),
      cri: 10, dod: 5, trait: 'boss', enraged: false, turn: 0,
    };
  }
  const types = Object.entries(ENEMY_TYPES).filter(([, t]) => floor >= t.minFloor);
  const [, t] = types[Math.floor(Math.random() * types.length)];
  const elite = floor >= 3 && Math.random() < Math.min(.4, .06 + floor * .03);
  const em = elite ? { hp: 1.5, atk: 1.25 } : { hp: 1, atk: 1 };
  return {
    boss: false, elite, sprite: t.sprite,
    name: (elite ? '菁英・' : '') + t.name, tag: t.tag,
    maxHp: Math.round(38 * t.hp * em.hp * s),
    atk: Math.round(8 * t.atk * em.atk * s),
    def: Math.round(3 * t.def * s),
    cri: 5, dod: t.dod, trait: t.trait, turn: 0,
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

    if (e.boss && !e.enraged && e.hp < e.maxHp / 2) {
      e.enraged = true;
      e.atk = Math.round(e.atk * 1.3);
      yield { type: 'enrage' };
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

    const smash = e.boss && e.turn % 4 === 0;
    if (e.boss && e.turn % 4 === 3) yield { type: 'charge' };

    if (!smash && chance(p.dod)) {
      yield { type: 'miss', who: 'enemy' };
    } else {
      const crit = !smash && chance(e.cri);
      const def = e.trait === 'pierce' ? p.def / 2 : p.def;
      const dmg = calcDamage(e.atk, def, smash ? 2 : crit ? 1.5 : 1);
      p.hp = Math.max(0, p.hp - dmg);
      const ev = { type: 'hit', who: 'enemy', dmg, crit, smash };
      if (e.trait === 'leech') { const h = Math.round(dmg * .5); e.hp = Math.min(e.maxHp, e.hp + h); ev.heal = h; }
      if (e.trait === 'poison' && chance(45)) { p.poison = 3; ev.poisoned = true; }
      yield ev;
      if (p.thorn && p.hp > 0) {
        const td = Math.max(1, Math.round(dmg * p.thorn / 100));
        e.hp = Math.max(0, e.hp - td);
        yield { type: 'thorn', dmg: td };
        if (e.hp <= 0) { yield { type: 'win' }; return 'win'; }
      }
      if (p.hp <= 0) { const r = yield* tryRevive(p); if (!r) return 'lose'; }
    }

    if (e.trait === 'regen' && e.hp < e.maxHp) {
      const h = Math.min(e.maxHp - e.hp, Math.round(e.maxHp * .05));
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
  module.exports = { createPlayer, createEnemy, battle, floorScale, FLOOR_NODES, ENEMY_TYPES };
}
