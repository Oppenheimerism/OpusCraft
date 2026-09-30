#!/bin/zsh
# Double-click to open the game to friends on this network (npm run lan): it builds the game, then serves it until
# this window is closed. Open http://localhost:4173 in Chrome on this computer to host; friends open the address
# printed below. Run from its own window, not the Claude app's preview, which may stop it in the middle of a game.
cd "$(dirname "$0")"
if [ ! -d node_modules ]; then
  echo "Installing the game's tools, once..."
  npm ci || exit 1
fi
npm run lan
