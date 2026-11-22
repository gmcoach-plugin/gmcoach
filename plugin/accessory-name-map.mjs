// Local accessory knowledge for Gym Monster (deviceType 1). Used only when the
// catalogue leaves an exercise's accessory list blank, missing or unreadable.
export const ACCESSORY_MAP = Object.freeze([
  { name: 'Flat Bench', ids: [1], aliases: ['flat bench', 'bench', 'ławka', 'lawka', 'ławka płaska'] },
  { name: 'Tricep Rope', ids: [2, 882627794731008, 882630752272384], aliases: ['rope', 'tricep rope', 'triceps rope', 'lina', 'linka'] },
  { name: 'Ankle Straps', ids: [3, 882628465819648, 882630479642624], aliases: ['ankle strap', 'ankle straps', 'ankle cuff', 'opaska na kostkę', 'mankiet'] },
  { name: 'Barbell', ids: [4], aliases: ['barbell', 'sztanga'] },
  { name: 'Barbell Bar', ids: [882629568921600], aliases: ['barbell bar', 'gryf'] },
  { name: 'Handles', ids: [5, 882627450798080, 882628935581696], aliases: ['handle', 'handles', 'uchwyt', 'uchwyty', 'rączki'] },
  { name: 'Skiing Handles', ids: [7, 882630223790080, 882631074676736], aliases: ['skiing handles', 'ski handle', 'uchwyty narciarskie'] },
  { name: 'Incline Bench', ids: [9], aliases: ['incline bench', 'ławka skośna'] },
  { name: 'Exercise Belt', ids: [10], aliases: ['exercise belt', 'pas'] },
  { name: 'Pilates Loops', ids: [11], aliases: ['pilates loop', 'pilates loops'] },
  { name: 'Pilates Straps', ids: [12], aliases: ['pilates strap', 'pilates straps'] },
  { name: 'Extender Belt', ids: [882627220668416, 882631360446464], aliases: ['extender belt', 'przedłużka'] },
  { name: 'Lat Pulldown Bar', ids: [882629891883008], aliases: ['lat pulldown bar', 'pulldown bar', 'drążek wyciągu'] },
  { name: 'Speediance Lat Pulldown Arms', ids: [896797006954496], aliases: ['lat pulldown arms', 'ramiona wyciągu'] },
  { name: 'Speediance Lat Pulldown Leg Hold-down Strap', ids: [896797153755136], aliases: ['leg hold-down strap', 'hold-down strap'] },
  { name: 'Speediance Removable Pulley Holder', ids: [896797287972864], aliases: ['pulley holder'] }
]);
const byId = new Map(ACCESSORY_MAP.flatMap(row => row.ids.map(id => [id, row])));
const norm = value => typeof value === 'string' ? value.normalize('NFKC').toLocaleLowerCase('pl-PL').replace(/\s+/g, ' ').trim() : '';
export function accessoryById(id) { return byId.get(Number(id)) ?? null; }
export function accessoryByName(name) {
  const value = norm(name);
  if (!value) return null;
  return ACCESSORY_MAP.find(row => norm(row.name) === value || row.aliases.some(alias => norm(alias) === value)) ?? null;
}
const TITLE_RULES = [
  [/\bbarbell\b|sztang/u, 4], [/\bincline\b|skośn/u, 9], [/\bbench\b|ławk/u, 1], [/\brope\b|\blin[aęy]\b/u, 2],
  [/ankle|kostk/u, 3], [/exercise belt|belt squat/u, 10], [/pulldown bar|lat bar/u, 882629891883008], [/skiing|ski erg/u, 7]
];
const NO_ACCESSORY = /stretch|recovery|warm|hiit|bodyweight|\bmat\b|yoga|pilates|rozciąg|rozgrzew/u;
// Usable requirement for an exercise whose catalogue metadata is not valid.
// Order: title rules from the local accessory map, then a safe default: no
// extra accessory for bodyweight, mat, stretching, warm-up and HIIT rows
// (Speediance leaves those blank), otherwise the standard handles shipped with
// every Gym Monster.
export function inferAccessoryRequirement(exercise) {
  const title = norm(exercise?.title);
  const category = norm(exercise?.category);
  const kind = norm(exercise?.kind);
  const ids = new Set();
  for (const [pattern, id] of TITLE_RULES) if (pattern.test(title)) ids.add(id);
  if (ids.has(9)) ids.delete(1);
  if (ids.size) return { status: 'valid-ids', ids: [...ids].sort((a, b) => a - b), source: 'local-accessory-map-title' };
  if (['bodyweight', 'recovery', 'mat'].includes(kind) || NO_ACCESSORY.test(category)) return { status: 'valid-empty', ids: [], source: 'safe-default-no-accessory' };
  return { status: 'valid-ids', ids: [5], source: 'safe-default-standard-handles' };
}

