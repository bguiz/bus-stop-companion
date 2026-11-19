// Scene tab note wording, with correct pluralisation.
const buses = (n) => (n === 1 ? '1 bus' : `${n} buses`);

export function sceneNote(placed, noGps) {
  const head = `${buses(placed)} placed`;
  if (!noGps) return head;
  return `${head}, ${buses(noGps)} ${noGps === 1 ? 'has' : 'have'} no live GPS yet`;
}
