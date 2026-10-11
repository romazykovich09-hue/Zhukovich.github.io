/* ============================================================
   Логика сайта: 3D-сцена, выбор детали, режим «взрыв»,
   сборка по шагам, каталог, проверка знаний и ТРЕНАЖЁР РАЗБОРКИ.

   Тренажёр: держим ЛКМ на детали и крутим колесо.
     колесо вверх  — снять деталь
     колесо вниз   — поставить на место
   Снять можно только то, что поставлено последним; поставить —
   только то, под чем уже есть основа. Верный ход — зелёная
   подсветка, неверный — красная и объяснение, что мешает.

   Классический скрипт (без модулей): страница открывается
   и двойным кликом, и с сайта. Three.js r147 с CDN.
   ============================================================ */

(function () {
  'use strict';

  const data = window.V12 || {};
  const ENGINE = data.ENGINE;
  const PART_GROUPS = data.PART_GROUPS;
  const PARTS = data.PARTS;
  const ASSEMBLY_STEPS = data.ASSEMBLY_STEPS;
  const QUIZ = data.QUIZ;
  const CAMERA_PRESETS = data.CAMERA_PRESETS;
  const INSTALL_STEP = data.INSTALL_STEP || {};

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.prototype.slice.call(document.querySelectorAll(sel));
  const T = window.THREE;

  function fatal(text) {
    const box = $('#fatal');
    if (box) {
      box.hidden = false;
      box.querySelector('p').textContent = text;
    }
    const loader = $('#loader');
    if (loader) loader.classList.add('hidden');
  }

  if (!T) {
    fatal('Не удалось загрузить 3D-библиотеку Three.js с CDN. Проверьте подключение к интернету и обновите страницу.');
    return;
  }
  if (!PARTS || !PARTS.length) {
    fatal('Не загрузились данные о деталях (data.js). Обновите страницу.');
    return;
  }

  /* ============================================================
     1. СЦЕНА, СВЕТ, ПОЛ
     ============================================================ */
  const canvas = $('#scene');
  const renderer = new T.WebGLRenderer({ canvas: canvas, antialias: true, powerPreference: 'high-performance' });
  /* Плотность пикселей ограничиваем 1.5: на экранах 125–150% это заметно
     легче для видеокарты, а разницы на глаз почти нет */
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFSoftShadowMap;
  /* Тени пересчитываем только когда что-то действительно двинулось,
     а не каждый кадр — теневой проход самый дорогой */
  renderer.shadowMap.autoUpdate = false;
  if ('outputEncoding' in renderer) renderer.outputEncoding = T.sRGBEncoding;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.02;

  const scene = new T.Scene();
  scene.background = new T.Color(0x14161b);
  scene.fog = new T.Fog(0x14161b, 3000, 6000);

  const camera = new T.PerspectiveCamera(45, 1, 5, 14000);
  const controls = new T.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 150;
  controls.maxDistance = 5000;
  controls.autoRotateSpeed = 0.9;

  const ENGINE_Y = 320;

  scene.add(new T.HemisphereLight(0x9dc0ff, 0x2a2119, 0.55));

  const key = new T.DirectionalLight(0xfff1dc, 1.15);
  key.position.set(760, 1180, 620);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.near = 200;
  key.shadow.camera.far = 3800;
  key.shadow.camera.left = -1000;
  key.shadow.camera.right = 1000;
  key.shadow.camera.top = 1000;
  key.shadow.camera.bottom = -1000;
  key.shadow.bias = -0.0008;
  scene.add(key);

  const lamp = new T.SpotLight(0xffb469, 1.5, 3800, 0.75, 0.6, 1.4);
  lamp.position.set(0, 1750, 260);
  lamp.target.position.set(0, ENGINE_Y, 0);
  scene.add(lamp, lamp.target);

  const fill = new T.PointLight(0x5f8fe0, 0.5, 4200);
  fill.position.set(-900, 520, -700);
  scene.add(fill);

  const floor = new T.Mesh(
    new T.PlaneGeometry(7000, 7000),
    new T.MeshStandardMaterial({ color: 0x2b2d31, roughness: 0.95, metalness: 0.02 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  const grid = new T.GridHelper(5200, 52, 0x3a4763, 0x252b36);
  grid.position.y = 1;
  scene.add(grid);

  /* --- стенд под двигателем --- */
  const PAN_BOTTOM = ENGINE_Y - 186;
  const standMat = new T.MeshStandardMaterial({ color: 0x3b4046, roughness: 0.6, metalness: 0.5 });
  const standH = 62;
  const stand = new T.Mesh(new T.BoxGeometry(1000, standH, 480), standMat);
  stand.position.y = PAN_BOTTOM - standH / 2;
  stand.castShadow = stand.receiveShadow = true;
  scene.add(stand);

  const legH = PAN_BOTTOM - standH;
  for (const dx of [-390, 390]) {
    for (const dz of [-185, 185]) {
      const leg = new T.Mesh(new T.BoxGeometry(58, legH, 58), standMat);
      leg.position.set(dx, legH / 2, dz);
      leg.castShadow = true;
      scene.add(leg);
    }
  }

  /* ============================================================
     2. ДВИГАТЕЛЬ
     ============================================================ */
  const built = buildEngine(T);
  const root = built.root;
  const parts = built.parts;
  root.position.y = ENGINE_Y;
  scene.add(root);

  /* каждому мешу — свой материал, иначе подсветка задевает соседей */
  Object.keys(parts).forEach((id) => {
    const p = parts[id];
    if (p.traverse) {
      p.traverse((o) => {
        if ((o.isMesh || o.isInstancedMesh) && o.material && !Array.isArray(o.material)) {
          o.material = o.material.clone();
          if (o.material.emissive) o.material.userData.baseEmissive = o.material.emissive.getHex();
        }
      });
    }
  });

  const partIds = Object.keys(parts);

  /* Мелкие детали — клапаны, пружины, крепёж, звенья цепи — тени не отбрасывают:
     теневой проход становится примерно вдвое легче, а на вид это не влияет */
  ['valve', 'spring', 'retainer', 'bucket', 'chain', 'head_bolts', 'main_bolts',
    'pan_bolts', 'injector', 'spark_plug', 'coil', 'belt', 'dipstick'].forEach((id) => {
    const p = parts[id];
    if (p && p.traverse) p.traverse((o) => { if (o.isMesh || o.isInstancedMesh) o.castShadow = false; });
  });
  const partInfo = {};
  PARTS.forEach((p) => { partInfo[p.id] = p; });

  /* исходные положения и повороты — основа для «взрыва» и разборки */
  partIds.forEach((id) => {
    const p = parts[id];
    p.userData.base = p.position.clone();
    p.userData.baseRot = p.rotation.clone();
    p.userData.vis = 0;          /* 0 — на месте, 1 — снята */
    p.userData.spin = 0;
    if (!p.userData.explode) p.userData.explode = new T.Vector3(0, 1, 0);
  });

  /* Куда встаёт снятая деталь: кольцо вокруг двигателя в два обвода
     и три яруса по высоте — как детали, разложенные вокруг верстака.
     Место закреплено за деталью, поэтому они не наезжают друг на друга. */
  const parkSlots = {};
  partIds.forEach((id, i) => {
    const tier = i % 3;
    const ring = (i % 2 === 0) ? 880 : 1210;
    const angle = (i / partIds.length) * Math.PI * 2;
    parkSlots[id] = new T.Vector3(
      Math.cos(angle) * ring,
      20 + tier * 200,
      Math.sin(angle) * ring
    );
    parts[id].userData.park = parkSlots[id];
  });

  /* ============================================================
     3. СОСТОЯНИЕ ТРЕНАЖЁРА
     ============================================================ */
  const state = {};                       /* id -> 'in' | 'out' */
  partIds.forEach((id) => { state[id] = 'in'; });

  const installed = (id) => state[id] === 'in';
  const stepOf = (id) => (INSTALL_STEP[id] === undefined ? 0 : INSTALL_STEP[id]);
  const nameOf = (id) => (partInfo[id] ? partInfo[id].name : id);
  const shortName = (id) => nameOf(id).replace(/\s*\(.*\)$/, '');

  /* что мешает снять деталь: всё, что поставлено позже */
  function blockersForExtract(id) {
    const st = stepOf(id);
    return partIds.filter((pid) => pid !== id && installed(pid) && stepOf(pid) > st);
  }

  /* что мешает поставить деталь: всё, что ещё не поставлено снизу */
  function blockersForInsert(id) {
    const st = stepOf(id);
    return partIds.filter((pid) => pid !== id && !installed(pid) && stepOf(pid) < st);
  }

  /** Ближайшая деталь, которую сейчас правильно снимать. */
  function nextToExtract() {
    const candidates = partIds.filter((id) => installed(id) && blockersForExtract(id).length === 0);
    if (!candidates.length) return null;
    return candidates.reduce((best, id) => (stepOf(id) > stepOf(best) ? id : best), candidates[0]);
  }

  const outCount = () => partIds.filter((id) => !installed(id)).length;

  /* ============================================================
     4. ПОДСВЕТКА И ОБРАТНАЯ СВЯЗЬ
     ============================================================ */
  function forEachMesh(id, fn) {
    const p = parts[id];
    if (!p) return;
    if (p.isMesh || p.isInstancedMesh) fn(p);
    if (p.traverse) p.traverse((o) => { if (o.isMesh || o.isInstancedMesh) fn(o); });
  }

  function applyEmissive(id, hex, intensity) {
    forEachMesh(id, (m) => {
      const mat = m.material;
      if (!mat || !mat.emissive) return;
      mat.emissive.setHex(hex);
      mat.emissiveIntensity = intensity;
    });
  }

  function resetEmissive(id) {
    forEachMesh(id, (m) => {
      const mat = m.material;
      if (!mat || !mat.emissive) return;
      mat.emissive.setHex(mat.userData.baseEmissive === undefined ? 0x000000 : mat.userData.baseEmissive);
      mat.emissiveIntensity = 1;
    });
  }

  const GOOD = 0x22c55e;
  const BAD = 0xef4444;
  const PICK = 0xff7a1a;
  const HINT = 0x38bdf8;
  const flashes = {};

  function flash(id, hex, ms) {
    applyEmissive(id, hex, 0.85);
    if (flashes[id]) clearTimeout(flashes[id]);
    flashes[id] = setTimeout(() => {
      if (selectedId === id) applyEmissive(id, PICK, 0.6);
      else resetEmissive(id);
      delete flashes[id];
    }, ms || 1100);
  }

  function log(text, kind) {
    const box = $('#train-log');
    if (!box) return;
    const el = document.createElement('p');
    el.className = 'log-item ' + (kind || '');
    el.textContent = text;
    box.insertBefore(el, box.firstChild);
    while (box.children.length > 6) box.removeChild(box.lastChild);
  }

  function toast(text) {
    const n = $('#note');
    if (!n) return;
    n.textContent = text;
    n.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => n.classList.remove('show'), 2400);
  }

  /* ============================================================
     5. ДЕЙСТВИЯ ТРЕНАЖЁРА
     ============================================================ */
  const stats = { right: 0, wrong: 0 };

  function updateStats() {
    const done = outCount();
    const total = partIds.length;
    const box = $('#train-stats');
    if (box) {
      box.innerHTML =
        '<span><b>' + done + '</b> / ' + total + ' снято</span>' +
        '<span class="ok">верно: <b>' + stats.right + '</b></span>' +
        '<span class="bad">ошибок: <b>' + stats.wrong + '</b></span>';
    }
    const bar = $('#train-bar');
    if (bar) bar.style.width = (done / total * 100).toFixed(1) + '%';
  }

  function attempt(id, dir) {
    if (!parts[id]) return;

    if (dir === 'out') {
      if (!installed(id)) { toast('Эта деталь уже снята'); return; }
      const blockers = blockersForExtract(id);
      if (blockers.length) {
        stats.wrong++;
        flash(id, BAD);
        const names = blockers.slice(0, 2).map(shortName).join(', ');
        const more = blockers.length > 2 ? ' и ещё ' + (blockers.length - 2) : '';
        log('Нельзя снять «' + shortName(id) + '»: сначала снимите ' + names + more, 'bad');
        toast('Не сейчас: сначала снимите ' + names);
        updateStats();
        return;
      }
      state[id] = 'out';
      stats.right++;
      flash(id, GOOD);
      log('Верно: «' + shortName(id) + '» снята', 'ok');
      updateStats();
      if (selectedId === id) renderInfo(id);
      return;
    }

    /* поставить на место */
    if (installed(id)) { toast('Эта деталь уже на месте'); return; }
    const blockers = blockersForInsert(id);
    if (blockers.length) {
      stats.wrong++;
      flash(id, BAD);
      const names = blockers.slice(0, 2).map(shortName).join(', ');
      const more = blockers.length > 2 ? ' и ещё ' + (blockers.length - 2) : '';
      log('Рано ставить «' + shortName(id) + '»: сначала поставьте ' + names + more, 'bad');
      toast('Ещё рано: сначала поставьте ' + names);
      updateStats();
      return;
    }
    state[id] = 'in';
    stats.right++;
    flash(id, GOOD);
    log('Верно: «' + shortName(id) + '» на месте', 'ok');
    updateStats();
    if (selectedId === id) renderInfo(id);
  }

  function resetTrainer() {
    partIds.forEach((id) => {
      state[id] = 'in';
      resetEmissive(id);
    });
    stats.right = 0;
    stats.wrong = 0;
    const box = $('#train-log');
    if (box) box.innerHTML = '';
    updateStats();
    if (selectedId) renderInfo(selectedId); else updateTouchBar();
    toast('Все детали возвращены на место');
  }

  function giveHint() {
    const id = nextToExtract();
    if (!id) { toast('Всё снято — двигатель разобран'); return; }
    flash(id, HINT, 2600);
    select(id, false);
    log('Подсказка: снимайте «' + shortName(id) + '»', 'hint');
    toast('Следующая деталь: ' + shortName(id));
  }

  /* ============================================================
     6. ВЫБОР ДЕТАЛИ
     ============================================================ */
  const raycaster = new T.Raycaster();
  const ndc = new T.Vector2();
  let selectedId = null;
  let isolated = false;
  let grabbed = null;

  function pickAt(clientX, clientY) {
    const rect = renderer.domElement.getBoundingClientRect();
    ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(ndc, camera);
    const targets = partIds.filter((id) => parts[id].visible).map((id) => parts[id]);
    const hits = raycaster.intersectObjects(targets, true);
    if (!hits.length) return null;
    let o = hits[0].object;
    while (o && !o.userData.partId) o = o.parent;
    return o ? o.userData.partId : null;
  }

  function boxOf(id) {
    return new T.Box3().setFromObject(parts[id]);
  }

  function focusOn(id, factor) {
    const box = boxOf(id);
    if (box.isEmpty()) return;
    const center = box.getCenter(new T.Vector3());
    const size = box.getSize(new T.Vector3()).length();
    controls.target.copy(center);
    const dir = new T.Vector3().subVectors(camera.position, center).normalize();
    camera.position.copy(center).addScaledVector(dir, Math.max(size * (factor || 1.5), 220));
    controls.update();
  }

  function select(id, focus) {
    if (selectedId && selectedId !== id) {
      if (flashes[selectedId]) applyEmissive(selectedId, GOOD, 0.85);
      else resetEmissive(selectedId);
    }
    selectedId = id;
    if (!id) { renderInfo(null); return; }
    if (!flashes[id]) applyEmissive(id, PICK, 0.6);
    renderInfo(id);
    if (focus) focusOn(id, 1.4);
    $$('.part-item').forEach((el) => el.classList.toggle('active', el.dataset.id === id));
  }

  function renderInfo(id) {
    const box = $('#info');
    if (!id) {
      box.innerHTML = '<p class="hint-soft">Выберите деталь на модели или в каталоге — здесь появится её описание.</p>';
      return;
    }
    const p = partInfo[id];
    const stateLine = installed(id)
      ? '<p class="state-in">Деталь на месте</p>'
      : '<p class="state-out">Деталь снята</p>';

    if (!p) {
      box.innerHTML = stateLine + '<h3>' + id + '</h3>' +
        '<div class="info-actions">' +
        '<button type="button" data-act="out">Снять</button>' +
        '<button type="button" data-act="in">Поставить</button></div>';
    } else {
      box.innerHTML =
        '<p class="info-group">' + (PART_GROUPS[p.group] || '') + ' · шаг ' + (stepOf(id) + 1) + '</p>' +
        '<h3>' + p.name + '</h3>' + stateLine +
        '<ul class="info-meta">' +
          '<li><span>Количество</span><b>' + p.qty + '</b></li>' +
          '<li><span>Материал</span><b>' + p.material + '</b></li>' +
        '</ul>' +
        '<h4>Зачем нужна</h4><p>' + p.role + '</p>' +
        '<h4>Как работает</h4><p>' + p.work + '</p>' +
        '<h4>На что смотреть при ремонте</h4><p>' + p.care + '</p>' +
        '<div class="info-actions">' +
          '<button type="button" data-act="out">Снять</button>' +
          '<button type="button" data-act="in">Поставить</button>' +
          '<button type="button" data-act="focus">Приблизить</button>' +
          '<button type="button" data-act="isolate">' + (isolated ? 'Показать всё' : 'Только эта деталь') + '</button>' +
        '</div>';
    }

    const out = box.querySelector('[data-act="out"]');
    const ins = box.querySelector('[data-act="in"]');
    const foc = box.querySelector('[data-act="focus"]');
    const iso = box.querySelector('[data-act="isolate"]');
    if (out) out.addEventListener('click', () => attempt(id, 'out'));
    if (ins) ins.addEventListener('click', () => attempt(id, 'in'));
    if (foc) foc.addEventListener('click', () => focusOn(id, 1.2));
    if (iso) iso.addEventListener('click', () => toggleIsolate(id));
    updateTouchBar();
  }

  /* Быстрые кнопки под сценой. На телефоне колеса мыши нет, поэтому
     деталь выбирают касанием, а снимают и ставят этими кнопками. */
  const touchName = $('#touch-name');
  const touchOut = $('#touch-out');
  const touchIn = $('#touch-in');

  function updateTouchBar() {
    if (!touchName) return;
    touchName.textContent = selectedId
      ? shortName(selectedId) + (installed(selectedId) ? ' — на месте' : ' — снята')
      : 'Выберите деталь на модели';
  }

  if (touchOut) {
    touchOut.addEventListener('click', () => {
      if (selectedId) attempt(selectedId, 'out');
      else toast('Сначала коснитесь детали на модели');
    });
  }

  if (touchIn) {
    touchIn.addEventListener('click', () => {
      if (selectedId) attempt(selectedId, 'in');
      else toast('Сначала коснитесь детали на модели');
    });
  }

  function toggleIsolate(id) {
    isolated = !isolated;
    partIds.forEach((pid) => { parts[pid].visible = !isolated || pid === id; });
    renderer.shadowMap.needsUpdate = true;
    if (isolated) focusOn(id, 1.4);
    renderInfo(id);
  }

  /* ============================================================
     7. РЕЖИМ «ВЗРЫВ» И «РЕНТГЕН»
     ============================================================ */
  let explodeAmount = 0;

  const xrayIds = ['block', 'head', 'cam_cover', 'intake_manifold', 'front_cover', 'rear_cover', 'oil_pan', 'head_gasket'];
  let xray = false;
  const xrayOriginal = {};

  function applyXray() {
    xrayIds.forEach((id) => {
      forEachMesh(id, (m) => {
        const mat = m.material;
        if (!mat) return;
        if (xray) {
          if (xrayOriginal[id] === undefined) {
            xrayOriginal[id] = { transparent: mat.transparent, opacity: mat.opacity, depthWrite: mat.depthWrite };
          }
          mat.transparent = true;
          mat.opacity = 0.16;
          mat.depthWrite = false;
        } else if (xrayOriginal[id]) {
          mat.transparent = xrayOriginal[id].transparent;
          mat.opacity = xrayOriginal[id].opacity;
          mat.depthWrite = xrayOriginal[id].depthWrite;
        }
      });
    });
    const btn = $('#btn-xray');
    if (btn) btn.classList.toggle('on', xray);
  }

  /* ============================================================
     8. СБОРКА ПО ШАГАМ
     ============================================================ */
  function setVisible(id, on) {
    parts[id].visible = on;
    /* скрытая деталь не должна отбрасывать тень — карту теней пересчитываем */
    renderer.shadowMap.needsUpdate = true;
  }

  function showStep(index) {
    if (index < 0) {
      partIds.forEach((id) => setVisible(id, true));
      $('#step-text').innerHTML = '<p class="hint-soft">Выберите шаг — останутся только его детали.</p>';
    } else {
      const step = ASSEMBLY_STEPS[index];
      partIds.forEach((id) => setVisible(id, step.parts.indexOf(id) >= 0));
      $('#step-text').innerHTML =
        '<h4>Шаг ' + (index + 1) + ' из ' + ASSEMBLY_STEPS.length + ' — ' + step.title + '</h4>' +
        '<p>' + step.text + '</p>' +
        '<p class="warn">' + step.warn + '</p>';
      const box = new T.Box3();
      step.parts.forEach((id) => { if (parts[id]) box.union(boxOf(id)); });
      if (!box.isEmpty()) {
        const center = box.getCenter(new T.Vector3());
        const size = box.getSize(new T.Vector3()).length();
        controls.target.copy(center);
        camera.position.set(center.x + size * 1.05, center.y + size * 0.7, center.z + size * 1.05);
        controls.update();
      }
    }
    $$('.step-item').forEach((el, i) => el.classList.toggle('active', i === index));
  }

  /* ============================================================
     9. ИНТЕРФЕЙС
     ============================================================ */
  function buildCatalog() {
    const groups = ['all'].concat(Object.keys(PART_GROUPS));
    const chips = $('#group-chips');
    chips.innerHTML = '';
    groups.forEach((g) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip' + (g === 'all' ? ' on' : '');
      b.textContent = g === 'all' ? 'Все' : PART_GROUPS[g];
      b.dataset.group = g;
      b.addEventListener('click', () => {
        $$('#group-chips .chip').forEach((c) => c.classList.toggle('on', c === b));
        renderCatalog();
      });
      chips.appendChild(b);
    });
    renderCatalog();
    $('#catalog-search').addEventListener('input', renderCatalog);
  }

  function renderCatalog() {
    const q = ($('#catalog-search').value || '').trim().toLowerCase();
    const active = $('#group-chips .chip.on');
    const group = active ? active.dataset.group : 'all';
    const list = $('#catalog-list');
    list.innerHTML = '';

    let shown = 0;
    Object.keys(PART_GROUPS).forEach((key) => {
      if (group !== 'all' && group !== key) return;
      const items = PARTS.filter((p) => p.group === key &&
        (!q || p.name.toLowerCase().indexOf(q) >= 0 || p.role.toLowerCase().indexOf(q) >= 0));
      if (!items.length) return;

      const head = document.createElement('p');
      head.className = 'catalog-group';
      head.textContent = PART_GROUPS[key];
      list.appendChild(head);

      items.forEach((p) => {
        const el = document.createElement('button');
        el.type = 'button';
        el.className = 'part-item' + (installed(p.id) ? '' : ' is-out');
        el.dataset.id = p.id;
        el.innerHTML = '<span class="pi-name">' + p.name + '</span><span class="pi-qty">' + p.qty + '</span>';
        el.addEventListener('click', () => {
          select(p.id, true);
          if (window.innerWidth < 1100) $('#panel-right').scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
        list.appendChild(el);
        shown++;
      });
    });
    if (!shown) list.innerHTML = '<p class="hint-soft">Ничего не найдено — измените запрос.</p>';
  }

  function buildSteps() {
    const list = $('#steps-list');
    ASSEMBLY_STEPS.forEach((s, i) => {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'step-item';
      el.innerHTML = '<b>' + (i + 1) + '</b><span>' + s.title + '</span>';
      el.addEventListener('click', () => showStep(i));
      list.appendChild(el);
    });
  }

  function buildQuiz() {
    const box = $('#quiz-list');
    let right = 0;
    let answered = 0;

    QUIZ.forEach((item, qi) => {
      const card = document.createElement('div');
      card.className = 'quiz-card';
      card.innerHTML = '<p class="quiz-q">' + (qi + 1) + '. ' + item.q + '</p>';
      const opts = document.createElement('div');
      opts.className = 'quiz-opts';

      item.answers.forEach((text, ai) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'quiz-opt';
        b.textContent = text;
        b.addEventListener('click', () => {
          if (card.dataset.done) return;
          card.dataset.done = '1';
          answered++;
          const ok = ai === item.right;
          if (ok) right++;
          b.classList.add(ok ? 'right' : 'wrong');
          if (!ok) opts.children[item.right].classList.add('right');
          const why = document.createElement('p');
          why.className = 'quiz-why';
          why.textContent = (ok ? 'Верно. ' : 'Неверно. ') + item.why;
          card.appendChild(why);
          $('#quiz-score').textContent = 'Правильно: ' + right + ' из ' + answered + ' отвеченных (всего вопросов ' + QUIZ.length + ')';
        });
        opts.appendChild(b);
      });

      card.appendChild(opts);
      box.appendChild(card);
    });

    $('#quiz-score').textContent = 'Отвечено 0 из ' + QUIZ.length;
  }

  function fillSpecs() {
    const box = $('#specs');
    ENGINE.specs.forEach((s) => {
      const el = document.createElement('div');
      el.className = 'spec';
      el.innerHTML = '<span class="spec-label">' + s.label + '</span>' +
        '<b class="spec-value">' + s.value + '</b>' +
        '<span class="spec-note">' + s.note + '</span>';
      box.appendChild(el);
    });
    document.title = ENGINE.name + ' — устройство V12 в 3D';
  }

  /* ============================================================
     10. КНОПКИ, МЫШЬ, КЛАВИАТУРА
     ============================================================ */
  let currentView = 'full';

  function setView(name) {
    const p = CAMERA_PRESETS[name];
    if (!p) return;
    currentView = name;

    /* Направление взгляда берём из пресета, а расстояние считаем по размеру
       установленных деталей и пропорциям экрана. В вертикальном положении
       телефона кадр узкий: фиксированное расстояние обрезало бы двигатель. */
    const box = new T.Box3();
    partIds.forEach((id) => { if (installed(id)) box.expandByObject(parts[id]); });

    const center = box.isEmpty()
      ? new T.Vector3(0, ENGINE_Y + 80, 0)
      : box.getCenter(new T.Vector3());

    const dir = new T.Vector3(
      p.pos[0] - p.target[0],
      p.pos[1] - p.target[1],
      p.pos[2] - p.target[2]
    ).normalize();

    const sphere = box.isEmpty() ? { radius: 700 } : box.getBoundingSphere(new T.Sphere());
    const vFov = camera.fov * Math.PI / 180;
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * camera.aspect);
    const dist = Math.max(
      sphere.radius / Math.sin(vFov / 2),
      sphere.radius / Math.sin(hFov / 2)
    ) * 1.15;

    controls.target.copy(center);
    camera.position.copy(center).addScaledVector(dir, Math.max(dist, 260));
    controls.update();
  }

  $('#btn-reset').addEventListener('click', () => { setView('full'); select(null); if (isolated) toggleIsolate(selectedId); });
  $('#btn-xray').addEventListener('click', () => { xray = !xray; applyXray(); });
  $('#btn-rotate').addEventListener('click', (e) => {
    controls.autoRotate = !controls.autoRotate;
    e.currentTarget.classList.toggle('on', controls.autoRotate);
  });
  $('#btn-isolate').addEventListener('click', () => { if (selectedId) toggleIsolate(selectedId); else toast('Сначала выберите деталь.'); });
  $('#btn-hint').addEventListener('click', giveHint);
  $('#btn-train-reset').addEventListener('click', resetTrainer);
  $('#explode').addEventListener('input', (e) => { explodeAmount = Number(e.target.value) / 100; });

  $$('[data-view]').forEach((b) => b.addEventListener('click', () => setView(b.dataset.view)));

  /* --- мышь: захват детали, клик и подсветка --- */
  let hoverThrottle = 0;
  let downX = 0, downY = 0, moved = false, wheelUsed = false;

  renderer.domElement.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    downX = e.clientX; downY = e.clientY;
    moved = false; wheelUsed = false;
    const id = pickAt(e.clientX, e.clientY);
    grabbed = id;
    select(id, false);
    if (id) renderer.domElement.style.cursor = 'grabbing';
  });

  renderer.domElement.addEventListener('pointermove', (e) => {
    if (grabbed && (Math.abs(e.clientX - downX) > 6 || Math.abs(e.clientY - downY) > 6)) moved = true;
    const now = performance.now();
    if (now - hoverThrottle < 90) return;
    hoverThrottle = now;
    if (!grabbed) renderer.domElement.style.cursor = pickAt(e.clientX, e.clientY) ? 'pointer' : 'grab';
  });

  window.addEventListener('pointerup', () => {
    if (grabbed && !moved && !wheelUsed) focusOn(grabbed, 1.4);
    grabbed = null;
    renderer.domElement.style.cursor = 'grab';
  });

  /* Колесо перехватываем в фазе перехвата на документе: иначе OrbitControls
     успел бы приблизить камеру вместо того, чтобы снять деталь. */
  document.addEventListener('wheel', (e) => {
    if (!grabbed) return;
    if (e.target !== renderer.domElement) return;
    e.preventDefault();
    e.stopPropagation();
    wheelUsed = true;
    attempt(grabbed, e.deltaY < 0 ? 'out' : 'in');
  }, { passive: false, capture: true });

  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT') return;
    if (e.key === 'r' || e.key === 'R' || e.key === 'к' || e.key === 'К') setView('full');
    if (e.key === 'x' || e.key === 'X' || e.key === 'ч' || e.key === 'Ч') { xray = !xray; applyXray(); }
    if (e.key === 'h' || e.key === 'H' || e.key === 'р' || e.key === 'Р') giveHint();
    if (e.key === ' ') { controls.autoRotate = !controls.autoRotate; $('#btn-rotate').classList.toggle('on', controls.autoRotate); e.preventDefault(); }
    if (e.key === 'Escape') {
      select(null);
      if (isolated) { isolated = false; partIds.forEach((id) => setVisible(id, true)); }
    }
  });

  function resize() {
    /* Размер берём у самого холста: на телефоне он задан отдельно от сцены,
       и высота сцены там не равна высоте холста */
    const rect = renderer.domElement.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width));
    const h = Math.max(1, Math.round(rect.height));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  window.addEventListener('resize', () => {
    const before = camera.aspect;
    resize();
    /* Пересобираем кадр только при заметной смене пропорций — например при
       повороте телефона. Скрытие адресной строки так кадр не дёргает. */
    if (before && Math.abs(camera.aspect - before) / before > 0.12) setView(currentView);
  });

  /* ============================================================
     11. ЗАПУСК
     ============================================================ */
  buildCatalog();
  buildSteps();
  buildQuiz();
  fillSpecs();
  resize();                 /* сначала узнаём пропорции экрана */
  setView('full');          /* и только потом выбираем расстояние камеры */
  applyXray();
  updateStats();

  /* --- состояние из адреса:
         ?explode=55&xray=1&step=2&out=cam_cover,intake_manifold --- */
  try {
    const qs = new URLSearchParams(window.location.search);
    if (qs.has('explode')) {
      const v = Math.max(0, Math.min(100, Number(qs.get('explode')) || 0));
      $('#explode').value = String(v);
      explodeAmount = v / 100;
    }
    if (qs.get('xray') === '1') { xray = true; applyXray(); }
    if (qs.has('out')) {
      qs.get('out').split(',').forEach((raw) => {
        const id = raw.trim();
        if (parts[id]) state[id] = 'out';
      });
      updateStats();
    }
    if (qs.has('step')) {
      const n = Number(qs.get('step'));
      if (n >= 0 && n < ASSEMBLY_STEPS.length) showStep(n);
    }
    /* ?try=belt:out,camshaft:out — прогнать решения через проверку порядка.
       Нужно для ссылок и для проверки, что правила работают. */
    if (qs.has('try')) {
      qs.get('try').split(',').forEach((raw) => {
        const bits = raw.split(':');
        if (bits.length === 2) attempt(bits[0].trim(), bits[1].trim() === 'in' ? 'in' : 'out');
      });
    }
  } catch (err) { /* параметры не разобрались — работаем как обычно */ }

  /* ============================================================
     11б. РАБОТА ДВИГАТЕЛЯ: кинематика, фазы, индикация
     ============================================================ */
  const motion = root.userData.motion;
  const MP = motion ? motion.params : null;

  const RUN = {
    on: false,
    angle: 0,            /* угол коленвала, 0…720° */
    rpm: 45,
    chainPhase: 0,
    panelAt: 0
  };

  const MAX_LIFT = 9.5;                     /* ход клапана, мм */
  const IN_OPEN = 350, IN_CLOSE = 570;      /* впуск открыт с 350° до 570° */
  const EX_OPEN = 130, EX_CLOSE = 380;      /* выпуск открыт с 130° до 380° */

  const STROKES = [
    { name: 'впуск', cls: 'st-in' },
    { name: 'сжатие', cls: 'st-comp' },
    { name: 'рабочий ход', cls: 'st-power' },
    { name: 'выпуск', cls: 'st-ex' }
  ];

  /* Подъём клапана: плавная волна от открытия до закрытия */
  function liftCurve(u, open, close) {
    let d = u - open;
    const span = close - open;
    if (d < 0) d += 720;
    if (d > span) return 0;
    return MAX_LIFT * Math.sin(Math.PI * d / span);
  }

  /* Полный ход поршня вдоль оси цилиндра для текущего угла коленвала */
  function pinAt(psi, th) {
    const a = psi + th;
    return MP.CRANK_R * Math.cos(a) + Math.sqrt(MP.ROD * MP.ROD - Math.pow(MP.CRANK_R * Math.sin(a), 2));
  }

  const alongBoreRoot = (s, x, d) =>
    new T.Vector3(x, d * Math.cos(MP.BANK), s * d * Math.sin(MP.BANK));

  const cylKey = (s, i) => (s < 0 ? 'Л' : 'П') + (i + 1);

  /* Углы вспышек. ВМТ у цилиндра при θ = −psi (mod 360), и на каждой ВМТ
     вспышки получают по очереди два цилиндра, стоящие в ней: один сейчас,
     второй через оборот. Поэтому у четырёхтактного V12 вспышки идут ровно
     через каждые 60° поворота коленвала. */
  const firing = {};
  const firingOrder = [];

  if (MP) {
    const byTdc = {};
    motion.pistons.forEach((p) => {
      const tdc = ((-p.psi * 180 / Math.PI) % 360 + 360) % 360;
      const key = Math.round(tdc);
      if (!byTdc[key]) byTdc[key] = [];
      byTdc[key].push(p);
    });
    Object.keys(byTdc).map(Number).sort((a, b) => a - b).forEach((tdc) => {
      byTdc[tdc].forEach((p, n) => {
        firing[cylKey(p.s, p.i)] = (tdc + n * 360) % 720;
      });
    });
    Object.keys(firing)
      .sort((a, b) => firing[a] - firing[b])
      .forEach((k) => firingOrder.push(k));
  }

  /* --- панель: двенадцать цилиндров и их такты --- */
  function buildRunPanel() {
    const box = $('#run-cyls');
    if (!box) return;
    box.innerHTML = '';
    Object.keys(firing).sort((a, b) => (a < b ? -1 : 1)).forEach((key) => {
      const card = document.createElement('div');
      card.className = 'cyl-card';
      card.dataset.key = key;
      card.innerHTML = '<b>' + key + '</b><span class="cyl-strokes">' +
        '<i class="st-in"></i><i class="st-comp"></i><i class="st-power"></i><i class="st-ex"></i></span>';
      box.appendChild(card);
    });

    const order = $('#run-order');
    if (order) {
      order.innerHTML = '<span>Порядок работы (у этой модели):</span> ' +
        firingOrder.map((k) => '<b>' + k + '</b>').join(' → ');
    }
  }

  function updateRunPanel() {
    const readout = $('#run-angle');
    if (readout) readout.textContent = Math.round(RUN.angle) + '°';

    $$('#run-cyls .cyl-card').forEach((card) => {
      const key = card.dataset.key;
      const fu = firing[key];
      if (fu === undefined) return;
      const u = ((RUN.angle - fu) % 720 + 720) % 720;
      const seg = Math.floor(((u + 360) % 720) / 180);      /* 0 впуск … 3 выпуск */
      const parts = card.querySelectorAll('.cyl-strokes i');
      for (let i = 0; i < parts.length; i++) parts[i].classList.toggle('on', i === seg);
      card.classList.toggle('firing', u < 40);
    });
  }

  /* --- пересчёт положения деталей под текущий угол --- */
  const _q = new T.Quaternion();
  const _e = new T.Euler();
  const _m = new T.Matrix4();
  const _one = new T.Vector3(1, 1, 1);
  const _sc = new T.Vector3(1, 1, 1);
  const _p1 = new T.Vector3();
  const _p2 = new T.Vector3();
  const _up = new T.Vector3(0, 1, 0);
  const _ux = new T.Vector3(1, 0, 0);

  function setInst(mesh, n, pos, rot, scaleY) {
    _e.set(rot[0], rot[1], rot[2]);
    _q.setFromEuler(_e);
    _sc.set(1, scaleY === undefined ? 1 : scaleY, 1);
    _m.compose(pos, _q, _sc);
    mesh.setMatrixAt(n, _m);
  }

  function updateMotion(dt) {
    if (!MP || !RUN.on) return;
    RUN.angle = (RUN.angle + RUN.rpm * 6 * dt) % 720;      /* об/мин → градусы в секунду */
    const th = RUN.angle * Math.PI / 180;

    /* поршни, кольца, пальцы, шатуны, вкладыши */
    if (installed('piston')) {
      motion.pistons.forEach((p) => {
        const d = pinAt(p.psi, th);
        const pin = alongBoreRoot(p.s, p.x, d);
        _p2.set(p.x, MP.CRANK_R * Math.cos(p.phi + th), MP.CRANK_R * Math.sin(p.phi + th));
        _p1.subVectors(pin, _p2).normalize();
        _q.setFromUnitVectors(_up, _p1);

        p.pistonG.position.copy(pin);
        p.ringsG.position.copy(pin);
        p.pinG.position.copy(pin);
        p.rodG.position.copy(_p2);
        p.rodG.quaternion.copy(_q);
        p.bearingG.position.copy(_p2);
        p.bearingG.quaternion.copy(_q);
      });
    }

    /* клапаны: стержень, тарелка, пружина (сжимается), толкатель, шайба */
    if (installed('valve')) {
      const vm = motion.valveMeshes;
      const springLen = vm.springLen;
      motion.valves.forEach((v, n) => {
        const fu = firing[cylKey(v.bank, v.cyl)];
        if (fu === undefined) return;
        const u = ((RUN.angle - fu) % 720 + 720) % 720;
        const lift = v.side === 'in'
          ? liftCurve(u, IN_OPEN, IN_CLOSE)
          : liftCurve(u, EX_OPEN, EX_CLOSE);

        /* клапан идёт вниз, к цилиндру */
        _p1.copy(v.head).addScaledVector(v.axis, -lift);
        setInst(vm.heads, n, _p1, v.rot);
        _p1.copy(v.stem).addScaledVector(v.axis, -lift);
        setInst(vm.stems, n, _p1, v.rot);
        _p1.copy(v.retainer).addScaledVector(v.axis, -lift);
        setInst(vm.retainers, n, _p1, v.rot);
        _p1.copy(v.bucket).addScaledVector(v.axis, -lift);
        setInst(vm.buckets, n, _p1, v.rot);
        _p1.copy(v.shim).addScaledVector(v.axis, -lift);
        setInst(vm.shims, n, _p1, v.rot);

        /* пружина: низ стоит на месте, верх идёт за тарелкой */
        _p1.copy(v.spring).addScaledVector(v.axis, -lift / 2);
        setInst(vm.springs, n, _p1, v.rot, (springLen - lift) / springLen);
      });
      vm.heads.instanceMatrix.needsUpdate = true;
      vm.stems.instanceMatrix.needsUpdate = true;
      vm.retainers.instanceMatrix.needsUpdate = true;
      vm.buckets.instanceMatrix.needsUpdate = true;
      vm.shims.instanceMatrix.needsUpdate = true;
      vm.springs.instanceMatrix.needsUpdate = true;
    }

    /* распредвалы: вдвое медленнее коленвала */
    if (installed('camshaft')) {
      motion.camLobes.forEach((l) => {
        const fu = firing[cylKey(l.bank, l.cyl)] || 0;
        const phase = (fu * Math.PI / 180) / 2 + (l.kind === 'ex' ? Math.PI : 0);
        l.mesh.rotation.x = phase + RUN.angle * Math.PI / 360;
      });
    }

    /* цепь бежит по контуру */
    if (motion.chain && installed('chain')) {
      const ch = motion.chain;
      RUN.chainPhase = (RUN.chainPhase + (RUN.rpm * 6 * dt) / 360) % 1;
      for (let i = 0; i < ch.count; i++) {
        const t = ((i / ch.count) + RUN.chainPhase) % 1;
        const pos = ch.curve.getPointAt(t);
        const tan = ch.curve.getTangentAt(t);
        _q.setFromUnitVectors(_ux, tan);
        _m.compose(pos, _q, _one);
        ch.plates.setMatrixAt(i, _m);
        _p1.copy(pos).addScaledVector(tan, 9);
        _m.compose(_p1, _q, _one);
        ch.pins.setMatrixAt(i, _m);
      }
      ch.plates.instanceMatrix.needsUpdate = true;
      ch.pins.instanceMatrix.needsUpdate = true;
    }

    /* индикацию обновляем реже, чем кадры: так дешевле для браузера */
    const now = performance.now();
    if (now - RUN.panelAt > 90) {
      RUN.panelAt = now;
      updateRunPanel();
    }
  }

  const btnRun = $('#btn-run');
  if (btnRun) {
    btnRun.addEventListener('click', () => {
      RUN.on = !RUN.on;
      btnRun.textContent = RUN.on ? 'Остановить двигатель' : 'Запустить двигатель';
      btnRun.classList.toggle('on', RUN.on);
      if (!RUN.on) updateRunPanel();
    });
  }

  const speed = $('#run-speed');
  if (speed) {
    speed.addEventListener('input', () => {
      RUN.rpm = Number(speed.value);
      const out = $('#run-rpm');
      if (out) out.textContent = String(RUN.rpm);
    });
  }

  /* запуск прямо из адреса: ?run=1&rpm=120 — удобно дать ссылкой */
  try {
    const q2 = new URLSearchParams(window.location.search);
    if (q2.get('run') === '1') {
      RUN.on = true;
      if (btnRun) { btnRun.textContent = 'Остановить двигатель'; btnRun.classList.add('on'); }
      if (q2.has('rpm')) {
        const r = Math.max(10, Math.min(300, Number(q2.get('rpm')) || 45));
        RUN.rpm = r;
        if (speed) speed.value = String(r);
        const out = $('#run-rpm');
        if (out) out.textContent = String(r);
      }
      updateRunPanel();
    }
  } catch (err) { /* параметр не разобрался — работаем как обычно */ }

  /* панель строим здесь: к этому моменту порядок работы уже посчитан */
  buildRunPanel();

  /* ============================================================
     12. ЦИКЛ ОТРИСОВКИ: плавный выезд деталей и вращение снятых
     ============================================================ */
  let prevTime = performance.now();
  let firstFrame = true;
  let sceneVisible = true;

  /* Сцена рисуется только пока она есть на экране. Как только зритель
     прокрутил её вниз, отрисовка полностью останавливается — поэтому
     длинная страница больше не тормозит при прокрутке. */
  const stageBox = renderer.domElement.parentElement;
  if ('IntersectionObserver' in window) {
    new IntersectionObserver((entries) => {
      sceneVisible = entries[0].isIntersecting;
    }, { rootMargin: '180px' }).observe(stageBox);
  }

  /* Во время прокрутки рисуем через кадр: видеокарта не спорит с прокруткой
     за каждый кадр, и страница идёт ровно. Через 160 мс после остановки
     снова рисуем в полную силу. */
  let scrolling = false;
  let scrollTimer = 0;
  let frameCount = 0;
  window.addEventListener('scroll', () => {
    scrolling = true;
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(() => { scrolling = false; }, 160);
  }, { passive: true });

  function loop() {
    requestAnimationFrame(loop);

    const now = performance.now();
    const dt = Math.min((now - prevTime) / 1000, 0.1);
    prevTime = now;

    /* кадры не тратим, если сцена за пределами экрана или вкладка свёрнута */
    if (!sceneVisible || document.hidden) return;
    if (scrolling && (frameCount++ % 2)) return;

    let moved = false;

    partIds.forEach((id) => {
      const p = parts[id];
      const target = installed(id) ? 0 : 1;
      const v = p.userData.vis + (target - p.userData.vis) * Math.min(dt * 6, 1);
      p.userData.vis = Math.abs(target - v) < 0.002 ? target : v;

      /* Снятая деталь уезжает по дуге на своё место в кольце вокруг мотора */
      const park = p.userData.park;
      const base = p.userData.base;
      const ex = explodeAmount * 430;
      p.position.set(
        base.x + (park.x - base.x) * v + p.userData.explode.x * ex,
        base.y + (park.y - base.y) * v + Math.sin(Math.PI * v) * 300 + p.userData.explode.y * ex,
        base.z + (park.z - base.z) * v + p.userData.explode.z * ex
      );

      /* снятая деталь медленно поворачивается — её можно рассмотреть */
      if (p.userData.vis > 0.02) {
        p.userData.spin += dt * 0.7 * p.userData.vis;
        p.rotation.set(p.userData.baseRot.x, p.userData.baseRot.y + p.userData.spin, p.userData.baseRot.z);
        moved = true;
      } else if (p.userData.spin !== 0) {
        p.userData.spin = 0;
        p.rotation.copy(p.userData.baseRot);
        moved = true;
      }

      /* карту теней обновляем только если что-то действительно сдвинулось */
      if (!p.userData.prevPos) {
        p.userData.prevPos = p.position.clone();
        moved = true;
      } else if (p.position.distanceToSquared(p.userData.prevPos) > 0.05) {
        p.userData.prevPos.copy(p.position);
        moved = true;
      }
    });

    /* анимация работы двигателя: коленвал, поршни, клапаны, распредвалы, цепь */
    updateMotion(dt);
    if (RUN.on) moved = true;

    if (moved) renderer.shadowMap.needsUpdate = true;

    controls.update();
    renderer.render(scene, camera);

    if (firstFrame) {
      firstFrame = false;
      const l = $('#loader');
      if (l) l.classList.add('hidden');
    }
  }
  loop();

  renderer.domElement.style.cursor = 'grab';
})();
