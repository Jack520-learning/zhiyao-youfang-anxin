import type { CloudSnapshot } from "../types";

export function cloudSnapshotFingerprint(snapshot: CloudSnapshot): string {
  const { updatedAt: _updatedAt, ...content } = snapshot;
  return JSON.stringify(content);
}
