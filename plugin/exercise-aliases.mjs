// Polish/English aliases for catalogue search. Keys are lower-case tokens;
// values are English catalogue words or muscle group names.
export const TERM_ALIASES = Object.freeze({
  rozciąganie: ['stretch'], rozciaganie: ['stretch'], rozciąg: ['stretch'], stretching: ['stretch'], stretches: ['stretch'], rozgrzewka: ['warm'],
  klatka: ['chest', 'pec', 'pecs'], klatki: ['chest', 'pec', 'pecs'], piersiowy: ['pec', 'chest'], piersiowe: ['pec', 'chest'], piersiowego: ['pec', 'chest'], chest: ['pec', 'pecs'], pectoral: ['pec'],
  plecy: ['back', 'lat', 'lats'], pleców: ['back', 'lat', 'lats'], najszerszy: ['lat', 'lats'], najszerszego: ['lat', 'lats'], back: ['lat', 'lats', 'spinal'],
  bark: ['shoulder', 'deltoid'], barki: ['shoulder', 'deltoid'], barku: ['shoulder', 'deltoid'], naramienny: ['deltoid'], shoulder: ['deltoid', 'delts'],
  ramię: ['biceps', 'triceps'], biceps: ['biceps'], bicepsa: ['biceps'], dwugłowy: ['biceps', 'hamstring'], triceps: ['triceps'], tricepsa: ['triceps'], trójgłowy: ['triceps'],
  przedramię: ['forearm'], przedramienia: ['forearm'], nadgarstek: ['wrist', 'forearm'],
  szyja: ['neck'], szyi: ['neck'], kaptur: ['trapezius', 'traps'], czworoboczny: ['trapezius', 'traps'],
  brzuch: ['abdominal', 'abs'], brzucha: ['abdominal', 'abs'], core: ['abdominal', 'abs'],
  pośladek: ['glute', 'glutes'], pośladki: ['glute', 'glutes'], pośladków: ['glute', 'glutes'], biodro: ['hip'], biodra: ['hip'], bioder: ['hip'], zginacz: ['flexor'], zginacze: ['flexor'],
  udo: ['quad', 'hamstring', 'thigh'], uda: ['quad', 'hamstring', 'thigh'], czworogłowy: ['quad', 'quads'], czwórki: ['quad', 'quads'], dwójki: ['hamstring', 'hamstrings'], kulszowo: ['hamstring'], hamstrings: ['hamstring'],
  przywodziciele: ['adductors', 'inner', 'thigh'], przywodzicieli: ['adductors', 'inner'], pachwina: ['adductors', 'inner'],
  łydka: ['calf', 'calves'], łydki: ['calf', 'calves'], łydek: ['calf', 'calves'], calf: ['calves'],
  kręgosłup: ['spinal', 'back'], skłon: ['fold'], motyl: ['butterfly'], żaba: ['frog']
});
// Muscle groups implied by a token, used to find a same-group replacement.
const MUSCLE_HINTS = [
  [/pec|chest|klat|piersi/u, 'Pecs'], [/lat|plec|najszer|spinal|back/u, 'Lats'], [/tricep|trójgł/u, 'Triceps'], [/bicep|dwugłowy ramienia/u, 'Biceps'],
  [/anterior|front delt/u, 'Front Delts'], [/lateral delt|side delt/u, 'Side Delts'], [/shoulder|delt|bark|naramien/u, 'Rear Delts'],
  [/forearm|wrist|przedrami|nadgarst/u, 'Forearms'], [/neck|trap|szyj|kaptur/u, 'Traps'], [/abdom|abs|brzuch|core/u, 'Abs'],
  [/glute|pośla|hip|biodr|piriform/u, 'Glutes'], [/quad|czworogł|czwórk|flexor|zginacz/u, 'Quads'], [/hamstring|dwójk|kulszow|fold|skłon/u, 'Hamstrings'],
  [/adductor|inner thigh|przywodz|pachwin|butterfly|frog/u, 'Adductors'], [/calf|calves|łyd/u, 'Calves']
];
export function expandTerm(word) { return [word, ...(TERM_ALIASES[word] ?? [])]; }
export function impliedMuscles(text) {
  const value = String(text ?? '').toLocaleLowerCase('pl-PL');
  return [...new Set(MUSCLE_HINTS.filter(([pattern]) => pattern.test(value)).map(([, muscle]) => muscle))];
}

