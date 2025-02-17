<script lang="ts">
  import cx from "classnames"
  import {switcher} from "hurdak"
  import {createEventDispatcher} from "svelte"
  import {router} from "src/app/router"

  export let stopPropagation = false
  export let external = false
  export let loading = false
  export let modal = false
  export let theme = "unstyled"
  export let type = null
  export let href = null
  export let tag = "a"

  const dispatch = createEventDispatcher()

  $: target = external ? "_blank" : null

  let className

  $: className = cx(
    $$props.class,
    "transition-all",
    {
      "opacity-50": loading,
      "cursor-pointer": !loading,
    },
    switcher(theme, {
      anchor: "underline",
      button:
        "py-2 px-4 rounded-full bg-input text-accent whitespace-nowrap border border-solid border-gray-6 hover:bg-input-hover",
      "button-circle":
        "w-10 h-10 flex justify-center items-center rounded-full bg-input text-accent whitespace-nowrap border border-solid border-gray-6 hover:bg-input-hover",
      "button-circle-dark":
        "w-10 h-10 flex justify-center items-center rounded-full bg-gray-8 text-white whitespace-nowrap border border-solid border-gray-7",
      "button-accent":
        "py-2 px-4 rounded-full bg-accent text-white whitespace-nowrap border border-solid border-accent-light hover:bg-accent-light",
      "button-minimal":
        "py-2 px-4 rounded-full whitespace-nowrap border border-solid border-gray-2",
    })
  )

  const onClick = e => {
    if (stopPropagation) {
      e.stopPropagation()
    }

    if (href && !external && !e.metaKey && !e.ctrlKey) {
      e.preventDefault()

      router.at(href).push({modal})
    }

    dispatch("click", e)
  }
</script>

{#if tag === "a"}
  <a class={className} on:click={onClick} {href} {target}>
    <slot />
  </a>
{:else if tag === "button"}
  <button class={className} on:click={onClick} {type}>
    <slot />
  </button>
{:else}
  <svelte:element this={tag} class={className} on:click={onClick}>
    <slot />
  </svelte:element>
{/if}
