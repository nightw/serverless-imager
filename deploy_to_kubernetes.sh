#!/bin/bash

set -euf -o pipefail

PROJECT="$(gcloud config configurations list --filter is_active:true --format 'value(properties.core.project)')"


kubectl delete deployment serverless-imager &> /dev/null || true
docker build -t gcr.io/$PROJECT/serverless-imager:v1 .
gcloud docker -- push gcr.io/$PROJECT/serverless-imager:v1
kubectl run serverless-imager --image=gcr.io/$PROJECT/serverless-imager:v1 --port 8080
