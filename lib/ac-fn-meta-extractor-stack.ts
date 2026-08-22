import { QueueLambdaConstruct } from "@aspan-corporation/ac-shared-cdk";
import * as cdk from "aws-cdk-lib";
import * as iam from "aws-cdk-lib/aws-iam";
import * as logs from "aws-cdk-lib/aws-logs";
import * as ssm from "aws-cdk-lib/aws-ssm";
import { Construct } from "constructs";
import * as path from "path";
import { fileURLToPath } from "node:url";

const currentFilePath = fileURLToPath(import.meta.url);
const currentDirPath = path.dirname(currentFilePath);

export class AcFnMetaExtractorStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Get centralized log group from monitoring stack
    const centralLogGroupArn = ssm.StringParameter.valueForStringParameter(
      this,
      "/ac/monitoring/central-log-group-arn"
    );
    const centralLogGroup = logs.LogGroup.fromLogGroupArn(
      this,
      "CentralLogGroup",
      centralLogGroupArn
    );

    // Create the Queue + Lambda construct for metadata extraction processing
    const metaExtractorProcessor = new QueueLambdaConstruct(
      this,
      "MetaExtractorProcessor",
      {
        entry: path.join(currentDirPath, "../src/meta-extractor/app.ts"),
        handler: "handler",
        logGroup: centralLogGroup,
        memorySize: 1024,
        timeout: cdk.Duration.minutes(5),
        batchSize: 1,
        maxReceiveCount: 3,
        reservedConcurrentExecutions: 10,
        environment: {
          LOG_LEVEL: "INFO",
          POWERTOOLS_SERVICE_NAME: "ac-fn-meta-extractor",
          AC_IDEMPOTENCY_TABLE_NAME:
            ssm.StringParameter.valueForStringParameter(
              this,
              "/ac/data/idempotency-table-name"
            ),
          AC_TAU_MEDIA_META_TABLE_NAME: ssm.StringParameter.valueForStringParameter(
            this,
            "/ac/data/meta-table-name"
          ),
          AC_PLACE_INDEX_NAME: "MyPlaceIndex"
        }
      }
    );

    const idempotencyTableName = ssm.StringParameter.valueForStringParameter(
      this,
      "/ac/data/idempotency-table-name"
    );

    const idempotencyTableArn = cdk.Arn.format(
      {
        partition: "aws",
        service: "dynamodb",
        region: this.region,
        account: this.account,
        resource: `table/${idempotencyTableName}`
      },
      this
    );

    metaExtractorProcessor.processor.addToRolePolicy(
      new iam.PolicyStatement({
        actions: [
          "dynamodb:PutItem",
          "dynamodb:UpdateItem",
          "dynamodb:GetItem",
          "dynamodb:DeleteItem",
          "dynamodb:DescribeTable",
          "dynamodb:ConditionCheckItem"
        ],
        resources: [idempotencyTableArn]
      })
    );

    const metaTableName = ssm.StringParameter.valueForStringParameter(
      this,
      "/ac/data/meta-table-name"
    );

    const metaTableArn = cdk.Arn.format(
      {
        partition: "aws",
        service: "dynamodb",
        region: this.region,
        account: this.account,
        resource: `table/${metaTableName}`
      },
      this
    );

    metaExtractorProcessor.processor.addToRolePolicy(
      new iam.PolicyStatement({
        actions: [
          "dynamodb:PutItem",
          "dynamodb:UpdateItem",
          "dynamodb:GetItem",
          "dynamodb:DeleteItem",
          "dynamodb:DescribeTable",
          "dynamodb:ConditionCheckItem"
        ],
        resources: [metaTableArn]
      })
    );

    const placeIndexArn = cdk.Arn.format(
      {
        partition: "aws",
        service: "geo",
        region: this.region,
        account: this.account,
        resource: "place-index/MyPlaceIndex"
      },
      this
    );

    metaExtractorProcessor.processor.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["geo:SearchPlaceIndexForPosition"],
        resources: [placeIndexArn]
      })
    );

    // Read grant for the consolidated media bucket (media/ and diary/ alike —
    // /ac/storage/diary-bucket-arn resolves to the same bucket as
    // /ac/storage/media-bucket-name since the cutover to MediaBucket). No
    // cross-account assume-role needed any more; the Lambda's own execution
    // role reads it directly.
    const mediaBucketArn = ssm.StringParameter.valueForStringParameter(
      this,
      "/ac/storage/diary-bucket-arn"
    );

    metaExtractorProcessor.processor.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["s3:GetObject"],
        resources: [`${mediaBucketArn}/*`]
      })
    );

    // Store the queue URL and ARN in SSM for external access
    new ssm.StringParameter(this, "MetaExtractorProcessorQueueUrlParameter", {
      parameterName: "/ac/meta-extractor/queue-url",
      stringValue: metaExtractorProcessor.queue.queueUrl
    });
    new ssm.StringParameter(this, "MetaExtractorProcessorQueueArnParameter", {
      parameterName: "/ac/meta-extractor/queue-arn",
      stringValue: metaExtractorProcessor.queue.queueArn
    });
  }
}
