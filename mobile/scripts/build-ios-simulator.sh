#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
export DEVELOPER_DIR="${DEVELOPER_DIR:-/Applications/Xcode.app/Contents/Developer}"
SIMULATOR_DESTINATION="${SIMULATOR_DESTINATION:-platform=iOS Simulator,name=iPhone 17e}"
xcodebuild -workspace ios/ChefJarvis.xcworkspace -scheme ChefJarvis -configuration Release -sdk iphonesimulator -destination "$SIMULATOR_DESTINATION" -derivedDataPath /tmp/chef-jarvis-ios-build CODE_SIGNING_ALLOWED=YES CODE_SIGN_IDENTITY=- ONLY_ACTIVE_ARCH=YES build
