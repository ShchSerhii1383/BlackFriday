/**
 * config.js — усі налаштування гри в одному місці.
 *
 * Тексти, шляхи, кольори, таймінги та параметри механіки змінюються тут,
 * без редагування ігрових функцій.
 */

const ASSET = 'assets/';

/**
 * Чотири нагороди описані ОДНІЄЮ структурою.
 * Ігрова логіка працює лише з цим масивом і не знає про конкретні значення.
 *
 * scenario — з чого складається анімований фінал (програє animations.js → playReward):
 *   burst     'flash' — спалах екрана кольором нагороди | 'wave' — енергетична хвиля
 *   outline   true — золота лінія обводить рамку екрана
 *   discount  'drop' — відсоток падає згори | 'zoom' — ефект масштабування
 *   meme      'split' — половинки розходяться | 'bounce' | 'pop' | 'rise' — з платформи
 *   accent    'shine' — світловий відблиск по персонажу
 *   particles 'debris' — червоні уламки | 'sparkle' — іскри | 'celebration' — салют, веселка, конфеті
 *
 * memeScale — візуальне вирівнювання персонажів: асети мають різні пропорції
 * (серце широке, єдиноріг високий), тож однакова висота робила б їх різними
 * «на око». Множник приблизно вирівнює площу; єдиноріг трохи більший навмисно —
 * це найвидовищніша нагорода.
 */
export const REWARDS = [
  {
    value: 0,
    key: 'r0',
    scenario: { burst: 'flash', discount: 'drop', meme: 'split', particles: 'debris' },
    title: 'GAME OVER',
    text: 'Бюджет погоджено. Фінансування відсутнє.',
    button: 'ACCEPT REALITY',
    confirm: 'REALITY ACCEPTED',
    colors: { main: '#FF3B50', dark: '#590C24', light: '#FFB0B8' },
    discountImg: `${ASSET}rewards/discount-0.webp`,
    memeImg: `${ASSET}memes/meme-0-broken-heart.webp`,
    memeAlt: 'Розбите піксельне серце',
    memeScale: 0.88,
    platform: false,
    /**
     * Лінія розлому між половинками серця: точки [x%, y%] зверху вниз.
     * Половинки на асеті не торкаються, тож лінія ділить їх без похибки
     * (перевірено попіксельно). Phase 04 розсуває половинки по цій лінії.
     * Генерується tools/build-assets.py (heartSplit) — оновити, якщо змінився асет.
     */
    split: [[49.7, 0], [49.8, 3.4], [49.9, 6.8], [49.9, 10.3], [49.9, 13.7], [49.4, 17.1], [49.4, 20.5], [49.4, 23.9], [49.4, 27.4], [48.1, 30.8], [46, 34.2], [44, 37.6], [42.4, 41], [43.4, 44.4], [45.3, 47.9], [47.5, 51.3], [48.8, 54.7], [47.6, 58.1], [45.4, 61.5], [43.1, 65], [43.2, 68.4], [44.9, 71.8], [46.8, 75.2], [48.3, 78.6], [47.4, 82.1], [46.2, 85.5], [46.3, 88.9], [45.7, 92.3], [45.7, 95.7], [48.2, 99.1], [48.7, 100]],
  },
  {
    value: 33,
    key: 'r33',
    scenario: { burst: 'flash', discount: 'drop', meme: 'bounce', particles: 'sparkle' },
    title: 'COMMON DROP',
    text: 'Заощадила 33%, щоб витратити ще більше.',
    button: 'CLAIM REWARD',
    confirm: 'REWARD CLAIMED',
    colors: { main: '#38D7FF', dark: '#125577', light: '#B5F5FF' },
    discountImg: `${ASSET}rewards/discount-33.webp`,
    memeImg: `${ASSET}memes/meme-33-shopping-bear.webp`,
    memeAlt: 'Ведмедик із покупками',
    memeScale: 1,
    platform: false,
  },
  {
    value: 66,
    key: 'r66',
    scenario: { burst: 'wave', discount: 'drop', meme: 'pop', accent: 'shine', particles: 'sparkle' },
    title: 'EPIC DROP',
    text: 'Витрати перекласифіковано в інвестиції у власне щастя.',
    button: 'CLAIM REWARD',
    confirm: 'REWARD CLAIMED',
    colors: { main: '#B64BFF', dark: '#58158B', light: '#E6B8FF' },
    discountImg: `${ASSET}rewards/discount-66.webp`,
    memeImg: `${ASSET}memes/meme-66-financial-rat.webp`,
    memeAlt: 'Щур-фінансист',
    memeScale: 1.06,
    platform: false,
  },
  {
    value: 100,
    key: 'r100',
    scenario: { burst: 'flash', outline: true, discount: 'zoom', meme: 'rise', particles: 'celebration' },
    title: 'LEGENDARY DROP',
    text: 'Аудитори в шоці. Фінансистка задоволена.',
    button: 'CLAIM REWARD',
    confirm: 'REWARD CLAIMED',
    colors: { main: '#FFBF32', dark: '#91500C', light: '#FFF1A3' },
    discountImg: `${ASSET}rewards/discount-100.webp`,
    memeImg: `${ASSET}memes/meme-100-legendary-unicorn.webp`,
    memeAlt: 'Легендарний єдиноріг',
    memeScale: 1.12,
    // Нижній край асета обрізаний у джерелі — ставимо персонажа на піксельну платформу.
    platform: true,
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
    coverFadeOut: 350,
    /** Скільки триває MATCH FOUND перед екраном нагороди (ТЗ: 1,5–2,5 с). */
    matchHold: 2000,
    lockedHint: 1600,
    toast: 1800,
    fontsTimeout: 2500,
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
    soundSoon: 'SOUND COMING SOON',
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

  audio: {
    available: false,
    enabledByDefault: false,
    musicVolume: 0.3,
    effectsVolume: 0.6,
    files: {
      intro: `${ASSET}audio/intro.mp3`,
      background: `${ASSET}audio/background.mp3`,
      buttonClick: `${ASSET}audio/button-click.mp3`,
      scratch: `${ASSET}audio/scratch.mp3`,
      cardReveal: `${ASSET}audio/card-reveal.mp3`,
      matchFound: `${ASSET}audio/match-found.mp3`,
      reward0: `${ASSET}audio/reward-0.mp3`,
      reward33: `${ASSET}audio/reward-33.mp3`,
      reward66: `${ASSET}audio/reward-66.mp3`,
      reward100: `${ASSET}audio/reward-100.mp3`,
    },
  },

  /** Режим розробника: ?debug=1 або #debug в адресі (у звичайному інтерфейсі його немає). */
  debug: new URLSearchParams(location.search).has('debug') || location.hash === '#debug',
};

/** Знайти нагороду за значенням (0 / 33 / 66 / 100). */
export function getReward(value) {
  return REWARDS.find((r) => r.value === value);
}
