#!/bin/bash

# AskBase Backend Deployment Script
# This script deploys the backend to AWS Lambda using Serverless Framework

set -e

echo "🚀 Starting AskBase Backend Deployment..."

# Check if AWS CLI is installed
if ! command -v aws &> /dev/null; then
    echo "❌ AWS CLI is not installed. Please install it first."
    exit 1
fi

# Check if Serverless Framework is installed
if ! command -v serverless &> /dev/null; then
    echo "❌ Serverless Framework is not installed. Installing..."
    npm install -g serverless
fi

# Check if .env file exists
if [ ! -f .env ]; then
    echo "❌ .env file not found. Creating from .env.example..."
    if [ -f .env.example ]; then
        cp .env.example .env
        echo "⚠️  Please update .env file with your configuration before deploying."
        exit 1
    else
        echo "❌ .env.example not found. Please create .env file manually."
        exit 1
    fi
fi

# Load environment variables
source .env

# Validate required environment variables
if [ -z "$MONGODB_URL" ]; then
    if [ -z "$MONGODB_USER" ] || [ -z "$MONGODB_PASSWORD" ]; then
        echo "❌ Required environment variable MONGODB_URL or both MONGODB_USER and MONGODB_PASSWORD are not set in .env file"
        exit 1
    fi
fi
required_vars=("OPENROUTER_API_KEY")
for var in "${required_vars[@]}"; do
    if [ -z "${!var}" ]; then
        echo "❌ Required environment variable $var is not set in .env file"
        exit 1
    fi
done

echo "✅ Environment variables validated"

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Run tests (if any)
echo "🧪 Running tests..."
npm test || echo "⚠️  Tests failed or not configured, continuing..."

# Deploy to AWS
echo "🌐 Deploying to AWS Lambda..."

# Deploy with stage and region options
STAGE=${1:-dev}
REGION=${2:-ap-south-1}

echo "📋 Deployment Configuration:"
echo "  Stage: $STAGE"
echo "  Region: $REGION"
echo "  Service: askbase-backend"

# Deploy using serverless
serverless deploy --stage $STAGE --region $REGION --verbose

echo "✅ Deployment completed successfully!"
echo ""
echo "📊 Deployment Information:"
echo "  Stage: $STAGE"
echo "  Region: $REGION"
echo "  Service: askbase-backend"
echo ""
echo "🔗 Your API endpoints are now available at the URLs shown above."
echo "📝 You can view logs with: serverless logs -f api --stage $STAGE"
echo "🗑️  To remove deployment: serverless remove --stage $STAGE" 