# Agent Node on AWS

CloudFormation templates to deploy an Agent Node on AWS.

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

## Cleanup

```bash
aws cloudformation delete-stack --stack-name agent-node-ec2
aws cloudformation delete-stack --stack-name agent-node-fargate
```
