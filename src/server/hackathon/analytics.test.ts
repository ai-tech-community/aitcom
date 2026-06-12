import { describe, it, expect } from "vitest";

import { participationFunnel, cellCompletion } from "./analytics";

describe("participationFunnel", () => {
  it("computes stage-over-previous-stage conversion rates", () => {
    const funnel = participationFunnel({
      enrolled: 20,
      teamed: 10,
      inSubmittedTeams: 5,
    });
    expect(funnel.enrolled.count).toBe(20);
    expect(funnel.teamed).toEqual({ count: 10, rate: 0.5 });
    expect(funnel.submitted).toEqual({ count: 5, rate: 0.5 });
  });

  it("reports full conversion as 1", () => {
    const funnel = participationFunnel({
      enrolled: 4,
      teamed: 4,
      inSubmittedTeams: 4,
    });
    expect(funnel.teamed.rate).toBe(1);
    expect(funnel.submitted.rate).toBe(1);
  });

  it("guards division by zero with null rates (pre-enrollment)", () => {
    const funnel = participationFunnel({
      enrolled: 0,
      teamed: 0,
      inSubmittedTeams: 0,
    });
    expect(funnel.enrolled.count).toBe(0);
    expect(funnel.teamed).toEqual({ count: 0, rate: null });
    expect(funnel.submitted).toEqual({ count: 0, rate: null });
  });

  it("nulls only the submitted rate when nobody has teamed yet", () => {
    const funnel = participationFunnel({
      enrolled: 7,
      teamed: 0,
      inSubmittedTeams: 0,
    });
    expect(funnel.teamed).toEqual({ count: 0, rate: 0 });
    expect(funnel.submitted).toEqual({ count: 0, rate: null });
  });
});

describe("cellCompletion", () => {
  it("aggregates cumulative claimed/reported/verified with rates against total", () => {
    // 10 cells: 2 pending, 1 requeued (claimable again → not "claimed"),
    // 3 currently claimed, 3 completed, 1 failed. 2 of the completed verified.
    const stats = cellCompletion(
      { pending: 2, requeued: 1, claimed: 3, completed: 3, failed: 1 },
      2,
    );
    expect(stats.total).toBe(10);
    // Ever-claimed = claimed + completed + failed.
    expect(stats.claimed).toEqual({ count: 7, rate: 0.7 });
    // Reported = a result exists: completed (awaiting/verified) + failed.
    expect(stats.reported).toEqual({ count: 4, rate: 0.4 });
    expect(stats.verified).toEqual({ count: 2, rate: 0.2 });
  });

  it("treats missing status buckets as zero", () => {
    const stats = cellCompletion({ pending: 5 }, 0);
    expect(stats.total).toBe(5);
    expect(stats.claimed).toEqual({ count: 0, rate: 0 });
    expect(stats.reported).toEqual({ count: 0, rate: 0 });
    expect(stats.verified).toEqual({ count: 0, rate: 0 });
  });

  it("guards division by zero with null rates when there are no cells (pre-lock)", () => {
    const stats = cellCompletion({}, 0);
    expect(stats.total).toBe(0);
    expect(stats.claimed).toEqual({ count: 0, rate: null });
    expect(stats.reported).toEqual({ count: 0, rate: null });
    expect(stats.verified).toEqual({ count: 0, rate: null });
  });

  it("counts every completed cell as reported even when verified", () => {
    const stats = cellCompletion({ completed: 4 }, 4);
    expect(stats.claimed).toEqual({ count: 4, rate: 1 });
    expect(stats.reported).toEqual({ count: 4, rate: 1 });
    expect(stats.verified).toEqual({ count: 4, rate: 1 });
  });
});
