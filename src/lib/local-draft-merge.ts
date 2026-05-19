type MergeableDraft = {
  id: string;
  created_at?: string;
  updated_at?: string;
};

type MergeLocalDraftsInput<T extends MergeableDraft> = {
  remote: T[];
  local: T[];
};

type MergeLocalDraftsResult<T extends MergeableDraft> = {
  items: T[];
  itemsToUpload: T[];
};

function timestampMs(value: string | undefined): number | null {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
}

function lastChangedMs(item: MergeableDraft): number {
  return timestampMs(item.updated_at) ?? timestampMs(item.created_at) ?? 0;
}

function sortNewestFirst<T extends MergeableDraft>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const changedDiff = lastChangedMs(b) - lastChangedMs(a);
    if (changedDiff !== 0) return changedDiff;
    return b.id.localeCompare(a.id);
  });
}

export function mergeLocalDraftsWithRemote<T extends MergeableDraft>({
  remote,
  local,
}: MergeLocalDraftsInput<T>): MergeLocalDraftsResult<T> {
  const mergedById = new Map<string, T>();
  const remoteById = new Map<string, T>();
  const itemsToUpload: T[] = [];

  for (const item of remote) {
    remoteById.set(item.id, item);
    mergedById.set(item.id, item);
  }

  for (const localItem of local) {
    const remoteItem = remoteById.get(localItem.id);
    if (!remoteItem) {
      mergedById.set(localItem.id, localItem);
      itemsToUpload.push(localItem);
      continue;
    }

    if (lastChangedMs(localItem) > lastChangedMs(remoteItem)) {
      mergedById.set(localItem.id, localItem);
      itemsToUpload.push(localItem);
    }
  }

  return {
    items: sortNewestFirst(Array.from(mergedById.values())),
    itemsToUpload: sortNewestFirst(itemsToUpload),
  };
}
