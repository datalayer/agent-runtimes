# Datalayer on AWS

CloudFormation templates to deploy an Agent Node on AWS, and the roles to run agents on Amazon Bedrock AgentCore.

Two deployment models are provided:

| File | Target | Notes |
|------|--------|-------|
| [`agent-node-ec2.yaml`](./agent-node-ec2.yaml) | EC2 instance | Creates a VPC, public subnet, internet gateway, security group, and a single EC2 instance with a public IP that runs the agent-node Docker container via user data. |
| [`agent-node-fargate.yaml`](./agent-node-fargate.yaml) | ECS Fargate | Creates a VPC, public subnets, an ECS cluster, a Fargate service, and an Application Load Balancer that fronts the agent-node container. |

## Prerequisites

- An AWS account and the AWS CLI configured (`aws configure`).
- A Datalayer **API key** (recommended for AWS). It enables non-interactive
  authentication/registration from the node. You can create a key from
  https://datalayer.ai under **Settings → API Keys**.

AWS templates run the node in SaaS-chat mode: execution stays on the node,
while chat is accessed from Datalayer SaaS through the runtimes tunnel.

## Deploy on EC2

```bash
# Recommended for AWS: provide API key for non-interactive registration.
aws cloudformation deploy \
  --template-file agent-node-ec2.yaml \
  --stack-name agent-node-ec2 \
  --capabilities CAPABILITY_IAM \
  --parameter-overrides \
      DatalayerApiKey=$DATALAYER_API_KEY \
      DatalayerIamUrl=https://prod1.datalayer.run \
      DatalayerRuntimesUrl=https://r1.datalayer.run \
      KeyName=$EC2_KEY_PAIR
```

After the stack reaches `CREATE_COMPLETE`, the public URL is printed in the
stack outputs:

```bash
aws cloudformation describe-stacks --stack-name agent-node-ec2 \
  --query 'Stacks[0].Outputs'
```

The node registers itself to Datalayer Runtimes and keeps a tunnel
connected for SaaS chat access.

For AWS nodes, use the SaaS Agent Nodes page to chat: enter your 12-digit AWS
account id in **Discover AWS Agent Nodes**, click **Discover**, then open chat
on the discovered node.

## Deploy on Fargate

```bash
# Recommended for AWS: provide API key for non-interactive registration.
aws cloudformation deploy \
  --template-file agent-node-fargate.yaml \
  --stack-name agent-node-fargate \
  --capabilities CAPABILITY_IAM \
  --parameter-overrides \
      DatalayerApiKey=$DATALAYER_API_KEY \
      DatalayerIamUrl=https://prod1.datalayer.run \
      DatalayerRuntimesUrl=https://r1.datalayer.run
```

The Application Load Balancer URL is printed in the stack outputs:

```bash
aws cloudformation describe-stacks --stack-name agent-node-fargate \
  --query 'Stacks[0].Outputs[?OutputKey==`AgentNodeUrl`].OutputValue'
```

If you need a dedicated ai-inference endpoint, add
`DatalayerAiInferenceUrl=<url>` to either template's `--parameter-overrides`.
When omitted, both templates default ai-inference routing to `DatalayerIamUrl`.

## Run agents on Amazon Bedrock AgentCore

[`agentcore-cross-account-role.yaml`](./agentcore-cross-account-role.yaml)
lets Datalayer run your organization's agentspecs on Amazon Bedrock
AgentCore Runtime in your own AWS account. It creates two IAM roles and
nothing else:

| Role | Assumed by | Allows |
|------|------------|--------|
| `DatalayerRole` | Datalayer's AWS account, only with your organization's external id (`sts:ExternalId`) | Create, read, update, list and delete agent runtimes and their endpoints; invoke a session and stop it; create the workload identity of a deployment; `GetWorkloadAccessTokenForJWT` (a token for a person Datalayer signed in), with an explicit deny on `GetWorkloadAccessTokenForUserId`; the third-party credentials of AgentCore Identity; ECR pull; `iam:PassRole` on the execution role below and no other role. |
| `ExecutionRole` | `bedrock-agentcore.amazonaws.com`, for this account | Pull the image; CloudWatch Logs under `/aws/bedrock-agentcore/runtimes/`, X-Ray and CloudWatch metrics; the third-party credentials of AgentCore Identity; Amazon Bedrock models only with `UseCustomerBedrock=true`. |

The control plane's actions (`CreateAgentRuntime`, …) and the data plane's
(`InvokeAgentRuntime`, …) share the IAM prefix `bedrock-agentcore`.

Your organization's AWS settings on Datalayer show the two values to pass:
Datalayer's AWS account id and your organization's external id.

```bash
aws cloudformation deploy \
  --template-file agentcore-cross-account-role.yaml \
  --stack-name datalayer-agentcore \
  --region us-east-1 \
  --capabilities CAPABILITY_IAM \
  --parameter-overrides \
      DatalayerAccountId=$DATALAYER_AWS_ACCOUNT_ID \
      ExternalId=$DATALAYER_EXTERNAL_ID \
      UseCustomerBedrock=false
```

Then copy the outputs (`DatalayerRoleArn`, `ExecutionRoleArn`, `ExternalId`,
`Region`) into the same settings page:

```bash
aws cloudformation describe-stacks --stack-name datalayer-agentcore \
  --region us-east-1 --query 'Stacks[0].Outputs'
```

The permissions are scoped to the stack's region: deploy one stack per region
your agents run in. To stop Datalayer from acting in the account, delete the
stack (`aws cloudformation delete-stack --stack-name datalayer-agentcore`);
agent runtimes Datalayer created stay until you delete them.

## Cleanup

```bash
aws cloudformation delete-stack --stack-name agent-node-ec2
aws cloudformation delete-stack --stack-name agent-node-fargate
```
