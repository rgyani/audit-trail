#!/bin/bash
# LocalStack looks for scripts in /docker-entrypoint-initaws.d/ and runs them in order.

echo "########### [INIT] Starting AWS Local Resource Setup ###########"

# 1. Create the Raw Audit Stream
# We specify 1 shard for local testing to keep memory low.
awslocal kinesis create-stream \
    --stream-name RawAuditStream \
    --shard-count 1

# 2. Create the SSM Parameter
# This matches the path the Node.js code will query on startup.
awslocal ssm put-parameter \
    --name "/audit/kinesis/raw-stream-name" \
    --type "String" \
    --value "RawAuditStream"

# 3. (Optional) Verify setup for the logs
echo "########### [VERIFY] Created Kinesis Streams: ###########"
awslocal kinesis list-streams

echo "########### [VERIFY] Created SSM Parameters: ###########"
awslocal ssm get-parameter --name "/audit/kinesis/raw-stream-name"

echo "########### [SUCCESS] Infrastructure Ready ###########"