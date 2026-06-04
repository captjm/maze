#!/bin/bash

set -e

if [ $# -ne 1 ]; then
    echo "Usage: $0 <graph.json>"
    exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

GRAPH_FILE="$PROJECT_ROOT/public/graphs/$1"
PUBLIC_DIR="$PROJECT_ROOT/public"

if [ ! -f "$GRAPH_FILE" ]; then
    echo "Graph file not found: $GRAPH_FILE"
    exit 1
fi

jq -r '.nodes[].source' "$GRAPH_FILE" | while read -r file
do
    FULL_PATH="$PUBLIC_DIR/$file"

    mkdir -p "$(dirname "$FULL_PATH")"
    touch "$FULL_PATH"

    echo "Created: $FULL_PATH"
done