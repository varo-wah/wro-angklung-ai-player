#!/bin/sh
set -eu
cd "$(dirname "$0")/../.."
build_dir=$(mktemp -d "${TMPDIR:-/tmp}/angklobot-host.XXXXXX")
trap 'rm -rf "$build_dir"' EXIT
mega_tests=hardware/arduino/mega_full_18_note_web_serial/tests
bridge_tests=firmware/esp32/angklobot_bridge/tests
for test in protocol_test wireless_test; do
  c++ -std=c++17 -Wall -Wextra -Werror -I "$mega_tests" "$mega_tests/$test.cpp" -o "$build_dir/$test"
  "$build_dir/$test"
done
c++ -std=c++17 -Wall -Wextra -Werror -I "$bridge_tests" "$bridge_tests/bridge_test.cpp" -o "$build_dir/bridge_test"
"$build_dir/bridge_test"
python3 -m unittest discover -s scripts/wireless -p 'test_*.py'
