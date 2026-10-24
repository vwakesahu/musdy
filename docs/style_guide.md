# musdy style guide

dark, dense, fast, loud about money. this guide is built from real fomo screenshots in refs/fomo-app/. we use fomo's colour scheme on purpose (this replaces the old "never copy fomo's indigo" rule). we still never copy fomo's logo, name, copy or token art. our brand lives in docs/brand.md and web/public/brand/.

## components in code

all in web/src. tokens are tailwind classes from globals.css: bg-bg, bg-bg-sheet, bg-surface, bg-surface-2, bg-surface-3, border-border, border-border-strong, text-text, text-text-2, text-muted, text-faint, bg-accent, text-accent-hi, bg-accent-soft, text-up, bg-up-soft, text-down, bg-down-soft, bg-buy, text-gold/silver/bronze/star, bg-scrim, shadow-glow, shadow-panel. radius: rounded-sm 6, rounded-md 10, rounded-lg 14, rounded-xl 16, rounded-2xl 24. helpers: .press (scale 0.97), .skeleton, .dot-grid, .label (13 muted). cn from @/lib/utils.
- Button, @/components/ui/button. variant primary | buy | sell | secondary (default) | ghost | white | destructive | link | bare. size lg 56 | md 48 (default) | sm 36 | icon 44 | icon-sm 36. loading, disabled. render={<Link href="/x" />} for links. one primary per view.
- Drawer, @/components/ui/drawer. { open, onOpenChange, title, hideTitle?, desktop?: "dialog" | "panel", data-testid?, className?, bodyClassName? }. under 640 vaul bottom sheet, 640+ centred 440 dialog, 1024+ with desktop="panel" a 420 right side panel. use it for every sheet; never import vaul directly.
- Dialog (DialogPopup, DialogTitle, DialogPanel, DialogFooter), @/components/ui/dialog. Sheet (SheetPopup side), @/components/ui/sheet. coss, base ui. prefer Drawer.
- Segmented, @/components/ui/segmented. { value, options, onChange, size sm | md }. pill segmented, role tab.
- Tabs (Tabs, TabsList, TabsTab, TabsPanel), @/components/ui/tabs. ToggleGroup, Toggle, SegmentedControl: same folder.
- UserAvatar { user, size }, plus coss Avatar, AvatarImage, AvatarFallback, AvatarGroup: @/components/ui/avatar.
- Input, NumberField, Label, Badge, Card, Tooltip, Menu, ScrollArea, Separator, Skeleton, Spinner, toast (coss): @/components/ui/<name>. app toasts still go through toast() in @/lib/toast.
- money and rows: Money, Pnl, PctChip, TokenIcon, NumberPad, EmptyState, Medal, CurveBar in @/components/ui.
- icons: @phosphor-icons/react, names ending in Icon (HouseIcon, LightningIcon). in a file without "use client" import from @phosphor-icons/react/ssr.
- shell: ScreenHeader (title, left, extra, right) and BackBar in @/components. desktop right rail: wrap content in <RightRail> from @/components/right-rail; it portals into the 360 aside at 1024+, renders nothing on phone. nav items live in @/components/nav-items.
- hooks: useIsDesktop (1024+), useIsWide (640+), useMediaQuery in @/hooks/use-media-query.
- keep every data-testid and accessible name the e2e specs use; render a testid only once per page (hidden copies still trip playwright strict mode).

the three things that make fomo feel like fomo, and that the current musdy ui is missing:
- money is the loudest thing on screen. big white numbers, green and red everywhere, live tickers.
- other people are always visible. avatars, handles, "15 top traders bought", stacked holder faces on every token row.
- one obvious action per screen. a fat indigo "deposit", a fat green "buy", a white "buy with apple pay". nothing else competes.

## reference screenshots

all in refs/fomo-app/. phone shots are 1242x2688.
- play-home-tokens.png, as-home-tokens.png: home. balance header, deposit button, top trades carousel, tabs, filter chips, token list.
- as-home-deposit-sheet.png: "deposit with" bottom sheet over a dimmed home.
- as-feed-global.png, play-feed-foryou.png: live feed. trade rows, side chips, thesis posts, embedded position cards, mini chart card.
- as-token-page.png: token page. header, price, step chart with trade markers, range chips, holders tab, sticky green buy.
- as-buy-numpad-applepay.png, play-buy-slide.png: buy drawer. big amount, percent presets, number pad, slide to buy.
- as-withdraw-success.png, play-withdraw-success.png: success state.
- as-profile.png: profile header, pnl chart, cash row, positions with segmented open and closed.
- play-leaderboard.png, as-leaderboard-clans.png, as-clans.png: leaderboard, your rank card, medal rows, clan cards.
- ipad-*-legacy.png: the 2025 ipad build with an older grey and purple theme. use for wide layout ideas only, not colour.
- fomo-appicon.png, fomo-og.png, privy-fomo-cover.png: brand energy only.
- refs/blog-announcing-fomo-web-d.png and refs/home-d.png: fomo.family web, for desktop chrome.

## colour tokens

sampled from the phone screenshots. name them exactly like this in css.

surfaces
- --bg: #070510. page background. near black with a violet cast. never pure #000.
- --bg-sheet: #08070f. drawers and sheets. same black as the page, separated by radius and scrim.
- --surface: #12111a. cards, chips, list cards, rank card, sheet option rows.
- --surface-2: #161523. raised controls. percent presets, slide track, segmented track.
- --surface-3: #1d1c27. hover and pressed state of surface and surface-2.
- --border: #1b1926. 1px card outline and list dividers.
- --border-strong: #2c2b35. outline of ghost buttons, chips, the active segmented pill.
- --scrim: rgba(3,2,8,0.72). behind sheets and dialogs. fomo dims the page hard.

text
- --text: #f7f7f7. primary. numbers, names, titles.
- --text-2: #c9c8cc. secondary body (thesis text, sheet row titles at rest).
- --text-muted: #9999a3. labels, market cap, handles, "24h", timestamps.
- --text-faint: #66667a. disabled, placeholder, and the cents tail of big balances ("$917,526" white, ".86" faint).
- --text-on-accent: #ffffff.

brand
- --accent: #516bf6. fomo indigo. primary buttons, slide knob, verified badge, links.
- --accent-hi: #4662fb. active tab underline, selected outline, highlighted words in banners.
- --accent-soft: #1a1c3a. tinted chip and info banner fill.
- --accent-soft-2: #262f6e. "new" badge fill. text on it is #b9c4fd.
- --accent-glow: 0 0 0 1px rgba(81,107,246,0.5), 0 8px 24px rgba(81,107,246,0.35). the primary deposit button glows.

money
- --up: #21c85e. gains, "+$91,240.00", success circle, the done bar, chart line.
- --up-text-sm: #04c249. small green text inside chips.
- --up-soft: #0b2c20. "buy" and "10x long" chip fill.
- --down: #ff5b3a. losses, ▼ change, red chart. fomo red leans orange.
- --down-soft: #501f18. "closed" and "sell" chip fill.
- --buy: #57c05a. the big buy button on the token page is a slightly softer green than pnl text. use it for buy ctas only.
- --gold: #e7b93e, --silver: #a9adb8, --bronze: #c9784a. leaderboard medals only.
- --star: #f5b70a. watchlist star when on.

gradients and glass
- chart fill: linear-gradient(180deg, rgba(33,200,94,0.28) 0%, rgba(33,200,94,0) 100%). red version uses --down at the same stops.
- chart dot grid: 1px dots, rgba(255,255,255,0.05), every 12px, behind charts only.
- marketing and og only: linear-gradient(180deg, #4f68f2 0%, #8b9cf6 70%, #b3bdf8 100%). this is fomo's store blue. never inside the app.
- no glass inside the app. surfaces are flat and opaque. the only blur is the sticky top bar on scroll: rgba(7,5,16,0.8) with backdrop-filter blur(16px).

## type

fomo uses aeonik. closest free google font: geist. load "Geist" weights 400, 500, 600, 700 (next/font/google exports Geist). set font-variant-numeric: tabular-nums on every number.

roles (size / line height / weight / letter spacing)
- hero balance: 40 / 44 / 500 / -0.03em. "$917,526" in --text, cents in --text-faint.
- token price on token page: 34 / 40 / 500 / -0.02em.
- buy amount in drawer: 64 / 68 / 500 / -0.03em, centred.
- screen title (clans, leaderboard): 28 / 34 / 600 / -0.02em.
- section title ("positions", "top traders", "weekly top trades"): 17 / 22 / 500 / -0.01em.
- row title (ticker, trader name): 16 / 20 / 500 / 0.
- row value (price, pnl on the right): 16 / 20 / 500 / 0.
- body: 15 / 21 / 400 / 0.
- meta (market cap, handle, time): 13 / 17 / 400 / 0, --text-muted.
- change under price: 13 / 16 / 500, coloured, with a ▲ or ▼ glyph at 9px.
- chip text: 13 / 16 / 500.
- micro badge ("new", "MC", side chips): 11 / 14 / 600 / 0.01em.
- button: 16 / 20 / 600 / 0. large buttons 17.
- tab label: 16 / 20 / 500. inactive --text-muted, active --text.
fomo writes ui copy in sentence case. musdy copy is lowercase per docs/brand.md, but tickers stay upper case (BTC, MUSD).

## radius, spacing, shadow

radius
- 4 to 6: micro badges, side chips, "MC" boxes.
- 10: chips, percent presets, segmented pills, small icon buttons.
- 14: buttons, list cards, feed embed cards, sheet option rows, inputs.
- 16: carousel cards, rank card, clan cards.
- 24: sheet top corners and desktop dialogs.
- full: avatars and switches only.

spacing (4 base)
- page gutter 16 on phone, 24 on the desktop centre column.
- list rows 64 to 72 tall, 12 vertical padding.
- avatar to text gap 12.
- section gap 24.
- card padding 12 to 16.

shadow
- in app there are almost no shadows. separation is surface colour plus 1px border.
- primary button gets --accent-glow.
- desktop dialogs and side panels: 0 24px 64px rgba(0,0,0,0.6) plus 1px --border.

## icons

use phosphor: npm package @phosphor-icons/react. its soft, rounded, filled shapes match fomo's set (gift, clock, share, gear, trophy, house, star) closely.
- tab bar and nav rail: weight "fill" when active, "regular" when inactive. size 24.
- top bar actions (history, share, settings, gift, star, bell): weight "bold", size 22, --text. star turns "fill" in --star when on the watchlist.
- inline meta icons (clock, swap, calendar, users in stat lines): weight "fill", size 14, --text-muted.
- icons inside buttons (plus, dots, arrow): weight "bold", size 20.
- success circle: ArrowUp or Check, weight "bold", size 36, black on --up.
- numpad backspace: Backspace, weight "regular", size 26.
- never mix icon sets. never hand draw svg icons except the brand mark. no emoji as icons.
names to use: House, Lightning (feed), Trophy, UserCircle, MagnifyingGlass, Bell, Gift, ClockCounterClockwise, Export, GearSix, Star, Plus, DotsThree, ArrowsDownUp, Backspace, ArrowUp, Check, CaretLeft, CaretDown, CaretDoubleRight (slide knob), CopySimple, ArrowSquareOut, Funnel, ChatCircle, Repeat (copy trade), SealCheck (verified), Medal, Rocket (launch), QrCode, CreditCard, Wallet, Info, Lightbulb.

## components

### tab bar (phone)
- 4 or 5 tabs: home, feed, leaderboard, launch, profile.
- height 56 plus safe area. --bg fill, 1px top border --border.
- icons only, no labels. active is fill weight in --text, inactive is regular in --text-muted. the profile tab shows the user's 24px avatar.
- no raised centre button. fomo keeps it flat.

### top bar
- height 52. left: brand mark 28px on home, CaretLeft bold 22 on inner pages.
- right: 1 to 3 icon buttons, 36x36 hit area, no fill. bell gets a 6px --down dot at top right when unread.
- token page variant: back, 40px token avatar, ticker 17/500 with a tiny chain badge, name under it 13 muted with a CopySimple icon. right side history, star, share.

### balance header (home)
- small label "portfolio" 13 muted above (optional).
- line 1: "$917,526" hero size, cents in --text-faint.
- line 2: "+$91,240.00" in --up 15/500, then "24h" in --text-muted.
- right side, vertically centred: deposit button, primary, 140x48, --accent fill, --accent-glow.
- 16 below: "weekly top trades" section title with a Lightbulb fill 16 icon, then a horizontal carousel of cards 160x96: top half 20px avatar + handle 14/500, bottom half 28px token icon + green pnl 17/500. --surface, 1px --border, radius 16, 1px divider between the halves.

### filter tabs and chips
- underline tabs: equal width, 16/500, active underline 2px --accent-hi across the full tab width, track line 1px --border under all tabs. optional leading star tab for watchlist. a "new" badge can follow a label.
- chips row: horizontal scroll, chip 36 tall, padding 0 14, radius 10. inactive: transparent, 1px --border-strong, --text-muted. active: --surface fill, --text, 600. a leading square chip holds a Funnel icon.
- info banner under chips: --surface, radius 14, 44 tall, a 16 icon in --accent, text 14 with the key words in --accent-hi, Info icon right.

### token row
- height 64. left: 44px token avatar with a 16px verified badge (SealCheck fill in --accent, 2px --bg ring) at bottom right.
- middle: ticker 16/500. under it either "$226.6B MC" in muted, or an "MC" micro box (1px --border-strong, radius 4, 10px text) then the value, then a stack of up to 3 holder faces 16px with a "5+" counter.
- right: price 16/500 right aligned, under it change 13/500 with ▲ or ▼ in --up or --down.
- the whole row is the tap target. desktop hover: --surface-3 rounded 14, inset 8.

### feed row (trade)
- padding 16 vertical, 1px --border divider, no card around it.
- line 1: 32px avatar, handle 15/500, optional verb in muted ("opened", "closed a position", "started a position"), side chip, time ("5s") 13 muted.
- side chip: 20 tall, padding 0 6, radius 6, 11/600. buy: --up-soft fill, --up-text-sm text. sell and closed: --down-soft fill, --down text. leverage "10x long" same green. thesis: --accent fill, white text.
- line 2, indented to the text start (44px): 28px token avatar, ticker 15/600, "$24K" in --text, "at $118M MC" in --text-muted. the ticker has a 1px dotted underline in --text-faint, which means "tap for token".
- closed position variant: an embedded card (--surface, radius 14, padding 12): token avatar, name, leverage chip, and on the right "+$2,890.00" over "▲ 38.03%".
- thesis variant: a mini token line with price and change, then the quote in 15/400 --text-2. a thin vertical thread line joins avatar and quote.
- social proof variant: overlapping avatars (3 x 28, -8 overlap) and "15 top traders bought" with "bought" in --up.
- chart card variant: the embed card holds a 120 tall sparkline with green plus and red minus trade markers.
- actions row (optional): like count, comment count, share. 13 muted, 16 icons.
- musdy addition: every trade row has a "copy" button at the right edge. small ghost button with a Repeat bold 16 icon. it opens the buy drawer prefilled with the same coin and amount. on phone always visible, on desktop it turns primary on row hover.
- new rows flash, see motion.

### token page
- top bar variant (see above).
- price block: price 34/500. under it "▲ $0.0009044 (1.26%)" in --up plus "1h" muted. right side: market cap 17/500 with an ArrowsDownUp toggle, "market cap" 13 muted under it.
- chart: full bleed, 280 tall on phone. 2px line in --up or --down, step line for thin coins, gradient fill, dot grid behind. last point is a 6px dot with a pulsing 12px halo. a dashed 1px line at the current price with a price tag pill at the right edge (--up fill, black 11/600 text). trade markers: 16px circles, green with + for buys, --down with − for sells.
- range chips under the chart: 1H 4H 1D 7D 6M ALL, 13/500 muted, active is a --surface-2 pill radius 8 in --text. far right: chart type toggle (line, candles).
- sub tabs: holders (count), feed, about. underline style.
- holders list: a friends toggle row (switch + "friends (1)" + avatar), then rows of avatar, handle, "avg. entry: $544.7M MC" muted, right side value and change.
- sticky bottom: full width buy button 56 tall, --buy fill, black 17/600 text, radius 14, 16 from edges, on a --bg strip with a 24px fade above. if the user holds the coin: sell (secondary) and buy (green), 1:2 widths.

### buy and sell drawer
- vaul bottom sheet. top radius 24, --bg-sheet, 1px top border --border, handle 36x4 #3a3945 radius 2, 8 from the top.
- header row: 44px token avatar, ticker 17/500, "MC $160.6M" with holder faces under it. right: live price 15/500 and change.
- amount: "$100" 64/500 centred, 48 below the header. under it "625 MOODENG" 15 muted with an ArrowsDownUp icon that flips usd and coin entry.
- presets: four equal pills, 25% 50% 75% 100%, 36 tall, --surface-2, radius 10, 14/600. for buy the percent is of the musd balance, for sell of the position.
- number pad: 3 columns x 4 rows, 1 to 9, ".", 0, backspace. keys 64 tall, 28/400, no key background. pressed shows a 56px --surface-3 circle behind the digit. our own pad, never the system keyboard.
- footer line: "$33.2k available" muted left, "$0.50 fee" in --text right. or a promo link in --accent with CaretDown.
- confirm: slide to buy. track 56 tall, --surface-2, radius 14. knob 48x48, --accent, radius 12, CaretDoubleRight bold white. label "slide to buy" 16/600 centred. release past 85 percent to fire.
- desktop: no slide and no number pad. a real input for the amount and a plain buy button. dragging with a mouse is slower than clicking.
- sell variant: knob and button in --down, label "slide to sell".
- invalid amount: the number turns --down and shakes 6px twice, confirm stays disabled at 40 percent opacity.

### success state
- fills the sheet, content centred. 80px --up circle with a black ArrowUp or Check bold 36.
- title 24/500 ("bought", "withdrew"), amount 34/500 below.
- an address line 15 muted with a chain glyph, then "view on explorer" in --accent with ArrowSquareOut 14.
- bottom: full width --up bar 56 tall, radius 14, label "done" centred in black 17/600, Check icon at the right. tap dismisses.
- musdy addition: a secondary "share trade" button above it, opens a pnl card image.

### toasts
fomo barely uses toasts. ours:
- phone: top centre under the status bar. desktop: bottom right, 24 from edges.
- pill 44 tall, radius 22, --surface, 1px --border-strong, 20px avatar or icon left, 14/500 text.
- live trade toast: "kenji bought $24k BTC" with a 6px --up dot. tap opens the coin. 3s. max 1 on phone, 3 stacked on desktop.
- error toast: --down-soft fill, --down icon, stays until tapped.

### sheets and dialogs
- "deposit with" sheet: centred title 17/500, then option rows. each row --surface, radius 14, 72 tall, padding 16, title 16/500 over subtitle 13 muted, right icon 24 (QrCode, CreditCard) or a "new" badge after the title.
- confirm dialog (destructive only): phone is a sheet with title, body, destructive button and ghost cancel. desktop is a centred dialog.
- every sheet dims the page with --scrim. the page behind does not scale.

### profile header
- 72px avatar with a 24px edit badge (black circle, white pencil) bottom right.
- name 24/500, handle 15 muted.
- bio 15 --text-2.
- follow line: "214" 15/600 plus "following" muted, same for followers.
- stat line: 13 muted with 14 fill icons: "9h avg. hold", "342 trades", "joined dec 2025".
- top right: gift, history, share, settings, bold 22.
- someone else's profile: a row of follow (primary) and copy trades (secondary), equal width, 48 tall.

### pnl display
- big value "$917,526" with faint cents, under it "+$91,240.00 24h" in --up.
- range segmented on the right: 24h 7d 30d all, 13/500, active is a --surface-2 pill.
- chart below, full bleed, 200 tall, same style as the token chart.
- cash row: 44px --surface-2 circle with a $ glyph, "total cash" 13 muted over "$11,190.00" 17/500, right side two 44px icon buttons (Plus, DotsThree) in --surface radius 12.
- positions: "positions (4)" title, an "open • closed" segmented pill on the right, chips all, coins, launched. rows like token rows, subtitle is the holding ("7.4M CASHCAT"), right side value and percent.
- every pnl shows its sign, + or −, in green or red. grey only when exactly zero.

### leaderboard row
- "your rank" card on top: --surface, radius 16, padding 16. 48 avatar, "your rank" 13 muted over "#67" in an --accent-soft pill with --accent-hi text. right side pnl 20/500 --up and an Export icon.
- section header "top traders" + segmented 24h 7d 30d + a % and $ toggle.
- rows 72 tall: rank column 28 wide (Medal fill in gold, silver, bronze for 1 to 3, else "4." 15 muted), 48 avatar, name 17/500 over handle 13 muted, right side pnl 17/500 --up and under it the 3 most held coin icons at 18px with "5+".
- you are highlighted in the list with "• you" after the handle.
- clans (later): horizontal cards 130 wide, --surface radius 16, 48 square image, name, member faces, pnl in a pill (1px --border-strong, radius 10, --up text).

### chips and badges
- side chips: see feed row.
- "new": --accent-soft-2 fill, #b9c4fd text, 11/600, radius 6, padding 2 6.
- "MC" box: 1px --border-strong, radius 4, 10/500 --text-muted.
- verified: SealCheck fill 16 in --accent with a 2px --bg ring.
- holder stack: 16 to 18 faces, -6 overlap, 2px --bg ring, counter pill "5+" --surface-2 10/600.

### buttons
sizes: large 56 (sticky ctas, confirm), medium 48 (deposit, follow), small 36 (copy, inline actions), icon 44 or 36 square.
- primary: --accent fill, white 16/600, radius 14, --accent-glow. hover lighten 6 percent, press scale 0.97.
- buy: --buy fill, black text. sell: --down fill, white text.
- secondary: --surface-2 fill, --text, no border.
- ghost: transparent, 1px --border-strong, --text.
- white: #ffffff fill, black text. for one external cta like "connect wallet", mirroring fomo's "buy with apple pay".
- destructive: --down-soft fill, --down text. solid --down on the final confirm.
- disabled: 40 percent opacity, no glow, cursor not-allowed.
- text link: --accent 15/500, optional ArrowSquareOut 14.
- rule: one primary per view. two buttons side by side means one is secondary.
- buttons must look like buttons: always a fill or a border, never bare text for an action.

### inputs
- text input: 52 tall, --surface, 1px --border, radius 14, padding 0 16, 16/400, placeholder --text-faint. focus: border --accent-hi plus a 3px rgba(81,107,246,0.25) ring.
- search: same, MagnifyingGlass 18 muted at left, radius 12, 44 tall.
- money is entered only in the drawer as the big centred number, never a boxed field on phone.
- textarea (coin launch): same as text input, min 96 tall.
- switch: 44x26, off --surface-3, on --up, white 22 knob.
- image picker (coin launch): 96 square, dashed 1px --border-strong, radius 16, Plus icon centre.

### avatars
- sizes: 16 (stacks), 24 (tab), 32 (feed), 44 (token rows), 48 (leaderboard), 72 (profile).
- always round, with a 1px rgba(255,255,255,0.06) inner ring so dark images don't vanish.
- fallback: solid colour from the handle hash (#516bf6, #21c85e, #f5b70a, #ff5b3a, #a66bff, #2ec5d3) with the first letter in white 600.

### empty states
- centred in the list area: 48 icon in a 72 --surface circle, --text-muted.
- title 17/500 ("nobody's trading this yet"), one line 14 muted, one small primary button ("be first, buy $10").
- never a blank screen. the feed falls back to "top trades today".

### loading
- skeletons, not spinners. --surface blocks with a left to right shimmer of rgba(255,255,255,0.04), 1.2s linear infinite. shapes match the real row.

## desktop layout

fomo web (fomo.family) is a full desktop app, not a stretched phone. musdy does the same from 1024 wide:
- left nav rail: 240 wide (72 icon-only between 1024 and 1279). brand mark and wordmark at the top, then nav items 44 tall, icon 22 plus label 15/500: home, feed, leaderboard, launch, profile. active item is --surface fill, radius 12, fill icon. at the bottom: a balance card (balance 20/500, pnl line, full width deposit button) and the user chip.
- centre column: fluid, max 720, gutter 24. home: balance header, top trades, token list. feed: the feed. token page: header, chart 360 tall, tabs, holders.
- right rail: 360 wide, sticky, scrolls on its own. home and feed: "trending" (5 token rows), "top traders today" (5 leaderboard rows), and a live trades ticker. token page: the buy and sell panel is docked here permanently (same anatomy as the drawer, real input instead of number pad, presets visible, plain buy button) plus coin stats (market cap, volume, holders, created).
- top bar: 64 tall, a 360 wide search field in the centre column, bell and avatar on the right.
- drawers on desktop: buying from a feed row opens a 420 wide side panel sliding in from the right, full height, same contents. deposit, success, confirm and share open as centred dialogs, 440 wide, radius 24, --bg-sheet, --scrim behind.
- 640 to 1023: rail collapses to icons, right rail content moves into the centre column, drawers are centred dialogs.
- under 640: phone layout with the tab bar.
- hover: rows go --surface-3, buttons lighten, the copy button turns primary on row hover. every clickable has cursor pointer and a visible focus ring (2px --accent-hi, 2px offset).
- keyboard: "/" focuses search, "b" opens buy on a token page, enter confirms dialogs, escape closes.

## motion

- library: motion (already in web). sheets via vaul.
- sheet open: spring stiffness 400, damping 40. close 200ms ease-in.
- dialogs and side panels: dialog scales 0.96 to 1 with fade, 180ms ease-out. side panel slides 24px with fade, 220ms.
- press: tappables scale to 0.97 in 80ms, back in 120ms.
- numbers tick: digits roll vertically when they change, 300ms. a price change flashes the text --up or --down for 600ms.
- feed: new trades slide in from the top (12px plus fade, 220ms) and the row background flashes --up-soft or --down-soft for 1s. that flash is the fomo vibe, keep it.
- chart: last point halo pulses every 1.6s. on hover or drag a crosshair and price tag follow the pointer.
- success: the green circle pops in with a spring (scale 0.6 to 1, bounce 0.4), the check draws in 250ms, haptic on phone.
- slide to buy: knob follows the pointer 1:1, springs back if released early.
- prefers-reduced-motion: no rolling digits, no flashes, fades only.

## copy

lowercase, short, money first. "bought", "you're up $42", "15 traders bought this", "slide to buy", "deposit". tickers stay upper case. see docs/brand.md.
