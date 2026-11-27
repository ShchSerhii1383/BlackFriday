/**
 * config.js — усі налаштування гри в одному місці.
 *
 * Тексти, шляхи, кольори, таймінги та параметри механіки змінюються тут,
 * без редагування ігрових функцій.
 */

const ASSET = 'assets/';

/** Шлях до WebP-копії мемного персонажа. */
const meme = (file) => `${ASSET}memes/${file}.webp`;

/**
 * Чотири нагороди описані ОДНІЄЮ структурою.
 * Ігрова логіка працює лише з цим масивом і не знає про конкретні значення.
 *
 * memes   — 4 персонажі знижки. На кожен результат обирається один персонаж
 *           і одна фраза — незалежно одне від одного (3 × 5 = 15 комбінацій).
 *   scale    візуальне вирівнювання: асети мають різні пропорції (Nyan Cat широкий,
 *            єдиноріг високий), тож однакова висота робила б їх різними «на око».
 *            Множник ≈ 1/√(ширина/висота); легендарні трохи більші навмисно.
 *   platform true — персонаж стоїть на піксельній платформі (у єдинорога
 *            нижній край асета обрізаний у джерелі).
 * phrases — 5 затверджених мемних фраз (ТЗ 2.0, розділ 06).
 *
 * scenario — з чого складається анімований фінал (програє animations.js → playReward):
 *   burst     'flash' — спалах екрана кольором нагороди | 'wave' — енергетична хвиля
 *   outline   true — золота лінія обводить рамку екрана
 *   titleFx   'glitch' — Pixel Glitch заголовка після появи
 *   discount  'drop' — відсоток падає згори | 'zoom' — ефект масштабування
 *   meme      'sink' — падає, важко присідає і тремтить | 'bounce' | 'pop' | 'rise' — з платформи
 *   accent    'shine' — світловий відблиск по персонажу
 *   particles 'debris' — червоні уламки | 'sparkle' — іскри | 'celebration' — салют, веселка, конфеті
 */
export const REWARDS = [
  {
    value: 0,
    key: 'r0',
    scenario: { burst: 'flash', titleFx: 'glitch', discount: 'drop', meme: 'sink', particles: 'debris' },
    title: 'GAME OVER',
    button: 'ACCEPT REALITY',
    confirm: 'REALITY ACCEPTED',
    colors: { main: '#FF3B50', dark: '#590C24', light: '#FFB0B8' },
    discountImg: `${ASSET}rewards/discount-0.webp`,
    memes: [
      { key: 'bankrupt-raccoon', img: meme('meme-0-bankrupt-raccoon'), alt: 'Єнот-банкрут', scale: 1.02 },
      { key: 'crying-cat', img: meme('meme-0-crying-cat'), alt: 'Кіт, що плаче', scale: 1.08 },
      { key: 'crying-pepe', img: meme('meme-0-crying-pepe'), alt: 'Пепе, що плаче', scale: 1.06 },
      { key: 'grumpy-cat', img: meme('meme-0-grumpy-cat'), alt: 'Сумний кіт із порожнім гаманцем', scale: 0.97 },
    ],
    phrases: [
      'Бюджет погоджено. Фінансування відсутнє.',
      'Знижка була в плані, але не у факті.',
      'Навіть Excel не зміг знайти позитивний сценарій.',
      'Очікувала Black Friday, отримала Black Monday.',
      'Фінансовий результат: мінус настрій.',
    ],
  },
  {
    value: 33,
    key: 'r33',
    scenario: { burst: 'flash', discount: 'drop', meme: 'bounce', particles: 'sparkle' },
    title: 'COMMON DROP',
    button: 'CLAIM REWARD',
    confirm: 'REWARD CLAIMED',
    colors: { main: '#38D7FF', dark: '#125577', light: '#B5F5FF' },
    discountImg: `${ASSET}rewards/discount-33.webp`,
    memes: [
      { key: 'shopping-bear', img: meme('meme-33-shopping-bear'), alt: 'Ведмедик із покупками', scale: 1 },
      { key: 'shopping-doge', img: meme('meme-33-shopping-doge'), alt: 'Доге з покупками', scale: 1 },
      { key: 'shopping-hamster', img: meme('meme-33-shopping-hamster'), alt: "Хом'як із покупками", scale: 1 },
      { key: 'shopping-snail', img: meme('meme-33-shopping-snail'), alt: 'Равлик із покупками', scale: 0.94 },
    ],
    phrases: [
      'Заощадила 33%, щоб витратити ще більше.',
      'Економію отримано. Бюджет успішно освоєно.',
      'Купила не тому, що потрібно, а тому, що вигідно.',
      'Фінансовий план виконано. Кошик перевиконано.',
      'Знижка невелика, але потенціал витрат величезний.',
    ],
  },
  {
    value: 66,
    key: 'r66',
    scenario: { burst: 'wave', discount: 'drop', meme: 'pop', accent: 'shine', particles: 'sparkle' },
    title: 'EPIC DROP',
    button: 'CLAIM REWARD',
    confirm: 'REWARD CLAIMED',
    colors: { main: '#B64BFF', dark: '#58158B', light: '#E6B8FF' },
    discountImg: `${ASSET}rewards/discount-66.webp`,
    memes: [
      { key: 'financial-rat', img: meme('meme-66-financial-rat'), alt: 'Щур-фінансист', scale: 1.01 },
      { key: 'stonks', img: meme('meme-66-stonks'), alt: 'Stonks', scale: 0.99 },
      { key: 'financial-monkey', img: meme('meme-66-financial-monkey'), alt: 'Мавпа-фінансист', scale: 0.99 },
      { key: 'rich-seal', img: meme('meme-66-rich-seal'), alt: 'Тюлень на грошах', scale: 0.74 },
    ],
    phrases: [
      'Витрати перекласифіковано в інвестиції у власне щастя.',
      'Не купити з такою знижкою — це вже фінансові збитки.',
      'Excel підтвердив: покупка економічно обґрунтована.',
      'Це не шопінг. Це оптимізація грошових потоків.',
      'Фінансові махінації? Ні, ефективне управління бюджетом.',
    ],
  },
  {
    value: 100,
    key: 'r100',
    scenario: { burst: 'flash', outline: true, discount: 'zoom', meme: 'rise', particles: 'celebration' },
    title: 'LEGENDARY DROP',
    button: 'CLAIM REWARD',
    confirm: 'REWARD CLAIMED',
    colors: { main: '#FFBF32', dark: '#91500C', light: '#FFF1A3' },
    discountImg: `${ASSET}rewards/discount-100.webp`,
    memes: [
      // Нижній край асета єдинорога обрізаний у джерелі — ставимо його на платформу.
      { key: 'legendary-unicorn', img: meme('meme-100-legendary-unicorn'), alt: 'Легендарний єдиноріг', scale: 1.12, platform: true },
      { key: 'legendary-nyan-cat', img: meme('meme-100-legendary-nyan-cat'), alt: 'Легендарний Nyan Cat', scale: 0.82 },
      { key: 'legendary-capybara', img: meme('meme-100-legendary-capybara'), alt: 'Легендарна капібара', scale: 1.06 },
      { key: 'legendary-yorkie', img: meme('meme-100-legendary-yorkie'), alt: 'Легендарний йорк у кроксі', scale: 1.12 },
    ],
    phrases: [
      'Аудитори в шоці. Королева продажів задоволена.',
      'Міністерство фінансів просить поділитися методикою.',
      'Нобелівська премія з економіки вже в дорозі.',
      'Навіть фінансовий директор попросив майстер-клас.',
      'Black Friday оголосила про банкрутство.',
    ],
  },
];

export const CONFIG = {
  /** Колода: кожне значення з REWARDS повторюється стільки разів. */
  game: {
    cardCount: 12,
    copiesPerReward: 3,
  },

  scratch: {
    /** Частка стертої активної області, після якої картка відкривається (0–1). */
    revealThreshold: 0.6,
    /** Розмір кисті в CSS px. */
    brushSize: 26,
    /** Крок «піксельної» сітки кисті в CSS px — дає ступінчасті краї. */
    pixelSnap: 4,
    /** Роздільність карти стирання (клітинок по кожній стороні). */
    coverageGrid: 24,
    /** Обмеження щільності canvas: вище 2x різниці не видно, а пам'яті витрачається більше. */
    maxDpr: 2,
    /** Розмір знака питання відносно отвору рамки. */
    questionMarkScale: 0.5,
    /**
     * Наскільки захисний шар заходить під рамку (частка ширини картки).
     * Отвір рамки починається на ~11%, тож 7% ховає краї обкладинки під рамкою.
     */
    coverInset: 0.07,
    /** Pixel Dissolve: на скільки блоків по стороні розсипаються залишки шару. */
    dissolveBlocks: 10,
  },

  /** Внутрішній отвір card-frame.webp (обчислено tools/build-assets.py). */
  frameHole: { left: 0.1107, top: 0.1086, right: 0.1107, bottom: 0.1039 },

  /** Тривалості в мс (швидкість лінії — у px/с). */
  timing: {
    // Інтро (разом ≈ 3,5–4 с — ТЗ: 2,5–4 с)
    introPixel: 360,        // блимання стартового пікселя
    introFrame: 1100,       // лінія обводить рамку екрана
    introLineSpeed: 1100,   // швидкість лінії під написами й навколо кнопки
    gridDraw: 1000,         // промальовування сітки карток
    matchLine: 550,         // лінія між переможними картками
    sceneWipe: 440,         // перехід між сценами (закрити + відкрити)
    coverFadeOut: 350,      // Pixel Dissolve залишків шару
    /** Скільки триває MATCH FOUND перед екраном нагороди (ТЗ: 1,5–2,5 с). */
    matchHold: 2000,
    claimGuard: 700,       // мс після CLAIM, коли PLAY AGAIN ще не реагує (захист від подвійного тапу)
    lockedHint: 1600,
    toast: 1800,
    fontsTimeout: 2500,
    memePreloadDelay: 4000, // фонове завантаження персонажів — після інтро
    // Секретне розблокування (ТЗ 2.0, розділ 11)
    secretGlitch: 1100,     // екран «збоїть»: RGB split, зсуви смуг, шум
    secretErrorHold: 1100,  // SYSTEM ERROR на екрані до другого рядка
    secretErrorType: 1100,  // UNKNOWN REWARD DETECTED «друкується»
    secretAssemble: 1100,   // медаль / портал складаються з пікселів
    secretBadgeHold: 2200,  // пауза на медалі перед порталом
    portalEnter: 1300,      // портал наближається, екран заповнюють частинки
  },

  particles: {
    maxActive: 220,       // фінал 100% — найбільше навантаження (салют + конфеті)
    colors: ['#FF79F4', '#B64BFF', '#D9D2E0'], // рожевий, фіолетовий, сріблястий
    scratchChance: 0.6,   // частка рухів пальця, що породжують крихти
    scratchCount: 2,      // крихт за один такий рух
    revealBurst: 16,      // частинок при відкритті картки
    rainbow: ['#FF3B50', '#FF9A3B', '#FFF15A', '#5BFF8A', '#38D7FF', '#B64BFF', '#FF79F4'],
  },

  text: {
    startHint: 'Знайди три однакові знижки',
    gameHint: 'Стирай картки пальцем',
    lockedHint: 'Спершу дотри цю картку',
    startButton: 'START GAME',
    playAgain: 'PLAY AGAIN',
    matchFound: 'MATCH FOUND',
    gameTitle: 'DISCOUNT HUNT',
  },

  assets: {
    logo: `${ASSET}ui/black-friday-logo.webp`,
    cardFrame: `${ASSET}ui/card-frame.webp`,
    scratchCover: `${ASSET}ui/scratch-cover.webp`,
    questionMark: `${ASSET}ui/question-mark.webp`,
    button: `${ASSET}ui/arcade-button.webp`,
    indicatorEmpty: `${ASSET}ui/indicator-empty.webp`,
    indicatorFilled: `${ASSET}ui/indicator-filled.webp`,
    soundOn: `${ASSET}ui/sound-on.webp`,
    soundOff: `${ASSET}ui/sound-off.webp`,
  },

  /**
   * Звук (фінальна музична режисура). Джерела — _source/audio/, готові файли — assets/audio/
   * (моно 96 kbps, гучність вирівняна). Нічого не вантажиться до першого дотику.
   */
  audio: {
    available: true,
    enabledByDefault: true,
    musicVolume: 0.55,
    effectsVolume: 0.7,
    files: {
      // музика (по колу)
      background: `${ASSET}audio/background.mp3`,            // гра — Wii Shop Channel (8-bit)
      reward0: `${ASSET}audio/reward-0.mp3`,                 // 0% — Curb Your Enthusiasm
      reward33: `${ASSET}audio/reward-33.mp3`,               // 33% — Mii Channel Theme
      reward66: `${ASSET}audio/reward-66.mp3`,               // 66% — Money, Money, Money (8-bit з MIDI)
      reward100: `${ASSET}audio/reward-100.mp3`,             // 100% — The Final Countdown (8-bit)
      secretRoomAmbient: `${ASSET}audio/secret-room-ambient.mp3`, // кімната — Snowdin Town
      greetingMusic: `${ASSET}audio/greeting-music.mp3`,     // подарунок і привітання — Home (Undertale)
      // короткі ефекти
      intro: `${ASSET}audio/intro.mp3`,                      // інтро — 8-bit Arcade Startup
      buttonClick: `${ASSET}audio/button-click.mp3`,         // кнопки — Button Effect 1
      scratch: `${ASSET}audio/scratch.mp3`,                  // стирання — 8-bit Scratch
      systemGlitch: `${ASSET}audio/system-glitch.mp3`,       // розблокування — Glitch + Zelda Secret Fanfare
      secretPortal: `${ASSET}audio/secret-portal.mp3`,       // портал — Magical Chime + Portal Sound
    },
  },

  /** Режим розробника: ?debug=1 або #debug в адресі (у звичайному інтерфейсі його немає). */
  debug: new URLSearchParams(location.search).has('debug') || location.hash === '#debug',
};

/** Знайти нагороду за значенням (0 / 33 / 66 / 100). */
export function getReward(value) {
  return REWARDS.find((r) => r.value === value);
}
