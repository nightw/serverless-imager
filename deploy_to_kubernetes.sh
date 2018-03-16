#!/bin/bash

set -euf -o pipefail

function do_version_str_with_python {
  NEW_VERSION_STR="$(python -c 'from datetime import datetime; print datetime.now().strftime("%Y-%m-%d-%H-%M-%S-%f")')"
}

PROJECT="$(gcloud config configurations list --filter is_active:true --format 'value(properties.core.project)')"
if [[ "$OSTYPE" == "darwin"* ]]; then
  # OSX date command does not support showing milliseconds in any way, so using Python from the OSX default install
  do_version_str_with_python
elif [[ "$OSTYPE" == "freebsd"* ]]; then
  # FreeBSD also does have the non-GNU date command and usually have Python installed, so do the same as with OSX
  do_version_str_with_python
else
  # On every other OS, date command with "%N" in the format string should work, because they hopefully use GNU date
  NEW_VERSION_STR="$(date '+%Y-%m-%d-%H-%M-%S-%6N')"
fi

kubectl delete deployment serverless-imager &> /dev/null || true
docker build -t "gcr.io/${PROJECT}/serverless-imager:${NEW_VERSION_STR}" .
gcloud docker -- push "gcr.io/${PROJECT}/serverless-imager:${NEW_VERSION_STR}"
kubectl run serverless-imager --image="gcr.io/${PROJECT}/serverless-imager:${NEW_VERSION_STR}" --port 8080
