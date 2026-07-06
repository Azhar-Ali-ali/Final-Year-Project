const defaultShippingRules = {
  assignmentRules: [],
  shippingChargesRules: [],
  codRules: []
};

let shippingRulesState = JSON.parse(JSON.stringify(defaultShippingRules));

function cloneRules(source = shippingRulesState) {
  return JSON.parse(JSON.stringify(source));
}

function normalizeRuleValue(value) {
  return String(value || '').trim().toLowerCase();
}

function getShippingRulesState() {
  return cloneRules(shippingRulesState);
}

function updateShippingRulesState(payload = {}) {
  const nextRules = cloneRules(shippingRulesState);

  if (Array.isArray(payload.assignmentRules)) {
    nextRules.assignmentRules = payload.assignmentRules;
  }

  if (Array.isArray(payload.shippingChargesRules)) {
    nextRules.shippingChargesRules = payload.shippingChargesRules;
  }

  if (Array.isArray(payload.codRules)) {
    nextRules.codRules = payload.codRules;
  }

  shippingRulesState = nextRules;
  return cloneRules(shippingRulesState);
}

function resetShippingRulesState() {
  shippingRulesState = JSON.parse(JSON.stringify(defaultShippingRules));
  return cloneRules(shippingRulesState);
}

function findBestMatchingRule(rules, state, city) {
  const normalizedState = normalizeRuleValue(state);
  const normalizedCity = normalizeRuleValue(city);

  const candidates = (rules || []).filter((rule) => normalizeRuleValue(rule.status || 'Active') === 'active');

  const scored = candidates.map((rule) => {
    const ruleState = normalizeRuleValue(rule.state);
    const ruleCity = normalizeRuleValue(rule.city);
    const stateMatch = ruleState === 'all' ? 1 : ruleState === normalizedState ? 2 : 0;
    const cityMatch = ruleCity === 'all' ? 1 : ruleCity === normalizedCity ? 2 : 0;
    const priority = Number(rule.priority || 999);
    return { rule, stateMatch, cityMatch, priority };
  }).filter((item) => item.stateMatch > 0 && item.cityMatch > 0);

  scored.sort((a, b) => {
    if (b.stateMatch !== a.stateMatch) return b.stateMatch - a.stateMatch;
    if (b.cityMatch !== a.cityMatch) return b.cityMatch - a.cityMatch;
    return a.priority - b.priority;
  });

  return scored[0] ? scored[0].rule : null;
}

function findAssignmentRule(state, city) {
  return findBestMatchingRule(getShippingRulesState().assignmentRules, state, city);
}

function findShippingFeeRule(state, city) {
  const rules = getShippingRulesState().shippingChargesRules || [];
  const normalizedState = normalizeRuleValue(state);
  const normalizedCity = normalizeRuleValue(city);

  const scored = (rules || []).map((rule) => {
    const ruleState = normalizeRuleValue(rule.state);
    const ruleCity = normalizeRuleValue(rule.city);
    const stateMatch = ruleState === 'all' ? 1 : ruleState === normalizedState ? 2 : 0;
    const cityMatch = ruleCity === 'all' ? 1 : ruleCity === normalizedCity ? 2 : 0;
    return { rule, stateMatch, cityMatch };
  }).filter((item) => item.stateMatch > 0 && item.cityMatch > 0);

  scored.sort((a, b) => {
    if (b.stateMatch !== a.stateMatch) return b.stateMatch - a.stateMatch;
    return b.cityMatch - a.cityMatch;
  });

  return scored[0] ? scored[0].rule : null;
}

function isCodAvailable(state, city) {
  const rules = getShippingRulesState().codRules || [];
  const normalizedState = normalizeRuleValue(state);
  const normalizedCity = normalizeRuleValue(city);

  const scored = (rules || []).map((rule) => {
    const ruleState = normalizeRuleValue(rule.state);
    const ruleCity = normalizeRuleValue(rule.city);
    const stateMatch = ruleState === 'all' ? 1 : ruleState === normalizedState ? 2 : 0;
    const cityMatch = ruleCity === 'all' ? 1 : ruleCity === normalizedCity ? 2 : 0;
    return { rule, stateMatch, cityMatch };
  }).filter((item) => item.stateMatch > 0 && item.cityMatch > 0);

  scored.sort((a, b) => {
    if (b.stateMatch !== a.stateMatch) return b.stateMatch - a.stateMatch;
    return b.cityMatch - a.cityMatch;
  });

  const matched = scored[0] ? scored[0].rule : null;
  if (!matched) return true;
  return normalizeRuleValue(matched.codAvailable) !== 'no';
}

module.exports = {
  defaultShippingRules,
  getShippingRulesState,
  updateShippingRulesState,
  resetShippingRulesState,
  findAssignmentRule,
  findShippingFeeRule,
  isCodAvailable
};
