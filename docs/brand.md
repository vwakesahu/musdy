# musdy brand

## the idea

the mark is a fat, rounded lowercase m with a green dot at its top right.
- the m is musdy and MUSD. three soft legs, drawn with one round stroke, chunky like a coin you can tap.
- the green dot is the live dot. someone just bought something. it's the notification you don't want to miss. that's the fomo.
- the dot is always --up green. it is the only colour in the mark.
- it borrows fomo's energy (indigo, near black, loud green) but not its shapes. fomo's mark is two slanted o's. ours is a letter and a dot. never draw anything that looks like an infinity or a pair of rings.

## files

all in web/public/brand/.
- mark.svg: white m, green dot, transparent. use on dark.
- mark-dark.svg: ink m, green dot, transparent. use on light.
- wordmark.svg: mark plus "musdy" in geist 600, -4 tracking, white. the text is live text, so load geist on the page. for a png, export from a browser.
- app-icon.svg: indigo gradient squircle (#6a80ff to #3d52e6), white m, green dot with an indigo ring.
- app-icon-512.png, apple-touch-icon-180.png: renders of app-icon.svg.
- favicon.svg, favicon-32.png: the app icon at small size.
- og.svg, og.png: 1200x630 share image. near black, indigo glow, big "musdy", "see what they buy. buy it first.", three live trade cards and a "copy trade" button.

wire them in next metadata: icons { icon: "/brand/favicon.svg", apple: "/brand/apple-touch-icon-180.png" }, openGraph images "/brand/og.png".

## colours

- ink #070510. the page.
- indigo #516bf6. the brand and every primary button.
- live green #21c85e. the dot, gains, buy.
- red #ff5b3a. losses only, never in brand marks.
- white #f7f7f7. type.
- muted #9999a3. supporting type.
full ui tokens live in docs/style_guide.md.

## usage

- minimum mark size 16px. below 24px drop the dot ring, keep the dot.
- clear space around the mark is half its height.
- on photos or busy backgrounds use the app icon, not the bare mark.
- don't recolour the m. don't move or remove the dot. don't outline, rotate or add shadows.
- the wordmark is always lowercase. "musdy", never "Musdy" or "MUSDY". MUSD the token stays upper case.

## voice

lowercase, short, a little cocky, always about money and people.
- say what happened, in the past tense, with the number: "kenji bought $24k BTC", "you're up $42".
- name people, not wallets: "15 traders bought this" beats "high volume".
- one verb per button: "deposit", "buy", "copy", "launch", "share".
- no exclamation marks, no emoji in ui copy, no jargon like "execute swap".
- empty and error states stay light: "nobody's trading this yet. be first.", "not enough MUSD. top up?"
- tagline: "see what they buy. buy it first."
