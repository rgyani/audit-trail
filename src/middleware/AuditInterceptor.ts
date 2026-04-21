import { Kinesis, SSM } from 'aws-sdk';
import { GraphQLResolveInfo } from 'graphql';

/**
 * We use a lazy-initialization pattern or a config object 
 * to ensure that env vars are read at runtime, not just at compile time.
 */
const getAwsConfig = () => {
  const region = process.env.AWS_REGION || 'us-east-1'; // Fallback for local safety
  const isLocal = !!process.env.AWS_ENDPOINT;

  return {
    region: region,
    // When running locally against LocalStack, we must provide dummy credentials
    // and point the endpoint to the LocalStack container.
    ...(isLocal && {
      endpoint: process.env.AWS_ENDPOINT,
      accessKeyId: 'test', 
      secretAccessKey: 'test',
      s3ForcePathStyle: true,
      sslEnabled: false,
    }),
  };
};

// Initialize clients with the dynamic config
const ssm = new SSM(getAwsConfig());
const kinesis = new Kinesis(getAwsConfig());

let STREAM_NAME: string | undefined;

/**
 * Initialization function to fetch config from SSM.
 * Called during ECS Task startup.
 */
export const initAuditConfig = async () => {
  const param = await ssm.getParameter({
    Name: process.env.SSM_STREAM_NAME_PATH || '/audit/kinesis/raw-stream-name',
    WithDecryption: false
  }).promise();
  STREAM_NAME = param.Parameter?.Value;
};

export const auditInterceptor = async (
  resolve: any,
  root: any,
  args: any,
  context: any,
  info: GraphQLResolveInfo
) => {
  const startTime = Date.now();
  const result = await resolve(root, args, context, info);
  
  if (!STREAM_NAME) {
    console.error('Audit Stream Name not initialized');
    return result;
  }

  try {
    const auditEvent = {
      timestamp: new Date().toISOString(),
      operation: info.operation.name?.value || info.fieldName,
      userId: context.user?.id || 'anonymous',
      permissions: context.user?.permissions || [], 
      mfaVerified: context.user?.claims?.mfa_verified || false,
      metadata: {
        ip: context.ip,
        durationMs: Date.now() - startTime
      },
      params: args 
    };
    
    kinesis.putRecord({
      Data: JSON.stringify(auditEvent),
      PartitionKey: auditEvent.userId, 
      StreamName: STREAM_NAME
    }).promise().catch(err => console.error('Audit Dispatch Failed', err));

  } catch (err) {
    console.error('Audit Metadata Extraction Failed', err);
  }
  return result;
};