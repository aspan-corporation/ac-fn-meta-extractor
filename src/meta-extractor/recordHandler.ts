import {
  AcContext,
  assertEnvVar,
  hintFallbackTags,
  isAllowedExtension,
  MetricUnit,
  processMeta,
} from "@aspan-corporation/ac-shared";
import { SFNClient, SendTaskSuccessCommand } from "@aws-sdk/client-sfn";
import type { S3ObjectCreatedNotificationEvent, SQSRecord } from "aws-lambda";
import exifr from "exifr";
import assert from "node:assert/strict";
import exifrTransform from "./exifrTransform.ts";

const sfnClient = new SFNClient({});

const metaTableName = assertEnvVar("AC_TAU_MEDIA_META_TABLE_NAME");
const placeIndexName = assertEnvVar("AC_PLACE_INDEX_NAME");
// In-account bucket holding diary-uploaded images. When the event names this
// bucket the source must be read with the Lambda's own role, not the
// cross-account media read-access role.
const diaryBucketName = process.env.AC_DIARY_BUCKET_NAME;

export const recordHandler = async (
  record: SQSRecord,
  context: AcContext,
): Promise<void> => {
  const { logger, metrics, acServices = {} } = context;

  const { dynamoDBService, locationService, sourceS3Service, localS3Service } =
    acServices;
  assert(dynamoDBService, "dynamoDBService is required in acServices");
  assert(locationService, "locationService is required in acServices");
  assert(sourceS3Service, "sourceS3Service is required in acServices");

  const payload = record.body;
  assert(payload, "SQS record has no body");

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(payload) as Record<string, unknown>;
  } catch (e) {
    logger.error("Failed to parse SQS record payload", { error: e });
    throw new Error(
      `Failed to parse SQS record payload: ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  // When dispatched by the Step Functions media-processing state machine the
  // body carries an extra `taskToken` field.  We extract it and later signal
  // completion so the state machine can proceed to the next step.
  const taskToken =
    typeof parsed.taskToken === "string" ? parsed.taskToken : undefined;
  const item = parsed as unknown as S3ObjectCreatedNotificationEvent;

  const {
    detail: {
      object: { key: sourceKey, size },
      bucket: { name: sourceBucket },
    },
  } = item;

  assert(sourceKey, "detail.object.key is missing from event payload");
  assert(
    size !== undefined && size !== null,
    "detail.object.size is missing from event payload",
  );
  assert(sourceBucket, "detail.bucket.name is missing from event payload");

  const isFolder = sourceKey.endsWith("/");

  if (isFolder) {
    logger.debug("FolderMetaExtractionStarted", { sourceKey });
    metrics.addMetric("FolderMetaExtractionsStarted", MetricUnit.Count, 1);

    await processMeta({
      dynamoDBService,
      locationService,
      meta: [],
      size: 0,
      id: sourceKey,
      metaTableName,
      placeIndexName,
      logger,
    });

    logger.debug("FolderMetaExtractionFinished", { sourceKey });
    metrics.addMetric("FolderMetaExtractionsFinished", MetricUnit.Count, 1);
    return;
  }

  logger.debug("PictureMetaExtractionsStarted", { sourceKey });
  metrics.addMetric("PictureMetaExtractionsStarted", MetricUnit.Count, 1);

  assert(
    isAllowedExtension(sourceKey),
    `extension for ${sourceKey} is not supported`,
  );

  // Pick the read client by source bucket: the diary bucket lives in this
  // account (Lambda's own role); everything else is the cross-account media
  // bucket reached via the assumed read-access role.
  const readS3Service =
    diaryBucketName && sourceBucket === diaryBucketName
      ? (localS3Service ?? sourceS3Service)
      : sourceS3Service;

  const buffer = await readS3Service.getObject({
    Bucket: sourceBucket,
    Key: sourceKey,
  });

  logger.debug("downloaded media file", { sourceBucket, sourceKey, size });

  let exifrData: Awaited<ReturnType<typeof exifr.parse>>;
  try {
    exifrData = await exifr.parse(buffer);
  } catch (err) {
    // Some HEIC variants (e.g. HDR gain-map / tmap brand from newer iPhones)
    // are not yet supported by exifr. Write a minimal record so the file is
    // visible in the UI rather than invisible.
    logger.warn("ExifParseSkipped", {
      sourceKey,
      reason: err instanceof Error ? err.message : String(err),
    });
    metrics.addMetric("PictureMetaExtractionExifSkipped", MetricUnit.Count, 1);
    exifrData = undefined;
  }

  const meta = exifrTransform(exifrData);

  // Attach yearImported / monthImported derived from the object's LastModified
  // timestamp. This lets the Search UI surface files by when they were added to
  // the library — useful for photos that have no EXIF date (old scans, etc.).
  // Using HeadObject rather than the EventBridge timestamp because ac-commander
  // synthetic SQS messages don't carry an event timestamp.
  // The same HeadObject response carries the device hints (x-amz-meta-hint-*)
  // set by the diary upload flow, used as fallback where EXIF came up empty.
  const importTags: Array<{ key: string; value: string }> = [];
  const hintTags: Array<{ key: string; value: string }> = [];
  try {
    const head = await readS3Service.headObject({
      Bucket: sourceBucket,
      Key: sourceKey,
    });
    if (head.LastModified) {
      importTags.push(
        {
          key: "yearImported",
          value: String(head.LastModified.getUTCFullYear()),
        },
        {
          key: "monthImported",
          value: String(head.LastModified.getUTCMonth() + 1),
        },
      );
    }
    hintTags.push(...hintFallbackTags(meta, head.Metadata));
    if (hintTags.length > 0) {
      logger.debug("DeviceHintFallbackApplied", {
        sourceKey,
        keys: hintTags.map((t) => t.key),
      });
    }
  } catch (err) {
    logger.warn("HeadObjectFailed — import tags will be skipped", {
      sourceKey,
      reason: err instanceof Error ? err.message : String(err),
    });
  }

  await processMeta({
    dynamoDBService,
    locationService,
    meta: [...meta, ...hintTags, ...importTags],
    size,
    id: sourceKey,
    metaTableName,
    placeIndexName,
    logger,
  });

  logger.debug("PictureMetaExtractionsFinished", { sourceKey });
  metrics.addMetric("PictureMetaExtractionsFinished", MetricUnit.Count, 1);

  if (taskToken) {
    // Determine orientation value from the tags we just wrote
    const orientationTag = meta.find((t) => t.key === "orientation");
    await sfnClient.send(
      new SendTaskSuccessCommand({
        taskToken,
        output: JSON.stringify({ orientation: orientationTag?.value ?? null }),
      }),
    );
  }
};
