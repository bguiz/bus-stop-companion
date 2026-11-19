// Pure rules for the stop picker. Events: open, tab, escape, cancel, select, home.
// On the home page (no stop) the picker is the main UI: no Cancel, nothing but a choice closes it.
export function pickerState({ hasStop, event }) {
  const dismiss = event === 'tab' || event === 'escape' || event === 'cancel';
  return {
    showCancel: Boolean(hasStop),
    close: event === 'select' || event === 'home' || (Boolean(hasStop) && dismiss),
  };
}
