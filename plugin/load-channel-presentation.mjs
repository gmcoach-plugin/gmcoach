/** Presentation only. This module never supplies or converts an API load. */
export function presentLoadChannels(sequences, { preference = 'per-side', execution = 'unknown' } = {}) {
  if (!['per-side', 'combined'].includes(preference)) throw new TypeError('Unknown load presentation preference.');
  const rows = Array.isArray(sequences) ? sequences : [];
  const channels = ['left-cable', 'right-cable'].map(channel => {
    const candidates = rows.filter(row => row?.channel === channel);
    const valid = candidates.filter(row => row.status === 'reported' && ['kg', 'lb', 'unknown'].includes(row.unit)
      && Array.isArray(row.samples) && row.samples.length && row.samples.every(value => typeof value === 'number' && Number.isFinite(value) && value >= 0));
    if (!valid.length) return { channel, status: candidates.length ? 'unknown' : 'not-reported' };
    const phaseOf = row => ['concentric', 'eccentric', 'isometric'].includes(row.phase) ? row.phase : 'unknown';
    const phases = [...new Set(valid.map(phaseOf))];
    if (phases.length > 1) {
      const phaseReadings = phases.map(phase => presentLoadChannels(valid.filter(row => phaseOf(row) === phase)).channels.find(row => row.channel === channel));
      return { channel, status: 'reported-phases', phaseReadings,
        ...(candidates.length !== valid.length ? { partial: true, reason: 'additional-invalid-channel-observations' } : {}) };
    }
    const first = valid[0];
    if (candidates.length !== valid.length || valid.some(row => row.unit !== first.unit || JSON.stringify(row.samples) !== JSON.stringify(first.samples)))
      return { channel, status: 'unknown', reason: 'conflicting-channel-observations',
        observations: valid.slice(0, 21).map(row => ({ unit: row.unit, phase: phaseOf(row), minimum: Math.min(...row.samples), maximum: Math.max(...row.samples) })) };
    return { channel, status: 'reported', unit: first.unit, phase: ['concentric', 'eccentric', 'isometric'].includes(first.phase) ? first.phase : 'unknown',
      minimum: Math.min(...first.samples), maximum: Math.max(...first.samples), constant: new Set(first.samples).size === 1,
      complete: valid.every(row => row.complete === true),
      completeness: valid.some(row => row.truncated === true) ? 'truncated' : valid.every(row => row.complete === true) ? 'complete' : valid.some(row => row.complete === false) ? 'partial' : 'unknown',
      ...(valid.some(row => row.truncated === true) ? { truncated: true } : {}),
      sourcePaths: valid.map(row => row.sourcePath).filter(path => typeof path === 'string') };
  });
  const known = channels.flatMap(row => row.status === 'reported' ? [row] : row.status === 'reported-phases' ? row.phaseReadings.filter(reading => reading.status === 'reported') : []);
  const base = { displayOnly: true, automaticApplication: false, preference, execution, channels,
    interpretation: 'reported-cable-samples-not-prescribed-resistance', combined: { status: 'unavailable', reason: 'simultaneity-and-same-phase-not-established' } };
  if (!rows.some(row => ['left-cable', 'right-cable'].includes(row?.channel))) {
    return { ...base, status: 'scalar-only', text: 'Raportowana wartość; podstawa na linkę lub łącznie niepotwierdzona.' };
  }
  // Constant complete channels avoid inventing sample alignment or summing independent peaks.
  if (execution === 'simultaneous') {
    const sums = ['concentric', 'eccentric', 'isometric'].flatMap(phase => {
      const pair = known.filter(row => row.phase === phase);
      if (pair.length !== 2 || pair[0].channel === pair[1].channel || !pair.every(row => row.complete && row.constant && ['kg', 'lb'].includes(row.unit)) || pair[0].unit !== pair[1].unit) return [];
      const value = pair[0].minimum + pair[1].minimum;
      return Number.isFinite(value) ? [{ status: 'reported-constant-channel-sum', value, unit: pair[0].unit, phase }] : [];
    });
    if (sums.length === 1) base.combined = sums[0];
    else if (sums.length > 1) base.combined = { status: 'reported-phase-sums', phaseReadings: sums };
  }
  const label = row => row.channel === 'left-cable' ? 'lewa linka' : 'prawa linka';
  const phaseLabel = phase => ({ concentric: 'faza koncentryczna', eccentric: 'faza ekscentryczna', isometric: 'faza izometryczna', unknown: 'faza nieznana' })[phase];
  const readingText = row => `${row.minimum === row.maximum ? row.minimum : `${row.minimum}–${row.maximum}`} ${row.unit === 'unknown' ? '(jednostka nieznana)' : row.unit} (${phaseLabel(row.phase)})${row.completeness === 'truncated' ? ' — częściowy odczyt (próbki obcięte)' : row.completeness === 'partial' ? ' — częściowy odczyt' : row.completeness === 'unknown' ? ' — kompletność niepotwierdzona' : ''}`;
  const text = channels.map(row => row.status === 'reported' ? `${label(row)}: ${readingText(row)}` : row.status === 'reported-phases' ? `${label(row)}: ${row.phaseReadings.map(reading => reading.status === 'reported' ? readingText(reading) : `sprzeczne odczyty: ${(reading.observations ?? []).map(readingText).join(', ')}`).join('; ')}` : row.observations ? `${label(row)}: sprzeczne odczyty: ${row.observations.map(readingText).join(', ')}` : `${label(row)}: brak potwierdzonego odczytu`).join('; ');
  return { ...base, status: known.length ? 'reported-channels' : 'unknown',
    text: preference === 'combined' && base.combined.status === 'reported-constant-channel-sum' ? `${base.combined.value} ${base.combined.unit} łącznie; ${text}`
      : preference === 'combined' && base.combined.status === 'reported-phase-sums' ? `${base.combined.phaseReadings.map(row => `${row.value} ${row.unit} łącznie (${phaseLabel(row.phase)})`).join('; ')}; ${text}` : text };
}
