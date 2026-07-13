# Maze Munch 2.1

This version replaces the previous pixel-snapping movement system with deterministic tile-to-tile movement.

## Fixed
- Player now moves continuously after joystick direction is selected.
- Requested turns remain buffered until a valid junction is reached.
- Ghosts follow separate scripted centre-house exit routes.
- Ghosts begin normal routing only after reaching the corridor above the gate.
- New PWA ID, file query versions and cache name.
- Existing service workers are unregistered before Version 2.1 is installed.

## Publishing
Replace every file in the GitHub Pages repository with the contents of this ZIP.
Delete the old Home Screen app, open the Pages address in Safari, refresh once, and add it to the Home Screen again.
