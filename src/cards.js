// 成長卡牌：每張卡有稀有度、圖示、說明與效果。
// 數值型卡牌會隨樓層放大（sc = 樓層倍率），避免後期加成被怪物成長稀釋。

const RARITY = {
  common: { name: '普通', color: '#c9d1e0', weight: 70 },
  rare:   { name: '稀有', color: '#4aa3ff', weight: 25 },
  epic:   { name: '史詩', color: '#c66bff', weight: 5 },
};

const CAP = { cri: 50, dod: 35, ls: 20, thorn: 30 };

const n = (base, sc) => Math.max(1, Math.round(base * sc));

const CARDS = [
  // ---- 普通 ----
  { id: 'whetstone', name: '磨刀石', rarity: 'common', icon: 'atk',
    desc: sc => `攻擊 +${n(3, sc)}`, apply: (p, sc) => { p.atk += n(3, sc); } },
  { id: 'leather', name: '厚皮甲', rarity: 'common', icon: 'def',
    desc: sc => `防禦 +${n(2, sc)}`, apply: (p, sc) => { p.def += n(2, sc); } },
  { id: 'potion', name: '生命藥劑', rarity: 'common', icon: 'hp',
    desc: sc => `最大生命 +${n(20, sc)}，並回復同量`, apply: (p, sc) => { const v = n(20, sc); p.maxHp += v; p.hp += v; } },
  { id: 'eagle', name: '鷹眼', rarity: 'common', icon: 'cri',
    desc: () => '爆擊率 +5%', apply: p => { p.cri = Math.min(CAP.cri, p.cri + 5); }, ok: p => p.cri < CAP.cri },
  { id: 'feather', name: '輕羽靴', rarity: 'common', icon: 'dod',
    desc: () => '閃避率 +4%', apply: p => { p.dod = Math.min(CAP.dod, p.dod + 4); }, ok: p => p.dod < CAP.dod },
  { id: 'bandage', name: '繃帶', rarity: 'common', icon: 'hp',
    desc: () => '立即回復 40% 生命', apply: p => { p.hp = Math.min(p.maxHp, p.hp + Math.round(p.maxHp * .4)); },
    ok: p => p.hp < p.maxHp * .8 },

  // ---- 稀有 ----
  { id: 'steel', name: '精鋼長劍', rarity: 'rare', icon: 'atk',
    desc: sc => `攻擊 +${n(7, sc)}`, apply: (p, sc) => { p.atk += n(7, sc); } },
  { id: 'kite', name: '騎士盾', rarity: 'rare', icon: 'def',
    desc: sc => `防禦 +${n(5, sc)}`, apply: (p, sc) => { p.def += n(5, sc); } },
  { id: 'fang', name: '吸血獠牙', rarity: 'rare', icon: 'ls',
    desc: () => '吸血 +6%（造成傷害時回血）', apply: p => { p.ls = Math.min(CAP.ls, p.ls + 6); }, ok: p => p.ls < CAP.ls },
  { id: 'berserk', name: '狂戰之心', rarity: 'rare', icon: 'atk',
    desc: sc => `攻擊 +${n(11, sc)}，防禦 -${n(2, sc)}`, apply: (p, sc) => { p.atk += n(11, sc); p.def = Math.max(0, p.def - n(2, sc)); } },
  { id: 'rhythm', name: '致命節奏', rarity: 'rare', icon: 'crd',
    desc: () => '爆擊傷害 +35%', apply: p => { p.crd += 35; } },
  { id: 'giant', name: '巨人之血', rarity: 'rare', icon: 'hp',
    desc: sc => `最大生命 +${n(45, sc)}，並回復同量`, apply: (p, sc) => { const v = n(45, sc); p.maxHp += v; p.hp += v; } },
  { id: 'thorns', name: '荊棘甲', rarity: 'rare', icon: 'thorn',
    desc: () => '反彈 15% 受到的傷害', apply: p => { p.thorn = Math.min(CAP.thorn, p.thorn + 15); }, ok: p => p.thorn < CAP.thorn },

  // ---- 史詩 ----
  { id: 'dragon', name: '龍鱗', rarity: 'epic', icon: 'def',
    desc: sc => `防禦 +${n(8, sc)}，最大生命 +${n(40, sc)}`, apply: (p, sc) => { p.def += n(8, sc); const v = n(40, sc); p.maxHp += v; p.hp += v; } },
  { id: 'slayer', name: '屠龍刃', rarity: 'epic', icon: 'atk',
    desc: sc => `攻擊 +${n(16, sc)}，爆擊率 +5%`, apply: (p, sc) => { p.atk += n(16, sc); p.cri = Math.min(CAP.cri, p.cri + 5); } },
  { id: 'phantom', name: '幻影步', rarity: 'epic', icon: 'dod',
    desc: () => '閃避 +8%，爆擊率 +8%', apply: p => { p.dod = Math.min(CAP.dod, p.dod + 8); p.cri = Math.min(CAP.cri, p.cri + 8); },
    ok: p => p.dod < CAP.dod || p.cri < CAP.cri },
  { id: 'phoenix', name: '鳳凰羽', rarity: 'epic', icon: 'revive',
    desc: () => '倒下時以 50% 生命復活一次', apply: p => { p.revive += 1; }, ok: p => p.revive < 1 },
  { id: 'twin', name: '雙刃', rarity: 'epic', icon: 'sword',
    desc: () => '每次攻擊有 25% 機率追加一擊', apply: p => { p.double = Math.min(50, p.double + 25); }, ok: p => p.double < 50 },
];

// 卡牌數值倍率
function cardScale(floor) { return 1 + .1 * (floor - 1); }

// 依樓層與來源抽出不重複的 3 張卡
// source: 'battle' | 'camp' | 'boss'
function drawCards(player, floor, source, count = 3) {
  const weights = {
    battle: { common: 70, rare: 25, epic: 5 + Math.min(10, floor) },
    camp:   { common: 0,  rare: 80, epic: 20 },
    boss:   { common: 0,  rare: 45, epic: 55 },
  }[source];
  const pool = CARDS.filter(c => !c.ok || c.ok(player));
  const picked = [];
  for (let i = 0; i < count && pool.length; i++) {
    const rar = weightedPick(weights);
    let options = pool.filter(c => c.rarity === rar && !picked.includes(c));
    if (!options.length) options = pool.filter(c => !picked.includes(c));
    if (!options.length) break;
    picked.push(options[Math.floor(Math.random() * options.length)]);
  }
  return picked;
}

function weightedPick(w) {
  const total = Object.values(w).reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (const [k, v] of Object.entries(w)) { if ((r -= v) < 0) return k; }
  return Object.keys(w)[0];
}

if (typeof module !== 'undefined') module.exports = { CARDS, RARITY, drawCards, cardScale };
