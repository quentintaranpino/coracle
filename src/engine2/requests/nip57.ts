import {now} from "src/util/misc"
import {people} from "src/engine2/state"
import {subscribe} from "./subscription"

export const listenForZapResponse = (pubkey, opts) => {
  const {zapper} = people.key(pubkey).get()

  return subscribe({
    ...opts,
    filters: [
      {
        kinds: [9735],
        authors: [zapper.nostrPubkey],
        "#p": [pubkey],
        since: now() - 10,
      },
    ],
  })
}
