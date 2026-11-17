import { fixtureGraph } from '../core/loadFixture';
import { calendarLayout, levelFor, levelThresholds, moveDate } from '../../../src/views/calendar/layout';

const g = fixtureGraph();
const notes = [...g.notes.values()];

describe('calendar layout', () => {
  const l = calendarLayout(notes, 'created');

  it('is deterministic and counts every visible note once', () => {
    expect(calendarLayout(notes, 'created')).toEqual(l);
    expect(l.total).toBe(39);
    expect([...l.byDate.values()].reduce((n, c) => n + c.count, 0)).toBe(39);
  });

  it('lists the notes for a day', () => {
    expect(l.byDate.get('2025-03-14')?.noteIds).toEqual(['areas/health/running']);
    expect(l.byDate.get('2025-03-15')?.count).toBe(0);
  });

  it('stacks years newest first and places days GitHub-style', () => {
    expect(l.years.map((y) => y.year)).toEqual([2026, 2025]);
    const y2025 = l.years.find((y) => y.year === 2025);
    expect(y2025?.cells).toHaveLength(365);
    expect(l.byDate.get('2025-01-01')).toMatchObject({ weekday: 3, week: 0 }); // a Wednesday
    expect(l.byDate.get('2025-01-05')).toMatchObject({ weekday: 0, week: 1 }); // the next Sunday starts week 1
    expect(y2025?.months.map((m) => m.label)).toEqual([
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
    ]);
  });

  it('colour levels rise with the count, by quartiles of non-empty days', () => {
    const t = levelThresholds([0, 1, 1, 2, 3, 5, 8]);
    expect(t).toEqual([1, 3, 5]); // non-zero days [1,1,2,3,5,8] → quartiles
    expect([0, 1, 2, 3, 4, 5, 9].map((c) => levelFor(c, t))).toEqual([0, 1, 2, 2, 3, 3, 4]);
    expect(levelThresholds([])).toEqual([1, 1, 1]);
  });

  it('respects the visible subset and the date field', () => {
    expect(
      calendarLayout(
        notes.filter((n) => n.folder === 'journal/2025'),
        'created',
      ).total,
    ).toBe(6);
    expect(calendarLayout([], 'created').years).toEqual([]);
    expect(calendarLayout(notes, 'updated').byDate.get('2025-03-14')?.count ?? 0).toBe(0);
  });

  it('moves through the grid with arrow keys', () => {
    expect(moveDate('2025-03-14', 'ArrowDown')).toBe('2025-03-15');
    expect(moveDate('2025-03-14', 'ArrowLeft')).toBe('2025-03-07');
    expect(moveDate('2025-12-31', 'ArrowRight')).toBe('2026-01-07');
    expect(moveDate('2025-03-14', 'x')).toBeNull();
  });
});
