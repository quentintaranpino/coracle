import {verifySignature, getEventHash, matchFilter as nostrToolsMatchFilter} from "nostr-tools"
import {omit, any, find, prop, groupBy, uniq} from "ramda"
import {shuffle, randomId, tryFunc, seconds, avg} from "hurdak"
import {Tags} from "src/util/nostr"
import {cached} from "src/util/lruCache"
import {env, pubkey} from "src/engine/session/state"
import {follows, network} from "src/engine/people/derived"
import {mergeHints, getPubkeyHints} from "src/engine/relays/utils"
import {Naddr} from "src/engine/events/utils"
import type {DynamicFilter, Filter} from "../model"

export const hasValidSignature = cached({
  maxSize: 10000,
  getKey: ([e]) => [getEventHash(e), e.sig].join(":"),
  getValue: ([e]) => tryFunc(() => verifySignature(e)),
})

export const matchFilter = (filter, event) => {
  if (!nostrToolsMatchFilter(filter, event)) {
    return false
  }

  if (filter.search) {
    const content = event.content.toLowerCase()
    const terms = filter.search.toLowerCase().split(/\s+/g)

    return any(s => content.includes(s), terms)
  }

  return true
}

export const matchFilters = (filters, event) => any(f => matchFilter(f, event), filters)

export const calculateFilterGroup = ({since, until, limit, search, ...filter}: Filter) => {
  const group = Object.keys(filter)

  if (since) group.push(`since:${since}`)
  if (until) group.push(`until:${until}`)
  if (limit) group.push(`limit:${randomId()}`)
  if (search) group.push(`search:${search}`)

  return group.sort().join("-")
}

export const combineFilters = filters => {
  const result = []

  for (const group of Object.values(groupBy(calculateFilterGroup, filters))) {
    const newFilter = {}

    for (const k of Object.keys(group[0])) {
      if (["since", "until", "limit", "search"].includes(k)) {
        newFilter[k] = group[0][k]
      } else {
        newFilter[k] = uniq(group.flatMap(prop(k)))
      }
    }

    result.push(newFilter)
  }

  return result
}

export const getIdFilters = values => {
  const ids = []
  const aFilters = []

  for (const value of values) {
    if (value.includes(":")) {
      aFilters.push(Naddr.fromTagValue(value).asFilter())
    } else {
      ids.push(value)
    }
  }

  const filters = combineFilters(aFilters)

  if (ids.length > 0) {
    filters.push({ids})
  }

  return filters
}

export const getReplyFilters = (events, filter) => {
  const a = []
  const e = []

  for (const event of events) {
    e.push(event.id)

    if (event.kind >= 10000) {
      const tags = Tags.from(event).asMeta()

      a.push([event.kind, event.pubkey, tags.d || ""].join(":"))
    }
  }

  const filters = []

  if (a.length > 0) {
    filters.push({...filter, "#a": a})
  }

  if (e.length > 0) {
    filters.push({...filter, "#e": e})
  }

  return filters
}

export const getFilterGenerality = filter => {
  if (filter.ids) {
    return 0
  }

  const hasTags = find(k => k.startsWith("#"), Object.keys(filter))

  if (filter.authors && hasTags) {
    return 0.2
  }

  if (filter.authors) {
    return Math.min(1, filter.authors.length / 100)
  }

  return 1
}

export const guessFilterDelta = filters => {
  const avgSpecificity = 1 - avg(filters.map(getFilterGenerality))

  return Math.round(seconds(1, "day") * Math.max(0.005, avgSpecificity))
}

export const getPubkeysWithDefaults = (pubkeys: Set<string>) => {
  if (pubkeys.size === 0) {
    pubkeys = new Set(env.get().DEFAULT_FOLLOWS)
  }

  return shuffle(Array.from(pubkeys)).slice(0, 1000)
}

export const compileFilter = (filter: DynamicFilter): Filter => {
  if (filter.authors === "global") {
    filter = omit(["authors"], filter)
  } else if (filter.authors === "follows") {
    filter = {...filter, authors: getPubkeysWithDefaults(follows.get())}
  } else if (filter.authors === "network") {
    filter = {...filter, authors: getPubkeysWithDefaults(network.get())}
  }

  return filter as Filter
}

export const getRelaysFromFilters = filters =>
  mergeHints(
    filters.flatMap(filter =>
      filter.authors
        ? filter.authors.map(pubkey => getPubkeyHints(pubkey, "write"))
        : [getPubkeyHints(pubkey.get(), "read")]
    )
  )
