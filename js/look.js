/* Togie Valley - look.js (Round 2 stage 2). Character appearance data: Game.Look.
 * A look = {skin, hairStyle, hair, eyes, nose, hat, acc:[], top, topColor, bottom, pantsColor}; palette fields are indexes, the rest ids.
 * API: DEFAULT, get(), set(look, opts), validate(look), encode(look) -> string (<= 80 chars), decode(str) -> look (bad input -> default),
 *      resolve(look) -> Models.character options, presets[], random(rng), toggleAcc(look,id), setHat(look,id), PAL / ID lists, chosen()/markChosen().
 * Event look:changed {look}. Save + hero wiring live in look_ui.js (needs save.js). Load before models.js; depends on core.js only. */
(function () {
  'use strict';
  var G = window.Game;
  if (!G || !G.Events) { console.error('[look] core.js missing'); return; }

  var PAL = {
    skin: [0xf6cfa8, 0xffe3cf, 0xf1c9a5, 0xe0ac82, 0xc98d63, 0xa86d47, 0x8a5535, 0x6b4028],
    hair: [0x6b3f2a, 0xd9a441, 0x2b2233, 0xc2543a, 0xf2dc9b, 0x8a5a3a, 0x5a4a7a, 0xf0a0be, 0x86b8ea, 0x8fd3a0, 0xb89be0, 0xe9e4da],
    eyes: [0x2b2233, 0x5a3a2a, 0x3a6aa8, 0x3f8a5a, 0x7a4a9a, 0x8a5a3a],
    top: [0x6fb6e8, 0xf4a6b8, 0xf7d56b, 0x9bd9a4, 0xc3a6ec, 0xf8b48a, 0xfff1d6, 0x8fd6d0, 0xe98f8f, 0xb7c9f2, 0xe8d6a0, 0xf5f5f0],
    pants: [0x4f6fa8, 0x8c6a4a, 0x3f4a6b, 0xc9b28a, 0x6b8f71, 0xd8a0a8, 0x7a6a9a, 0xf0e6d2, 0x5a5a66, 0xe3a76f]
  };
  var IDS = {
    hairStyle: ['bun', 'short', 'bob', 'long', 'pony', 'twin'],
    nose: ['none', 'dot', 'round', 'button', 'pointy'],
    hat: ['none', 'straw', 'la', 'beret', 'beanie', 'cap'],
    acc: ['glasses', 'flower', 'bow', 'scarf', 'headband', 'backpack', 'catear'],
    top: ['overalls', 'tee', 'hoodie', 'baba', 'sweater'],
    bottom: ['pants', 'shorts', 'skirt']
  };
  var LABEL = {   // player-facing names (Vietnamese)
    hairStyle: ['Búi tóc', 'Tóc ngắn', 'Tóc bob', 'Tóc dài', 'Đuôi ngựa', 'Hai bím'],
    nose: ['Không mũi', 'Chấm nhỏ', 'Tròn', 'Cúc áo', 'Nhọn nhỏ'],
    hat: ['Không mũ', 'Mũ rơm', 'Nón lá', 'Mũ beret', 'Mũ len', 'Mũ lưỡi trai'],
    acc: ['Kính tròn', 'Ghim hoa', 'Nơ', 'Khăn quàng', 'Băng đô', 'Ba lô', 'Bờm tai mèo'],
    top: ['Quần yếm', 'Áo thun', 'Áo hoodie', 'Áo bà ba', 'Áo len'],
    bottom: ['Quần dài', 'Quần short', 'Váy']
  };
  var TOPGROUP = { bow: 1, headband: 1, catear: 1 };   // sit on top of the head: one at most, never with a hat
  var KEYS = ['skin', 'hairStyle', 'hair', 'eyes', 'nose', 'hat', 'acc1', 'acc2', 'top', 'topColor', 'bottom', 'pantsColor'];
  var MAXLEN = 80;

  var DEFAULT = { skin: 0, hairStyle: 'bun', hair: 0, eyes: 0, nose: 'none', hat: 'straw', acc: [], top: 'overalls', topColor: 0, bottom: 'pants', pantsColor: 0 };

  function clone(l) { return { skin: l.skin, hairStyle: l.hairStyle, hair: l.hair, eyes: l.eyes, nose: l.nose, hat: l.hat, acc: l.acc.slice(), top: l.top, topColor: l.topColor, bottom: l.bottom, pantsColor: l.pantsColor }; }
  function pal(v, n, d) { v = typeof v === 'number' ? Math.floor(v) : -1; return v >= 0 && v < n ? v : d; }
  function id(v, list, d) { return typeof v === 'string' && list.indexOf(v) >= 0 ? v : d; }

  /* Always returns a fresh, fully valid look. Conflicts: a hat wins over head-top accessories; max one head-top accessory; max 2 accessories. */
  function validate(l) {
    var o = clone(DEFAULT), a, i, top = 0;
    if (!l || typeof l !== 'object') return o;
    o.skin = pal(l.skin, PAL.skin.length, 0); o.hair = pal(l.hair, PAL.hair.length, 0); o.eyes = pal(l.eyes, PAL.eyes.length, 0);
    o.topColor = pal(l.topColor, PAL.top.length, 0); o.pantsColor = pal(l.pantsColor, PAL.pants.length, 0);
    o.hairStyle = id(l.hairStyle, IDS.hairStyle, 'bun'); o.nose = id(l.nose, IDS.nose, 'none'); o.hat = id(l.hat, IDS.hat, 'none');
    o.top = id(l.top, IDS.top, 'overalls'); o.bottom = id(l.bottom, IDS.bottom, 'pants');
    a = Array.isArray(l.acc) ? l.acc : [];
    for (i = 0; i < a.length && o.acc.length < 2; i++) {
      if (IDS.acc.indexOf(a[i]) < 0 || o.acc.indexOf(a[i]) >= 0) continue;
      if (TOPGROUP[a[i]] && (o.hat !== 'none' || top)) continue;
      if (TOPGROUP[a[i]]) top = 1;
      o.acc.push(a[i]);
    }
    return o;
  }

  function setHat(l, hat) { var o = clone(l); o.hat = hat; return validate(o); }   // new hat wins: head-top accessories are dropped
  function toggleAcc(l, accId) {   // last choice wins: conflicting hat / head-top accessory is removed, oldest accessory drops at 3
    var o = clone(l), i = o.acc.indexOf(accId), j;
    if (i >= 0) { o.acc.splice(i, 1); return validate(o); }
    if (TOPGROUP[accId]) {
      o.hat = 'none';
      for (j = o.acc.length - 1; j >= 0; j--) if (TOPGROUP[o.acc[j]]) o.acc.splice(j, 1);
    }
    o.acc.push(accId);
    if (o.acc.length > 2) o.acc.shift();
    return validate(o);
  }

  function ch36(n) { return n.toString(36); }
  function encode(l) {
    l = validate(l);
    var v = [l.skin, IDS.hairStyle.indexOf(l.hairStyle), l.hair, l.eyes, IDS.nose.indexOf(l.nose), IDS.hat.indexOf(l.hat),
      l.acc[0] ? IDS.acc.indexOf(l.acc[0]) + 1 : 0, l.acc[1] ? IDS.acc.indexOf(l.acc[1]) + 1 : 0,
      IDS.top.indexOf(l.top), l.topColor, IDS.bottom.indexOf(l.bottom), l.pantsColor], s = '1', i;
    for (i = 0; i < v.length; i++) s += ch36(v[i]);
    return s;
  }
  function decode(s) {
    if (typeof s !== 'string' || s.length < 13 || s.length > MAXLEN || s.charAt(0) !== '1') return validate(null);
    var v = [], i, n, l = { acc: [] };
    for (i = 0; i < 12; i++) { n = parseInt(s.charAt(i + 1), 36); if (isNaN(n)) return validate(null); v.push(n); }
    l.skin = v[0]; l.hairStyle = IDS.hairStyle[v[1]]; l.hair = v[2]; l.eyes = v[3]; l.nose = IDS.nose[v[4]]; l.hat = IDS.hat[v[5]];
    if (v[6]) l.acc.push(IDS.acc[v[6] - 1]);
    if (v[7]) l.acc.push(IDS.acc[v[7] - 1]);
    l.top = IDS.top[v[8]]; l.topColor = v[9]; l.bottom = IDS.bottom[v[10]]; l.pantsColor = v[11];
    return validate(l);
  }

  /* Look -> Models.character options (concrete colours and ids). */
  function resolve(l) {
    l = validate(l);
    return {
      skin: PAL.skin[l.skin], hair: PAL.hair[l.hair], eyes: PAL.eyes[l.eyes], shirt: PAL.top[l.topColor], pants: PAL.pants[l.pantsColor],
      hairStyle: l.hairStyle, nose: l.nose, hat: l.hat === 'none' ? null : l.hat, acc: l.acc.slice(), top: l.top, bottom: l.bottom
    };
  }

  /* 12 ready-made outfits ("Bộ gợi ý"): soft pastel palettes. Indexes point into PAL. */
  function P(name, skin, hs, hair, eyes, nose, hat, acc, top, tc, bottom, pc) {
    return { name: name, look: validate({ skin: skin, hairStyle: hs, hair: hair, eyes: eyes, nose: nose, hat: hat, acc: acc, top: top, topColor: tc, bottom: bottom, pantsColor: pc }) };
  }
  var presets = [
    P('Nông dân vui vẻ', 0, 'bun', 0, 0, 'none', 'straw', [], 'overalls', 0, 'pants', 0),
    P('Cô bé nón lá', 2, 'long', 2, 1, 'dot', 'la', [], 'baba', 6, 'pants', 2),
    P('Họa sĩ nhỏ', 1, 'short', 2, 0, 'round', 'beret', ['glasses'], 'sweater', 9, 'pants', 3),
    P('Mùa đông ấm', 1, 'bob', 11, 2, 'button', 'beanie', ['scarf'], 'hoodie', 4, 'pants', 8),
    P('Chạy bộ buổi sáng', 3, 'pony', 3, 1, 'pointy', 'cap', [], 'tee', 5, 'shorts', 3),
    P('Công chúa hoa', 0, 'long', 7, 4, 'dot', 'none', ['flower'], 'tee', 1, 'skirt', 7),
    P('Mèo con', 1, 'twin', 10, 3, 'button', 'none', ['catear'], 'hoodie', 11, 'skirt', 5),
    P('Học trò chăm chỉ', 2, 'short', 0, 1, 'round', 'none', ['glasses', 'backpack'], 'tee', 11, 'shorts', 2),
    P('Làng quê yên bình', 2, 'bun', 2, 0, 'dot', 'none', ['flower'], 'baba', 3, 'pants', 7),
    P('Đi chợ sớm', 4, 'twin', 5, 1, 'button', 'straw', [], 'tee', 8, 'skirt', 0),
    P('Bạn gấu bông', 3, 'pony', 5, 5, 'round', 'none', ['headband'], 'sweater', 10, 'pants', 1),
    P('Nắng vàng', 5, 'bob', 1, 1, 'pointy', 'none', ['bow', 'scarf'], 'overalls', 2, 'pants', 9)
  ];

  function pick(rng, n) { return Math.floor(rng() * n) % n; }
  function random(rng) {   // every field comes from its own list, validate() resolves conflicts, so any result is renderable
    rng = rng || Math.random;
    var l = { acc: [] }, n = pick(rng, 3), i, a;
    l.skin = pick(rng, PAL.skin.length); l.hair = pick(rng, PAL.hair.length); l.eyes = pick(rng, PAL.eyes.length);
    l.topColor = pick(rng, PAL.top.length); l.pantsColor = pick(rng, PAL.pants.length);
    l.hairStyle = IDS.hairStyle[pick(rng, IDS.hairStyle.length)]; l.nose = IDS.nose[pick(rng, IDS.nose.length)];
    l.hat = IDS.hat[pick(rng, IDS.hat.length)]; l.top = IDS.top[pick(rng, IDS.top.length)]; l.bottom = IDS.bottom[pick(rng, IDS.bottom.length)];
    for (i = 0; i < n; i++) { a = IDS.acc[pick(rng, IDS.acc.length)]; if (l.acc.indexOf(a) < 0) l.acc.push(a); }
    return validate(l);
  }

  var cur = clone(DEFAULT), chosen = false;
  var Look = G.Look = {
    DEFAULT: validate(DEFAULT), PAL: PAL, IDS: IDS, LABEL: LABEL, KEYS: KEYS, MAXLEN: MAXLEN, presets: presets,
    validate: validate, encode: encode, decode: decode, resolve: resolve, random: random, setHat: setHat, toggleAcc: toggleAcc,
    get: function () { return clone(cur); },
    set: function (l, silent) {
      cur = validate(l);
      if (!silent) { G.Events.emit('look:changed', { look: Look.get() }); if (G.Save && G.Save.request) G.Save.request(); }
      return Look.get();
    },
    chosen: function () { return chosen; },
    markChosen: function (v) { chosen = v !== false; },
    reset: function () { cur = validate(DEFAULT); chosen = false; G.Events.emit('look:changed', { look: Look.get() }); }
  };
})();
