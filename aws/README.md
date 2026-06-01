# Agent Node on AWS

CloudFormation templates to deploy an Agent Node on AWS.

Two deployment models are provided:

| File | Target | Notes |
|------|--------|-------|
| [`agent-node-ec2.yaml`](./agent-node-ec2.yaml) | EC2 instance | Creates a VPC, public subnet, internet gateway, security group, and a single EC2 instance with a public IP that runs the agent-node Docker container via user data. |
| [`agent-node-fargate.yaml`](./agent-node-fargate.yaml) | ECS Fargate | Creates a VPC, public subnets, an ECS cluster, a Fargate service, and an Application Load Balancer that fronts the agent-node container. |

## Prerequisites

- An AWS account and the AWS CLI configured (`aws configure`).
- A Datalayer **API key** (optional). When provided via `DatalayerApiKey`,
  the node exchanges it for a session token at startup and skips the
  sign-in screen. When omitted, open the public URL and paste your key
  on the built-in sign-in screen. You can create a key from
  https://datalayer.ai under **Settings → API Keys**.

## Deploy on EC2

```bash
# Without a preconfigured API key (sign in from the node UI).
aws cloudformation deploy \
  --template-file agent-node-ec2.yaml \
  --stack-name agent-node-ec2 \
  --capabilities CAPABILITY_IAM \
  --parameter-overrides \
      DatalayerRunUrl=https://prod1.datalayer.run \
      KeyName=$EC2_KEY_PAIR

# With a preconfigured API key (skips the sign-in screen).
aws cloudformation deploy \
  --template-file agent-node-ec2.yaml \
  --stack-name agent-node-ec2 \
  --capabilities CAPABILITY_IAM \
  --parameter-overrides \
      DatalayerApiKey=$DATALAYER_API_KEY \
      DatalayerRunUrl=https://prod1.datalayer.run \
      KeyName=$EC2_KEY_PAIR
```

After the stack reaches `CREATE_COMPLETE`, the public URL is printed in the
stack outputs:

```bash
aws cloudformation describe-stacks --stack-name agent-node-ec2 \
  --query 'Stacks[0].Outputs'
```

Open `http://<PublicIp>:8765` in your browser. If `DatalayerApiKey` was
provided, the node is already signed in. Otherwise, paste your API key on
the sign-in screen and the node will register itself with the Datalayer
platform.

## Deploy on Fargate

```bash
# Without a preconfigured API key.
aws cloudformation deploy \
  --template-file agent-node-fargate.yaml \
  --stack-name agent-node-fargate \
  --capabilities CAPABILITY_IAM \
  --parameter-overrides \
  DatalayerRunUrl=https://prod1.datalayer.run

# With a preconfigured API key.
aws cloudformation deploy \
  --template-file agent-node-fargate.yaml \
  --stack-name agent-node-fargate \
  --capabilities CAPABILITY_IAM \
  --parameter-overrides \
      DatalayerApiKey=$DATALAYER_API_KEY \
      DatalayerRunUrl=https://prod1.datalayer.run
```

The Application Load Balancer URL is printed in the stack outputs:

```bash
aws cloudformation describe-stacks --stack-name agent-node-fargate \
  --query 'Stacks[0].Outputs[?OutputKey==`AgentNodeUrl`].OutputValue'
```

If you need a dedicated ai-inference endpoint, add
`DatalayerAiInferenceUrl=<url>` to either template's `--parameter-overrides`.
When omitted, both templates default ai-inference routing to `DatalayerRunUrl`.

## Cleanup

```bash
aws cloudformation delete-stack --stack-name agent-node-ec2
aws cloudformation delete-stack --stack-name agent-node-fargate
```
