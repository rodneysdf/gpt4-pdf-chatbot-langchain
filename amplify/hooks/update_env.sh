#!/bin/bash

if [ -z "$(which jq)" ]; then
    echo "Please install jq to run the sample script."
    exit 0
fi

if [ -z "$(which sed)" ]; then
    echo "Please install jq to run the sample script."
    exit 0
fi

CURRENT_ENV=$(jq -r '.envName' amplify/.config/local-env-info.json)

sed -r -i '' -e "s/= \"(prod|dev)\";/= \"${CURRENT_ENV}\";/"  'config/aws-amplify.ts' || true
