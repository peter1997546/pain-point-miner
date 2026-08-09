import { describe, expect, it } from "vitest";
import { toArchivePermalink } from "../index.js";

/**
 * Seams under test (ticket #48 / ADR-0016):
 * - Pure URL/id → Archive Permalink helper (not a new port)
 *
 * Expected Archive Permalink form (Arctic Shift search UI id lookup):
 * https://arctic-shift.photon-reddit.com/search?fun=ids&ids=t3_<postId>
 * https://arctic-shift.photon-reddit.com/search?fun=ids&ids=t1_<commentId>
 */

describe("toArchivePermalink — Reddit URL/id → Archive Permalink", () => {
  it("converts www.reddit.com post permalinks to t3_ Archive Permalinks", () => {
    expect(
      toArchivePermalink(
        "https://www.reddit.com/r/freelance/comments/abc123/invoice_pain/",
      ),
    ).toBe(
      "https://arctic-shift.photon-reddit.com/search?fun=ids&ids=t3_abc123",
    );
  });

  it("converts old.reddit.com and bare reddit.com hosts", () => {
    expect(
      toArchivePermalink(
        "https://old.reddit.com/r/webdev/comments/xyz789/title_here/",
      ),
    ).toBe(
      "https://arctic-shift.photon-reddit.com/search?fun=ids&ids=t3_xyz789",
    );
    expect(
      toArchivePermalink(
        "https://reddit.com/r/sales/comments/post42/slug/",
      ),
    ).toBe(
      "https://arctic-shift.photon-reddit.com/search?fun=ids&ids=t3_post42",
    );
  });

  it("converts redd.it short links to t3_ Archive Permalinks", () => {
    expect(toArchivePermalink("https://redd.it/short99")).toBe(
      "https://arctic-shift.photon-reddit.com/search?fun=ids&ids=t3_short99",
    );
    expect(toArchivePermalink("https://www.redd.it/short99")).toBe(
      "https://arctic-shift.photon-reddit.com/search?fun=ids&ids=t3_short99",
    );
  });

  it("converts comment permalinks to t1_ Archive Permalinks", () => {
    expect(
      toArchivePermalink(
        "https://www.reddit.com/r/sysadmin/comments/abc123/slug/def456/",
      ),
    ).toBe(
      "https://arctic-shift.photon-reddit.com/search?fun=ids&ids=t1_def456",
    );
    expect(
      toArchivePermalink(
        "https://old.reddit.com/r/marketing/comments/aaa111/title/bbb222",
      ),
    ).toBe(
      "https://arctic-shift.photon-reddit.com/search?fun=ids&ids=t1_bbb222",
    );
  });

  it("accepts bare Reddit fullnames and bare post ids", () => {
    expect(toArchivePermalink("t3_abc123")).toBe(
      "https://arctic-shift.photon-reddit.com/search?fun=ids&ids=t3_abc123",
    );
    expect(toArchivePermalink("t1_def456")).toBe(
      "https://arctic-shift.photon-reddit.com/search?fun=ids&ids=t1_def456",
    );
    expect(toArchivePermalink("abc123")).toBe(
      "https://arctic-shift.photon-reddit.com/search?fun=ids&ids=t3_abc123",
    );
  });

  it("returns undefined for non-Reddit identities (does not invent artifacts)", () => {
    expect(toArchivePermalink("https://news.ycombinator.com/item?id=1")).toBe(
      undefined,
    );
    expect(toArchivePermalink("https://example.com/not-reddit")).toBe(
      undefined,
    );
    expect(toArchivePermalink("")).toBe(undefined);
    expect(toArchivePermalink("not a url")).toBe(undefined);
  });
});
