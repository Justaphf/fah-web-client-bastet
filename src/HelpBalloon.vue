<!--

                  This file is part of the Folding@home Client.

          The fah-client runs Folding@home protein folding simulations.
                    Copyright (c) 2001-2026, foldingathome.org
                               All rights reserved.

       This program is free software; you can redistribute it and/or modify
       it under the terms of the GNU General Public License as published by
        the Free Software Foundation; either version 3 of the License, or
                       (at your option) any later version.

         This program is distributed in the hope that it will be useful,
          but WITHOUT ANY WARRANTY; without even the implied warranty of
          MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
                   GNU General Public License for more details.

     You should have received a copy of the GNU General Public License along
     with this program; if not, write to the Free Software Foundation, Inc.,
           51 Franklin Street, Fifth Floor, Boston, MA 02110-1301 USA.

                  For information regarding this software email:
                                 Joseph Coffland
                          joseph@cauldrondevelopment.com

-->

<script>
const offset = 6 // px, content edge past the caret


export default {
  props: ['name'],
  data() {return {active: false, up: false}},

  watch: {
    active() {
      if (this.active) {
        this.$util.lock_scrolling()
        this.$nextTick(this.place)

      } else {
        this.$util.unlock_scrolling()
        this.up = false
      }
    }
  },


  methods: {
    // Opens upward if the content would run past the bottom of the viewport
    // and there is more room above
    flip_up(top, bottom, height, view_height) {
      let below = view_height - (top - offset)
      let above = bottom + offset
      return below < height && below < above
    },


    place() {
      let content = this.$refs.content
      if (!content || window.matchMedia('(max-width: 800px)').matches) return

      let rect = this.$refs.anchor.getBoundingClientRect()
      this.up = this.flip_up(rect.top, rect.bottom, content.offsetHeight,
                             window.innerHeight)
    }
  }
}
</script>

<template lang="pug">
label.help-balloon(@click="active = !active", :class="{'help-up': up}")
  .help-overlay(v-show="active", @click.stop="active = false")
  .help-name {{name}}#[.fa.fa-question-circle]
  span(v-if="active", ref="anchor")
    .fa.fa-caret-left
    .help-content.view-panel(ref="content", @click.stop="true")
      .help-header
        h2.help-title {{name}} Help
        Button.button-icon(icon="times", @click="active=false")
      slot
</template>

<style lang="stylus">
.help-balloon
  display inline-block

  .help-overlay
    position fixed
    top 0
    left 0
    width 100vw
    height 100vh
    background var(--overlay-bg)

  .help-name
    display inline
    cursor help

    .fa
      font-size 50%
      vertical-align super
      margin-left 0.125em

    &:hover
      color var(--highlight-color)

  > span
    position fixed
    display inline-block
    width 0.5em
    margin-left 0.5em

    > .fa
      display inline-block
      height 20px
      vertical-align unset
      font-size 100%
      color var(--panel-fg)

    > .fa-caret-left
      transform scale(2.5)

    .help-content
      display inline-block
      position absolute
      margin-top -6px
      margin-left 3px
      font-size 12pt
      white-space normal
      text-align left
      width 30em
      max-width 80vw
      font-weight normal
      padding var(--gap)
      box-shadow var(--shadow)

      .help-header
        display flex
        gap var(--gap)

        .help-title
          flex 1
          margin 0

      p:first-child
        margin-top 0

      p:last-child
        margin-bottom 0

  &.help-up > span .help-content
    margin-top 0
    bottom -6px

@media (max-width 800px)
  .help-balloon .help-content
    position fixed
    top 8px
    left 0
    width auto
    max-width calc(100vw - 6px)
</style>
