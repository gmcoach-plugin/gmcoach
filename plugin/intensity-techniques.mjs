// Dobór superserii i drop setów na etapie budowy planu (nie tylko oceny).
// Speediance/GM nie ma pola „superseria”: zapis to naprzemienne pojedyncze serie
// z przerwą przejścia 0 s (maszyna zapisuje minimum 1 s) i przerwą po rundzie
// (zob. superset-serialization.mjs). Drop set to dodatkowa seria tego samego
// ćwiczenia z niższym obciążeniem i przerwą 0 s (zapis 1 s).
const ANTAGONISTS = [['chest', 'back'], ['biceps', 'triceps'], ['quadriceps', 'hamstrings'], ['shoulders', 'lats'], ['abs', 'lower back'], ['glutes', 'abs']];
import { classifyJoint, equipmentOf } from './equipment-order.mjs';

/** Propozycja dla gotowego planu: pola sprzętu z lookup (odczyty szablonów/metadane), klasa stawowa z equipment-order. */
export function suggestIntensityForPlan(plan, lookup, options = {}) {
  const exercises = (plan?.exercises ?? []).map((exercise, index) => {
    const meta = typeof lookup === 'function' ? lookup(exercise) : null;
    const equipment = equipmentOf(meta);
    return {
      entryId: exercise.entryId ?? exercise.id, section: exercise.section ?? 'main',
      muscleGroup: exercise.muscleGroup ?? meta?.mainMuscleGroupName ?? meta?.muscleGroup ?? '',
      equipment: equipment ? [...equipment.accessories].sort().join(',') : 'unknown-' + index,
      outPositionShow: equipment?.position ?? '', bench: Boolean(equipment?.angle),
      isolation: classifyJoint(exercise) === 'isolation', anchor: false
    };
  });
  const firstMain = exercises.find((e) => e.section === 'main');
  if (firstMain) firstMain.anchor = true;
  return suggestIntensityTechniques(exercises, options);
}
const norm = (v) => String(v ?? '').toLowerCase().trim();
const isIsolation = (e) => e.isolation === true;
export const compatibleSetup = (a, b) => norm(a.equipment) === norm(b.equipment) && String(a.outPositionShow ?? '') === String(b.outPositionShow ?? '') && Boolean(a.bench) === Boolean(b.bench);
export const nonConflicting = (a, b) => {
  const x = norm(a.muscleGroup), y = norm(b.muscleGroup);
  if (!x || !y || x === y) return false;
  return ANTAGONISTS.some(([p, q]) => (x.includes(p) && y.includes(q)) || (x.includes(q) && y.includes(p))) || !(x.includes(y) || y.includes(x));
};

/** exercises: [{entryId, section, muscleGroup, equipment, outPositionShow, bench, isolation, anchor}] */
export function suggestIntensityTechniques(exercises, { goal = 'hypertrophy', timeLimited = false, userDeclinedSupersets = false, userDeclinedDropSets = false, priorityAreas = [] } = {}) {
  const main = (Array.isArray(exercises) ? exercises : []).filter((e) => (e.section ?? 'main') === 'main');
  const hypertrophy = /hypert|mięś|muscle/.test(norm(goal));
  const supersets = [], used = new Set();
  if ((hypertrophy || timeLimited) && !userDeclinedSupersets) {
    for (let i = 0; i < main.length; i++) for (let j = i + 1; j < main.length; j++) {
      const a = main[i], b = main[j];
      if (used.has(a.entryId) || used.has(b.entryId) || a.anchor || b.anchor) continue;
      if (compatibleSetup(a, b) && nonConflicting(a, b)) {
        supersets.push({ members: [a.entryId, b.entryId], transitionRestSeconds: 0, serializedAs: 'naprzemienne serie, przejście 0 s (zapis 1 s), przerwa po rundzie', reason: 'Niekolidujące partie, ten sam sprzęt, wysokość linek i ławka.' });
        used.add(a.entryId); used.add(b.entryId);
      }
    }
  }
  // Drop set tylko tam, gdzie realnie pomaga: najwyżej jeden na sesję, w izolacji partii priorytetowej,
  // a bez priorytetu w ostatniej izolacji sesji. Brak sensownego miejsca = brak drop setu.
  const priorities = (Array.isArray(priorityAreas) ? priorityAreas : []).map(norm).filter(Boolean);
  const isolations = main.filter((e) => isIsolation(e) && !e.anchor);
  const priorityPick = isolations.find((e) => priorities.some((p) => norm(e.muscleGroup).includes(p) || p.includes(norm(e.muscleGroup))));
  const pick = priorityPick ?? isolations[isolations.length - 1];
  const dropSets = hypertrophy && !userDeclinedDropSets && pick
    ? [{ entryId: pick.entryId, placement: 'last-set', restBeforeDropSeconds: 0, serializedAs: 'dodatkowa seria tego samego ćwiczenia z niższym obciążeniem, przerwa 0 s (zapis 1 s)', reason: priorityPick ? 'Dodatkowa objętość blisko upadku dla partii priorytetowej, bez wydłużania sesji.' : 'Ostatnia izolacja sesji: dodatkowy bodziec bez ryzyka dla kolejnych ćwiczeń.' }]
    : [];
  return { supersets, dropSets, order: orderBySetup(main).map((e) => e.entryId), note: 'Propozycje: dodaj tylko te, które realnie pomagają celowi lub czasowi, każdą z jednym zdaniem uzasadnienia; brak sensownego miejsca oznacza brak dodatków.' };
}

/** Kolejność: kotwice najpierw, potem grupowanie po sprzęcie i wysokości linek (outPositionShow). */
export function orderBySetup(exercises) {
  const anchors = exercises.filter((e) => e.anchor), rest = exercises.filter((e) => !e.anchor);
  const out = [...anchors];
  while (rest.length) {
    const last = out[out.length - 1];
    let index = last ? rest.findIndex((e) => compatibleSetup(e, last)) : -1;
    if (index < 0) index = 0;
    out.push(...rest.splice(index, 1));
  }
  return out;
}
