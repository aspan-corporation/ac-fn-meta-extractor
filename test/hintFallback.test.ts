import hintFallbackTags from "../src/meta-extractor/hintFallback.ts";

const tag = (key: string, value = "x") => ({ key, value });

describe("hintFallbackTags", () => {
  it("returns nothing without S3 metadata", () => {
    expect(hintFallbackTags([], undefined)).toEqual([]);
    expect(hintFallbackTags([], {})).toEqual([]);
  });

  it("falls back to the date hint when EXIF has no date", () => {
    const out = hintFallbackTags([], { "hint-date": "2026-07-06T10:30:00.000Z" });
    expect(out).toEqual([
      { key: "dateCreated", value: "2026-07-06T10:30:00.000Z" },
    ]);
  });

  it("prefers the EXIF date over the hint", () => {
    const out = hintFallbackTags(
      [tag("dateCreated", "2020-01-01T00:00:00.000Z")],
      { "hint-date": "2026-07-06T10:30:00.000Z" },
    );
    expect(out).toEqual([]);
  });

  it("ignores an unparseable date hint", () => {
    expect(hintFallbackTags([], { "hint-date": "not-a-date" })).toEqual([]);
  });

  it("falls back to coordinate hints when EXIF has no GPS", () => {
    const out = hintFallbackTags([], {
      "hint-latitude": "48.8584",
      "hint-longitude": "2.2945",
    });
    expect(out).toEqual([
      { key: "latitude", value: "48.8584" },
      { key: "longitude", value: "2.2945" },
    ]);
  });

  it("prefers EXIF GPS over coordinate hints", () => {
    const out = hintFallbackTags(
      [tag("latitude", "1"), tag("longitude", "2")],
      { "hint-latitude": "48.8584", "hint-longitude": "2.2945" },
    );
    expect(out).toEqual([]);
  });

  it("skips coordinates when EXIF has either half of the pair", () => {
    // A lone EXIF latitude is malformed data; don't mix EXIF and hint halves.
    const out = hintFallbackTags([tag("latitude", "1")], {
      "hint-latitude": "48.8584",
      "hint-longitude": "2.2945",
    });
    expect(out).toEqual([]);
  });

  it("requires both coordinate hints", () => {
    expect(hintFallbackTags([], { "hint-latitude": "48.8584" })).toEqual([]);
    expect(hintFallbackTags([], { "hint-longitude": "2.2945" })).toEqual([]);
  });

  it("accepts 0 as a valid coordinate", () => {
    const out = hintFallbackTags([], {
      "hint-latitude": "0",
      "hint-longitude": "0",
    });
    expect(out).toEqual([
      { key: "latitude", value: "0" },
      { key: "longitude", value: "0" },
    ]);
  });

  it.each([
    ["out-of-range latitude", "91", "0"],
    ["out-of-range longitude", "0", "181"],
    ["non-numeric latitude", "abc", "0"],
    ["empty-string latitude", "", "0"],
    ["whitespace latitude", "  ", "0"],
    ["Infinity latitude", "Infinity", "0"],
  ])("drops garbage coordinates: %s", (_name, lat, lon) => {
    const out = hintFallbackTags([], {
      "hint-latitude": lat,
      "hint-longitude": lon,
    });
    expect(out).toEqual([]);
  });

  it("applies date and coordinates independently", () => {
    // EXIF has a date but no GPS: the coordinate hint still applies.
    const out = hintFallbackTags(
      [tag("dateCreated", "2020-01-01T00:00:00.000Z")],
      {
        "hint-date": "2026-07-06T10:30:00.000Z",
        "hint-latitude": "48.8584",
        "hint-longitude": "2.2945",
      },
    );
    expect(out).toEqual([
      { key: "latitude", value: "48.8584" },
      { key: "longitude", value: "2.2945" },
    ]);
  });
});
