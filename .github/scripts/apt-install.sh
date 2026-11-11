#!/usr/bin/env bash
# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.
#
# Install system packages on a GitHub runner, resilient to an Ubuntu mirror
# that does not answer: short timeouts and retries, then the next mirror —
# the runner's own, then Ubuntu's archive, kernel.org's and the US archive —
# for the main and the security pockets alike. No package is skipped: the
# script fails when no mirror served them.
#
#   .github/scripts/apt-install.sh libdbus-1-3 libdbus-1-dev libglib2.0-dev
set -uo pipefail

if [ "$#" -eq 0 ]; then
  echo "Name the packages to install." >&2
  exit 2
fi

APT_OPTS=(-o Acquire::Retries=3 -o Acquire::http::Timeout=20 -o Acquire::https::Timeout=20)
MIRRORS=("" "http://archive.ubuntu.com/ubuntu" "http://mirrors.edge.kernel.org/ubuntu" "http://us.archive.ubuntu.com/ubuntu")

# Where the runner keeps its sources: deb822 on Ubuntu 24.04, the classic list before.
SOURCES=()
[ -f /etc/apt/sources.list.d/ubuntu.sources ] && SOURCES+=(/etc/apt/sources.list.d/ubuntu.sources)
[ -f /etc/apt/sources.list ] && SOURCES+=(/etc/apt/sources.list)
for file in "${SOURCES[@]}"; do sudo cp "$file" "$file.orig"; done

for mirror in "${MIRRORS[@]}"; do
  for file in "${SOURCES[@]}"; do
    sudo cp "$file.orig" "$file"
    if [ -n "$mirror" ]; then
      # Every Ubuntu archive URL, the security pocket's included, goes to this mirror.
      sudo sed -i -E "s#https?://[A-Za-z0-9.-]*(archive|security)\.ubuntu\.com/ubuntu/?#${mirror}/#g" "$file"
    fi
  done
  label="${mirror:-the runner mirror}"
  echo "::group::apt from ${label}"
  if sudo apt-get "${APT_OPTS[@]}" update && sudo apt-get "${APT_OPTS[@]}" install -y --no-install-recommends "$@"; then
    echo "::endgroup::"
    echo "Installed $* from ${label}."
    exit 0
  fi
  echo "::endgroup::"
  echo "::warning::apt failed from ${label}; trying the next mirror."
done

echo "::error::No Ubuntu mirror served $*." >&2
exit 1
