import {
  AcServices,
  assertEnvVar,
  DynamoDBService,
  getIdempotencyOptions,
  getPartialResponseHandler,
  LocationService,
  S3Service,
  STSService,
  makeIdempotent,
  withMiddlewares,
} from "@aspan-corporation/ac-shared";
import type { Handler } from "aws-lambda";
import { recordHandler } from "./recordHandler.ts";

const region = process.env.AWS_REGION || "us-east-1";
const idempotentRecordHandler = makeIdempotent(
  recordHandler,
  getIdempotencyOptions(assertEnvVar("AC_IDEMPOTENCY_TABLE_NAME"), "messageId"),
);
const partialHandler = getPartialResponseHandler(idempotentRecordHandler);

export const handler: Handler = withMiddlewares(partialHandler).use({
  before: async ({ context }) => {
    const { logger } = context;
    const stsService = new STSService({ region, logger });

    const assumeRoleCommandOutput = await stsService.assumeRole({
      RoleArn: assertEnvVar("AC_TAU_MEDIA_MEDIA_BUCKET_ACCESS_ROLE_ARN"),
      RoleSessionName: "extract-meta-data",
    });

    const sourceS3Service = new S3Service({
      region,
      assumeRoleCommandOutput,
      logger,
    });

    const locationService = new LocationService({
      region,
      logger,
    });
    const dynamoDBService = new DynamoDBService({
      region,
      logger,
    });

    const acServices: AcServices = {
      sourceS3Service,
      locationService,
      dynamoDBService,
    };

    context.acServices = acServices;
  },
});
