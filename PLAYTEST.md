# Play-test checklist

Nothing in this repository has been played by a person yet. The tests cover the engines and the API flow, not the screens. Use this list on the Vercel preview or `npm run dev`, and note what fails.

How to report: for each failure, write the game, the step, what you expected, what happened, and the device and browser. A screenshot of the **API calls** panel helps.

## Everywhere

1. Open the site. You see "Starting the sandbox…", then a name form.
2. Enter `ab`. You see an `invalid_display_name` error. Enter `NovaKnight`. You see `display_name_taken`. Enter a new name of 3 or more letters. You reach the Games page.
3. Reload the page. You are still the same player.
4. The **API calls** panel lists every request with a status. A failed call is red.
5. Open **Leaderboard**. Each game has a Best score and a Total score board with the seeded players.
6. Open **Profile**. It shows your coins, booster packs, skin and achievements.
7. **Reset sandbox** returns you to the name form with the seeded boards.
8. Check the page on a phone-sized screen: no sideways scrolling, buttons large enough to tap.

## Shop

1. Buy a **Booster pack** with the test card. Status `succeeded`, and the pack shows in Profile.
2. Tick **Use the declined test card** and buy again. You see `payment_declined` and nothing is added.
3. Buy the **Neon skin**. The button changes to **Owned**, and the Reflex and Memory boards use the neon colors.
4. **Refund** a purchase. Its status becomes `refunded`. Refund a booster pack you already used: the response says fewer items were taken back.

## Arena Reflex

1. Start a ranked match. The API panel shows `POST /matches` and `POST /matches/{id}/start`, then a 3-2-1 countdown.
2. Green squares are targets. Click them fast. Red squares are decoys and cost points. The score, combo and time update.
3. When the 20 seconds end, the result shows both scores, your ranks, coins and any achievements.
4. Does a round feel fair? Is the speed of the targets right? Note if it feels too fast or too slow.

## Memory sequence

1. Watch the pattern, then repeat it. Level 1 is one pad.
2. A wrong pad ends the game. With a booster pack ticked, the first mistake replays the level instead.
3. Is the pattern speed readable at level 8 and above?

## Word scramble

1. Type or tap letters, then **Check**. A correct word shows `+points`.
2. `Skip` and a wrong answer reset the streak. Time runs for 60 seconds. A booster pack adds 10.
3. Try typing on a phone keyboard: does the keyboard cover the letters?

## Tile merge

1. Move with the arrow keys, WASD, a swipe and the on-screen buttons. Page scrolling is blocked only while a game is on.
2. **End game and submit score** finishes the game early. With a booster pack, **Undo last move** works once.
3. Do the tile colors have enough contrast? Can you tell 128, 256 and 512 apart?

## Connect Four

1. **1 player:** you are red and move first. Tap a column to drop a disc. Does it feel clear whose turn it is, and when the system is thinking?
2. **2 players:** enter a second name. Player 1 is red and player 2 is yellow. Take turns on the same screen. Can you tell red from yellow, including the ring on yellow discs?
3. Is the system too easy or too hard? It blocks and takes wins but does not plan ahead, so you can beat it with two threats at once.
4. Win on a diagonal for the "Corner to corner" achievement. Fill the board for a draw if you can. A draw puts both players at placement 1.
5. With a booster pack, take back a move with the button under the board. Does it take back your move and the system's reply?
6. After the game, both players show ranks and coins. The leaderboard lists both.

## Known unknowns

- Bot strength is tuned from simulation only. Say if RivalBot is too easy or too hard in each game.
- Whether two players can share a placement is not in the API docs. A drawn Connect Four game puts both at placement 1. This is now in the spec: players can share a placement.
