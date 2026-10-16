/** UI language. Stored as `lang` in chrome.storage.local (written by the background); default is English. */
export type Lang = 'ru' | 'en';
/** Colour theme. Stored as `theme`; absent = follow the system. */
export type Theme = 'system' | 'light' | 'dark';

export const isLang = (v: unknown): v is Lang => v === 'ru' || v === 'en';
export const isTheme = (v: unknown): v is Theme => v === 'system' || v === 'light' || v === 'dark';
/** Default when nothing is stored: English (the public default; Russian is one click away in Settings). */
export const DEFAULT_LANG: Lang = 'en';

// ponytail: one module-level language per page (each extension page is its own document); pages set it before render.
let current: Lang = DEFAULT_LANG;
export const setLang = (lang: Lang) => {
  current = lang;
};
export const getLang = () => current;

/** Russian plural: 1 сайт, 2 сайта, 5 сайтов. */
export function plural(n: number, forms: [string, string, string]) {
  const t = n % 10;
  const h = n % 100;
  return forms[t === 1 && h !== 11 ? 0 : t >= 2 && t <= 4 && (h < 12 || h > 14) ? 1 : 2];
}
const en = (n: number, one: string, many = `${one}s`) => (n === 1 ? one : many);

const ru = {
  molly: 'Молли',
  unit: { s: 'с', min: 'мин', h: 'ч' },
  weekdays: ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'],
  months: ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'],
  tabs: { history: 'История', limits: 'Лимиты', settings: 'Настройки' },
  noAnswer: 'нет ответа',

  popup: {
    today: 'сегодня в браузере',
    more: (n: number) => `ещё ${n} ${plural(n, ['сайт', 'сайта', 'сайтов'])}`,
    share: (p: number) => `${p}% дня`,
    closed: 'закрыт до полуночи',
    left: (d: string) => `осталось ${d}`,
    fromTomorrow: (d: string) => `. С завтра: ${d}`,
    noLimit: 'без лимита',
    sitesToday: 'Сайты сегодня',
    empty: 'Пока пусто. Молли ждёт первый сайт.',
    quick: 'Ограничить',
    todayTab: 'Сегодня',
    full: 'Открыть во вкладке',
  },

  shell: {
    sections: 'Разделы',
    brand: 'Molly, история',
    week: 'Неделя',
    thisWeek: 'Эта неделя',
    prev: 'Прошлая неделя',
    next: 'Следующая неделя',
    title: (tab: string) => `Molly: ${tab.toLowerCase()}`,
  },

  history: {
    emptyThis: 'На этой неделе пока пусто.',
    empty: (r: string) => `${r}: пусто.`,
    emptyThisSub: 'Молли начнёт считать, как только ты откроешь какой-нибудь сайт.',
    emptySub: 'В эти дни Молли ничего не насчитала.',
    leadThis: (d: string) => `За эту неделю ${d} в браузере.`,
    lead: (r: string, d: string) => `${r}: ${d} в браузере.`,
    top: (s: string, d: string) => `Больше всего ушло на ${s}: ${d}.`,
    chart: 'Время по дням',
    today: 'сегодня',
    sitesWeek: 'Сайты за неделю',
    wholeWeek: 'Вся неделя',
    emptyDay: 'В этот день Молли ничего не насчитала.',
    limit: (d: string) => `лимит ${d} в день`,
    hit: ', исчерпан',
    hits: (n: number) => `, исчерпан ${n} ${plural(n, ['раз', 'раза', 'раз'])}`,
    rest: (n: number, d: string) => `И ещё ${n} ${plural(n, ['сайт', 'сайта', 'сайтов'])}: ${d}`,
  },

  limits: {
    lead: 'Лимиты.',
    leadSub: 'Уменьшить можно сразу, увеличить или убрать получится только завтра.',
    presets: 'Частые сайты',
    presetsSub: 'Нажми на сайт и выбери время в день.',
    custom: 'Своё',
    more: (n: number) => `Ещё ${n} ${plural(n, ['сайт', 'сайта', 'сайтов'])}`,
    fewer: 'Свернуть',
    limited: (d: string) => `${d} в день`,
    newLimit: 'Новый лимит',
    site: 'Сайт',
    perDay: 'Минут в день',
    placeholder: 'youtube.com или ссылка',
    add: 'Добавить',
    save: 'Сохранить',
    remove: 'Убрать',
    cancel: 'Отменить',
    minPerDay: 'мин в день',
    minutesFor: (d: string) => `Минут в день для ${d}`,
    notSaved: (e: string) => `Не сохранилось: ${e}`,
    now: 'уже действует',
    tomorrow: 'заработает с завтра',
    status: (s: string, when: string) => `${s}: ${when}.`,
    badDomain: 'Не похоже на адрес сайта. Попробуй youtube.com или ссылку.',
    covered: (site: string, by: string) => `${site} уже входит в лимит ${by}. Измени его.`,
    badMinutes: 'Лимит: целое число минут от 1 до 1440.',
    none: 'Лимитов пока нет. Начни с сайта, который съедает вечер.',
    fromTomorrow: (d: string) => `С завтра: ${d}.`,
  },

  settings: {
    lead: 'Настройки.',
    language: 'Язык',
    theme: 'Тема',
    themes: { system: 'Как в системе', light: 'Светлая', dark: 'Тёмная' },
    incognito: 'Инкогнито',
    incognitoOn: 'Считается и в инкогнито.',
    incognitoOff: 'В инкогнито время не считается. Включи «Разрешить в режиме инкогнито» на странице расширения.',
    openExtension: 'Открыть страницу расширения',
    data: 'Данные',
    dataSub: 'Всё хранится только в этом браузере. Сохраняй копию перед переустановкой.',
    csv: 'Скачать CSV',
    backup: 'Сохранить копию',
    restore: 'Восстановить из копии',
    file: 'Файл копии',
    restored: (n: number) =>
      `Готово: вернула ${n} ${plural(n, ['день', 'дня', 'дней'])}. Повышенные лимиты заработают с завтра.`,
    failed: (e: string) => `Не получилось: ${e}`,
  },

  blocked: {
    thisSite: 'этот сайт',
    headline: (s: string) => `Молли огородила ${s} до завтра.`,
    tape: ['Сайт закрыт', 'Лимит исчерпан'],
    title: (s: string) => `${s}: лимит на сегодня`,
    opens: 'Откроется через ',
    week: 'Куда ушло время за неделю',
  },

  backup: {
    notJson: 'Это не JSON-файл.',
    notMolly: 'Это не копия Molly.',
    badDay: (d: string) => `Испорчен день ${d}.`,
    badEntry: (d: string, s: string) => `Испорчена запись ${d} / ${s}.`,
    badLimit: (s: string) => `Испорчен лимит ${s}.`,
  },
};

type Strings = typeof ru;

const english: Strings = {
  molly: 'Molly',
  unit: { s: 's', min: 'min', h: 'h' },
  weekdays: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
  months: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  tabs: { history: 'History', limits: 'Limits', settings: 'Settings' },
  noAnswer: 'no response',

  popup: {
    today: 'in the browser today',
    more: (n) => `${n} more ${en(n, 'site')}`,
    share: (p) => `${p}% of the day`,
    closed: 'closed until midnight',
    left: (d) => `${d} left`,
    fromTomorrow: (d) => `. From tomorrow: ${d}`,
    noLimit: 'no limit',
    sitesToday: 'Sites today',
    empty: 'Nothing yet. Molly is waiting for the first site.',
    quick: 'Limit',
    todayTab: 'Today',
    full: 'Open in a tab',
  },

  shell: {
    sections: 'Sections',
    brand: 'Molly, history',
    week: 'Week',
    thisWeek: 'This week',
    prev: 'Previous week',
    next: 'Next week',
    title: (tab) => `Molly: ${tab.toLowerCase()}`,
  },

  history: {
    emptyThis: 'Nothing this week yet.',
    empty: (r) => `${r}: empty.`,
    emptyThisSub: 'Molly starts counting as soon as you open a site.',
    emptySub: 'Molly counted nothing on these days.',
    leadThis: (d) => `This week: ${d} in the browser.`,
    lead: (r, d) => `${r}: ${d} in the browser.`,
    top: (s, d) => `Most went to ${s}: ${d}.`,
    chart: 'Time by day',
    today: 'today',
    sitesWeek: 'Sites this week',
    wholeWeek: 'Whole week',
    emptyDay: 'Molly counted nothing that day.',
    limit: (d) => `limit ${d} a day`,
    hit: ', used up',
    hits: (n) => `, used up ${n} ${en(n, 'time')}`,
    rest: (n, d) => `And ${n} more ${en(n, 'site')}: ${d}`,
  },

  limits: {
    lead: 'Limits.',
    leadSub: 'Lowering works now; raising or removing waits until tomorrow.',
    presets: 'Common sites',
    presetsSub: 'Pick a site, then the time per day.',
    custom: 'Custom',
    more: (n) => `${n} more ${en(n, 'site')}`,
    fewer: 'Show fewer',
    limited: (d) => `${d} a day`,
    newLimit: 'New limit',
    site: 'Site',
    perDay: 'Minutes a day',
    placeholder: 'youtube.com or a link',
    add: 'Add',
    save: 'Save',
    remove: 'Remove',
    cancel: 'Undo',
    minPerDay: 'min a day',
    minutesFor: (d) => `Minutes a day for ${d}`,
    notSaved: (e) => `Not saved: ${e}`,
    now: 'applies now',
    tomorrow: 'applies from tomorrow',
    status: (s, when) => `${s}: ${when}.`,
    badDomain: "That doesn't look like a site. Try youtube.com or a link.",
    covered: (site, by) => `${site} already falls under the ${by} limit. Change that one.`,
    badMinutes: 'Limit: a whole number of minutes from 1 to 1440.',
    none: 'No limits yet. Start with the site that eats your evenings.',
    fromTomorrow: (d) => `From tomorrow: ${d}.`,
  },

  settings: {
    lead: 'Settings.',
    language: 'Language',
    theme: 'Theme',
    themes: { system: 'System', light: 'Light', dark: 'Dark' },
    incognito: 'Incognito',
    incognitoOn: 'Incognito time is counted too.',
    incognitoOff: 'Incognito time is not counted. Turn on "Allow in Incognito" on the extension page.',
    openExtension: 'Open the extension page',
    data: 'Data',
    dataSub: 'Everything stays in this browser. Save a backup before reinstalling.',
    csv: 'Download CSV',
    backup: 'Save backup',
    restore: 'Restore from backup',
    file: 'Backup file',
    restored: (n) => `Done: restored ${n} ${en(n, 'day')}. Raised limits apply from tomorrow.`,
    failed: (e) => `Failed: ${e}`,
  },

  blocked: {
    thisSite: 'this site',
    headline: (s) => `Molly fenced off ${s} until tomorrow.`,
    tape: ['Site closed', 'Limit reached'],
    title: (s) => `${s}: today's limit`,
    opens: 'Opens in ',
    week: 'Where the week went',
  },

  backup: {
    notJson: 'This is not a JSON file.',
    notMolly: 'This is not a Molly backup.',
    badDay: (d) => `Broken day ${d}.`,
    badEntry: (d, s) => `Broken entry ${d} / ${s}.`,
    badLimit: (s) => `Broken limit ${s}.`,
  },
};

const STRINGS: Record<Lang, Strings> = { ru, en: english };

/** Strings for the current page language. */
export const t = () => STRINGS[current];
