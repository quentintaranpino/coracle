import {nip19} from "nostr-tools"
import {uniq, join, nth, last} from "ramda"
import {Fetch, tryFunc, createMapOf, ellipsize, switcherFn} from "hurdak"
import {fuzzy, createBatcher} from "src/util/misc"
import {fromNostrURI} from "src/util/nostr"
import {cached} from "src/util/lruCache"
import {dufflepud} from "src/engine/session/utils"
import {getPubkeyHints} from "src/engine/relays/utils"
import type {Person, Handle} from "./model"
import {people} from "./state"

export const fetchHandle = createBatcher(3000, async (handles: string[]) => {
  const data =
    (await tryFunc(async () => {
      const res = await Fetch.postJson(dufflepud("handle/info"), {handles: uniq(handles)})

      return res?.data
    })) || []

  const infoByHandle = createMapOf("handle", "info", data)

  return handles.map(h => infoByHandle[h])
})

export const getHandle = cached({
  maxSize: 100,
  getKey: ([handle]) => handle,
  getValue: ([handle]) => fetchHandle(handle),
})

export const personHasName = ({profile: p}: Person) => Boolean(p?.name || p?.display_name)

export const getPersonWithDefault = pubkey => ({pubkey, ...people.key(pubkey).get()})

export const displayPerson = ({pubkey, profile}: Person) => {
  if (profile) {
    const {display_name, name} = profile

    if (display_name) {
      return ellipsize(display_name, 60)
    }

    if (name) {
      return ellipsize(name, 60)
    }
  }

  try {
    return nip19.npubEncode(pubkey).slice(-8)
  } catch (e) {
    console.error(e)

    return ""
  }
}

export const displayHandle = (handle: Handle) =>
  handle.address.startsWith("_@") ? last(handle.address.split("@")) : handle.address

export const displayPubkey = (pubkey: string) => displayPerson(getPersonWithDefault(pubkey))

export const getPeopleSearch = $people =>
  fuzzy($people, {
    keys: [
      "profile.name",
      "profile.display_name",
      {name: "profile.nip05", weight: 0.5},
      {name: "about", weight: 0.1},
    ],
    threshold: 0.3,
  })

export const getMutedPubkeys = $person => ($person?.mutes || []).map(nth(1)) as string[]

export const getMutes = $person => new Set(getMutedPubkeys($person))

export const isMuting = ($person, pubkey) => getMutedPubkeys($person).includes(pubkey)

export const getFollowedPubkeys = $person => ($person?.petnames || []).map(nth(1)) as string[]

export const getFollows = $person => new Set(getFollowedPubkeys($person))

export const isFollowing = ($person, pubkey) => getFollowedPubkeys($person).includes(pubkey)

export const getFollowers = pubkey => people.get().filter($p => isFollowing($p, pubkey))

export const getNetwork = $person => {
  const pubkeys = getFollows($person)
  const network = new Set<string>()

  for (const follow of pubkeys) {
    for (const [_, pubkey] of people.key(follow).get()?.petnames || []) {
      if (!pubkeys.has(pubkey)) {
        network.add(pubkey)
      }
    }
  }

  return network
}

export const getFollowsWhoFollow = cached({
  maxSize: 1000,
  getKey: join(":"),
  getValue: ([pk, tpk]) =>
    getFollowedPubkeys(people.key(pk).get()).filter(pk => isFollowing(people.key(pk).get(), tpk)),
})

export const getFollowsWhoMute = cached({
  maxSize: 1000,
  getKey: join(":"),
  getValue: ([pk, tpk]) =>
    getFollowedPubkeys(people.key(pk).get()).filter(pk => isMuting(people.key(pk).get(), tpk)),
})

export const getWotScore = (pk, tpk) =>
  getFollowsWhoFollow(pk, tpk).length -
  Math.floor(Math.pow(2, Math.log(getFollowsWhoMute(pk, tpk).length)))

const annotatePerson = pubkey => {
  const relays = getPubkeyHints.limit(3).getHints(pubkey, "write")

  return {
    pubkey,
    relays,
    npub: nip19.npubEncode(pubkey),
    nprofile: nip19.nprofileEncode({pubkey, relays}),
  }
}

export const decodePerson = entity => {
  entity = fromNostrURI(entity)

  let type, data
  try {
    ;({type, data} = nip19.decode(entity))
  } catch (e) {
    return annotatePerson(entity)
  }

  return switcherFn(type, {
    nprofile: () => ({
      pubkey: data.pubkey,
      relays: data.relays,
      npub: nip19.npubEncode(data.pubkey),
      nprofile: nip19.nprofileEncode(data),
    }),
    npub: () => annotatePerson(data),
    default: () => annotatePerson(entity),
  })
}
