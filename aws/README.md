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

## The AgentCore image

AgentCore Runtime runs one image for every agentspec: agent-runtimes from
PyPI, started with `agent-runtimes serve --target agentcore` and the agentspec
id in `AGENT_SPEC_ID` ([`docker/Dockerfile.agentcore`](../docker/Dockerfile.agentcore):
Python 3.11 on Debian slim, wheels only, a non-root user, ports 8080 and
9000; no Node.js, so no npm MCP server and no coding-agent harness). The
GitHub Actions workflow
[`agentcore-image.yml`](../.github/workflows/agentcore-image.yml) builds it
natively for linux/arm64 (AgentCore's platform) and linux/amd64, checks on
each that `GET /ping` answers `{"status": "Healthy"}`, and pushes one
manifest list to Amazon ECR as `<version>` and `latest`. It runs on every
`v*` tag (once the version is on PyPI) and by hand.

[`agentcore-image-push-role.yaml`](./agentcore-image-push-role.yaml) creates,
in the account that holds the image:

| Resource | What |
|----------|------|
| ECR repository `datalayer/agent-runtimes-agentcore` | Scan on push; tags immutable except `latest` (`IMMUTABLE_WITH_EXCLUSION`), so a version tag always names the same image. `PullAccountIds` lets AgentCore runtimes in other accounts pull it. |
| OIDC provider `token.actions.githubusercontent.com` | Only with `CreateOidcProvider=true`: an account holds one per URL, so pass `false` when it exists (`aws iam list-open-id-connect-providers`). |
| `PushRole` | Assumed only by GitHub Actions of `datalayer/agent-runtimes` on a `v*` tag or on the branch `DispatchBranch` (`main` by default, for a manual run); allowed to push to that repository and nothing else. |

1. Deploy the stack in the account and region of the image (Datalayer's
   end-to-end account, `773842031886`, `us-east-1`):

   ```bash
   aws cloudformation deploy \
     --template-file aws/agentcore-image-push-role.yaml \
     --stack-name datalayer-agentcore-image \
     --region us-east-1 \
     --capabilities CAPABILITY_IAM \
     --parameter-overrides CreateOidcProvider=true

   aws cloudformation describe-stacks --stack-name datalayer-agentcore-image \
     --region us-east-1 --query 'Stacks[0].Outputs'
   ```

2. Set the repository secret to the `PushRoleArn` output:

   ```bash
   gh secret set AGENTCORE_IMAGE_ROLE_ARN --repo datalayer/agent-runtimes \
     --body "$(aws cloudformation describe-stacks --stack-name datalayer-agentcore-image \
       --region us-east-1 --query "Stacks[0].Outputs[?OutputKey=='PushRoleArn'].OutputValue" --output text)"
   ```

   Without it the workflow stops at its first step and says so.

3. Run the workflow: push a `v*` tag, or by hand on a tag (or on
   `DispatchBranch`), optionally with a version already on PyPI:

   ```bash
   gh workflow run agentcore-image.yml --repo datalayer/agent-runtimes --ref v1.6.2
   gh workflow run agentcore-image.yml --repo datalayer/agent-runtimes --ref main -f version=1.6.2
   ```

   Each architecture is pushed as `<version>-amd64` and `<version>-arm64`, then
   the manifest list as `<version>` and `latest`. The tags being immutable, a
   run for a version already pushed fails at its push.

4. The image URI is what the Datalayer runtimes service is configured with:

   ```bash
   DATALAYER_AGENTCORE_IMAGE_URI=773842031886.dkr.ecr.us-east-1.amazonaws.com/datalayer/agent-runtimes-agentcore:1.6.2
   ```

   Name a version, not `latest`: an AgentCore runtime keeps the image it was
   created or updated with.

## Cleanup

```bash
aws cloudformation delete-stack --stack-name agent-node-ec2
aws cloudformation delete-stack --stack-name agent-node-fargate
```
