#!/bin/sh
# Builds a Firefox-ready copy of the extension in ./build-firefox (same code, Firefox manifest).
# Usage: ./make-firefox.sh        then in Firefox: about:debugging -> This Firefox -> Load Temporary Add-on
#        and pick build-firefox/manifest.json
set -e
cd "$(dirname "$0")"
version=$(sed -n 's/.*"version": *"\([^"]*\)".*/\1/p' manifest.json | head -1)
rm -rf build-firefox
mkdir build-firefox
cp content.js places.js build-firefox/
sed "s/__VERSION__/$version/" manifest.firefox.json > build-firefox/manifest.json
echo "Built build-firefox/ (version $version). Load build-firefox/manifest.json in Firefox."
