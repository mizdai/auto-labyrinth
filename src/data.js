// 種族・職業・呪文の定義（すべてオリジナルデータ）
export const STATS = ['str', 'iq', 'pie', 'vit', 'agi', 'luk'];
export const STAT_NAMES = { str: '力', iq: '知恵', pie: '信仰', vit: '生命力', agi: '素早さ', luk: '運' };
export const ALIGN_NAMES = { G: '善', N: '中立', E: '悪' };

export const RACES = {
  human:    { name: '人間',         base: { str: 9,  iq: 8,  pie: 6,  vit: 9,  agi: 8,  luk: 8 },  age: 16 },
  elf:      { name: 'エルフ',       base: { str: 7,  iq: 11, pie: 9,  vit: 6,  agi: 9,  luk: 7 },  age: 22 },
  dwarf:    { name: 'ドワーフ',     base: { str: 11, iq: 6,  pie: 9,  vit: 11, agi: 5,  luk: 7 },  age: 20 },
  gnome:    { name: 'ノーム',       base: { str: 7,  iq: 8,  pie: 11, vit: 8,  agi: 9,  luk: 7 },  age: 20 },
  halfling: { name: 'ハーフリング', base: { str: 6,  iq: 7,  pie: 7,  vit: 7,  agi: 11, luk: 13 }, age: 18 },
};

// key: 装備可否判定に使う1文字
// hit: 命中ボーナス = hitBase + floor(Lv / hitDiv)
// atkDiv: 攻撃回数 = 1 + floor(Lv / atkDiv)（0なら常に1回）
// spells: { school: [習得開始Lv, 呪文レベルごとの間隔] }
export const CLASSES = {
  fighter: { name: '戦士',   ab: '戦', key: 'F', req: { str: 11 }, align: 'GNE', hd: 10, hitBase: 2, hitDiv: 3, atkDiv: 5, maxAtk: 4, exp: 1000, spells: {}, prio: ['str', 'vit', 'agi'] },
  mage:    { name: '魔術師', ab: '魔', key: 'M', req: { iq: 11 }, align: 'GNE', hd: 4, hitBase: 0, hitDiv: 5, atkDiv: 0, maxAtk: 1, exp: 1100, spells: { mage: [1, 2] }, prio: ['iq', 'agi', 'vit'] },
  priest:  { name: '僧侶',   ab: '僧', key: 'P', req: { pie: 11 }, align: 'GE', hd: 8, hitBase: 1, hitDiv: 4, atkDiv: 0, maxAtk: 1, exp: 1050, spells: { priest: [1, 2] }, prio: ['pie', 'vit', 'agi'] },
  thief:   { name: '盗賊',   ab: '盗', key: 'T', req: { agi: 11 }, align: 'NE', hd: 6, hitBase: 1, hitDiv: 4, atkDiv: 0, maxAtk: 1, exp: 900, spells: {}, prio: ['agi', 'luk', 'vit'] },
  bishop:  { name: '司教',   ab: '司', key: 'B', req: { iq: 12, pie: 12 }, align: 'GE', hd: 6, hitBase: 0, hitDiv: 5, atkDiv: 0, maxAtk: 1, exp: 1250, spells: { mage: [1, 4], priest: [4, 4] }, prio: ['iq', 'pie', 'vit'] },
  samurai: { name: '侍',     ab: '侍', key: 'S', req: { str: 15, iq: 11, pie: 10, vit: 14, agi: 10 }, align: 'GN', hd: 12, hitBase: 2, hitDiv: 3, atkDiv: 5, maxAtk: 4, exp: 1300, spells: { mage: [4, 3] }, prio: ['str', 'vit', 'agi', 'luk'] },
  lord:    { name: '君主',   ab: '君', key: 'L', req: { str: 15, iq: 12, pie: 12, vit: 15, agi: 14, luk: 15 }, align: 'G', hd: 10, hitBase: 2, hitDiv: 3, atkDiv: 5, maxAtk: 4, exp: 1350, spells: { priest: [4, 3] }, prio: ['str', 'vit', 'pie'] },
  ninja:   { name: '忍者',   ab: '忍', key: 'N', req: { str: 17, iq: 17, pie: 17, vit: 17, agi: 17, luk: 17 }, align: 'E', hd: 7, hitBase: 2, hitDiv: 3, atkDiv: 4, maxAtk: 5, exp: 1450, spells: {}, prio: ['agi', 'str', 'luk'] },
};

// 呪文
// target: enemy(敵1体) group(敵1グループ) all(敵全体) ally(味方1人) party(味方全体) none
// combat/camp: 戦闘中/野営中に使えるか
export const SPELLS = [
  // 魔術師系
  { id: 'hibana',   name: 'ヒバナ',   school: 'mage', lv: 1, target: 'enemy', effect: 'damage', dice: [1, 8, 0], combat: true, desc: '敵1体に火の粉を浴びせる' },
  { id: 'kagemi',   name: 'カゲミ',   school: 'mage', lv: 1, target: 'self', effect: 'ac', amount: 3, combat: true, desc: '唱えた人のACを3下げる' },
  { id: 'utatane',  name: 'ウタタネ', school: 'mage', lv: 1, target: 'enemy', effect: 'sleep', combat: true, desc: '敵1体を深い眠りに誘う' },
  { id: 'nemuri',   name: 'ネムリ',   school: 'mage', lv: 1, target: 'group', effect: 'sleep', combat: true, desc: '敵1グループを眠らせる' },
  { id: 'yamikumo', name: 'ヤミクモ', school: 'mage', lv: 2, target: 'group', effect: 'debuff', amount: 3, combat: true, desc: '敵1グループを闇で包み、ACを3上げる' },
  { id: 'tsurara',  name: 'ツララ',   school: 'mage', lv: 2, target: 'enemy', effect: 'damage', dice: [3, 6, 0], combat: true, desc: '敵1体に氷の刃' },
  { id: 'kasumi',   name: 'カスミ',   school: 'mage', lv: 2, target: 'party', effect: 'ac', amount: 2, combat: true, desc: '霞で味方全体のACを2下げる' },
  { id: 'homura',   name: 'ホムラ',   school: 'mage', lv: 3, target: 'group', effect: 'damage', dice: [4, 6, 0], combat: true, desc: '敵1グループを炎で包む' },
  { id: 'hirumi',   name: 'ヒルミ',   school: 'mage', lv: 3, target: 'group', effect: 'fear', amount: 3, combat: true, desc: '敵1グループを怯ませ、ACを3上げる' },
  { id: 'kekkai',   name: 'ケッカイ', school: 'mage', lv: 3, target: 'party', effect: 'ward', combat: true, desc: '魔物の呪文とブレスを和らげる障壁を張る（重ねがけ可）' },
  { id: 'shizuka',  name: 'シズカ',   school: 'mage', lv: 3, target: 'group', effect: 'silence', combat: true, desc: '敵1グループの呪文を封じる' },
  { id: 'hyouga',   name: 'ヒョウガ', school: 'mage', lv: 4, target: 'group', effect: 'damage', dice: [6, 6, 0], combat: true, desc: '敵1グループを凍てつかせる' },
  { id: 'tsuranuki', name: 'ツラヌキ', school: 'mage', lv: 4, target: 'enemy', effect: 'damage', dice: [20, 3, 0], combat: true, desc: '敵1体を魔力の槍で貫く' },
  { id: 'ishikure', name: 'イシクレ', school: 'mage', lv: 4, target: 'group', effect: 'stone', combat: true, desc: '敵1グループを石に変える' },
  { id: 'raimei',   name: 'ライメイ', school: 'mage', lv: 5, target: 'group', effect: 'damage', dice: [8, 6, 0], combat: true, desc: '敵1グループに雷を落とす' },
  { id: 'ugachi',   name: 'ウガチ',   school: 'mage', lv: 5, target: 'enemy', effect: 'damage', dice: [10, 10, 0], combat: true, desc: '敵1体を魔力の奔流で穿つ' },
  { id: 'shizumari', name: 'シズマリ', school: 'mage', lv: 5, target: 'all', effect: 'silence', combat: true, desc: '敵全体の呪文を封じる' },
  { id: 'shinigami',name: 'シニガミ', school: 'mage', lv: 5, target: 'group', effect: 'death', maxLv: 8, combat: true, desc: 'Lv8以下の敵1グループを即死させる' },
  { id: 'gouka',    name: 'ゴウカ',   school: 'mage', lv: 6, target: 'all', effect: 'damage', dice: [6, 6, 0], combat: true, desc: '敵全体を劫火で焼く' },
  { id: 'osore',    name: 'オソレ',   school: 'mage', lv: 6, target: 'all', effect: 'fear', amount: 3, combat: true, desc: '敵全体を怯ませ、ACを3上げる' },
  { id: 'joubutsu', name: 'ジョウブツ', school: 'mage', lv: 6, target: 'enemy', effect: 'damage', dice: [10, 100, 0], only: 'undead', combat: true, desc: '不死の敵1体を消し去る' },
  { id: 'teni',     name: 'テンイ',   school: 'mage', lv: 6, target: 'none', effect: 'return', camp: true, desc: '城下町へ転移する' },
  { id: 'shinokaze', name: 'シノカゼ', school: 'mage', lv: 7, target: 'all', effect: 'deathAll', combat: true, desc: '敵全体を即死させる（成功率30%、効かなかった敵は無傷）' },
  { id: 'kago',     name: 'カゴ',     school: 'mage', lv: 7, target: 'none', effect: 'wardLong', camp: true, desc: '迷宮にいるあいだ続く障壁を張る（呪文・ブレスを軽減）' },
  { id: 'metsubou', name: 'メツボウ', school: 'mage', lv: 7, target: 'all', effect: 'damage', dice: [10, 10, 0], combat: true, desc: '敵全体を滅ぼす光' },
  // 僧侶系
  { id: 'iyashi',   name: 'イヤシ',   school: 'priest', lv: 1, target: 'ally', effect: 'heal', dice: [1, 8, 0], combat: true, camp: true, desc: '味方1人のHPを回復' },
  { id: 'tsubute',  name: 'ツブテ',   school: 'priest', lv: 1, target: 'enemy', effect: 'damage', dice: [1, 8, 0], combat: true, desc: '敵1体に聖なる礫' },
  { id: 'mamori',   name: 'マモリ',   school: 'priest', lv: 1, target: 'party', effect: 'ac', amount: 1, combat: true, desc: '味方全体のACを1下げる' },
  { id: 'minuki',   name: 'ミヌキ',   school: 'priest', lv: 2, target: 'none', effect: 'detectTrap', camp: true, desc: '宝箱の罠を見抜く' },
  { id: 'katame',   name: 'カタメ',   school: 'priest', lv: 2, target: 'ally', effect: 'ac', amount: 3, combat: true, desc: '味方1人のACを3下げる' },
  { id: 'shizume',  name: 'シズメ',   school: 'priest', lv: 2, target: 'group', effect: 'silence', combat: true, desc: '敵1グループの呪文を封じる' },
  { id: 'naoshi',   name: 'ナオシ',   school: 'priest', lv: 3, target: 'ally', effect: 'heal', dice: [2, 8, 2], combat: true, camp: true, desc: '味方1人のHPを回復' },
  { id: 'gedoku',   name: 'ゲドク',   school: 'priest', lv: 3, target: 'ally', effect: 'cure', cures: ['poison'], combat: true, camp: true, desc: '毒を治す' },
  { id: 'hogushi',  name: 'ホグシ',   school: 'priest', lv: 3, target: 'ally', effect: 'cure', cures: ['paralyzed'], combat: true, camp: true, desc: '麻痺を治す' },
  { id: 'ooiyashi', name: 'オオイヤシ', school: 'priest', lv: 4, target: 'ally', effect: 'heal', dice: [4, 8, 4], combat: true, camp: true, desc: '味方1人のHPを大きく回復' },
  { id: 'seijin',   name: 'セイジン', school: 'priest', lv: 4, target: 'group', effect: 'damage', dice: [4, 4, 0], combat: true, desc: '敵1グループに聖なる刃' },
  { id: 'matoi',    name: 'マトイ',   school: 'priest', lv: 4, target: 'none', effect: 'acLong', amount: 2, camp: true, desc: '迷宮にいるあいだ、味方全体のACを2下げる' },
  { id: 'harai',    name: 'ハライ',   school: 'priest', lv: 4, target: 'group', effect: 'dispel', combat: true, desc: '不死の敵1グループを祓う' },
  { id: 'yomigaeri',name: 'ヨミガエリ', school: 'priest', lv: 5, target: 'ally', effect: 'revive', combat: false, camp: true, desc: '死者を蘇らせる（失敗すると灰になる）' },
  { id: 'yaburi',   name: 'ヤブリ',   school: 'priest', lv: 5, target: 'all', effect: 'unresist', combat: true, desc: '敵全体の呪文への抵抗を下げる（重ねがけ可）' },
  { id: 'shibire',  name: 'シビレ',   school: 'priest', lv: 5, target: 'group', effect: 'paralyze', combat: true, desc: '敵1グループを麻痺させる' },
  { id: 'inochitori', name: 'イノチトリ', school: 'priest', lv: 5, target: 'enemy', effect: 'deathOne', combat: true, desc: '敵1体の命を奪う（不死・悪魔・虫・巨像には効きにくい）' },
  { id: 'ikazuchi', name: 'イカズチ', school: 'priest', lv: 5, target: 'enemy', effect: 'damage', dice: [6, 8, 0], combat: true, desc: '敵1体に神の雷' },
  { id: 'kaifuku',  name: 'カイフク', school: 'priest', lv: 6, target: 'ally', effect: 'fullheal', combat: true, camp: true, desc: '味方1人を完全に回復' },
  { id: 'akumabarai', name: 'アクマバライ', school: 'priest', lv: 6, target: 'enemy', effect: 'banish', combat: true, desc: '悪魔1体を消し去る' },
  { id: 'suitori',  name: 'スイトリ', school: 'priest', lv: 6, target: 'enemy', effect: 'drain', combat: true, desc: '敵1体の生命力を吸い取り、自分を癒やす' },
  { id: 'kikan',    name: 'キカン',   school: 'priest', lv: 6, target: 'none', effect: 'return', camp: true, desc: '城下町へ帰還する' },
  { id: 'mimegumi', name: 'ミメグミ', school: 'priest', lv: 7, target: 'party', effect: 'heal', dice: [6, 8, 0], combat: true, camp: true, desc: '味方全体のHPを回復' },
  { id: 'tenbatsu', name: 'テンバツ', school: 'priest', lv: 7, target: 'all', effect: 'damage', dice: [12, 6, 0], combat: true, desc: '敵全体に天罰を下す' },
  { id: 'shinotsukai', name: 'シノツカイ', school: 'priest', lv: 7, target: 'group', effect: 'deathGroup', combat: true, desc: '敵1グループの命を奪う（成功率は低め）' },
  { id: 'tamakaeshi', name: 'タマカエシ', school: 'priest', lv: 7, target: 'ally', effect: 'revive', full: true, ash: true, combat: false, camp: true, desc: '死者・灰を完全な状態で蘇らせる' },
];
export const SPELL_BY_ID = Object.fromEntries(SPELLS.map(s => [s.id, s]));

export const SCHOOL_NAMES = { mage: '魔術', priest: '僧侶' };

// 宿の部屋：cost は1週間あたり、hp は1週間あたりの回復量（最大HPに対する割合）
export const INN_ROOMS = [
  { name: '大部屋',     cost: 0,   hp: 0.04 },
  { name: '簡易寝台',   cost: 10,  hp: 0.10 },
  { name: '個室',       cost: 50,  hp: 0.25 },
  { name: '上等な個室', cost: 200, hp: 0.5 },
  { name: '貴賓室',     cost: 500, hp: 1.0 },
];

// 寺院の料金（Lvあたり）
export const TEMPLE_COST = { paralyzed: 50, stoned: 100, dead: 100, ash: 250 };

export const STATUS_NAMES = { ok: '', asleep: '睡眠', paralyzed: '麻痺', stoned: '石化', dead: '死亡', ash: '灰', lost: '消失' };

export const NAME_SYLLABLES = ['ア', 'カ', 'サ', 'タ', 'ナ', 'ハ', 'マ', 'ラ', 'ガ', 'ザ', 'ダ', 'バ', 'リ', 'ル', 'レ', 'ロ', 'ド', 'ジ', 'ギ', 'ヴァ', 'エ', 'オ', 'イ', 'キ', 'ク', 'ケ', 'ト', 'ノ', 'ミ', 'ム', 'メ', 'ユ', 'シ', 'ス', 'セ', 'ソ', 'テ', 'ネ', 'フ', 'ベ', 'ボ', 'ゼ', 'グ', 'ゴ', 'ディ', 'ティ', 'フィ', 'ヴィ', 'ミラ', 'ロウ'];
export const NAME_ENDINGS = ['', '', '', 'ン', 'ス', 'ル', 'ド', 'ア', 'ク', 'ト'];
