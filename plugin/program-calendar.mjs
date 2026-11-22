import { randomBytes } from 'node:crypto';
import { lstat, mkdir, open, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

export function normalizeScheduleDate(value, today = undefined, allowPast = false) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error('Data treningu musi mieć format YYYY-MM-DD.');
  }
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new Error('Podaj prawidłową datę kalendarzową YYYY-MM-DD.');
  }
  const now = new Date();
  const todayLocal = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  if (!allowPast && value < (today ?? todayLocal)) throw new Error('Nie można zaplanować nowego treningu w przeszłości.');
  return value;
}

export function getTemplateCode(value) {
  for (const code of [value?.code, value?.templateCode]) {
    if (typeof code === 'string' && /^[A-Za-z0-9._-]{1,128}$/.test(code)) return code;
  }
  return null;
}

/** Make read results impossible to confuse with a completed plan write. */
export function markReadOnlyProgramResult(result) {
  if (!result || typeof result !== 'object' || Array.isArray(result)) {
    throw new TypeError('Odczytowy wynik programu musi być obiektem.');
  }
  return {
    ...result,
    operationStatus: 'read-only',
    mutationSent: false,
    programCreatedByThisCall: false,
    programModifiedByThisCall: false
  };
}

export function extractTemplateCode(value, depth = 0, budget = { visited: 0 }) {
  if (!value || typeof value !== 'object' || depth > 10 || budget.visited++ > 20_000) return null;
  if (Array.isArray(value)) {
    for (const child of value) {
      const found = extractTemplateCode(child, depth + 1, budget);
      if (found) return found;
    }
    return null;
  }
  const direct = getTemplateCode(value);
  if (direct) return direct;
  for (const key of ['data', 'template', 'trainingTemplate', 'result']) {
    const found = extractTemplateCode(value[key], depth + 1, budget);
    if (found) return found;
  }
  return null;
}

export function resolveCreatedTemplateCode(createResponse, previousCodes, templates, programName) {
  const responseCode = extractTemplateCode(createResponse?.data) || extractTemplateCode(createResponse);
  if (responseCode) return responseCode;
  if (!Array.isArray(templates)) throw new Error('Nie udało się sprawdzić zapisanych programów Speediance po utworzeniu planu.');
  const newMatches = templates.filter((template) => {
    const code = getTemplateCode(template);
    return code && !previousCodes.has(code) && typeof template?.name === 'string' && template.name.trim() === programName;
  });
  const uniqueCodes = [...new Set(newMatches.map(getTemplateCode))];
  if (uniqueCodes.length !== 1) {
    throw new Error('Speediance zapisało program, ale nie udało się jednoznacznie odczytać jego kodu kalendarza. Program nie został zaplanowany. Użyj speediance_schedule_saved_program po sprawdzeniu dokładnej nazwy.');
  }
  return uniqueCodes[0];
}

export function buildTemplateReservationPayload(date, templateCode, deviceType, add = true) {
  if (typeof add !== 'boolean') throw new Error('add musi mieć wartość true albo false.');
  normalizeScheduleDate(date, undefined, !add);
  if (typeof templateCode !== 'string' || !/^[A-Za-z0-9._-]{1,128}$/.test(templateCode)) {
    throw new Error('Kod zapisanego programu Speediance jest nieprawidłowy.');
  }
  if (!Number.isSafeInteger(deviceType) || deviceType < 1 || deviceType > 1_000_000) {
    throw new Error('deviceType musi być dodatnią liczbą całkowitą.');
  }
  return { status: add ? 1 : 0, deviceType, thatDay: date, templateCode };
}

function calendarReadbackFailure(status, reason) {
  return { verified: false, status, reason };
}

function calendarPlanCode(plan) {
  const values = ['code', 'templateCode']
    .filter((field) => Object.hasOwn(plan, field) && plan[field] !== null && plan[field] !== '')
    .map((field) => plan[field]);
  if (!values.length || values.some((value) => typeof value !== 'string' || !/^[A-Za-z0-9._-]{1,128}$/.test(value))) return null;
  const unique = [...new Set(values)];
  return unique.length === 1 ? unique[0] : null;
}

// Public reference client schedule_planner.py distinguishes custom-template type3 from
// official-course/goal type4. Neither official entries nor completed history
// prove a custom-template reservation, even if a code happens to match.
export function classifyCalendarTemplateEntry(plan) {
  if (!plan || typeof plan !== 'object' || Array.isArray(plan)) return null;
  if (plan.type === 4) return { kind: 'official-or-suggested', code: null, isReservation: false };
  const code = calendarPlanCode(plan);
  if (!code) return null;
  if (plan.type === 3) {
    if (![0, 1].includes(plan.isFinish)) return null;
    const isReservation = plan.isFinish === 0;
    if (Object.hasOwn(plan, 'isReservation') && plan.isReservation !== isReservation) return null;
    return { kind: isReservation ? 'custom-reservation' : 'completed', code, isReservation };
  }
  if (plan.type !== undefined || typeof plan.isReservation !== 'boolean') return null;
  return { kind: plan.isReservation ? 'custom-reservation' : 'completed', code, isReservation: plan.isReservation };
}

/** Read-only coverage: a returned empty/partial month cannot establish absence. */
export function inspectCalendarReadCoverage(calendar, { month, deviceType } = {}) {
  if (typeof month !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || !Number.isSafeInteger(deviceType) || deviceType < 1) throw new TypeError('Invalid calendar read context.');
  const [year, number] = month.split('-').map(Number);
  const expectedDays = new Date(Date.UTC(year, number, 0)).getUTCDate();
  const diagnostics = [], dates = new Set();
  let validDayCount = 0, unknownEntryCount = 0;
  if (!Array.isArray(calendar)) diagnostics.push('unsupported-month-shape');
  else if (calendar.length > 31) diagnostics.push('month-day-limit-exceeded');
  else for (const day of calendar) {
    if (!day || typeof day !== 'object' || Array.isArray(day) || typeof day.date !== 'string' || day.date.slice(0,7) !== month || !Array.isArray(day.trainingPlanList) || day.trainingPlanList.length > 1000) { diagnostics.push('invalid-day-record'); continue; }
    try { normalizeScheduleDate(day.date, undefined, true); } catch { diagnostics.push('invalid-day-date'); continue; }
    if (dates.has(day.date)) { diagnostics.push('duplicate-day-date'); continue; }
    dates.add(day.date); validDayCount++;
    for (const plan of day.trainingPlanList) if (!classifyCalendarTemplateEntry(plan)) unknownEntryCount++;
  }
  if (validDayCount !== expectedDays) diagnostics.push('incomplete-month');
  if (unknownEntryCount) diagnostics.push('unclassified-calendar-entries');
  const complete = diagnostics.length === 0;
  return { sourceEndpoint: '/app/v5/trainingCalendar/monthNew', selectedMonth: month, selectedDeviceType: deviceType,
    scope: 'returned-selected-device-calendar-month', status: complete ? 'read' : 'partial', complete,
    structuralMonthComplete: validDayCount === expectedDays && !diagnostics.some(reason => reason !== 'unclassified-calendar-entries'),
    expectedDayCount: expectedDays, validDayCount, unknownEntryCount, observedDates: [...dates].sort(), diagnostics: [...new Set(diagnostics)],
    officialReservationIdentityVerified: false, accountTimezoneVerified: false,
    note: 'Coverage describes returned dates and supported entry classification only. Partial or empty output does not establish no scheduled workout. Official/suggested entries are not verified course reservations; completed entries are not reservations.' };
}

/** Verify a full month structure, then classify only the exact target day.
 * Unknown entries elsewhere in the month do not affect this date's identity. */
export function inspectTemplateReservationReadback(calendarData, { date, templateCode, deviceType, add = true } = {}) {
  if (!Array.isArray(calendarData)) {
    return calendarReadbackFailure('unavailable', 'Odczyt miesięcznego kalendarza nie zwrócił listy dni.');
  }
  try { normalizeScheduleDate(date, undefined, true); }
  catch { return calendarReadbackFailure('unsupported_shape', 'Weryfikacja wymaga dokładnej daty YYYY-MM-DD.'); }
  if (typeof templateCode !== 'string' || !/^[A-Za-z0-9._-]{1,128}$/.test(templateCode)
    || !Number.isSafeInteger(deviceType) || deviceType < 1 || typeof add !== 'boolean') {
    return calendarReadbackFailure('unsupported_shape', 'Brakuje dokładnego kodu programu, typu urządzenia albo operacji kalendarza.');
  }

  const month = date.slice(0, 7);
  const [year, monthNumber] = month.split('-').map(Number);
  const daysInMonth = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  if (calendarData.length !== daysInMonth) {
    return calendarReadbackFailure('incomplete_month', `Odpowiedź kalendarza nie zawiera wszystkich ${daysInMonth} dni miesiąca ${month}.`);
  }

  const daysByDate = new Map();
  let targetPlans = null;
  for (const day of calendarData) {
    if (!day || typeof day !== 'object' || Array.isArray(day)
      || typeof day.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(day.date)
      || day.date.slice(0, 7) !== month || !Array.isArray(day.trainingPlanList)) {
      return calendarReadbackFailure('unsupported_shape', 'Odpowiedź zawiera dzień bez dokładnej daty YYYY-MM-DD albo bez trainingPlanList.');
    }
    try { normalizeScheduleDate(day.date, undefined, true); }
    catch { return calendarReadbackFailure('unsupported_shape', 'Odpowiedź zawiera nieprawidłową datę kalendarzową.'); }
    if (daysByDate.has(day.date)) {
      return calendarReadbackFailure('duplicate_day', `Odpowiedź zawiera powielony dzień ${day.date}.`);
    }
    daysByDate.set(day.date, day);
    if (day.date !== date) continue;
    const plans = [];
    for (const plan of day.trainingPlanList) {
      const entry = classifyCalendarTemplateEntry(plan);
      if (!entry) {
        return calendarReadbackFailure('unsupported_shape', `Lista treningów dla ${day.date} zawiera nieznany lub niekompletny wpis.`);
      }
      if (Object.hasOwn(plan, 'deviceType') && plan.deviceType !== null && plan.deviceType !== '') {
        if (!Number.isSafeInteger(plan.deviceType) || plan.deviceType < 1) {
          return calendarReadbackFailure('unsupported_shape', `Wpis kalendarza dla ${day.date} zawiera nieprawidłowy deviceType.`);
        }
        if (plan.deviceType !== deviceType) {
          return calendarReadbackFailure('device_mismatch', `Odpowiedź zawiera wpis dla innego deviceType (${plan.deviceType}); wybrano ${deviceType}.`);
        }
      }
      plans.push(entry);
    }
    targetPlans = plans;
  }

  for (let dayNumber = 1; dayNumber <= daysInMonth; dayNumber++) {
    const expectedDate = `${month}-${String(dayNumber).padStart(2, '0')}`;
    if (!daysByDate.has(expectedDate)) {
      return calendarReadbackFailure('incomplete_month', `Odpowiedź nie zawiera dnia ${expectedDate}; nie można potwierdzić obecności ani braku rezerwacji.`);
    }
  }

  if (targetPlans === null) {
    return calendarReadbackFailure('incomplete_month', `Odpowiedź nie zawiera dokładnego dnia ${date}; nie można potwierdzić rezerwacji.`);
  }
  const targetMatches = targetPlans.filter((plan) => plan.code === templateCode);
  if (targetMatches.length > 1) {
    return calendarReadbackFailure('duplicate_match', `Kalendarz zawiera kilka wpisów dla kodu ${templateCode} w dniu ${date}.`);
  }
  const activeReservation = targetMatches[0]?.isReservation === true;
  if (add && activeReservation && targetPlans.length === 1 && targetMatches[0]?.kind === 'custom-reservation') {
    return { verified: true, status: 'readback_verified', reason: `Potwierdzono rezerwację ${templateCode} na ${date} dla wybranego deviceType.` };
  }
  if (add && targetPlans.length > 0) {
    return calendarReadbackFailure('target_day_conflict', `Dzień ${date} zawiera inny lub niejednoznaczny wpis; nie można potwierdzić rezerwacji jako jedynego wpisu tego dnia.`);
  }
  if (!add && !activeReservation) {
    return { verified: true, status: 'readback_verified', reason: `Potwierdzono brak rezerwacji ${templateCode} na ${date} w kompletnym miesiącu dla wybranego deviceType.` };
  }
  return calendarReadbackFailure(add ? 'reservation_missing' : 'reservation_present', add
    ? `Nie znaleziono dokładnego wpisu ${templateCode} oznaczonego isReservation=true na ${date}.`
    : `Wpis ${templateCode} nadal ma isReservation=true na ${date}.`);
}

let calendarJournalQueue = Promise.resolve();

function withCalendarJournalLock(callback) {
  const operation = calendarJournalQueue.then(callback, callback);
  calendarJournalQueue = operation.then(() => undefined, () => undefined);
  return operation;
}

async function readCalendarReservationJournal(journalPath) {
  const directory = path.dirname(journalPath);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const directoryStats = await lstat(directory);
  if (!directoryStats.isDirectory() || directoryStats.isSymbolicLink()) {
    throw new Error('Katalog dziennika rezerwacji kalendarza nie jest bezpiecznym zwykłym katalogiem.');
  }

  let stats;
  try { stats = await lstat(journalPath); }
  catch (error) {
    if (error?.code === 'ENOENT') return { version: 1, operations: {} };
    throw new Error('Nie można bezpiecznie odczytać dziennika rezerwacji kalendarza.');
  }
  if (!stats.isFile() || stats.isSymbolicLink() || stats.size > 2 * 1024 * 1024) {
    throw new Error('Dziennik rezerwacji kalendarza jest nieprawidłowy lub przekracza limit rozmiaru.');
  }

  let journal;
  try { journal = JSON.parse(await readFile(journalPath, 'utf8')); }
  catch { throw new Error('Nie można odczytać dziennika rezerwacji kalendarza; nie wysłano mutacji.'); }
  if (journal?.version !== 1 || !journal.operations || typeof journal.operations !== 'object' || Array.isArray(journal.operations)) {
    throw new Error('Format dziennika rezerwacji kalendarza jest nieznany; nie wysłano mutacji.');
  }
  const allowedStates = new Set(['preparing', 'pending', 'acknowledged', 'readback_unavailable', 'readback_unverified', 'readback_verified']);
  for (const [key, record] of Object.entries(journal.operations)) {
    if (!record || typeof record !== 'object' || Array.isArray(record)
      || typeof record.profile !== 'string' || !record.profile
      || typeof record.templateCode !== 'string' || !/^[A-Za-z0-9._-]{1,128}$/.test(record.templateCode)
      || typeof record.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(record.date)
      || typeof record.add !== 'boolean' || !allowedStates.has(record.state)
      || key !== reservationJournalKey(record.profile, record.templateCode, record.date)
      || (record.state === 'readback_verified' && record.calendarReadbackVerified !== true)) {
      throw new Error('Dziennik rezerwacji kalendarza zawiera nieprawidłowy wpis; nie wysłano mutacji.');
    }
  }
  return journal;
}

async function writeCalendarReservationJournal(journalPath, journal) {
  const directory = path.dirname(journalPath);
  const directoryStats = await lstat(directory);
  if (!directoryStats.isDirectory() || directoryStats.isSymbolicLink()) {
    throw new Error('Katalog dziennika rezerwacji kalendarza nie jest bezpiecznym zwykłym katalogiem.');
  }
  try {
    const existing = await lstat(journalPath);
    if (!existing.isFile() || existing.isSymbolicLink()) {
      throw new Error('Plik dziennika rezerwacji kalendarza nie jest zwykłym plikiem.');
    }
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }

  const serialized = `${JSON.stringify(journal, null, 2)}\n`;
  if (Buffer.byteLength(serialized, 'utf8') > 2 * 1024 * 1024) {
    throw new Error('Dziennik rezerwacji kalendarza przekracza limit rozmiaru.');
  }
  const temporary = `${journalPath}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`;
  try {
    await writeFile(temporary, serialized, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
    await rename(temporary, journalPath);
  } catch (error) {
    try { await unlink(temporary); } catch { /* Keep the previous journal intact. */ }
    throw error;
  }
}

function reservationJournalKey(profile, templateCode, date) {
  return JSON.stringify([profile, templateCode, date]);
}

function reservationResultFromJournal(record, duplicateMutationBlocked = false) {
  const verified = record.state === 'readback_verified';
  return {
    profile: record.profile,
    date: record.date,
    templateCode: record.templateCode,
    scheduled: verified && record.add ? true : null,
    reservationRemoved: verified && !record.add ? true : null,
    mutationSent: false,
    mutationAcknowledged: record.mutationAcknowledged ?? null,
    mutationError: record.mutationError === true,
    calendarReadbackVerified: verified,
    calendarReadbackStatus: record.calendarReadbackStatus ?? 'pending',
    calendarReadbackNote: duplicateMutationBlocked
      ? 'Trwały dziennik blokuje ponowienie tej operacji. Sprawdź dokładny wpis w kalendarzu Speediance ręcznie przed podjęciem dalszych działań.'
      : record.calendarReadbackNote ?? 'Operacja jest zapisana w lokalnym dzienniku i nie zostanie wysłana ponownie przed jej zweryfikowaniem.',
    manualCheckRequired: duplicateMutationBlocked,
    duplicateMutationBlocked,
    blockedByJournal: duplicateMutationBlocked,
    journalState: record.state
  };
}

const activeCalendarPreparations = new Map();
async function acquireCalendarDispatchLock(journalPath) {
  const directory = path.dirname(journalPath);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const directoryStat = await lstat(directory);
  if (!directoryStat.isDirectory() || directoryStat.isSymbolicLink()) throw new Error('Unsafe calendar dispatch directory.');
  const file = `${journalPath}.dispatch.lock`;
  let handle;
  try { handle = await open(file, 'wx', 0o600); }
  catch (error) {
    if (error.code !== 'EEXIST') throw error;
    const recoveryFile = `${file}.recovery`;
    let recovery;
    try { recovery = await open(recoveryFile, 'wx', 0o600); } catch { throw new Error('Calendar recovery lock owned or unresolved.'); }
    try {
      await recovery.writeFile(JSON.stringify({ pid: process.pid, token: randomBytes(16).toString('hex') })); await recovery.sync();
      const stat = await lstat(file);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 4096) throw new Error('Unsafe calendar owner lock.');
      const raw = await readFile(file, 'utf8'), owner = JSON.parse(raw);
      if (!Number.isSafeInteger(owner.pid) || owner.pid <= 0) throw new Error('Unknown calendar lock owner.');
      let dead = false;
      try { process.kill(owner.pid, 0); } catch (status) { dead = status.code === 'ESRCH'; }
      if (!dead) throw new Error('Calendar dispatch owner live or unconfirmed; no concurrent replay.');
      if (await readFile(file, 'utf8') !== raw) throw new Error('Calendar owner changed during recovery.');
      await unlink(file); handle = await open(file, 'wx', 0o600);
    } finally { await recovery.close(); await unlink(recoveryFile); }
  }
  try {
    await handle.writeFile(JSON.stringify({ pid: process.pid, token: randomBytes(16).toString('hex') })); await handle.sync();
  } catch (error) {
    try { await handle.close(); } catch { /* Preserve the original lock initialization error. */ }
    // Keep the unresolved owner file: no remote dispatch occurred, but another process
    // must not infer ownership from incomplete metadata or remove it by age.
    throw error;
  }
  return async () => { await handle.close(); await unlink(file); };
}
export function createTemplateReservationExecutor({ journalPath, isRequestNotSent = () => false } = {}) {
  if (typeof journalPath !== 'string' || !path.isAbsolute(journalPath)) {
    throw new Error('Dziennik rezerwacji wymaga bezwzględnej ścieżki wewnątrz PLUGIN_DATA.');
  }

  const active = activeCalendarPreparations;
  const execute = async function executeTemplateReservation({ profile, date, templateCode, deviceType, add = true, send, readCalendar, beforeDispatch = null }) {
    if (typeof profile !== 'string' || !profile || typeof send !== 'function' || typeof readCalendar !== 'function') {
      throw new Error('Brakuje lokalnego klucza operacji lub funkcji API kalendarza.');
    }
    const payload = buildTemplateReservationPayload(date, templateCode, deviceType, add);
    const key = reservationJournalKey(profile, templateCode, date);
    const pendingRecord = {
      dispatchOwner: randomBytes(16).toString('hex'),
      profile,
      templateCode,
      date,
      deviceType,
      add,
      state: beforeDispatch ? 'preparing' : 'pending',
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      mutationAcknowledged: null,
      mutationError: false,
      calendarReadbackVerified: false,
      calendarReadbackStatus: 'pending',
      calendarReadbackNote: 'Mutacja nie ma jeszcze potwierdzonego odczytu zwrotnego.'
    };

    const reservation = await withCalendarJournalLock(async () => {
      const journal = await readCalendarReservationJournal(journalPath);
      const previous = journal.operations[key];
      if (previous && previous.state !== 'readback_verified' && previous.state !== 'preparing') {
        return { blocked: true, record: previous };
      }
      if (previous?.state === 'readback_verified' && previous.add === add) {
        return { alreadyVerified: true, record: previous };
      }

      journal.operations[key] = pendingRecord;
      await writeCalendarReservationJournal(journalPath, journal);
      return { blocked: false, alreadyVerified: false };
    });

    if (reservation.blocked) return reservationResultFromJournal(reservation.record, true);
    if (reservation.alreadyVerified) {
      // Durable idempotency prevents another POST, but is not evidence that an
      // external edit left the calendar unchanged since the previous call.
      let current;
      try {
        current = inspectTemplateReservationReadback(await readCalendar(), { date, templateCode, deviceType, add });
      } catch {
        current = { verified: false, status: 'unavailable', reason: 'Nie udało się świeżo sprawdzić wcześniej potwierdzonej rezerwacji.' };
      }
      const freshRecord = {
        ...reservation.record,
        state: current.verified ? 'readback_verified' : 'readback_unverified',
        calendarReadbackStatus: current.status,
        calendarReadbackNote: current.reason
      };
      if (current.verified) {
        return {
          ...reservationResultFromJournal(freshRecord, false),
          freshCalendarReadback: true,
          calendarReadbackNote: current.reason,
          note: 'Potwierdzono bieżący kalendarz; nie wysłano ponownie zapisu.'
        };
      }
      const safeToRetry = (add && current.status === 'reservation_missing') || (!add && current.status === 'reservation_present');
      if (!safeToRetry) {
        return {
          ...reservationResultFromJournal(freshRecord, true),
          freshCalendarReadback: true,
          calendarReadbackNote: current.reason,
          note: 'Dziennik potwierdza wcześniejszą operację, a bieżący kalendarz nie pozwala bezpiecznie jej powtórzyć. Nie wysłano mutacji.'
        };
      }
      await withCalendarJournalLock(async () => {
        const journal = await readCalendarReservationJournal(journalPath);
        const latest = journal.operations[key];
        if (latest?.state !== 'readback_verified' || latest.add !== add || latest.dispatchOwner !== reservation.record.dispatchOwner) {
          throw new Error('Dziennik rezerwacji zmienił się podczas odczytu; ponowienie zostało zablokowane.');
        }
        journal.operations[key] = pendingRecord;
        await writeCalendarReservationJournal(journalPath, journal);
      });
    }

    let mutationAcknowledged = null;
    let mutationError = false;
    if (beforeDispatch) {
      // Only this explicit contract proves send cannot yet have run. Legacy
      // pending records remain uncertain and are never upgraded to preparing.
      await beforeDispatch(async () => {
        await withCalendarJournalLock(async () => {
          const journal = await readCalendarReservationJournal(journalPath);
          pendingRecord.state = 'pending';
          journal.operations[key] = pendingRecord;
          await writeCalendarReservationJournal(journalPath, journal);
        });
      });
      if (pendingRecord.state !== 'pending') throw new Error('Reservation dispatch checkpoint was not durably marked; send blocked.');
    }
    try {
      const response = await send(payload);
      mutationAcknowledged = [true, 1, '1'].includes(response?.data);
    } catch (error) {
      if (isRequestNotSent(error, profile) === true) {
        await withCalendarJournalLock(async () => {
          const journal = await readCalendarReservationJournal(journalPath);
          if (journal.operations[key]?.dispatchOwner !== pendingRecord.dispatchOwner) throw new Error('Calendar dispatch owner changed; checkpoint preserved.');
          pendingRecord.state = 'preparing';
          pendingRecord.calendarReadbackStatus = 'not_sent';
          pendingRecord.calendarReadbackNote = 'Transport control stopped this request before fetch.';
          journal.operations[key] = pendingRecord;
          await writeCalendarReservationJournal(journalPath, journal);
        });
        throw error;
      }
      // A lost response does not prove that the service rejected the write.
      mutationError = true;
    }

    Object.assign(pendingRecord, {
      state: mutationAcknowledged === true ? 'acknowledged' : 'pending',
      updatedAt: new Date().toISOString(),
      mutationAcknowledged,
      mutationError
    });
    try {
      await withCalendarJournalLock(async () => {
        const journal = await readCalendarReservationJournal(journalPath);
        journal.operations[key] = pendingRecord;
        await writeCalendarReservationJournal(journalPath, journal);
      });
    } catch {
      // The durable pending record written before POST still blocks a retry.
    }

    let readbackStatus;
    try {
      readbackStatus = inspectTemplateReservationReadback(await readCalendar(), { date, templateCode, deviceType, add });
    } catch {
      readbackStatus = {
        verified: false,
        status: 'unavailable',
        reason: 'Nie udało się ponownie odczytać miesięcznego kalendarza.'
      };
    }

    Object.assign(pendingRecord, {
      state: readbackStatus.verified ? 'readback_verified' : readbackStatus.status === 'unavailable' ? 'readback_unavailable' : 'readback_unverified',
      updatedAt: new Date().toISOString(),
      calendarReadbackVerified: readbackStatus.verified,
      calendarReadbackStatus: readbackStatus.status,
      calendarReadbackNote: readbackStatus.reason
    });
    try {
      await withCalendarJournalLock(async () => {
        const journal = await readCalendarReservationJournal(journalPath);
        journal.operations[key] = pendingRecord;
        await writeCalendarReservationJournal(journalPath, journal);
      });
    } catch {
      pendingRecord.state = 'pending';
      pendingRecord.calendarReadbackVerified = false;
      pendingRecord.calendarReadbackStatus = 'journal_update_failed';
      pendingRecord.calendarReadbackNote = 'Nie udało się utrwalić końcowego statusu. Zachowano blokadę przed ponowieniem; sprawdź kalendarz Speediance ręcznie.';
    }

    return {
      profile,
      date,
      templateCode,
      scheduled: readbackStatus.verified && add ? true : null,
      reservationRemoved: readbackStatus.verified && !add ? true : null,
      mutationSent: true,
      mutationAcknowledged,
      mutationError,
      calendarReadbackVerified: readbackStatus.verified && pendingRecord.state === 'readback_verified',
      calendarReadbackStatus: pendingRecord.calendarReadbackStatus,
      calendarReadbackNote: pendingRecord.calendarReadbackNote,
      duplicateMutationBlocked: false,
      blockedByJournal: false,
      journalState: pendingRecord.state
    };
  };
  return async args => {
    const key = JSON.stringify([journalPath, reservationJournalKey(args.profile, args.templateCode, args.date)]);
    const previous = active.get(key);
    if (previous) {
      if ((previous.args.add ?? true) !== (args.add ?? true) || previous.args.deviceType !== args.deviceType ||
          previous.args.beforeDispatch !== args.beforeDispatch || previous.args.send !== args.send || previous.args.readCalendar !== args.readCalendar) {
        throw new Error('Reservation preparation is already active with a different intent or dispatch contract.');
      }
      const shared = await previous.promise;
      return { ...shared, duplicateMutationBlocked: true, mutationSent: false, coalescedOperation: true };
    }
    const entry = { args, promise: null };
    entry.promise = (async () => {
      let release, result;
      try { release = await acquireCalendarDispatchLock(journalPath); result = await execute(args); return result; }
      finally {
        if (active.get(key) === entry) active.delete(key);
        if (release) try { await release(); } catch { if (result) result.localCleanupDiagnostic = 'Prior calendar result retained; dispatch lock cleanup failed. Do not resend.'; }
      }
    })();
    active.set(key, entry);
    return entry.promise;
  };
}
