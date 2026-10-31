import { describe, expect, it, vi } from "vitest";
import { collectAll, fakeContext } from "../testing/fake-context";
import { eventPage } from "./event-page";
const url = "https://events.example/day";
describe("Event page collector", () => {
  it("fetches through context and yields exportable typed event rows", async () => {
    const { ctx, requests } = fakeContext({
      [url]: {
        body: '<script type="application/ld+json">{"@type":"Event","name":"Community day","location":{"@type":"Place","name":"Town hall"}}</script>',
      },
    });
    const extract = vi.spyOn(ctx, "extractEvents");
    const rows = await collectAll(eventPage.run({ url }, ctx));
    expect(rows[0]).toMatchObject({
      name: "Community day",
      online: false,
      url,
    });
    expect(eventPage.itemSchema.safeParse(rows[0]).success).toBe(true);
    expect(requests).toEqual([
      { url, accept: "text/html,application/xhtml+xml" },
    ]);
    expect(extract).toHaveBeenCalledOnce();
  });
  it.each([
    [200, "<p>No event</p>", {}, "no_event_data"],
    [
      200,
      '<script type="application/ld+json">{</script>',
      {},
      "event_data_invalid",
    ],
    [
      200,
      '<script type="application/ld+json">{"@type":"Event"}</script>',
      {},
      "event_data_invalid",
    ],
    [404, "", {}, "page_status"],
    [200, "{}", { "content-type": "application/json" }, "not_a_page"],
  ])(
    "explains an unreadable event page (%s)",
    async (status, body, headers, code) => {
      const { ctx } = fakeContext({
        [url]: {
          status: status,
          body: body,
          headers: headers as Record<string, string>,
        },
      });
      await expect(
        collectAll(eventPage.run({ url }, ctx)),
      ).rejects.toMatchObject({ outcome: "failed", detail: { code } });
    },
  );
});
