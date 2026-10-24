#!/usr/bin/env bash
# writes typed abis to shared/abi, run after forge build
set -e
cd "$(dirname "$0")"
forge build --silent
out=../shared/abi
mkdir -p $out
emit() { # emit <artifact path> <export name>
  printf 'export const %s = %s as const;\n' "$2" "$(jq -c '.abi' "out/$1")" > "$out/$2.ts"
}
pick() { [ -f "out/$1" ] && echo "$1" || echo "$2"; }
emit "$(pick MusdyVault.sol/MusdyVault.json IMusdyVault.sol/IMusdyVault.json)" vaultAbi
emit "$(pick MusdyLaunchpad.sol/MusdyLaunchpad.json IMusdyLaunchpad.sol/IMusdyLaunchpad.json)" launchpadAbi
emit IMezoPools.sol/IMezoRouter.json routerAbi
emit IMezoPools.sol/IMezoPoolFactory.json poolFactoryAbi
emit IMezoPools.sol/IMezoPool.json poolAbi
{ for f in vaultAbi launchpadAbi routerAbi poolFactoryAbi poolAbi; do echo "export * from \"./$f\";"; done; } > $out/index.ts
echo "abis -> shared/abi"
