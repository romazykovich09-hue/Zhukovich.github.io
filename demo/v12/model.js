/* ============================================================
   Геометрия двигателя Mercedes-Benz M120 — детализированная версия.

   Система координат (миллиметры):
     X — вдоль коленвала (1-й цилиндр в минусе),
     Y — вверх, ось коленвала в Y = 0,
     Z — поперёк, развал V раскрывается в плоскости Y–Z.

   Из открытых данных: развал 60°, 89 × 80,2 мм, 4 клапана на цилиндр,
   4 распредвала, цепной привод ГРМ.
   Принято правдоподобно (в источниках нет): расстояние между
   цилиндрами 106 мм, длина шатуна 145 мм, толщины стенок, число
   зубьев звёздочек. Модель учебная: структура верная, это не CAD.

   Каждая деталь — группа (parts[id]), повторяющиеся элементы —
   InstancedMesh внутри группы: так одинаково работают «взрыв»,
   изоляция, подсветка и тренажёр разборки.
   ============================================================ */

/* --- Размеры --- */
const BORE = 89;
const STROKE = 80.2;
const CRANK_R = STROKE / 2;
const ROD = 145;
const SPACING = 106;
const CYL = 6;
const BANK_DEG = 30;
const BANK = BANK_DEG * Math.PI / 180;
const HALF_LEN = (CYL - 1) * SPACING / 2;          // 265
const BLOCK_LEN = HALF_LEN * 2 + 150;              // 680
const PISTON_H = 62;
const PIN_OFFSET = 32;
const DECK = CRANK_R + ROD + PIN_OFFSET - 30;      // плоскость блока над осью
const THROW_DEG = [0, 120, 240, 0, 120, 240];
const V12_DEG = 180 / Math.PI;

function buildEngine(THREE) {
  const root = new THREE.Group();
  const parts = {};

  /* ---------- материалы ---------- */
  const M = (color, metalness, roughness, extra) =>
    new THREE.MeshStandardMaterial(Object.assign({ color: color, metalness: metalness, roughness: roughness }, extra || {}));

  const MAT = {
    alu: M(0x99a3ae, 0.5, 0.55),
    aluCast: M(0x8b95a1, 0.45, 0.68),
    aluDark: M(0x6d7681, 0.55, 0.55),
    steel: M(0xbfc6cd, 0.85, 0.28),
    steelDark: M(0x7b838c, 0.8, 0.36),
    crank: M(0x8f979f, 0.9, 0.22),
    polished: M(0xd9dee4, 0.95, 0.14),
    piston: M(0xdadfe5, 0.75, 0.26),
    dark: M(0x2b2f35, 0.5, 0.6),
    bore: M(0x4a5058, 0.6, 0.45),
    bronze: M(0xb08d57, 0.7, 0.4),
    rubber: M(0x22252a, 0.1, 0.92),
    cover: M(0x4a5158, 0.55, 0.5),
    zinc: M(0xaeb6be, 0.7, 0.38),
    copper: M(0xb87333, 0.8, 0.35),
    blue: M(0x3f6fa8, 0.5, 0.5)
  };

  /* ---------- вспомогательное ---------- */
  function part(id, explodeDir, position) {
    const g = new THREE.Group();
    g.userData.partId = id;
    g.userData.explode = new THREE.Vector3(explodeDir[0], explodeDir[1], explodeDir[2]).normalize();
    if (position) g.position.set(position[0], position[1], position[2]);
    root.add(g);
    parts[id] = g;
    return g;
  }

  const mesh = (geo, material, parent, pos, rot) => {
    const m = new THREE.Mesh(geo, material);
    if (pos) m.position.set(pos[0], pos[1], pos[2]);
    if (rot) m.rotation.set(rot[0], rot[1], rot[2]);
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  };

  /* вдоль оси цилиндра ряда s */
  const alongBore = (s, x, d) => new THREE.Vector3(x, d * Math.cos(BANK), s * d * Math.sin(BANK));

  /* труба по набору точек — для пружин, цепи, ремня */
  const tube = (points, radius, material, parent, tubular, closed) => {
    const curve = new THREE.CatmullRomCurve3(points, !!closed);
    const geo = new THREE.TubeGeometry(curve, tubular || 64, radius, 8, !!closed);
    return mesh(geo, material, parent);
  };

  /* спираль пружины клапана */
  const springGeometry = (radius, height, coils) => {
    const pts = [];
    const N = coils * 10;
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const a = t * coils * Math.PI * 2;
      pts.push(new THREE.Vector3(Math.cos(a) * radius, t * height - height / 2, Math.sin(a) * radius));
    }
    return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), N, 2.1, 6, false);
  };

  /* сектор (противовес коленвала, зуб звёздочки) */
  const sectorGeometry = (radius, thickness, centerDeg, spanDeg) => {
    const center = centerDeg / V12_DEG;
    const span = spanDeg / V12_DEG;
    return new THREE.CylinderGeometry(radius, radius, thickness, 28, 1, false, center - span / 2, span);
  };

  /* инстансы внутри группы-детали */
  const instanced = (geo, material, parent, spots, shadows) => {
    const inst = new THREE.InstancedMesh(geo, material, spots.length);
    if (shadows !== false) inst.castShadow = true;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const one = new THREE.Vector3(1, 1, 1);
    spots.forEach((sp, n) => {
      if (sp.quat) q.copy(sp.quat); else q.setFromEuler(new THREE.Euler(sp.rot ? sp.rot[0] : 0, sp.rot ? sp.rot[1] : 0, sp.rot ? sp.rot[2] : 0));
      if (sp.scale) m.compose(sp.pos, q, sp.scale); else m.compose(sp.pos, q, one);
      inst.setMatrixAt(n, m);
    });
    inst.instanceMatrix.needsUpdate = true;
    parent.add(inst);
    return inst;
  };

  /* ============================================================
     БЛОК ЦИЛИНДРОВ
     ============================================================ */
  const block = part('block', [0, -0.35, 0]);

  /* картер */
  mesh(new THREE.BoxGeometry(BLOCK_LEN, 104, 252), MAT.aluCast, block, [0, -26, 0]);

  /* перегородки коренных опор: у каждой — постель под вкладыш */
  const mainX = [-HALF_LEN - SPACING / 2];
  for (let i = 0; i < CYL - 1; i++) mainX.push(-HALF_LEN + i * SPACING + SPACING / 2);
  mainX.push(HALF_LEN + SPACING / 2);

  mainX.forEach((x) => {
    mesh(new THREE.BoxGeometry(34, 104, 252), MAT.aluCast, block, [x, -26, 0]);
    mesh(new THREE.CylinderGeometry(46, 46, 36, 26, 1, true), MAT.bore, block, [x, -6, 0], [0, 0, Math.PI / 2]);
  });

  /* два ряда цилиндров */
  for (const s of [-1, 1]) {
    const bank = new THREE.Group();
    bank.rotation.x = s * BANK;
    block.add(bank);

    const bodyH = DECK - 30;
    mesh(new THREE.BoxGeometry(BLOCK_LEN, bodyH, 128), MAT.aluCast, bank, [0, 30 + bodyH / 2, 0]);

    /* наружные рёбра жёсткости */
    for (let i = 0; i < 9; i++) {
      const x = -HALF_LEN - 40 + i * (BLOCK_LEN - 60) / 8;
      mesh(new THREE.BoxGeometry(9, bodyH * 0.78, 142), MAT.aluCast, bank, [x, 30 + bodyH / 2, 0]);
    }

    /* бобышки под кронштейны и датчики */
    for (const [bx, bz] of [[-HALF_LEN, 70], [0, 70], [HALF_LEN, 70], [-HALF_LEN / 2, -70], [HALF_LEN / 2, -70]]) {
      mesh(new THREE.CylinderGeometry(16, 16, 26, 12), MAT.aluDark, bank, [bx, DECK - 60, bz], [Math.PI / 2, 0, 0]);
    }

    /* гильзы: зеркало цилиндра и фаска сверху */
    for (let i = 0; i < CYL; i++) {
      const x = -HALF_LEN + i * SPACING;
      mesh(new THREE.CylinderGeometry(BORE / 2, BORE / 2, DECK - 40, 36, 1, true), MAT.bore, bank, [x, (DECK - 40) / 2 + 12, 0]);
      mesh(new THREE.CylinderGeometry(BORE / 2 + 6, BORE / 2, 8, 36, 1, true), MAT.aluDark, bank, [x, DECK - 4, 0]);
      /* отверстия рубашки охлаждения в плоскости блока */
      for (const ang of [40, 140, 220, 320]) {
        const a = ang / V12_DEG;
        mesh(new THREE.CylinderGeometry(6, 6, 10, 10), MAT.dark, bank,
          [x + Math.cos(a) * 52, DECK - 3, Math.sin(a) * 52]);
      }
    }
  }

  /* передняя плита привода ГРМ */
  mesh(new THREE.BoxGeometry(20, DECK + 40, 250), MAT.aluCast, block, [-BLOCK_LEN / 2 + 10, (DECK + 40) / 2 - 20, 0]);

  /* ============================================================
     КОЛЕНВАЛ
     ============================================================ */
  const crank = part('crankshaft', [0, -1, 0]);

  mainX.forEach((x) => {
    mesh(new THREE.CylinderGeometry(34, 34, 46, 30), MAT.crank, crank, [x, 0, 0], [0, 0, Math.PI / 2]);
    /* канал смазки в шейке */
    mesh(new THREE.CylinderGeometry(4.5, 4.5, 36, 8), MAT.dark, crank, [x, 17, 0], [0, 0, 0]);
  });

  for (let i = 0; i < CYL; i++) {
    const x = -HALF_LEN + i * SPACING;
    const phi = THROW_DEG[i] / V12_DEG;
    const py = CRANK_R * Math.cos(phi);
    const pz = CRANK_R * Math.sin(phi);

    /* шатунная шейка с каналом */
    mesh(new THREE.CylinderGeometry(30, 30, 48, 26), MAT.crank, crank, [x, py, pz], [0, 0, Math.PI / 2]);
    mesh(new THREE.CylinderGeometry(4, 4, 26, 8), MAT.dark, crank, [x, py * 1.2, pz * 1.2], [0, 0, Math.PI / 2]);

    /* щёки */
    for (const dx of [-32, 32]) {
      const web = mesh(new THREE.BoxGeometry(22, CRANK_R + 54, 84), MAT.crank, crank, [x + dx, py / 2, pz / 2]);
      web.rotation.x = phi;
    }

    /* противовесы: сектор, развёрнутый в сторону, противоположную шейке.
       Геометрия сектора строится вокруг своей оси, поэтому сначала
       разворачиваем его вдоль коленвала, потом доворачиваем против шейки. */
    for (const dx of [-32, 32]) {
      const cw = mesh(sectorGeometry(88, 26, 0, 150), MAT.crank, crank, [x + dx, 0, 0], [0, 0, Math.PI / 2]);
      cw.rotateOnWorldAxis(new THREE.Vector3(1, 0, 0), phi + Math.PI / 2);
    }
  }

  /* носок, шпоночный паз, фланец маховика */
  mesh(new THREE.CylinderGeometry(40, 40, 96, 26), MAT.crank, crank, [-HALF_LEN - SPACING / 2 - 68, 0, 0], [0, 0, Math.PI / 2]);
  mesh(new THREE.BoxGeometry(60, 10, 14), MAT.dark, crank, [-HALF_LEN - SPACING / 2 - 96, 22, 0]);
  mesh(new THREE.CylinderGeometry(62, 62, 28, 30), MAT.crank, crank, [HALF_LEN + SPACING / 2 + 52, 0, 0], [0, 0, Math.PI / 2]);

  /* ============================================================
     ПОРШНИ, КОЛЬЦА, ПАЛЬЦЫ, ШАТУНЫ, ВКЛАДШИНЫ
     ============================================================ */
  const pistons = [];
  for (const s of [-1, 1]) {
    for (let i = 0; i < CYL; i++) {
      const deg = THROW_DEG[i] + (s > 0 ? 60 : 0);
      const d = (function (deg2) {
        const a = deg2 / V12_DEG;
        return CRANK_R * Math.cos(a) + Math.sqrt(ROD * ROD - Math.pow(CRANK_R * Math.sin(a), 2)) + PIN_OFFSET;
      })(deg);
      pistons.push({ s: s, i: i, x: -HALF_LEN + i * SPACING, deg: deg, d: d, phi: deg / V12_DEG });
    }
  }

  const pistonPart = part('piston', [0, 1, 0]);
  const ringsPart = part('rings', [0, 1, 0]);
  const pinPart = part('pin', [0, 1, 0]);
  const rodPart = part('rod', [0, 1, 0]);
  const rodBearingPart = part('rod_bearing', [0, 1, 0]);

  pistons.forEach((p) => {
    const pin = alongBore(p.s, p.x, p.d);
    const crankPin = new THREE.Vector3(p.x, CRANK_R * Math.cos(p.phi), CRANK_R * Math.sin(p.phi));
    const axis = new THREE.Vector3().subVectors(pin, crankPin);
    const len = axis.length();
    axis.normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis);

    /* --- поршень --- */
    const pg = new THREE.Group();
    pg.position.copy(pin);
    pg.rotation.x = p.s * BANK;
    pistonPart.add(pg);

    mesh(new THREE.CylinderGeometry(BORE / 2 - 1.5, BORE / 2 - 1.5, PISTON_H, 40), MAT.piston, pg);
    /* днище с выемками под клапаны */
    mesh(new THREE.CylinderGeometry(BORE / 2 - 2, BORE / 2 - 2, 6, 40), MAT.polished, pg, [0, PISTON_H / 2 - 3, 0]);
    for (const ang of [35, 145, 215, 325]) {
      const a = ang / V12_DEG;
      mesh(new THREE.CylinderGeometry(15, 15, 5, 16), MAT.dark, pg,
        [Math.cos(a) * 26, PISTON_H / 2 - 1, Math.sin(a) * 26]);
    }
    /* бобышки под палец */
    for (const dz of [-1, 1]) {
      mesh(new THREE.CylinderGeometry(18, 18, 12, 20), MAT.piston, pg, [0, 0, dz * 17], [Math.PI / 2, 0, 0]);
      mesh(new THREE.TorusGeometry(15, 1.6, 6, 20), MAT.steel, pg, [0, 0, dz * 24], [0, 0, 0]);
    }
    mesh(new THREE.CylinderGeometry(16, 16, 46, 20, 1, true), MAT.dark, pg, [0, 0, 0], [Math.PI / 2, 0, 0]);

    /* --- кольца --- */
    const rg = new THREE.Group();
    rg.position.copy(pin);
    rg.rotation.x = p.s * BANK;
    ringsPart.add(rg);
    mesh(new THREE.CylinderGeometry(BORE / 2 - 0.5, BORE / 2 - 0.5, 3.6, 40, 1, true), MAT.dark, rg, [0, PISTON_H / 2 - 10, 0]);
    mesh(new THREE.CylinderGeometry(BORE / 2 - 0.5, BORE / 2 - 0.5, 3.2, 40, 1, true), MAT.dark, rg, [0, PISTON_H / 2 - 17, 0]);
    mesh(new THREE.CylinderGeometry(BORE / 2 - 0.6, BORE / 2 - 0.6, 4.6, 40, 1, true), MAT.bronze, rg, [0, PISTON_H / 2 - 25, 0]);

    /* --- палец --- */
    const ping = new THREE.Group();
    ping.position.copy(pin);
    ping.rotation.x = p.s * BANK;
    pinPart.add(ping);
    mesh(new THREE.CylinderGeometry(13, 13, 64, 24), MAT.polished, ping, [0, 0, 0], [0, 0, Math.PI / 2]);
    mesh(new THREE.CylinderGeometry(9.5, 9.5, 66, 18, 1, true), MAT.dark, ping, [0, 0, 0], [0, 0, Math.PI / 2]);

    /* --- шатун: двутавр, крышка, болты --- */
    const rg2 = new THREE.Group();
    rg2.position.copy(crankPin);
    rg2.quaternion.copy(q);
    rodPart.add(rg2);

    mesh(new THREE.CylinderGeometry(31, 31, 46, 28, 1, true), MAT.steelDark, rg2, [0, 0, 0], [0, 0, Math.PI / 2]);
    mesh(new THREE.CylinderGeometry(20, 20, 34, 22, 1, true), MAT.steelDark, rg2, [0, len - 22, 0], [0, 0, Math.PI / 2]);
    /* стержень двутаврового сечения */
    mesh(new THREE.BoxGeometry(24, len - 60, 9), MAT.steel, rg2, [0, len / 2, -12]);
    mesh(new THREE.BoxGeometry(24, len - 60, 9), MAT.steel, rg2, [0, len / 2, 12]);
    mesh(new THREE.BoxGeometry(9, len - 66, 20), MAT.steel, rg2, [0, len / 2, 0]);
    /* крышка нижней головки и болты */
    mesh(new THREE.BoxGeometry(66, 16, 46), MAT.steelDark, rg2, [0, -18, 0]);
    mesh(new THREE.CylinderGeometry(5, 5, 30, 6), MAT.zinc, rg2, [-22, -24, 0]);
    mesh(new THREE.CylinderGeometry(5, 5, 30, 6), MAT.zinc, rg2, [22, -24, 0]);

    /* --- вкладыши шатунные --- */
    const rb = new THREE.Group();
    rb.position.copy(crankPin);
    rb.quaternion.copy(q);
    rodBearingPart.add(rb);
    mesh(new THREE.CylinderGeometry(28.6, 28.6, 48, 28, 1, true), MAT.bronze, rb, [0, 0, 0], [0, 0, Math.PI / 2]);
    mesh(new THREE.CylinderGeometry(21.5, 21.5, 30, 22, 1, true), MAT.bronze, rb, [0, len - 22, 0], [0, 0, Math.PI / 2]);
  });

  /* ============================================================
     КОРЕННЫЕ ВКЛАДЫШИ И КРЫШКИ
     ============================================================ */
  const mainBearing = part('main_bearing', [0, -0.6, 0]);
  const mainCaps = part('main_caps', [0, -0.8, 0]);
  mainX.forEach((x) => {
    mesh(new THREE.CylinderGeometry(32.5, 32.5, 46, 26, 1, true), MAT.bronze, mainBearing, [x, 0, 0], [0, 0, Math.PI / 2]);
    mesh(new THREE.BoxGeometry(58, 34, 206), MAT.aluCast, mainCaps, [x, -46, 0]);
    mesh(new THREE.CylinderGeometry(38, 38, 24, 26, 1, true), MAT.bore, mainCaps, [x, -30, 0], [0, 0, Math.PI / 2]);
  });

  /* ============================================================
     ГОЛОВКИ, РАСПРЕДВАЛЫ, КЛАПАНЫ
     ============================================================ */
  const headPart = part('head', [0, 1, 0]);
  const gasketPart = part('head_gasket', [0, 0.6, 0]);
  const camPart = part('camshaft', [0, 1.4, 0]);
  const coverPart = part('cam_cover', [0, 2.1, 0]);

  const valveSpots = [];
  const springSpots = [];
  const bucketSpots = [];
  const retainerSpots = [];

  for (const s of [-1, 1]) {
    const bank = new THREE.Group();
    bank.rotation.x = s * BANK;
    headPart.add(bank);

    /* прокладка головки */
    const gk = new THREE.Group();
    gk.rotation.x = s * BANK;
    gasketPart.add(gk);
    mesh(new THREE.BoxGeometry(BLOCK_LEN - 36, 3, 138), MAT.zinc, gk, [0, DECK + 2, 0]);
    for (let i = 0; i < CYL; i++) {
      const x = -HALF_LEN + i * SPACING;
      mesh(new THREE.CylinderGeometry(BORE / 2 + 3, BORE / 2 + 3, 4, 30, 1, true), MAT.dark, gk, [x, DECK + 2, 0]);
    }

    /* тело головки */
    mesh(new THREE.BoxGeometry(BLOCK_LEN - 36, 84, 136), MAT.alu, bank, [0, DECK + 44, 0]);
    /* рёбра по бокам головки */
    for (let i = 0; i < 8; i++) {
      const x = -HALF_LEN - 30 + i * (BLOCK_LEN - 40) / 7;
      mesh(new THREE.BoxGeometry(9, 60, 144), MAT.aluCast, bank, [x, DECK + 46, 0]);
    }

    for (let i = 0; i < CYL; i++) {
      const x = -HALF_LEN + i * SPACING;

      /* камера сгорания — выемка в плоскости головки */
      mesh(new THREE.CylinderGeometry(BORE / 2 - 2, BORE / 2 - 2, 8, 32, 1, true), MAT.bore, bank, [x, DECK + 6, 0]);
      mesh(new THREE.SphereGeometry(BORE / 2 - 6, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), MAT.bore, bank, [x, DECK + 8, 0], [Math.PI, 0, 0]);

      /* сёдла и направляющие втулки клапанов */
      for (const dz of [-44, -22, 22, 44]) {
        mesh(new THREE.CylinderGeometry(19, 19, 8, 20, 1, true), MAT.steelDark, bank, [x, DECK + 10, dz]);
        mesh(new THREE.CylinderGeometry(9, 9, 46, 16), MAT.bronze, bank, [x, DECK + 42, dz]);
      }

      /* каналы: впускные и выпускные ранеры в теле головки */
      for (const [dz, dir] of [[-44, -1], [-22, -1], [22, 1], [44, 1]]) {
        const port = mesh(new THREE.CylinderGeometry(16, 20, 74, 18, 1, true), MAT.dark, bank,
          [x, DECK + 54, dz + dir * 14]);
        port.rotation.x = dir * 0.5;
      }
    }

    /* постели и бугели распредвалов */
    for (const dz of [-34, 34]) {
      mesh(new THREE.BoxGeometry(BLOCK_LEN - 36, 16, 44), MAT.aluCast, bank, [0, DECK + 88, dz]);
      for (let i = 0; i < 7; i++) {
        const x = -HALF_LEN - 34 + i * (HALF_LEN * 2 + 68) / 6;
        mesh(new THREE.BoxGeometry(22, 26, 52), MAT.aluDark, bank, [x, DECK + 106, dz]);
        mesh(new THREE.CylinderGeometry(17, 17, 22, 20, 1, true), MAT.bore, bank, [x, DECK + 92, dz], [0, 0, Math.PI / 2]);
      }
    }

    /* крышки распредвалов */
    const cvg = new THREE.Group();
    cvg.rotation.x = s * BANK;
    coverPart.add(cvg);
    for (const dz of [-34, 34]) {
      mesh(new THREE.BoxGeometry(BLOCK_LEN - 36, 28, 62), MAT.cover, cvg, [0, DECK + 118, dz]);
      mesh(new THREE.BoxGeometry(BLOCK_LEN - 60, 10, 40), MAT.aluCast, cvg, [0, DECK + 134, dz]);
    }
    /* маслозаливная горловина */
    mesh(new THREE.CylinderGeometry(18, 18, 26, 16), MAT.cover, cvg, [-HALF_LEN + 30, DECK + 140, -34]);
    mesh(new THREE.CylinderGeometry(20, 20, 16, 16), MAT.dark, cvg, [-HALF_LEN + 30, DECK + 158, -34]);

    /* четыре распредвала: кулачки + шейки */
    for (const [k, dz] of [[0, -34], [1, 34]]) {
      const cam = new THREE.Group();
      cam.rotation.x = s * BANK;
      camPart.add(cam);
      mesh(new THREE.CylinderGeometry(15, 15, BLOCK_LEN - 46, 22), MAT.steel, cam, [0, DECK + 92, dz], [0, 0, Math.PI / 2]);

      for (let i = 0; i < CYL; i++) {
        const x = -HALF_LEN + i * SPACING;
        /* кулачок: основание и выступ */
        const base = mesh(new THREE.CylinderGeometry(21, 21, 18, 22), MAT.steelDark, cam, [x, DECK + 92, dz], [0, 0, Math.PI / 2]);
        base.rotation.x = (i + k * 3) * 0.9;
        const lift = mesh(new THREE.CylinderGeometry(24, 24, 18, 20, 1, false, 0, Math.PI), MAT.steelDark, cam, [x, DECK + 92, dz], [0, 0, Math.PI / 2]);
        lift.rotation.x = (i + k * 3) * 0.9;
      }
      /* шейки распредвала */
      for (let i = 0; i < 7; i++) {
        const x = -HALF_LEN - 34 + i * (HALF_LEN * 2 + 68) / 6;
        mesh(new THREE.CylinderGeometry(17, 17, 22, 20), MAT.steel, cam, [x, DECK + 92, dz], [0, 0, Math.PI / 2]);
      }
      /* звёздочка привода на переднем конце */
      mesh(new THREE.CylinderGeometry(34, 34, 20, 30), MAT.steelDark, cam, [-BLOCK_LEN / 2 + 22, DECK + 92, dz], [0, 0, Math.PI / 2]);
    }

    /* точки клапанов, пружин, толкателей */
    for (let i = 0; i < CYL; i++) {
      const x = -HALF_LEN + i * SPACING;
      for (const dz of [-44, -22, 22, 44]) {
        valveSpots.push({ s: s, x: x, dz: dz, d: DECK + 34, ang: (dz < 0 ? 1 : -1) * 0.09 });
        springSpots.push({ s: s, x: x, dz: dz * 1.02, d: DECK + 84, ang: (dz < 0 ? 1 : -1) * 0.09 });
        retainerSpots.push({ s: s, x: x, dz: dz * 1.02, d: DECK + 104, ang: (dz < 0 ? 1 : -1) * 0.09 });
        bucketSpots.push({ s: s, x: x, dz: dz * 1.03, d: DECK + 112, ang: (dz < 0 ? 1 : -1) * 0.09 });
      }
    }
  }

  /* --- клапаны: стержень, тарелка, сухари --- */
  const valvePart = part('valve', [0, 1, 0]);
  const valveSpotsStem = valveSpots.map((v) => ({
    pos: alongBore(v.s, v.x, v.d + 44),
    rot: [v.s * BANK + v.ang, 0, 0]
  }));
  instanced(new THREE.CylinderGeometry(5, 5, 96, 12), MAT.polished, valvePart, valveSpotsStem);

  const valveHeadSpots = valveSpots.map((v) => ({
    pos: (function () {
      const base = alongBore(v.s, v.x, v.d - 34);
      const local = new THREE.Vector3(0, 0, v.dz - v.dz * 0.02).applyAxisAngle(new THREE.Vector3(1, 0, 0), v.s * BANK);
      base.add(local);
      return base;
    })(),
    rot: [v.s * BANK + v.ang, 0, 0]
  }));
  instanced(new THREE.CylinderGeometry(18, 11, 14, 20), MAT.polished, valvePart, valveHeadSpots);

  /* --- пружины: настоящая спираль --- */
  const springPart = part('spring', [0, 1, 0]);
  const springGeo = springGeometry(12.5, 46, 5);
  instanced(springGeo, MAT.steel, springPart, springSpots.map((v) => ({
    pos: (function () {
      const base = alongBore(v.s, v.x, v.d);
      base.add(new THREE.Vector3(0, 0, v.dz - v.dz * 0.02).applyAxisAngle(new THREE.Vector3(1, 0, 0), v.s * BANK));
      return base;
    })(),
    rot: [v.s * BANK + v.ang, 0, 0]
  })));

  /* --- тарелки пружин и сухари --- */
  const retainerPart = part('retainer', [0, 1, 0]);
  instanced(new THREE.CylinderGeometry(15, 13, 6, 18), MAT.steelDark, retainerPart, retainerSpots.map((v) => ({
    pos: (function () {
      const base = alongBore(v.s, v.x, v.d);
      base.add(new THREE.Vector3(0, 0, v.dz - v.dz * 0.02).applyAxisAngle(new THREE.Vector3(1, 0, 0), v.s * BANK));
      return base;
    })(),
    rot: [v.s * BANK + v.ang, 0, 0]
  })));

  /* --- толкатели с шайбой --- */
  const bucketPart = part('bucket', [0, 1, 0]);
  instanced(new THREE.CylinderGeometry(15, 15, 24, 20), MAT.steelDark, bucketPart, bucketSpots.map((v) => ({
    pos: (function () {
      const base = alongBore(v.s, v.x, v.d);
      base.add(new THREE.Vector3(0, 0, v.dz - v.dz * 0.02).applyAxisAngle(new THREE.Vector3(1, 0, 0), v.s * BANK));
      return base;
    })(),
    rot: [v.s * BANK + v.ang, 0, 0]
  })));
  instanced(new THREE.CylinderGeometry(13.5, 13.5, 3, 20), MAT.zinc, bucketPart, bucketSpots.map((v) => ({
    pos: (function () {
      const base = alongBore(v.s, v.x, v.d + 13);
      base.add(new THREE.Vector3(0, 0, v.dz * 0.97).applyAxisAngle(new THREE.Vector3(1, 0, 0), v.s * BANK));
      return base;
    })(),
    rot: [v.s * BANK + v.ang, 0, 0]
  })));

  /* ============================================================
     ЦЕПЬ ГРМ: звенья, звёздочки, успокоители
     ============================================================ */
  const chainPart = part('chain', [0, 0.4, 0]);
  const chainX = -BLOCK_LEN / 2 + 24;

  /* звёздочка коленвала */
  mesh(new THREE.CylinderGeometry(44, 44, 24, 32), MAT.steelDark, chainPart, [chainX, 0, 0], [0, 0, Math.PI / 2]);
  /* звёздочки распредвалов */
  for (const s of [-1, 1]) {
    for (const dz of [-34, 34]) {
      mesh(new THREE.CylinderGeometry(36, 36, 22, 30), MAT.steelDark, chainPart, [chainX, DECK + 92, dz], [0, 0, Math.PI / 2]);
      mesh(new THREE.CylinderGeometry(30, 30, 24, 24, 1, true), MAT.dark, chainPart, [chainX, DECK + 92, dz], [0, 0, Math.PI / 2]);
    }
  }

  /* звенья цепи по замкнутому контуру */
  (function buildChain() {
    const path = [];
    const yBottom = -6;
    const yTop = DECK + 96;
    /* левая ветвь вверх, правая вниз — как у настоящего привода */
    for (let i = 0; i <= 16; i++) path.push(new THREE.Vector3(chainX - 44, yBottom + (yTop - yBottom) * i / 16, 0));
    for (let i = 0; i <= 12; i++) path.push(new THREE.Vector3(chainX - 44 + 88 * i / 12, yTop, 0));
    for (let i = 0; i <= 16; i++) path.push(new THREE.Vector3(chainX + 44, yTop - (yTop - yBottom) * i / 16, 0));
    for (let i = 0; i <= 12; i++) path.push(new THREE.Vector3(chainX + 44 - 88 * i / 12, yBottom, 0));

    const curve = new THREE.CatmullRomCurve3(path, true);
    const count = 78;
    const plateGeo = new THREE.BoxGeometry(5, 16, 22);
    const pinGeo = new THREE.CylinderGeometry(2.6, 2.6, 26, 8);
    const plates = [];
    const pins = [];
    for (let i = 0; i < count; i++) {
      const t = i / count;
      const pos = curve.getPointAt(t);
      const tan = curve.getTangentAt(t);
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), tan);
      plates.push({ pos: pos.clone(), quat: q.clone() });
      pins.push({ pos: pos.clone().add(tan.clone().multiplyScalar(9)), quat: q.clone(), rot: [0, 0, Math.PI / 2] });
    }
    instanced(plateGeo, MAT.steelDark, chainPart, plates);
    instanced(pinGeo, MAT.zinc, chainPart, pins);
  })();

  /* успокоитель и натяжитель */
  mesh(new THREE.BoxGeometry(18, 150, 26), MAT.dark, chainPart, [chainX - 52, DECK / 2 + 30, 0]);
  mesh(new THREE.BoxGeometry(18, 120, 26), MAT.dark, chainPart, [chainX + 52, DECK / 2 + 10, 0]);
  mesh(new THREE.CylinderGeometry(12, 12, 40, 12), MAT.steel, chainPart, [chainX + 62, DECK - 40, 0], [0, 0, Math.PI / 2]);

  /* ============================================================
     ВПУСК, ЗАЖИГАНИЕ, ТОПЛИВО
     ============================================================ */
  const intakePart = part('intake_manifold', [0, 1.2, 0]);
  const throttlePart = part('throttle', [0, 0.6, 0]);
  const injectorPart = part('injector', [0, 0.9, 0]);
  const plugPart = part('spark_plug', [0, 1.6, 0]);
  const coilPart = part('coil', [0, 2.4, 0]);
  const railPart = part('fuel_rail', [0, 0.8, 0]);

  const injectorSpots = [];
  const plugSpots = [];
  const coilSpots = [];

  for (const s of [-1, 1]) {
    const bank = new THREE.Group();
    bank.rotation.x = s * BANK;
    intakePart.add(bank);

    /* ресивер */
    mesh(new THREE.CylinderGeometry(46, 46, BLOCK_LEN - 90, 26), MAT.alu, bank, [0, DECK + 176, 40], [0, 0, Math.PI / 2]);
    /* патрубки к головке */
    for (let i = 0; i < CYL; i++) {
      const x = -HALF_LEN + i * SPACING;
      const runner = mesh(new THREE.CylinderGeometry(19, 22, 100, 18), MAT.alu, bank, [x, DECK + 128, 22]);
      runner.rotation.x = Math.PI / 2.35;
      mesh(new THREE.TorusGeometry(22, 3, 6, 20), MAT.aluDark, bank, [x, DECK + 168, 46], [0, Math.PI / 2, 0]);
    }

    /* дроссельный узел */
    const tb = new THREE.Group();
    tb.rotation.x = s * BANK;
    throttlePart.add(tb);
    mesh(new THREE.CylinderGeometry(40, 40, 56, 24), MAT.aluDark, tb, [-BLOCK_LEN / 2 + 60, DECK + 176, 40], [0, 0, Math.PI / 2]);
    mesh(new THREE.CylinderGeometry(36, 36, 6, 24), MAT.polished, tb, [-BLOCK_LEN / 2 + 60, DECK + 176, 40], [0, 0, Math.PI / 2]);
    mesh(new THREE.BoxGeometry(30, 30, 30), MAT.dark, tb, [-BLOCK_LEN / 2 + 90, DECK + 176, 40]);

    /* топливная рампа */
    const rail = new THREE.Group();
    rail.rotation.x = s * BANK;
    railPart.add(rail);
    mesh(new THREE.CylinderGeometry(13, 13, BLOCK_LEN - 140, 16), MAT.steel, rail, [0, DECK + 120, 50], [0, 0, Math.PI / 2]);
    for (let i = 0; i < CYL; i++) {
      const x = -HALF_LEN + i * SPACING;
      mesh(new THREE.CylinderGeometry(8, 8, 26, 10), MAT.steelDark, rail, [x, DECK + 108, 46]);
    }

    for (let i = 0; i < CYL; i++) {
      const x = -HALF_LEN + i * SPACING;
      injectorSpots.push({ s: s, x: x, d: DECK + 108, dz: 44 });
      plugSpots.push({ s: s, x: x, d: DECK + 126, dz: 0 });
      coilSpots.push({ s: s, x: x, d: DECK + 196, dz: 0 });
    }
  }

  const spotPos = (v, extra) => {
    const base = alongBore(v.s, v.x, v.d + (extra || 0));
    base.add(new THREE.Vector3(0, 0, v.dz).applyAxisAngle(new THREE.Vector3(1, 0, 0), v.s * BANK));
    return base;
  };

  instanced(new THREE.CylinderGeometry(8, 8, 56, 12), MAT.zinc, injectorPart,
    injectorSpots.map((v) => ({ pos: spotPos(v), rot: [v.s * BANK, 0, 0] })));
  instanced(new THREE.CylinderGeometry(9, 9, 74, 14), MAT.zinc, plugPart,
    plugSpots.map((v) => ({ pos: spotPos(v), rot: [v.s * BANK, 0, 0] })));
  instanced(new THREE.CylinderGeometry(12, 12, 18, 6), MAT.copper, plugPart,
    plugSpots.map((v) => ({ pos: spotPos(v, 34), rot: [v.s * BANK, 0, 0] })));
  instanced(new THREE.BoxGeometry(30, 66, 30), MAT.rubber, coilPart,
    coilSpots.map((v) => ({ pos: spotPos(v), rot: [v.s * BANK, 0, 0] })));
  instanced(new THREE.CylinderGeometry(9, 9, 30, 12), MAT.blue, coilPart,
    coilSpots.map((v) => ({ pos: spotPos(v, -40), rot: [v.s * BANK, 0, 0] })));

  /* ============================================================
     СМАЗКА, ОХЛАЖДЕНИЕ, НАВЕСНОЕ
     ============================================================ */
  const panPart = part('oil_pan', [0, -1.6, 0]);
  mesh(new THREE.BoxGeometry(BLOCK_LEN - 90, 70, 212), MAT.aluCast, panPart, [0, -110, 0]);
  mesh(new THREE.BoxGeometry(BLOCK_LEN - 220, 44, 176), MAT.aluCast, panPart, [0, -162, 0]);
  mesh(new THREE.CylinderGeometry(20, 20, 20, 14), MAT.steelDark, panPart, [-HALF_LEN + 60, -184, 0], [0, 0, 0]);
  /* маслоприёмник */
  mesh(new THREE.CylinderGeometry(24, 24, 40, 16), MAT.dark, panPart, [-HALF_LEN + 40, -60, 0]);

  const pumpPart = part('oil_pump', [0, -1.1, 0]);
  mesh(new THREE.CylinderGeometry(32, 32, 76, 20), MAT.steelDark, pumpPart, [-HALF_LEN + 40, -70, 0], [Math.PI / 2, 0, 0]);
  mesh(new THREE.CylinderGeometry(14, 14, 30, 12), MAT.steel, pumpPart, [-HALF_LEN + 40, -30, 0]);

  const filterPart = part('oil_filter', [0, 0.5, 1], [0, -40, 158]);
  mesh(new THREE.CylinderGeometry(44, 44, 100, 26), MAT.cover, filterPart);
  mesh(new THREE.CylinderGeometry(46, 46, 12, 26), MAT.aluDark, filterPart, [0, 52, 0]);
  mesh(new THREE.BoxGeometry(60, 40, 30), MAT.aluDark, filterPart, [0, -58, -20]);

  const wpPart = part('water_pump', [-1, 0.2, 0]);
  mesh(new THREE.CylinderGeometry(50, 50, 80, 28), MAT.aluDark, wpPart, [-BLOCK_LEN / 2 + 6, -6, 66], [0, 0, Math.PI / 2]);
  mesh(new THREE.CylinderGeometry(72, 72, 20, 30), MAT.steelDark, wpPart, [-BLOCK_LEN / 2 - 30, -6, 66], [0, 0, Math.PI / 2]);
  mesh(new THREE.CylinderGeometry(20, 20, 40, 16), MAT.steel, wpPart, [-BLOCK_LEN / 2 - 30, -6, 66], [0, 0, Math.PI / 2]);

  const thermoPart = part('thermostat', [0, 0.3, 1]);
  mesh(new THREE.CylinderGeometry(28, 28, 50, 18), MAT.alu, thermoPart, [-BLOCK_LEN / 2 + 76, 22, 104], [Math.PI / 2, 0, 0]);
  mesh(new THREE.CylinderGeometry(20, 20, 20, 14), MAT.dark, thermoPart, [-BLOCK_LEN / 2 + 76, 22, 128], [Math.PI / 2, 0, 0]);

  const frontCover = part('front_cover', [-1, 0, 0]);
  mesh(new THREE.BoxGeometry(24, DECK + 70, 206), MAT.alu, frontCover, [-BLOCK_LEN / 2 + 26, (DECK + 70) / 2 - 44, 0]);
  mesh(new THREE.CylinderGeometry(58, 58, 20, 26), MAT.rubber, frontCover, [-BLOCK_LEN / 2 + 26, 0, 0], [0, 0, Math.PI / 2]);

  const rearCover = part('rear_cover', [1, 0, 0]);
  mesh(new THREE.BoxGeometry(24, DECK + 30, 216), MAT.alu, rearCover, [BLOCK_LEN / 2 - 26, (DECK + 30) / 2 - 44, 0]);
  mesh(new THREE.CylinderGeometry(54, 54, 20, 26), MAT.rubber, rearCover, [BLOCK_LEN / 2 - 14, 0, 0], [0, 0, Math.PI / 2]);

  const flywheelPart = part('flywheel', [1.6, 0, 0]);
  mesh(new THREE.CylinderGeometry(176, 176, 28, 44), MAT.steelDark, flywheelPart, [BLOCK_LEN / 2 + 20, 0, 0], [0, 0, Math.PI / 2]);
  mesh(new THREE.CylinderGeometry(196, 196, 18, 52, 1, true), MAT.steel, flywheelPart, [BLOCK_LEN / 2 + 20, 0, 0], [0, 0, Math.PI / 2]);
  mesh(new THREE.CylinderGeometry(60, 60, 34, 24), MAT.steel, flywheelPart, [BLOCK_LEN / 2 + 20, 0, 0], [0, 0, Math.PI / 2]);
  /* зубья венца стартера */
  (function teeth() {
    const spots = [];
    for (let i = 0; i < 60; i++) {
      const a = i / 60 * Math.PI * 2;
      spots.push({
        pos: new THREE.Vector3(BLOCK_LEN / 2 + 20, Math.sin(a) * 196, Math.cos(a) * 196),
        rot: [a, 0, Math.PI / 2]
      });
    }
    instanced(new THREE.BoxGeometry(18, 8, 10), MAT.steel, flywheelPart, spots, false);
  })();

  const pulleyPart = part('pulley', [-2, 0, 0]);
  mesh(new THREE.CylinderGeometry(98, 98, 46, 32), MAT.steelDark, pulleyPart, [-BLOCK_LEN / 2 - 40, 0, 0], [0, 0, Math.PI / 2]);
  mesh(new THREE.TorusGeometry(98, 13, 8, 36), MAT.rubber, pulleyPart, [-BLOCK_LEN / 2 - 40, 0, 0], [0, Math.PI / 2, 0]);
  mesh(new THREE.CylinderGeometry(40, 40, 60, 20), MAT.steel, pulleyPart, [-BLOCK_LEN / 2 - 40, 0, 0], [0, 0, Math.PI / 2]);

  /* генератор и ремень навесного */
  const altPart = part('alternator', [-1, 1, 1]);
  mesh(new THREE.CylinderGeometry(52, 52, 130, 26), MAT.aluDark, altPart, [-BLOCK_LEN / 2 + 40, -60, 190], [0, 0, Math.PI / 2]);
  mesh(new THREE.CylinderGeometry(38, 38, 26, 22), MAT.steelDark, altPart, [-BLOCK_LEN / 2 - 30, -60, 190], [0, 0, Math.PI / 2]);

  const beltPart = part('belt', [-1, 0.6, 0.6]);
  (function belt() {
    /* Ремень идёт по внешним обводам трёх шкивов: коленвал, насос, генератор */
    const pulleys = [
      { c: new THREE.Vector3(-BLOCK_LEN / 2 - 40, 0, 0), r: 112 },      /* шкив коленвала */
      { c: new THREE.Vector3(-BLOCK_LEN / 2 - 30, -6, 66), r: 84 },     /* насос охлаждения */
      { c: new THREE.Vector3(-BLOCK_LEN / 2 - 30, -60, 190), r: 50 }    /* генератор */
    ];

    const centroid = new THREE.Vector3();
    pulleys.forEach((p) => centroid.add(p.c));
    centroid.multiplyScalar(1 / pulleys.length);

    /* обходим шкивы в порядке угла вокруг центра — так петля не пересекается */
    const ordered = pulleys.slice().sort((a, b) => {
      const aa = Math.atan2(a.c.y - centroid.y, a.c.z - centroid.z);
      const bb = Math.atan2(b.c.y - centroid.y, b.c.z - centroid.z);
      return aa - bb;
    });

    const pts = [];
    const arc = 3.5;                       /* ≈200° охвата на каждом шкиве */
    ordered.forEach((p) => {
      const base = Math.atan2(p.c.y - centroid.y, p.c.z - centroid.z);
      for (let i = 0; i <= 16; i++) {
        const a = base - arc / 2 + arc * i / 16;
        pts.push(new THREE.Vector3(p.c.x, p.c.y + Math.sin(a) * p.r, p.c.z + Math.cos(a) * p.r));
      }
    });
    tube(pts, 7, MAT.rubber, beltPart, 140, true);
  })();

  const mountPart = part('engine_mount', [0, -0.6, 0]);
  for (const s of [-1, 1]) {
    for (const dx of [-170, 170]) {
      mesh(new THREE.BoxGeometry(84, 34, 74), MAT.steelDark, mountPart, [dx, -74, s * 138]);
      mesh(new THREE.BoxGeometry(70, 26, 60), MAT.rubber, mountPart, [dx, -46, s * 138]);
    }
  }

  /* щуп и маслозаливная крышка */
  const dipPart = part('dipstick', [0, 0.4, 1]);
  mesh(new THREE.CylinderGeometry(7, 7, 260, 12), MAT.zinc, dipPart, [-HALF_LEN + 40, -20, 150], [0.1, 0, 0]);
  mesh(new THREE.TorusGeometry(16, 5, 8, 20), MAT.dark, dipPart, [-HALF_LEN + 40, 106, 128]);

  /* ============================================================
     КРЕПЁЖ: три отдельных набора (головки, коренные, поддон)
     ============================================================ */
  const headBoltsPart = part('head_bolts', [0, 1, 0]);
  const mainBoltsPart = part('main_bolts', [0, -0.8, 0]);
  const panBoltsPart = part('pan_bolts', [0, -1.4, 0]);
  const boltGeo = new THREE.CylinderGeometry(6.5, 6.5, 30, 6);
  const washerGeo = new THREE.CylinderGeometry(10, 10, 3, 14);

  const headBoltSpots = [];
  for (const s of [-1, 1]) {
    for (let i = 0; i < 14; i++) {
      const x = -HALF_LEN - 58 + i * (HALF_LEN * 2 + 116) / 13;
      const dz = (i % 2 ? 1 : -1) * 60;
      const base = alongBore(s, x, DECK + 12);
      base.add(new THREE.Vector3(0, 0, dz).applyAxisAngle(new THREE.Vector3(1, 0, 0), s * BANK));
      headBoltSpots.push({ pos: base, rot: [s * BANK, 0, 0] });
    }
  }
  instanced(boltGeo, MAT.zinc, headBoltsPart, headBoltSpots);
  instanced(washerGeo, MAT.steel, headBoltsPart, headBoltSpots.map((b) => ({ pos: b.pos.clone(), rot: b.rot })));

  const mainBoltSpots = [];
  mainX.forEach((x) => {
    for (const dx of [-20, 20]) {
      mainBoltSpots.push({ pos: new THREE.Vector3(x + dx, -62, 0), rot: [0, 0, Math.PI / 2] });
    }
  });
  instanced(boltGeo, MAT.zinc, mainBoltsPart, mainBoltSpots);
  instanced(washerGeo, MAT.steel, mainBoltsPart, mainBoltSpots.map((b) => ({ pos: b.pos.clone(), rot: b.rot })));

  const panBoltSpots = [];
  for (let i = 0; i < 10; i++) {
    for (const z of [-98, 98]) {
      panBoltSpots.push({ pos: new THREE.Vector3(-HALF_LEN - 62 + i * (HALF_LEN * 2 + 124) / 9, -146, z), rot: [Math.PI / 2, 0, 0] });
    }
  }
  for (let i = 0; i < 6; i++) {
    panBoltSpots.push({ pos: new THREE.Vector3(-HALF_LEN + 40 + i * 80, -186, 60), rot: [0, 0, 0] });
    panBoltSpots.push({ pos: new THREE.Vector3(-HALF_LEN + 40 + i * 80, -186, -60), rot: [0, 0, 0] });
  }
  instanced(boltGeo, MAT.zinc, panBoltsPart, panBoltSpots);

  /* ---------- итог ---------- */
  root.userData.parts = parts;
  root.userData.metrics = {
    BORE: BORE, STROKE: STROKE, ROD: ROD, SPACING: SPACING,
    DECK: DECK, BLOCK_LEN: BLOCK_LEN, HALF_LEN: HALF_LEN, BANK_DEG: BANK_DEG, CYL: CYL
  };
  return { root: root, parts: parts };
}
