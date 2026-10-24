# musdy style guide

phone first, dark, one balance. we copy fomo's craft, never its content, logo, name or indigo. references live in refs/. what we saw there: bg rgb(6,5,16), Aeonik, big tight lowercase headlines, rounded dark cards, small mono-caps blue labels, green gains, a feed row of "name, Buy, 12m, TOKEN $34.3K at $642.3M MC", a buy sheet with a big $ input and $25 $50 $100 $250 chips.

## layout grammar

width target is 390. content gutter is 16. everything lives in one column. desktop is the same column centered at 480 max, not a different layout.

### bottom tab bar
five tabs: feed, explore, trade (center, raised), portfolio, profile. height 56 plus safe area. surface colour with a 1px top border. icons are drawn svg, 24px, stroke 1.75, no emoji. active tab is text colour plus a 4px accent dot under it. inactive is muted. no labels on inactive tabs is allowed, labels on active only.

### top of every screen
left: the screen title in 20px. right: the balance pill, "$1,240.55" with the MUSD mark at 14px. tapping it opens the deposit sheet. the balance is always one number, in USD. never show two currencies.

### feed card anatomy
one row, 72px min height, no card box, separated by a 1px border line. left to right:
- 40px round avatar of the trader
- line one: trader name (semibold 15), a small side tag "Buy" in green or "Sell" in red (12px, tinted pill), time ago in muted (12px)
- line two: token icon 20px, TICKER (semibold), then "$34.3K at $642.3M MC" where the amount is text colour and "at ... MC" is muted
- right edge: a copy button (36px, accent outline) on first view only, after that a chevron
tap row opens the token page. long press opens a peek of the trader. a thesis post has the same avatar and a short quote, with an embedded position block below it.

### token page anatomy
top to bottom:
- back chevron, ticker, star
- token icon 56, name, price at 34px, change chip beside it
- chart 220px high, full bleed, no frame, line chart, range chips 1H 1D 1W 1M All under it
- your position block (only if held): value, PnL in USD and percent
- "traders who bought" strip: avatars and amounts, the social proof lives here
- stats in two columns of label over value (market cap, volume, holders)
- sticky bottom bar: Buy (accent fill) and Sell (raised surface). the bar is 72px and sits above the tab bar space.

### bottom sheets for buy and sell
the only way to trade. no new screen. the sheet rises from the bottom, 16px top radius on 24, drag handle 36x4, dims the page to 60% black.
- Buy / Sell segmented control at top
- big amount input, 40px, "$100", with the token amount on the right in muted ("493.54K PENGU")
- four chips: $25 $50 $100 $250, plus a last "max"
- one line of fee and slippage in muted 13px
- one full width button, 52px, "Buy PENGU". it is accent for buy and red for sell
- keyboard is our own number pad inside the sheet, not the system one, so the sheet never jumps
the sheet is draggable and interruptible. success state replaces the button with a green check and the new position, then closes itself after 1.2s.

### numbers and PnL
- balance: "$163,293.86". the cents are 60% size and muted. 
- PnL is signed and coloured: "+$134.12K" green, "-$4.5K" red. percent in a small chip next to it, "+6.88%" with a tiny triangle.
- zero is muted, no colour.
- compact units K M B above 10,000. one decimal. full precision on the token page price and in the sheet.
- tiny prices use a subscript zero count like 0.0₅42, never a wall of zeros.
- every number is tabular so columns do not wobble.
- time ago is "5m", "23h", "3d". 
- only real numbers from the chain or the api. a loading number is a grey bar, never a made up one.

### leaderboard and profile
leaderboard is a list, not a table. rank (1 to 3 get medal drawn in svg), avatar 40, name and handle, PnL on the right in green. the user's own row pins to the bottom. profile: avatar 72, name, handle, follower counts, big PnL number, then segments (positions, trades, thesis). copy trade button is the only filled button on the page.

## type

font: Figtree (Google Fonts), weights 400, 500, 600, 700. closest free match to Aeonik: round geometric, friendly, tight at large sizes. numbers use font-variant-numeric: tabular-nums. use Geist Mono or JetBrains Mono only for the small caps section labels and addresses.

- big balance: 40/44, 700, letter-spacing -0.03em
- token price: 34/38, 700, -0.02em
- screen title: 20/26, 600
- body and row primary: 15/22, 500
- secondary row text: 14/20, 400
- meta (time, labels, fine print): 12/16, 500, muted
- section label: mono, 11/14, uppercase, +0.08em, accent
- headlines on marketing pages are lowercase like fomo. in the app, tickers are uppercase and names keep their own case.

## colour

dark only. no pure black, no pure white.

- bg: #0B0A0F
- surface: #14121A
- raised surface: #1D1A25
- border: #2A2633
- text: #F4F1EA
- muted text: #8B8696
- green up: #2EE59D
- red down: #FF5C6C
- accent: #F7931A
- accent pressed: #D97B0B
- accent on dark tint (chips, glows): #F7931A at 14% alpha
- accent text on fill: #1A0F00

the bg leans slightly warm violet-black so orange sits well on it. green and red are only for money direction, never decoration. accent is for the one primary action on a screen and the active tab dot. one accent element above the fold, two at most.

## spacing

4px base. scale: 4, 8, 12, 16, 20, 24, 32, 48. gutter 16. row padding 12 vertical. card inner padding 16. section gap 24. touch targets 44 minimum.

## radius

- chips and pills: 999
- buttons: 14
- inputs: 14
- cards: 20
- sheets: 24 top corners
- avatars: round
- token icons: round

## motion

feel: quick, soft, confident. nothing bounces except the sheet on a hard fling. all motion respects prefers-reduced-motion (fade only, 120ms).

- easing out: cubic-bezier(0.22, 1, 0.36, 1). use for everything entering.
- easing in-out for moves on screen: cubic-bezier(0.65, 0, 0.35, 1).
- press: scale 0.97, 100ms. release 160ms.
- number tick: digits roll vertically, 280ms, only the digits that changed. colour flashes green or red at 20% opacity behind the number and fades over 600ms.
- new feed item: slides in from the top, 24px translate plus fade, 320ms, and pushes the rest down with a 240ms layout move. if the user has scrolled down, do not move anything, show a "3 new" pill instead.
- sheet open: 360ms ease out, translateY from 100%. close 240ms. follows the finger 1:1 while dragging and uses release velocity to decide.
- tab switch: crossfade 160ms. no slide.
- chart: line draws on first load in 500ms, then updates by morphing, 300ms.
- success check: stroke draw 280ms.
- skeletons: static grey bars with a very slow 1.6s shimmer.

only animate transform and opacity.

## tricks of fomo worth copying

1. the feed row is a sentence. "trader Buy 12m, TOKEN $34.3K at $642.3M MC". it reads in one glance and the market cap at buy time is the hook. keep that exact density.
2. the buy sheet is the whole trade. one amount, four chips, one button. no review screen, no settings maze. funding is one tap.

## where we push past

- the feed shows what happened after: each row has a live PnL of that trade since the buy, so you see if following paid off.
- one balance in MUSD means no chain or gas talk at all. the sheet never mentions a network.
- copy trade is one line in the buy sheet: "also copy @name's next buys, $50 each".
- the chart marks the buys of traders you follow as small avatar dots on the line.
- orange on warm black gives musdy its own look instead of fomo's indigo space theme. no astronaut, no 3d coins, no stock art. real product screens only.

## banned

- centered hero with three cards and a gradient
- lorem ipsum or any filler text
- invented numbers, fake traders, fake volume. use real data or an honest empty state
- emoji as icons, anywhere
- tables on phone. use rows
- marketing words in copy (seamless, robust, revolutionary, unlock)
- gradients as backgrounds for cards or buttons
- more than one filled accent button per screen
- purple or indigo as accent
- fomo's logo, name, mascot, astronaut art or copy
- system keyboard inside the trade sheet
- red or green used for anything except money direction
