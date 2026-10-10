/* ============================================================
   «Звёздная пыль» — интерактивный фон на чистом JavaScript.

   Что происходит:
   1. Слой #dust  — пылинки: медленно дрейфуют и мерцают.
   2. Слой #sparks — искры:
      • зажал кнопку и держишь — мерцание вращается ВОКРУГ курсора;
      • ведёшь курсором — шлейф начинается ОТ курсора и тянется за ним;
      • клик — вспышка искр и волна.
   3. Панель справа меняет цвет и поведение эффекта на лету.
      Настройки сохраняются в браузере и переносятся ссылкой.
   ============================================================ */

const TAU = Math.PI * 2;

const dustCanvas = document.getElementById('dust');
const sparkCanvas = document.getElementById('sparks');
const dctx = dustCanvas.getContext('2d');
const sctx = sparkCanvas.getContext('2d');
const hint = document.querySelector('.hint');
const panel = document.getElementById('panel');
const panelToggle = document.getElementById('panelToggle');

// Системная настройка «уменьшить движение» — делаем эффект спокойнее
const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ============================================================
   1. НАСТРОЙКИ
   ============================================================ */

const DEFAULTS = {
  // Цвет
  palette: 'rainbow',      // rainbow | cold | warm | neon | mono
  hueSpeed: 0.7,           // скорость переливания радуги
  hueBase: 205,            // базовый оттенок для «одного оттенка» и холодной темы
  hueSpread: 70,           // разброс оттенков между искрами
  saturation: 100,         // насыщенность цвета искр, %
  lightness: 62,           // базовая яркость цвета искр, %

  // Мерцание
  sparkRate: 4,            // сколько искр рождается за кадр при движении
  sparkSize: 1.4,          // размер искры
  glow: 5,                 // размер ореола (0 — без свечения)
  trail: 0.075,            // скорость затухания шлейфа: меньше — след живёт дольше
  life: 1,                 // время жизни искр (больше — дольше)
  flicker: 3,              // частота мерцания

  // Удержание кнопки
  holdMode: 'vortex',      // vortex | ring | cloud
  holdRadius: 26,          // радиус вихря вокруг курсора
  holdSpin: 0.07,          // скорость вращения вихря
  holdRate: 3,             // плотность вихря

  // Клик
  clickBurst: 90,          // сколько искр выбрасывать при клике
  ripple: true,            // показывать волну-кольцо

  // Пыль и небо
  dustDensity: 1,          // плотность пылинок
  dustBright: 1,           // яркость пылинок
  dustDrift: 1,            // скорость дрейфа пылинок
  meteors: true,           // падающие звёзды
  meteorEvery: 8,          // средняя пауза между метеорами, секунды

  // Прочее
  autoDemo: false,         // при открытии ничего не летает само: только пыль и подсказка
  hint: true,              // показывать подсказку
  panelOpen: true          // панель настроек раскрыта
};

const settings = Object.assign({}, DEFAULTS);

// Название сохранённых настроек в браузере.
// Версия в конце — чтобы старые сохранения (с включённым автопоказом) не подтягивались.
const STORE_KEY = 'zvezdnaya-pyl-nastroiki-v2';

/* Загрузка: сначала параметры в ссылке, потом сохранённое, потом умолчания */
function loadSettings() {
  Object.assign(settings, readFromUrl());
  try {
    const saved = localStorage.getItem(STORE_KEY);
    if (saved) {
      const data = JSON.parse(saved);
      for (const key of Object.keys(DEFAULTS)) {
        if (key in data && !(key in readFromUrl())) settings[key] = data[key];
      }
    }
  } catch (err) {
    /* испорченное хранилище просто игнорируем */
  }
}

function readFromUrl() {
  const params = new URLSearchParams(location.search);
  const out = {};
  for (const key of Object.keys(DEFAULTS)) {
    if (!params.has(key)) continue;
    const raw = params.get(key);
    const def = DEFAULTS[key];
    if (typeof def === 'boolean') out[key] = raw === '1' || raw === 'true';
    else if (typeof def === 'number') {
      const num = Number(raw);
      if (!Number.isNaN(num)) out[key] = num;
    } else out[key] = raw;
  }
  return out;
}

function saveSettings() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(settings)); } catch (err) { /* приватный режим */ }
}

function resetSettings() {
  Object.assign(settings, DEFAULTS);
  createDust();
  buildPanel();
  applyPanelState();
  applyHintState();
  saveSettings();
}

/* Случайная, но приятная палитра */
function randomPalette() {
  const palettes = ['rainbow', 'cold', 'warm', 'neon', 'mono'];
  settings.palette = palettes[Math.floor(Math.random() * palettes.length)];
  settings.hueBase = Math.round(Math.random() * 360);
  settings.hueSpread = 40 + Math.round(Math.random() * 110);
  settings.saturation = 70 + Math.round(Math.random() * 30);
  settings.lightness = 55 + Math.round(Math.random() * 15);
  settings.hueSpeed = Number((Math.random() * 1.6).toFixed(2));
  buildPanel();
  saveSettings();
}

/* Ссылка с текущими настройками — можно отправить заказчику */
function copyLink() {
  const params = new URLSearchParams();
  for (const key of Object.keys(DEFAULTS)) {
    if (settings[key] !== DEFAULTS[key]) {
      params.set(key, typeof settings[key] === 'boolean' ? (settings[key] ? '1' : '0') : settings[key]);
    }
  }
  const url = location.origin + location.pathname + (params.toString() ? '?' + params : '');
  const done = () => flashButton('Ссылка скопирована');
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(url).then(done, () => window.prompt('Скопируй ссылку:', url));
  } else {
    window.prompt('Скопируй ссылку:', url);
  }
}

/* ============================================================
   2. ПАНЕЛЬ НАСТРОЕК
   ============================================================ */

const CONTROLS = [
  {
    title: 'Цвет',
    items: [
      { key: 'palette', type: 'select', label: 'Палитра', options: [
        ['rainbow', 'Радуга — весь спектр'],
        ['cold', 'Холодная — синий и бирюза'],
        ['warm', 'Тёплая — золото и огонь'],
        ['neon', 'Неон — маджента и циан'],
        ['mono', 'Один оттенок']
      ] },
      { key: 'hueSpeed', type: 'range', label: 'Скорость переливания', min: 0, max: 3, step: 0.05 },
      { key: 'hueBase', type: 'range', label: 'Основной оттенок', min: 0, max: 360, step: 1, suffix: '°' },
      { key: 'hueSpread', type: 'range', label: 'Разброс оттенков', min: 0, max: 180, step: 1, suffix: '°' },
      { key: 'saturation', type: 'range', label: 'Насыщенность', min: 30, max: 100, step: 1, suffix: '%' },
      { key: 'lightness', type: 'range', label: 'Яркость цвета', min: 35, max: 90, step: 1, suffix: '%' }
    ]
  },
  {
    title: 'Мерцание',
    items: [
      { key: 'sparkRate', type: 'range', label: 'Плотность шлейфа', min: 1, max: 12, step: 1 },
      { key: 'sparkSize', type: 'range', label: 'Размер искр', min: 0.4, max: 4, step: 0.1 },
      { key: 'glow', type: 'range', label: 'Свечение вокруг искры', min: 0, max: 10, step: 0.5 },
      { key: 'trail', type: 'range', label: 'Длина шлейфа', min: 0.02, max: 0.25, step: 0.005, hint: 'правее — след короче' },
      { key: 'life', type: 'range', label: 'Время жизни искр', min: 0.4, max: 2, step: 0.1 },
      { key: 'flicker', type: 'range', label: 'Частота мерцания', min: 0.5, max: 8, step: 0.1 }
    ]
  },
  {
    title: 'Удержание кнопки',
    items: [
      { key: 'holdMode', type: 'select', label: 'Как ведёт себя мерцание', options: [
        ['vortex', 'Вихрь вокруг курсора'],
        ['ring', 'Пульсирующее кольцо'],
        ['cloud', 'Облако на месте']
      ] },
      { key: 'holdRadius', type: 'range', label: 'Радиус вихря', min: 6, max: 90, step: 1, suffix: 'px' },
      { key: 'holdSpin', type: 'range', label: 'Скорость вращения', min: 0, max: 0.3, step: 0.005 },
      { key: 'holdRate', type: 'range', label: 'Плотность вихря', min: 1, max: 10, step: 1 }
    ]
  },
  {
    title: 'Клик',
    items: [
      { key: 'clickBurst', type: 'range', label: 'Искр при клике', min: 0, max: 240, step: 10 },
      { key: 'ripple', type: 'check', label: 'Волна-кольцо от клика' }
    ]
  },
  {
    title: 'Пыль и небо',
    items: [
      { key: 'dustDensity', type: 'range', label: 'Плотность пыли', min: 0.2, max: 2.5, step: 0.1 },
      { key: 'dustBright', type: 'range', label: 'Яркость пыли', min: 0.3, max: 2, step: 0.1 },
      { key: 'dustDrift', type: 'range', label: 'Дрейф пыли', min: 0, max: 3, step: 0.1 },
      { key: 'meteors', type: 'check', label: 'Падающие звёзды' },
      { key: 'meteorEvery', type: 'range', label: 'Пауза между метеорами', min: 3, max: 30, step: 1, suffix: ' с' }
    ]
  },
  {
    title: 'Прочее',
    items: [
      { key: 'autoDemo', type: 'check', label: 'Автопоказ при открытии' },
      { key: 'hint', type: 'check', label: 'Подсказка внизу' }
    ]
  }
];

function buildPanel() {
  panel.innerHTML = '';

  const title = document.createElement('h2');
  title.textContent = 'Настройки эффекта';
  panel.append(title);

  const sub = document.createElement('p');
  sub.className = 'sub';
  sub.textContent = 'Меняй и смотри результат сразу — всё сохраняется.';
  panel.append(sub);

  for (const group of CONTROLS) {
    const box = document.createElement('div');
    box.className = 'group';

    const head = document.createElement('h3');
    head.textContent = group.title;
    box.append(head);

    for (const item of group.items) box.append(buildField(item));
    panel.append(box);
  }

  const buttons = document.createElement('div');
  buttons.className = 'buttons';
  buttons.append(makeButton('Случайная палитра', randomPalette));
  buttons.append(makeButton('Сбросить всё', resetSettings));
  buttons.append(makeButton('Скопировать ссылку с настройками', copyLink, 'wide'));
  panel.append(buttons);
}

function makeButton(text, action, extraClass) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.textContent = text;
  if (extraClass) btn.className = extraClass;
  btn.addEventListener('click', action);
  return btn;
}

function buildField(item) {
  const wrap = document.createElement('div');

  if (item.type === 'check') {
    wrap.className = 'check';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = Boolean(settings[item.key]);
    input.addEventListener('change', () => setSetting(item.key, input.checked));
    const label = document.createElement('span');
    label.textContent = item.label;
    wrap.append(input, label);
    return wrap;
  }

  wrap.className = 'field';
  const top = document.createElement('div');
  top.className = 'field-top';
  const name = document.createElement('span');
  name.textContent = item.label;
  const value = document.createElement('b');
  top.append(name, value);
  wrap.append(top);

  if (item.type === 'select') {
    value.remove();
    const select = document.createElement('select');
    for (const [val, text] of item.options) {
      const option = document.createElement('option');
      option.value = val;
      option.textContent = text;
      if (settings[item.key] === val) option.selected = true;
      select.append(option);
    }
    select.addEventListener('change', () => setSetting(item.key, select.value));
    wrap.append(select);
    return wrap;
  }

  // Ползунок
  const input = document.createElement('input');
  input.type = 'range';
  input.min = item.min;
  input.max = item.max;
  input.step = item.step;
  input.value = settings[item.key];
  value.textContent = formatValue(item, settings[item.key]);
  input.addEventListener('input', () => {
    const num = Number(input.value);
    value.textContent = formatValue(item, num);
    setSetting(item.key, num);
  });
  wrap.append(input);
  return wrap;
}

function formatValue(item, value) {
  const num = Number(value);
  const shown = item.step < 1 ? num.toFixed(item.step < 0.05 ? 3 : 2) : String(num);
  return shown + (item.suffix || '');
}

function setSetting(key, value) {
  settings[key] = value;

  if (key === 'dustDensity') createDust();
  if (key === 'meteors' && !value) meteors.length = 0;
  if (key === 'hint') applyHintState();
  if (key === 'autoDemo' && value) {
    auto.active = true;
    auto.t = 0;
  }

  saveSettings();
}

function applyPanelState() {
  panel.classList.toggle('collapsed', !settings.panelOpen);
}

function applyHintState() {
  hint.classList.toggle('hidden', !settings.hint);
}

function flashButton(text) {
  const buttons = panel.querySelectorAll('button');
  for (const btn of buttons) {
    if (btn.textContent.startsWith('Скопировать')) {
      const old = btn.textContent;
      btn.textContent = text;
      setTimeout(() => { btn.textContent = old; }, 1400);
    }
  }
}

/* ============================================================
   3. СОСТОЯНИЕ ЭФФЕКТА
   ============================================================ */

let W = 0;
let H = 0;
let time = 0;          // внутреннее время, секунды
let hue = 205;         // текущий оттенок радуги
let nextMeteor = 6;    // когда запускать следующий метеор
let moveAge = 0;       // сколько секунд назад двигался курсор

const dust = [];       // пылинки
const sparks = [];     // искры
const meteors = [];    // падающие звёзды
const ripples = [];    // волны от клика

const pointer = {
  x: 0, y: 0,
  dx: 0, dy: 0,        // сглаженная скорость за кадр
  down: false,
  seen: false,
  overPanel: false     // курсор над панелью — искры не сыплем
};

const auto = { active: settings.autoDemo, t: 0, duration: 8 };

/* ============================================================
   4. РАЗМЕРЫ ОКНА
   ============================================================ */

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  W = window.innerWidth;
  H = window.innerHeight;

  for (const canvas of [dustCanvas, sparkCanvas]) {
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    // Размер на экране задаём явно — иначе браузер показывает холст
    // по числу его пикселей, и при масштабе экрана 125–150% всё смещается
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    canvas.getContext('2d').setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  if (!pointer.seen) {
    pointer.x = W / 2;
    pointer.y = H / 2;
  }
  createDust();
}

/* ============================================================
   5. ПЫЛИНКИ
   ============================================================ */

function createDust() {
  dust.length = 0;

  const limit = calm ? 200 : 700;
  const count = Math.min(limit, Math.round((W * H) / 2400 * settings.dustDensity));

  for (let i = 0; i < count; i++) {
    const depth = Math.random();
    const warm = Math.random() < 0.12;      // редкие тёплые пылинки

    dust.push({
      x: Math.random() * W,
      y: Math.random() * H,
      r: 0.35 + depth * 1.5,
      a: 0.16 + depth * 0.55,                                  // яркость умножаем при отрисовке
      vx: (Math.random() - 0.5) * 0.07 * (0.4 + depth),        // и дрейф тоже
      vy: (Math.random() - 0.5) * 0.07 * (0.4 + depth),
      tw: 0.4 + Math.random() * 1.7,
      ph: Math.random() * TAU,
      h: warm ? 35 + Math.random() * 20 : 195 + Math.random() * 70,
      depth
    });
  }
}

function drawDust() {
  dctx.clearRect(0, 0, W, H);
  dctx.globalCompositeOperation = 'lighter';

  for (const p of dust) {
    p.x += p.vx * settings.dustDrift;      // дрейф берём из настроек на лету
    p.y += p.vy * settings.dustDrift;

    // Лёгкий сдвиг от положения курсора — ощущение глубины
    const ox = (pointer.x - W / 2) * 0.004 * p.depth;
    const oy = (pointer.y - H / 2) * 0.004 * p.depth;

    if (p.x < -12) p.x = W + 12;
    else if (p.x > W + 12) p.x = -12;
    if (p.y < -12) p.y = H + 12;
    else if (p.y > H + 12) p.y = -12;

    const twinkle = 0.45 + 0.55 * Math.sin(time * p.tw + p.ph);
    const alpha = p.a * settings.dustBright * (0.5 + twinkle * 0.5);
    const x = p.x + ox;
    const y = p.y + oy;

    dctx.fillStyle = `hsla(${p.h}, 75%, ${80 - p.depth * 14}%, ${alpha})`;
    dctx.beginPath();
    dctx.arc(x, y, p.r, 0, TAU);
    dctx.fill();

    if (p.depth > 0.6) {
      dctx.fillStyle = `hsla(${p.h}, 85%, 72%, ${alpha * 0.1})`;
      dctx.beginPath();
      dctx.arc(x, y, p.r * 4.5, 0, TAU);
      dctx.fill();
    }
  }

  dctx.globalCompositeOperation = 'source-over';
}

/* ============================================================
   6. ИСКРЫ
   ============================================================ */

/* Оттенок новой искры — зависит от выбранной палитры */
function pickHue() {
  const jitter = (Math.random() - 0.5) * settings.hueSpread;

  switch (settings.palette) {
    case 'cold': return 190 + Math.random() * 80 + jitter * 0.25;
    case 'warm': return 10 + Math.random() * 55 + jitter * 0.25;
    case 'neon': return (Math.random() < 0.5 ? 305 : 178) + jitter * 0.25;
    case 'mono': return settings.hueBase + jitter * 0.2;
    default:     return hue + jitter;          // радуга: hue переливается во времени
  }
}

/* Создать искру в заданной точке с заданной скоростью */
function pushSpark(x, y, vx, vy, decay) {
  sparks.push({
    x, y, vx, vy,
    life: 1,
    decay: decay / settings.life,
    size: settings.sparkSize * (0.5 + Math.random()),
    h: pickHue(),
    ph: Math.random() * TAU
  });

  const limit = calm ? 900 : 4000;
  if (sparks.length > limit) sparks.splice(0, sparks.length - limit);
}

/* ВИХРЬ: искры летят по кругу вокруг курсора */
function emitVortex(count) {
  const radius = settings.holdRadius;
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * TAU;
    const r = radius * (0.55 + Math.random() * 0.8);
    const spin = settings.holdSpin * (0.7 + Math.random() * 0.7);
    pushSpark(
      pointer.x + Math.cos(angle) * r,
      pointer.y + Math.sin(angle) * r,
      -Math.sin(angle) * r * spin,          // тангенциальная скорость — вращение
       Math.cos(angle) * r * spin,
      0.012 + Math.random() * 0.02
    );
  }
}

/* КОЛЬЦО: искры на окружности расходятся наружу */
function emitRing(count) {
  const radius = settings.holdRadius * 0.8;
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * TAU;
    const push = 0.2 + Math.random() * 0.5;
    pushSpark(
      pointer.x + Math.cos(angle) * radius,
      pointer.y + Math.sin(angle) * radius,
      Math.cos(angle) * push,
      Math.sin(angle) * push,
      0.014 + Math.random() * 0.018
    );
  }
}

/* ОБЛАКО: искры висят вокруг курсора и слегка шевелятся */
function emitCloud(count) {
  const radius = settings.holdRadius;
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * TAU;
    const r = radius * Math.random();
    pushSpark(
      pointer.x + Math.cos(angle) * r,
      pointer.y + Math.sin(angle) * r,
      (Math.random() - 0.5) * 0.7,
      (Math.random() - 0.5) * 0.7,
      0.012 + Math.random() * 0.02
    );
  }
}

/* ШЛЕЙФ: искры рождаются В точке курсора и летят назад по движению */
function emitTrail(count) {
  const direction = Math.atan2(pointer.dy, pointer.dx);
  const speed = Math.min(3, Math.hypot(pointer.dx, pointer.dy));

  for (let i = 0; i < count; i++) {
    const back = direction + Math.PI + (Math.random() - 0.5) * 1.1;
    const power = (0.25 + Math.random() * 0.9) * (0.6 + speed * 0.35);
    pushSpark(
      pointer.x + (Math.random() - 0.5) * 7,
      pointer.y + (Math.random() - 0.5) * 7,
      Math.cos(back) * power + pointer.dx * 0.12,
      Math.sin(back) * power + pointer.dy * 0.12,
      0.008 + Math.random() * 0.018
    );
  }
}

function emitHold(count) {
  if (settings.holdMode === 'ring') emitRing(count);
  else if (settings.holdMode === 'cloud') emitCloud(count);
  else emitVortex(count);
}

function drawSparks() {
  const S = settings.saturation;
  const L = settings.lightness;
  const glow = settings.glow;

  for (let i = sparks.length - 1; i >= 0; i--) {
    const p = sparks[i];

    p.x += p.vx;
    p.y += p.vy;
    p.vx *= 0.975;
    p.vy *= 0.975;
    p.life -= p.decay;

    if (p.life <= 0) {
      sparks.splice(i, 1);
      continue;
    }

    const flicker = 0.55 + 0.45 * Math.sin(time * settings.flicker + p.ph);
    const alpha = Math.max(0, p.life) * flicker;
    const radius = p.size * (0.35 + p.life);
    const light = Math.min(96, L + 30 * p.life);

    if (glow > 0) {
      sctx.fillStyle = `hsla(${p.h}, ${S}%, ${light}%, ${alpha * 0.18})`;
      sctx.beginPath();
      sctx.arc(p.x, p.y, radius * glow, 0, TAU);
      sctx.fill();
    }

    sctx.fillStyle = `hsla(${p.h}, ${S}%, ${light}%, ${alpha})`;
    sctx.beginPath();
    sctx.arc(p.x, p.y, radius, 0, TAU);
    sctx.fill();
  }
}

/* ============================================================
   7. МЕТЕОРЫ И ВОЛНЫ
   ============================================================ */

function spawnMeteor() {
  const fromLeft = Math.random() < 0.5;
  const speed = 5 + Math.random() * 5;

  meteors.push({
    x: fromLeft ? -60 : W + 60,
    y: Math.random() * H * 0.5,
    vx: fromLeft ? speed : -speed,
    vy: speed * (0.3 + Math.random() * 0.25),
    life: 1
  });
}

function drawMeteors() {
  for (let i = meteors.length - 1; i >= 0; i--) {
    const m = meteors[i];
    m.x += m.vx;
    m.y += m.vy;
    m.life -= 0.004;

    if (m.life <= 0) {
      meteors.splice(i, 1);
      continue;
    }

    const tailX = m.x - m.vx * 16;
    const tailY = m.y - m.vy * 16;
    const g = sctx.createLinearGradient(m.x, m.y, tailX, tailY);
    g.addColorStop(0, `hsla(200, 100%, 92%, ${m.life * 0.9})`);
    g.addColorStop(1, 'hsla(200, 100%, 92%, 0)');

    sctx.strokeStyle = g;
    sctx.lineWidth = 2;
    sctx.beginPath();
    sctx.moveTo(m.x, m.y);
    sctx.lineTo(tailX, tailY);
    sctx.stroke();
  }
}

function drawRipples() {
  for (let i = ripples.length - 1; i >= 0; i--) {
    const r = ripples[i];
    r.radius += 3;
    r.life -= 0.014;

    if (r.life <= 0) {
      ripples.splice(i, 1);
      continue;
    }

    sctx.strokeStyle = `hsla(${r.h}, ${settings.saturation}%, 72%, ${r.life * 0.5})`;
    sctx.lineWidth = 2;
    sctx.beginPath();
    sctx.arc(r.x, r.y, r.radius, 0, TAU);
    sctx.stroke();
  }
}

/* ============================================================
   8. АВТОПОКАЗ
   ============================================================ */

function runAutoDemo() {
  auto.t += 0.016;

  if (auto.t < 0.7) return;   // пауза, чтобы страница успела появиться

  const k = auto.t - 0.7;
  const nx = W / 2 + Math.cos(k * 0.6) * W * 0.22;
  const ny = H / 2 + Math.sin(k * 0.9) * H * 0.16;

  pointer.dx = Math.max(-40, Math.min(40, nx - pointer.x));
  pointer.dy = Math.max(-40, Math.min(40, ny - pointer.y));
  pointer.x = nx;
  pointer.y = ny;
  pointer.down = true;

  if (auto.t > auto.duration) {
    auto.active = false;
    pointer.down = false;
    pointer.dx = 0;
    pointer.dy = 0;
  }
}

/* ============================================================
   9. ГЛАВНЫЙ ЦИКЛ
   ============================================================ */

function frame() {
  time += 0.016;
  hue = (hue + settings.hueSpeed) % 360;
  moveAge += 0.016;

  if (auto.active) runAutoDemo();

  // Скорость курсора плавно затухает; когда курсор стоит — обнуляем её,
  // иначе мерцание уезжает в сторону последнего движения
  pointer.dx *= 0.8;
  pointer.dy *= 0.8;
  if (Math.hypot(pointer.dx, pointer.dy) < 0.05) {
    pointer.dx = 0;
    pointer.dy = 0;
  }

  if (pointer.down && !pointer.overPanel) {
    const dragging = moveAge < 0.1 && Math.hypot(pointer.dx, pointer.dy) > 0.4;
    if (dragging) emitTrail(settings.sparkRate);   // ведёшь — шлейф от курсора
    else emitHold(settings.holdRate);              // держишь — вихрь вокруг курсора
  }

  drawDust();

  // Верхний слой: слегка стираем старое (так и получается шлейф), затем рисуем новое
  sctx.globalCompositeOperation = 'destination-out';
  sctx.fillStyle = `rgba(0, 0, 0, ${settings.trail})`;
  sctx.fillRect(0, 0, W, H);

  sctx.globalCompositeOperation = 'lighter';
  if (settings.meteors) drawMeteors();
  if (settings.ripple) drawRipples();
  drawSparks();
  sctx.globalCompositeOperation = 'source-over';

  if (settings.meteors && !calm && time > nextMeteor) {
    spawnMeteor();
    nextMeteor = time + settings.meteorEvery * (0.6 + Math.random() * 0.8);
  }

  requestAnimationFrame(frame);
}

/* ============================================================
   10. СОБЫТИЯ
   ============================================================ */

function onDown(event) {
  if (event.target.closest && event.target.closest('.panel, .panel-toggle')) return;
  if (event.pointerType === 'mouse' && event.button !== 0) return;   // только левая кнопка

  // Если работал автопоказ — гасим его след, чтобы эффект сразу был у курсора
  if (auto.active) {
    auto.active = false;
    for (const p of sparks) p.decay *= 2.5;
  }

  pointer.down = true;
  pointer.seen = true;
  pointer.overPanel = false;
  pointer.dx = 0;                 // никакого уноса в сторону
  pointer.dy = 0;
  pointer.x = event.clientX;
  pointer.y = event.clientY;
  moveAge = 1;

  hint.classList.add('hidden');

  if (settings.ripple) {
    ripples.push({ x: event.clientX, y: event.clientY, radius: 0, life: 1, h: hue });
  }
  if (settings.clickBurst > 0) {
    for (let i = 0; i < settings.clickBurst; i++) {
      const angle = Math.random() * TAU;
      const power = 0.4 + Math.random() * 2.4;
      pushSpark(
        event.clientX, event.clientY,
        Math.cos(angle) * power,
        Math.sin(angle) * power,
        0.01 + Math.random() * 0.02
      );
    }
  }
}

function onMove(event) {
  pointer.overPanel = Boolean(event.target.closest && event.target.closest('.panel, .panel-toggle'));

  if (!pointer.seen) {
    pointer.seen = true;
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    return;
  }

  const dx = event.clientX - pointer.x;
  const dy = event.clientY - pointer.y;

  // Ограничиваем рывок, если курсор прыгнул далеко
  pointer.dx = Math.max(-40, Math.min(40, dx));
  pointer.dy = Math.max(-40, Math.min(40, dy));
  pointer.x = event.clientX;
  pointer.y = event.clientY;

  moveAge = 0;
  if (auto.active) auto.active = false;
}

function onUp() {
  pointer.down = false;
}

function togglePanel() {
  settings.panelOpen = !settings.panelOpen;
  applyPanelState();
  saveSettings();
}

panelToggle.addEventListener('click', togglePanel);

window.addEventListener('pointerdown', onDown);
window.addEventListener('pointermove', onMove);
window.addEventListener('pointerup', onUp);
window.addEventListener('pointercancel', onUp);
window.addEventListener('blur', onUp);
window.addEventListener('resize', resize);

window.addEventListener('keydown', (event) => {
  if (event.key === 'h' || event.key === 'H' || event.key === 'р' || event.key === 'Р') togglePanel();
  if (event.key === 'r' || event.key === 'R' || event.key === 'к' || event.key === 'К') resetSettings();
});

/* ============================================================
   ЗАПУСК
   ============================================================ */

loadSettings();
buildPanel();
applyPanelState();
applyHintState();
resize();
requestAnimationFrame(frame);
