# Coin Collector PRD

## Goal

The player should be able to start a short browser game, move across a four-cell
board, collect two coins, and reach a visible win state.

## Controls

- The visible Start button begins the game.
- Arrow Right moves the player one cell to the right.
- Arrow Left moves the player one cell to the left.
- Movement input has no effect before Start or after the game has been won.

## Rules

1. The player starts in cell 0 and the coins start in cells 1 and 2.
2. Entering a cell containing a coin removes exactly that coin.
3. Each collected coin increases the internal score by exactly one.
4. Collecting both coins changes the game state from `playing` to `won`.
5. The final score of the intended happy path is 2.

## User interface

- The score shown in the HUD must equal the internal score after each action.
- The status shown in the HUD must equal the internal game status.
- The Canvas remains visible during the complete playthrough.

## Testability contract

The fixture exposes the versioned `window.__PRD2PLAY__` read-only observation
bridge. Tests must use real mouse and keyboard input for actions; they may use the
bridge only to reset a seed and read state/events. Private expected values and
fault labels are stored outside this document.
