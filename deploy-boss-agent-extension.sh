#!/bin/bash

# Deployment script for Boss Agent Chrome Extension on Cloud Run
# Serves the extension as a static web application via nginx

set -e

# Configuration
PROJECT_ID="${GCP_PROJECT_ID:-spry-bus-425315-p6}"
REGION="${GCP_REGION:-us-central1}"
SERVICE_NAME="boss-agent-extension"
IMAGE_NAME="gcr.io/$PROJECT_ID/$SERVICE_NAME"

echo "==========================================="
echo "Deploying Boss Agent Extension to Cloud Run"
echo "==========================================="
echo "Project: $PROJECT_ID"
echo "Region: $REGION"
echo "Service: $SERVICE_NAME"
echo ""

# Check gcloud auth
if ! gcloud auth list --filter=status:ACTIVE --format="value(account)" 2>/dev/null | grep -q .; then
    echo "Error: gcloud not authenticated. Run:"
    echo "  gcloud auth login"
    echo "  gcloud config set project $PROJECT_ID"
    exit 1
fi

CURRENT_PROJECT=$(gcloud config get-value project 2>/dev/null)
if [ "$CURRENT_PROJECT" != "$PROJECT_ID" ]; then
    echo "Setting project to $PROJECT_ID..."
    gcloud config set project $PROJECT_ID
fi

# Build Docker image
echo ""
echo "Building Docker image..."
docker build -t $IMAGE_NAME:latest .

echo "Pushing image to Container Registry..."
docker push $IMAGE_NAME:latest

# Deploy to Cloud Run
echo ""
echo "Deploying to Cloud Run..."
gcloud run deploy $SERVICE_NAME \
    --image $IMAGE_NAME:latest \
    --platform managed \
    --region $REGION \
    --allow-unauthenticated \
    --memory=256Mi \
    --cpu=1 \
    --max-instances=10 \
    --min-instances=0 \
    --concurrency=80 \
    --timeout=60s \
    --port=8080 \
    --project=$PROJECT_ID

# Get service URL
echo ""
SERVICE_URL=$(gcloud run services describe $SERVICE_NAME \
    --region=$REGION \
    --project=$PROJECT_ID \
    --format='value(status.url)')

echo "==========================================="
echo "Deployment Complete!"
echo "==========================================="
echo ""
echo "Service URL: $SERVICE_URL"
echo ""

# Test health
echo "Testing health endpoint..."
if curl -sf "$SERVICE_URL/health" 2>/dev/null; then
    echo ""
    echo "Health check passed!"
else
    echo "Health check pending (service may still be starting)"
fi

echo ""
echo "Available pages:"
echo "  $SERVICE_URL/          - Main popup UI"
echo "  $SERVICE_URL/sidepanel - Side panel UI"
echo "  $SERVICE_URL/settings  - Settings page"
echo "  $SERVICE_URL/cre       - CRE Underwriting popup"
echo "  $SERVICE_URL/health    - Health check endpoint"
