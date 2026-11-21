import { Assignment, TicketLine } from '../types';

const EPS = 0.001;

/**
 * Un "grupo" (Assignment) reparte `units` unidades a partes iguales entre `personIds`.
 * - Unidades enteras de una persona: grupo con una sola persona.
 * - Unidades compartidas: grupo con varias personas.
 * - Grupo sin personas: unidades todavía sin asignar (solo existe desde la vista por producto).
 */

export const assignedUnits = (line: TicketLine): number =>
  line.assignments.reduce((s, a) => (a.personIds.length > 0 ? s + a.units : s), 0);

export const pendingUnits = (line: TicketLine): number =>
  Math.max(0, line.quantity - assignedUnits(line));

export const soloGroup = (line: TicketLine, pid: string): Assignment | undefined =>
  line.assignments.find((a) => a.personIds.length === 1 && a.personIds[0] === pid);

export const wholeUnits = (line: TicketLine, pid: string): number =>
  soloGroup(line, pid)?.units ?? 0;

export const sharedGroups = (line: TicketLine, pid: string): Assignment[] =>
  line.assignments.filter((a) => a.personIds.length > 1 && a.personIds.includes(pid));

export const sharedUnitsCount = (line: TicketLine, pid: string): number =>
  sharedGroups(line, pid).reduce((s, a) => s + a.units, 0);

/** Grupos de otras personas a los que `pid` podría unirse. */
export const joinableGroups = (line: TicketLine, pid: string): Assignment[] =>
  line.assignments.filter((a) => a.personIds.length > 0 && a.units > EPS && !a.personIds.includes(pid));

export const hasUnits = (line: TicketLine, pid: string): boolean =>
  line.assignments.some((a) => a.personIds.includes(pid) && a.units > EPS);

export const personAmount = (line: TicketLine, pid: string): number =>
  line.assignments.reduce(
    (s, a) =>
      a.personIds.includes(pid) && a.units > 0
        ? s + (a.units * line.unitPrice) / a.personIds.length
        : s,
    0
  );

/** Importe que pagaría `pid` si se une al grupo `a`. */
export const joinPreviewAmount = (line: TicketLine, a: Assignment): number => {
  if (a.personIds.length === 1) {
    // Se parte una de las unidades del otro: la mitad para cada uno.
    const moved = Math.min(1, a.units);
    return (moved * line.unitPrice) / 2;
  }
  return (a.units * line.unitPrice) / (a.personIds.length + 1);
};

/** Si los grupos sin personas ocupan más de lo que cabe, los recorta. */
const fit = (line: TicketLine, assignments: Assignment[]): Assignment[] => {
  let total = assignments.reduce((s, a) => s + a.units, 0);
  if (total <= line.quantity + EPS) return assignments;
  const result = [...assignments];
  for (let i = result.length - 1; i >= 0 && total > line.quantity + EPS; i--) {
    const a = result[i];
    if (a.personIds.length !== 0) continue;
    const excess = total - line.quantity;
    if (a.units - excess > EPS) {
      result[i] = { ...a, units: a.units - excess };
      total -= excess;
    } else {
      total -= a.units;
      result.splice(i, 1);
    }
  }
  return result;
};

/** Une grupos con las mismas personas y elimina los vacíos de unidades. */
const merge = (assignments: Assignment[]): Assignment[] => {
  const out: Assignment[] = [];
  assignments.forEach((a) => {
    if (a.units <= EPS) return;
    if (a.personIds.length === 0) {
      out.push(a);
      return;
    }
    const key = [...a.personIds].sort().join('|');
    const existing = out.find(
      (o) => o.personIds.length > 0 && [...o.personIds].sort().join('|') === key
    );
    if (existing) existing.units += a.units;
    else out.push({ ...a, personIds: [...a.personIds] });
  });
  return out;
};

const newId = () => crypto.randomUUID();

/** +1 unidad entera para la persona. */
export const addWhole = (line: TicketLine, pid: string): Assignment[] => {
  const pending = pendingUnits(line);
  if (pending <= EPS) return line.assignments;
  const step = Math.min(1, pending);
  const solo = soloGroup(line, pid);
  const next = solo
    ? line.assignments.map((a) => (a.id === solo.id ? { ...a, units: a.units + step } : a))
    : [...line.assignments, { id: newId(), units: step, personIds: [pid] }];
  return merge(fit(line, next));
};

/** -1 unidad entera para la persona. */
export const removeWhole = (line: TicketLine, pid: string): Assignment[] => {
  const solo = soloGroup(line, pid);
  if (!solo) return line.assignments;
  const step = Math.min(1, solo.units);
  return merge(
    line.assignments.map((a) => (a.id === solo.id ? { ...a, units: a.units - step } : a))
  );
};

/** Crea una unidad (o varias) compartida entre la persona y otras. */
export const createShare = (
  line: TicketLine,
  pid: string,
  otherIds: string[],
  units: number
): Assignment[] => {
  const u = Math.min(units, pendingUnits(line));
  if (u <= EPS || otherIds.length === 0) return line.assignments;
  return merge(
    fit(line, [...line.assignments, { id: newId(), units: u, personIds: [pid, ...otherIds] }])
  );
};

/** Cambia las unidades de un grupo compartido. */
export const changeGroupUnits = (
  line: TicketLine,
  assignmentId: string,
  delta: number
): Assignment[] => {
  const a = line.assignments.find((x) => x.id === assignmentId);
  if (!a) return line.assignments;
  const nextUnits = a.units + delta;
  if (nextUnits < 1 - EPS) return line.assignments;
  if (delta > 0 && pendingUnits(line) <= EPS) return line.assignments;
  return merge(
    fit(
      line,
      line.assignments.map((x) => (x.id === assignmentId ? { ...x, units: nextUnits } : x))
    )
  );
};

/** Añade o quita a otra persona de un grupo compartido. */
export const toggleGroupPerson = (
  line: TicketLine,
  assignmentId: string,
  otherId: string
): Assignment[] => {
  const a = line.assignments.find((x) => x.id === assignmentId);
  if (!a) return line.assignments;
  const personIds = a.personIds.includes(otherId)
    ? a.personIds.filter((id) => id !== otherId)
    : [...a.personIds, otherId];
  return merge(line.assignments.map((x) => (x.id === assignmentId ? { ...x, personIds } : x)));
};

/** Selecciona a todos en un grupo, o deja solo a la persona si ya estaban todos. */
export const setGroupAll = (
  line: TicketLine,
  assignmentId: string,
  pid: string,
  allIds: string[]
): Assignment[] => {
  const a = line.assignments.find((x) => x.id === assignmentId);
  if (!a) return line.assignments;
  const personIds = a.personIds.length === allIds.length ? [pid] : [...allIds];
  return merge(line.assignments.map((x) => (x.id === assignmentId ? { ...x, personIds } : x)));
};

/** La persona sale de un grupo (las unidades siguen para quien se quede). */
export const leaveGroup = (line: TicketLine, assignmentId: string, pid: string): Assignment[] => {
  return merge(
    line.assignments
      .map((x) =>
        x.id === assignmentId ? { ...x, personIds: x.personIds.filter((id) => id !== pid) } : x
      )
      .filter((x) => !(x.id === assignmentId && x.personIds.length === 0))
  );
};

/** La persona se une al grupo de otras. Si el grupo es de una sola persona, se parte una de sus unidades. */
export const joinGroup = (line: TicketLine, assignmentId: string, pid: string): Assignment[] => {
  const a = line.assignments.find((x) => x.id === assignmentId);
  if (!a || a.personIds.includes(pid)) return line.assignments;
  if (a.personIds.length === 1 && a.units > 1 + EPS) {
    const rest = line.assignments.map((x) =>
      x.id === assignmentId ? { ...x, units: x.units - 1 } : x
    );
    return merge([...rest, { id: newId(), units: 1, personIds: [a.personIds[0], pid] }]);
  }
  return merge(
    line.assignments.map((x) =>
      x.id === assignmentId ? { ...x, personIds: [...x.personIds, pid] } : x
    )
  );
};
