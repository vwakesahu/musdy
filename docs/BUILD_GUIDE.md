# build guide

read `docs/brief.md`, `docs/spec.md`, `docs/contract.md` and your rows in `docs/tasks.md` first. you own exactly one package. shapes come from `shared`, never redefine one. if the contract is wrong or missing something, stop and say so in your report, don't patch around it.

## stack

contracts. solidity 0.8.28, evm london, foundry, openzeppelin 5.1 from `contracts/lib` (`@openzeppelin/contracts/...`), forge-std. unit, fuzz and invariant tests. custom errors, no require strings.

server. bun, `Bun.serve` with websockets on one port, viem with websocket transport for watching and http for reads, `bun:sqlite`, zod from `shared`. no express, no orm.

web. next 16 app router, typescript strict, tailwind 4, `@privy-io/react-auth`, wagmi and viem, tanstack query, motion for animation, vaul for bottom sheets, lightweight-charts for the chart. nothing else without asking.

## conventions

files are kebab-case, one component per file. web hooks live in `web/src/hooks`, the only socket client is `web/src/lib/socket.ts`.

money is bigint everywhere and formatted only at the edge with `formatUnits`. dollars show 2 decimals, token amounts show 4 significant digits, prices under $0.01 use subscript zero notation like fomo.

errors never get swallowed. the server answers `{code, message}`, the web shows it in a toast with the message.

the server is the source of truth for anything live. the web doesn't derive chain state that the server already streams.

server logs one json line per event, `{t, type, ...}`. the web logs nothing.

comments only where something non obvious needs saying, one line max. no commented out code, no `any`, no `@ts-ignore`, no `console.log` left in.

## look

`docs/style_guide.md` is the law for colour, type, spacing and motion. phones get bottom sheets, never dialogs. no input under 16px or ios zooms. no invented data anywhere, an empty state says it's empty.

## commits

you don't commit, the lead merges your worktree. leave the tree clean and building.

## done means

your task's tests pass locally, `pnpm typecheck` is clean in your package, nothing outside your package changed, and you appended one line to `docs/review_log.md`: `<task ids> done, <test names>, <anything the lead must know>`.
