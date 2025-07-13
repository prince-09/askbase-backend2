# AskBase Node.js Backend - AWS Serverless Deployment Guide

This guide will help you deploy the AskBase Node.js backend to AWS Lambda using the Serverless Framework.

## Prerequisites

### 1. AWS Account Setup
- Create an AWS account if you don't have one
- Create an IAM user with appropriate permissions
- Configure AWS CLI with your credentials

### 2. Install Required Tools
```bash
# Install AWS CLI
curl "https://awscli.amazonaws.com/AWSCLIV2.pkg" -o "AWSCLIV2.pkg"
sudo installer -pkg AWSCLIV2.pkg -target /

# Install Serverless Framework
npm install -g serverless

# Verify installations
aws --version
serverless --version
```

### 3. AWS Credentials Setup
```bash
# Configure AWS credentials
aws configure

# Enter your:
# - AWS Access Key ID
# - AWS Secret Access Key
# - Default region (e.g., us-east-1)
# - Default output format (json)
```

## Environment Configuration

### 1. Create Environment File
```bash
# Copy the example environment file
cp env.example .env

# Edit the .env file with your actual values
nano .env
```

### 2. Required Environment Variables
```bash
# MongoDB Configuration
MONGODB_URL=mongodb+srv://username:password@cluster.mongodb.net/database
MONGODB_DB_NAME=ai_sql_assistant

# AI API Configuration
OPENROUTER_API_URL=https://openrouter.ai/api/v1/chat/completions
OPENROUTER_API_KEY=your_openrouter_api_key_here
MISTRAL_MODEL=mistralai/mistral-7b-instruct

# AWS Configuration (optional)
AWS_REGION=us-east-1
AWS_PROFILE=default

# Server Configuration
NODE_ENV=production
```

## Deployment

### 1. Quick Deployment
```bash
# Deploy to dev stage
npm run deploy:dev

# Deploy to production stage
npm run deploy:prod

# Deploy with custom stage and region
./deploy.sh staging us-west-2
```

### 2. Manual Deployment
```bash
# Install dependencies
npm install

# Deploy using serverless
serverless deploy --stage dev --region us-east-1 --verbose
```

### 3. Deployment Stages
- `dev` - Development environment
- `staging` - Staging environment  
- `prod` - Production environment

## Post-Deployment

### 1. Get API Endpoints
After successful deployment, you'll see output like:
```
endpoints:
  ANY - https://abc123.execute-api.us-east-1.amazonaws.com/dev/{proxy+}
  ANY - https://abc123.execute-api.us-east-1.amazonaws.com/dev/
```

### 2. Test the API
```bash
# Test health endpoint
curl https://your-api-id.execute-api.us-east-1.amazonaws.com/dev/health

# Test root endpoint
curl https://your-api-id.execute-api.us-east-1.amazonaws.com/dev/
```

### 3. View Logs
```bash
# View real-time logs
npm run logs

# Or manually
serverless logs -f api --stage dev --tail
```

## Management Commands

### 1. Update Deployment
```bash
# Deploy updates
npm run deploy:dev
```

### 2. Remove Deployment
```bash
# Remove entire deployment
npm run deploy:remove

# Or manually
serverless remove --stage dev
```

### 3. Local Development
```bash
# Run locally with serverless offline
npm run offline

# Run with nodemon
npm run dev
```

## Configuration Files

### 1. serverless.yml
Main configuration file for AWS Lambda deployment:
- Runtime: Node.js 18.x
- Memory: 1024MB
- Timeout: 30 seconds
- Environment variables
- IAM permissions
- API Gateway configuration

### 2. handler.js
Lambda handler that wraps the Express app with serverless-http.

### 3. deploy.sh
Automated deployment script that:
- Validates environment variables
- Installs dependencies
- Runs tests
- Deploys to AWS

## Troubleshooting

### 1. Common Issues

**MongoDB Connection Failed**
- Check if MongoDB URL is correct
- Ensure MongoDB is accessible from AWS Lambda
- Consider using MongoDB Atlas for cloud-hosted MongoDB

**Environment Variables Not Set**
- Verify .env file exists and has correct values
- Check that all required variables are set

**Deployment Fails**
- Check AWS credentials are configured
- Verify IAM permissions
- Check CloudWatch logs for errors

### 2. Debugging
```bash
# View detailed logs
serverless logs -f api --stage dev --tail

# Check function configuration
serverless info --stage dev

# Test function locally
serverless invoke local -f api --path test-event.json
```

### 3. Cost Optimization
- Monitor Lambda execution times
- Consider reducing memory allocation if not needed
- Use CloudWatch to track usage
- Set up billing alerts

## Security Considerations

### 1. Environment Variables
- Never commit .env files to version control
- Use AWS Systems Manager Parameter Store for sensitive data
- Rotate API keys regularly

### 2. IAM Permissions
- Follow principle of least privilege
- Regularly audit IAM roles and policies
- Use temporary credentials when possible

### 3. API Security
- Consider adding API key authentication
- Implement rate limiting at API Gateway level
- Use HTTPS for all communications

## Monitoring and Maintenance

### 1. CloudWatch Monitoring
- Set up CloudWatch dashboards
- Configure alarms for errors and latency
- Monitor Lambda cold starts

### 2. Log Management
- Centralize logs in CloudWatch
- Set up log retention policies
- Use structured logging

### 3. Performance Optimization
- Monitor memory usage
- Optimize cold start times
- Consider using provisioned concurrency for production

## Support

For issues or questions:
1. Check CloudWatch logs first
2. Review this documentation
3. Check Serverless Framework documentation
4. Review AWS Lambda documentation

## Useful Commands

```bash
# Deploy to different stages
npm run deploy:dev
npm run deploy:prod

# View logs
npm run logs

# Remove deployment
npm run deploy:remove

# Run locally
npm run offline

# Check serverless info
serverless info --stage dev

# List functions
serverless deploy list
``` 