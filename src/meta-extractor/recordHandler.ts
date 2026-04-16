import {
  AcContext,
  assertEnvVar,
  isAllowedExtension,
  MetricUnit,
  processMeta,
} from "@aspan-corporation/ac-shared";
import type { S3ObjectCreatedNotificationEvent, SQSRecord } from "aws-lambda";
import exifr from "exifr";
import assert from "node:assert/strict";
import exifrTransform from "./exifrTransform.ts";

const region = assertEnvVar("AWS_REGION");
const metaTableName = assertEnvVar("AC_TAU_MEDIA_META_TABLE_NAME");
const placeIndexName = assertEnvVar("AC_PLACE_INDEX_NAME");

export const recordHandler = async (
  record: SQSRecord,
  context: AcContext,
): Promise<void> => {
  const { logger, metrics, acServices = {} } = context;

  const { dynamoDBService, locationService, sourceS3Service } = acServices;
  assert(dynamoDBService, "dynamoDBService is required in acServices");
  assert(locationService, "locationService is required in acServices");
  assert(sourceS3Service, "sourceS3Service is required in acServices");

  const payload = record.body;
  assert(payload, "SQS record has no body");

  const item = JSON.parse(payload);
  const {
    detail: {
      object: { key: sourceKey, size },
      bucket: { name: sourceBucket },
    },
  } = item as S3ObjectCreatedNotificationEvent;

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

  const buffer = await sourceS3Service.getObject({
    Bucket: sourceBucket,
    Key: sourceKey,
  });

  logger.debug("downloaded media file", { sourceBucket, sourceKey, size });

  const exifrData = await exifr.parse(buffer);
  const meta = exifrTransform(exifrData);

  await processMeta({
    dynamoDBService,
    locationService,
    meta,
    size,
    id: sourceKey,
    metaTableName,
    placeIndexName,
    logger,
  });

  logger.debug("PictureMetaExtractionsFinished", { sourceKey });
  metrics.addMetric("PictureMetaExtractionsFinished", MetricUnit.Count, 1);

};
