import type { TagInput } from "./graphqlTypes.ts";

export const arr2obj = (arr: TagInput[]) =>
  arr.reduce((acc: Record<string, any>, cur: TagInput) => {
    acc[cur.key] = cur.value;
    return acc;
  }, {});
