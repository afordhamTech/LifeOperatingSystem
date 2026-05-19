import { describe, expect, it } from "vitest";
import { mergeLocalDraftsWithRemote } from "@/lib/local-draft-merge";

type DraftRow = {
  id: string;
  title: string;
  created_at?: string;
  updated_at?: string;
};

describe("mergeLocalDraftsWithRemote", () => {
  it("keeps remote rows and uploads local drafts when both sources have data", () => {
    const remote: DraftRow[] = [
      {
        id: "remote-1",
        title: "Remote task",
        created_at: "2026-05-15T12:00:00.000Z",
        updated_at: "2026-05-15T12:00:00.000Z",
      },
    ];
    const local: DraftRow[] = [
      {
        id: "local-1",
        title: "Local draft",
        created_at: "2026-05-16T12:00:00.000Z",
        updated_at: "2026-05-16T12:00:00.000Z",
      },
      remote[0],
    ];

    const result = mergeLocalDraftsWithRemote({ remote, local });

    expect(result.items.map((item) => item.id)).toEqual(["local-1", "remote-1"]);
    expect(result.itemsToUpload.map((item) => item.id)).toEqual(["local-1"]);
  });

  it("uploads the local copy when a matching local row is newer", () => {
    const remote: DraftRow[] = [
      {
        id: "same-id",
        title: "Remote stale",
        created_at: "2026-05-15T12:00:00.000Z",
        updated_at: "2026-05-15T12:00:00.000Z",
      },
    ];
    const local: DraftRow[] = [
      {
        id: "same-id",
        title: "Local edit",
        created_at: "2026-05-15T12:00:00.000Z",
        updated_at: "2026-05-16T12:00:00.000Z",
      },
    ];

    const result = mergeLocalDraftsWithRemote({ remote, local });

    expect(result.items).toEqual(local);
    expect(result.itemsToUpload).toEqual(local);
  });

  it("keeps the remote copy when it is newer than the matching local row", () => {
    const remote: DraftRow[] = [
      {
        id: "same-id",
        title: "Remote edit",
        created_at: "2026-05-15T12:00:00.000Z",
        updated_at: "2026-05-16T12:00:00.000Z",
      },
    ];
    const local: DraftRow[] = [
      {
        id: "same-id",
        title: "Local stale",
        created_at: "2026-05-15T12:00:00.000Z",
        updated_at: "2026-05-15T12:00:00.000Z",
      },
    ];

    const result = mergeLocalDraftsWithRemote({ remote, local });

    expect(result.items).toEqual(remote);
    expect(result.itemsToUpload).toEqual([]);
  });
});
