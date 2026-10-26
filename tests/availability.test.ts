import { describe, expect, it } from "vitest";
import { DateTime } from "luxon";
import { computeSlots, pickSuggestions, reminderSendTime, subtractIntervals, type EngineInput } from "@/lib/availability";
import { normalizePhone } from "@/lib/phone";

const TZ = "America/Argentina/Buenos_Aires";
const d = (iso: string) => DateTime.fromISO(iso, { zone: TZ }).toMillis();
// Lunes 2 de noviembre de 2026
const MONDAY = "2026-11-02";
const rules = [1, 2, 3, 4, 5].flatMap((weekday) => [
  { locationId: 1, weekday, startTime: "09:00", endTime: "13:00" },
  { locationId: 1, weekday, startTime: "15:00", endTime: "19:00" },
]);

function base(over: Partial<EngineInput> = {}): EngineInput {
  return {
    now: d("2026-10-30T08:00"),
    tz: TZ,
    from: d(`${MONDAY}T00:00`),
    to: d(`${MONDAY}T23:59`),
    rules,
    exceptions: [],
    busy: [],
    durationMinutes: 30,
    bufferMinutes: 0,
    slotIntervalMinutes: 30,
    minNoticeHours: 0,
    maxAdvanceDays: 60,
    locationIds: [1],
    ...over,
  };
}
const times = (slots: { start: number }[]) => slots.map((s) => DateTime.fromMillis(s.start, { zone: TZ }).toFormat("HH:mm"));

describe("motor de disponibilidad", () => {
  it("genera turnos dentro del horario y respeta el descanso", () => {
    const t = times(computeSlots(base()));
    expect(t[0]).toBe("09:00");
    expect(t).toContain("12:30");
    expect(t).not.toContain("13:00");
    expect(t).not.toContain("14:30");
    expect(t).toContain("15:00");
    expect(t.at(-1)).toBe("18:30");
    expect(t).toHaveLength(16);
  });

  it("la duración larga no se sale de la franja", () => {
    const t = times(computeSlots(base({ durationMinutes: 40 })));
    expect(t).not.toContain("12:30"); // 12:30 + 40' = 13:10
    expect(t).toContain("12:00");
  });

  it("no ofrece horarios pasados ni dentro de la anticipación mínima", () => {
    const t = times(computeSlots(base({ now: d(`${MONDAY}T10:10`), minNoticeHours: 2 })));
    expect(t[0]).toBe("12:30");
  });

  it("respeta el máximo de días a futuro", () => {
    const slots = computeSlots(base({ now: d("2026-10-01T08:00"), maxAdvanceDays: 10 }));
    expect(slots).toHaveLength(0);
  });

  it("feriados, vacaciones y bloqueos eliminan horarios", () => {
    const holiday = { kind: "holiday", startAt: d(`${MONDAY}T00:00`), endAt: d("2026-11-03T00:00"), locationId: null };
    expect(computeSlots(base({ exceptions: [holiday] }))).toHaveLength(0);
    const block = { kind: "block", startAt: d(`${MONDAY}T10:00`), endAt: d(`${MONDAY}T11:00`), locationId: 1 };
    const t = times(computeSlots(base({ exceptions: [block] })));
    expect(t).not.toContain("10:00");
    expect(t).not.toContain("10:30");
    expect(t).toContain("11:00");
    expect(t).toContain("09:30");
  });

  it("horario especial agrega disponibilidad un sábado", () => {
    const sat = "2026-11-07";
    const extra = { kind: "extra", startAt: d(`${sat}T09:00`), endAt: d(`${sat}T11:00`), locationId: null };
    const t = times(computeSlots(base({ exceptions: [extra], from: d(`${sat}T00:00`), to: d(`${sat}T23:59`) })));
    expect(t).toEqual(["09:00", "09:30", "10:00", "10:30"]);
  });

  it("nunca ofrece un horario ocupado y respeta el tiempo entre pacientes", () => {
    const busy = [{ start: d(`${MONDAY}T10:00`), end: d(`${MONDAY}T10:30`) }];
    expect(times(computeSlots(base({ busy })))).not.toContain("10:00");
    const t = times(computeSlots(base({ busy, bufferMinutes: 10 })));
    expect(t).not.toContain("09:30"); // 09:30–10:00 + 10' de margen choca con 10:00
    expect(t).not.toContain("10:30"); // necesita 10' después del turno de las 10:00
    expect(t).toContain("11:00");
  });

  it("aplica las reglas de la cobertura (días, horario y sede)", () => {
    const coverage = { allowedWeekdays: [2], allowedLocationIds: [], timeFrom: null, timeTo: null };
    expect(computeSlots(base({ coverage }))).toHaveLength(0);
    const morning = { allowedWeekdays: [], allowedLocationIds: [], timeFrom: "09:00", timeTo: "11:00" };
    expect(times(computeSlots(base({ coverage: morning })))).toEqual(["09:00", "09:30", "10:00", "10:30"]);
    const otherLoc = { allowedWeekdays: [], allowedLocationIds: [2], timeFrom: null, timeTo: null };
    expect(computeSlots(base({ coverage: otherLoc }))).toHaveLength(0);
  });

  it("resta intervalos correctamente", () => {
    expect(subtractIntervals([{ start: 0, end: 10 }], [{ start: 3, end: 5 }])).toEqual([
      { start: 0, end: 3 },
      { start: 5, end: 10 },
    ]);
  });
});

describe("sugerencias", () => {
  it("propone la más próxima y alternativas en otros días y franjas", () => {
    const slots = computeSlots(base({ from: d(`${MONDAY}T00:00`), to: d("2026-11-07T00:00") }));
    const picks = pickSuggestions(slots, TZ);
    const labels = picks.map((s) => DateTime.fromMillis(s.start, { zone: TZ }).toFormat("ccc HH:mm", { locale: "en" }));
    expect(labels).toEqual(["Mon 09:00", "Tue 15:00", "Wed 09:00"]);
  });

  it("si hay pocos turnos, devuelve los que hay", () => {
    const slots = computeSlots(base({ busy: [{ start: d(`${MONDAY}T09:00`), end: d(`${MONDAY}T18:30`) }] }));
    expect(pickSuggestions(slots, TZ)).toHaveLength(1);
  });
});

describe("recordatorios", () => {
  const start = d("2026-11-05T10:30");
  it("48 y 24 horas antes", () => {
    const now = d("2026-11-01T10:00");
    expect(reminderSendTime(start, 48, now, TZ, "08:00", "21:00")).toBe(d("2026-11-03T10:30"));
    expect(reminderSendTime(start, 24, now, TZ, "08:00", "21:00")).toBe(d("2026-11-04T10:30"));
  });
  it("se ajusta a la franja permitida", () => {
    const early = d("2026-11-05T07:30");
    expect(reminderSendTime(early, 24, d("2026-11-01T10:00"), TZ, "08:00", "21:00")).toBe(d("2026-11-04T08:00"));
    const late = d("2026-11-05T22:00");
    expect(reminderSendTime(late, 24, d("2026-11-01T10:00"), TZ, "08:00", "21:00")).toBe(d("2026-11-04T21:00"));
  });
  it("no programa recordatorios que ya pasaron", () => {
    expect(reminderSendTime(start, 48, d("2026-11-04T00:00"), TZ, "08:00", "21:00")).toBeNull();
  });
});

describe("teléfonos", () => {
  it.each([
    ["11 2345-6789", "5491123456789"],
    ["011 15 2345-6789", "5491123456789"],
    ["+54 9 11 2345 6789", "5491123456789"],
    ["0351 15 456-7890", "5493514567890"],
    ["+54 351 4567890", "5493514567890"],
  ])("%s → %s", (input, out) => expect(normalizePhone(input)).toBe(out));
  it("rechaza números inválidos", () => expect(normalizePhone("1234")).toBeNull());
});
