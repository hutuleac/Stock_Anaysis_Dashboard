import { hasPosition } from './portfolio.svelte.js';

// Per-ticker checklist state: Map<symbol, ChecklistState>
let checklistMap = $state(new Map());

function getOrCreate(symbol) {
  if (!checklistMap.has(symbol)) {
    checklistMap.set(symbol, {
      macroChecked: false,
      earningsAnswer: null,    // null = pending, true = safe, false = risk, 'manual' = user override
      sectorAnswer: null,      // null = pending, true = safe, false = downtrend, 'manual' = user override
      stopLoss: '',
      accumulation: false,     // "Add to position" toggle
      accCostConfirmed: false,  // Q3-ACC manual answer
      hardWarning: false,       // true = earnings < 5 days, entry blocked
      hardWarningDismissed: false,
      autoAnswerFailed: { earnings: false, sector: false },
    });
  }
  return checklistMap.get(symbol);
}

export function getChecklist(symbol) {
  return getOrCreate(symbol);
}

export function isChecklistComplete(symbol) {
  const c = getOrCreate(symbol);
  if (c.hardWarning) return false;

  const q1 = c.macroChecked;

  // Q2: earnings — safe (true) or manually confirmed
  const q2 = c.earningsAnswer === true || c.earningsAnswer === 'manual';

  // Q3: depends on accumulation mode
  let q3;
  if (c.accumulation) {
    q3 = c.accCostConfirmed;
  } else {
    q3 = c.sectorAnswer === true || c.sectorAnswer === 'manual';
  }

  // Q4: stop-loss must have a value
  const q4 = c.stopLoss.trim().length > 0;

  return q1 && q2 && q3 && q4;
}

export function setMacroChecked(symbol, val) {
  getOrCreate(symbol).macroChecked = val;
}

export function setStopLoss(symbol, val) {
  getOrCreate(symbol).stopLoss = val;
}

export function toggleAccumulation(symbol) {
  const c = getOrCreate(symbol);
  c.accumulation = !c.accumulation;
  c.accCostConfirmed = false;
}

export function setAccCostConfirmed(symbol, val) {
  getOrCreate(symbol).accCostConfirmed = val;
}

export function setHardWarning(symbol, val) {
  const c = getOrCreate(symbol);
  c.hardWarning = val;
  c.hardWarningDismissed = false;
}

export function dismissHardWarning(symbol) {
  getOrCreate(symbol).hardWarningDismissed = true;
}

// Called by data layer after fetching earnings
export function setEarningsAnswer(symbol, daysToEarnings) {
  const c = getOrCreate(symbol);
  if (daysToEarnings === null) {
    // API failed — fall back to manual
    c.earningsAnswer = null;
    c.autoAnswerFailed.earnings = true;
    return;
  }
  c.autoAnswerFailed.earnings = false;
  if (daysToEarnings < 5) {
    c.hardWarning = true;
    c.earningsAnswer = false;
  } else if (daysToEarnings < 14) {
    c.earningsAnswer = false;
    c.hardWarning = false;
  } else {
    c.earningsAnswer = true;
    c.hardWarning = false;
  }
}

// Called by data layer after fetching sector ETF
export function setSectorAnswer(symbol, isDowntrend) {
  const c = getOrCreate(symbol);
  if (isDowntrend === null) {
    c.sectorAnswer = null;
    c.autoAnswerFailed.sector = true;
    return;
  }
  c.autoAnswerFailed.sector = false;
  c.sectorAnswer = !isDowntrend;
}

// Manual override when auto-answer fails
export function setManualEarnings(symbol, safe) {
  getOrCreate(symbol).earningsAnswer = safe ? 'manual' : false;
}

export function setManualSector(symbol, safe) {
  getOrCreate(symbol).sectorAnswer = safe ? 'manual' : false;
}

export function resetChecklist(symbol) {
  checklistMap.delete(symbol);
}

export function showAccumulationToggle(symbol) {
  return hasPosition(symbol);
}
