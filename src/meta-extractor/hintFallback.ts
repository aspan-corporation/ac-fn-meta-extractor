import type { TagInput } from "./graphqlTypes.ts";

// S3 user-metadata keys written by the diary upload-url route when the
// browser supplied device hints (mobile OSes strip GPS EXIF — and sometimes
// the date — from files handed to web pages, so the client sends what it
// knows: the file's own timestamp and, for just-taken photos, the device's
// current position). S3 lowercases metadata keys, so these are the exact
// wire names as they come back from HeadObject.
const HINT_DATE = "hint-date";
const HINT_LATITUDE = "hint-latitude";
const HINT_LONGITUDE = "hint-longitude";

// Number() quirks: Number("") and Number("  ") are 0, not NaN — an empty
// hint must not turn into a valid coordinate at (0, 0).
const parseFinite = (value: string | undefined): number | undefined => {
  if (value === undefined || value.trim() === "") return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
};

/**
 * Fallback tags from device hints for fields EXIF didn't provide. EXIF always
 * wins: a hint is used only when the corresponding key is absent from the
 * EXIF-derived tags. Only `dateCreated` / `latitude` / `longitude` are pushed;
 * processMeta derives year/month/day from dateCreated and reverse-geocodes
 * lat/long into country/region tags exactly as it does for real EXIF.
 */
export default function hintFallbackTags(
  exifTags: TagInput[],
  s3Metadata: Record<string, string> | undefined,
): TagInput[] {
  if (!s3Metadata) return [];

  const has = (key: string) => exifTags.some((t) => t.key === key);
  const out: TagInput[] = [];

  if (!has("dateCreated") && s3Metadata[HINT_DATE]) {
    const d = new Date(s3Metadata[HINT_DATE]);
    if (!isNaN(d.getTime())) {
      out.push({ key: "dateCreated", value: d.toISOString() });
    }
  }

  // Coordinates only ever make sense as a pair; note 0 is a valid value
  // (equator / prime meridian), so presence checks must not be falsy checks.
  if (!has("latitude") && !has("longitude")) {
    const lat = parseFinite(s3Metadata[HINT_LATITUDE]);
    const lon = parseFinite(s3Metadata[HINT_LONGITUDE]);
    if (
      lat !== undefined &&
      lon !== undefined &&
      Math.abs(lat) <= 90 &&
      Math.abs(lon) <= 180
    ) {
      out.push(
        { key: "latitude", value: String(lat) },
        { key: "longitude", value: String(lon) },
      );
    }
  }

  return out;
}
