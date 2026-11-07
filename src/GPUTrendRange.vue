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
import GPUSeries from './gpu-series.js'


const width  = 1000
const height = 100


export default {
  props: ['series', 'field', 'range'],
  emits: ['update:range'],


  data() {
    return {width, height, drag: undefined, mode: undefined}
  },


  computed: {
    bucket()   {return this.series.bucket},
    full()     {return GPUSeries.range(this.series)},
    min()      {return GPUSeries.min_span(this.series)},
    selected() {return this.range || this.full},
    left()     {return this.pos(this.selected[0])},
    right()    {return this.pos(this.selected[1])},


    segments() {
      let points = GPUSeries.points(this.series, this.field)
      return GPUSeries.segments(points, this.bucket)
    },


    y_range() {
      let means = this.segments.flat().map(p => p.mean)
      let lo = Math.min(...means), hi = Math.max(...means)

      if (!isFinite(lo)) return [0, 1]
      let pad = (hi - lo) / 10 || 1
      return [lo - pad, hi + pad]
    },


    line_path() {
      return GPUSeries.line(this.segments, this.bucket, this.x, this.y)
    },


    ticks() {
      return GPUSeries.ticks(this.full).map(tick => Object.assign(tick, {
        x: tick.pos * width / 100,
        label: this.$util.format_time(tick.t * 1000).substring(11, 16)}))
    },


    cursor() {
      let mode = this.drag ? this.drag.mode : this.mode
      if (mode == 'start' || mode == 'end') return 'ew-resize'
      if (mode == 'move') return this.drag ? 'grabbing' : 'grab'
    }
  },


  methods: {
    pos(t) {
      let [x0, x1] = this.full
      return (t - x0) / (x1 - x0) * 100
    },


    x(t) {return this.pos(t) * width / 100},


    y(v) {
      let [lo, hi] = this.y_range
      return (1 - (v - lo) / (hi - lo)) * height
    },


    time(e) {
      let rect = e.currentTarget.getBoundingClientRect()
      let [x0, x1] = this.full
      return x0 + (e.clientX - rect.left) / rect.width * (x1 - x0)
    },


    mode_at(e) {
      let rect = e.currentTarget.getBoundingClientRect()
      let grab = e.pointerType == 'touch' ? 16 : 6
      let x = e.clientX - rect.left
      return GPUSeries.drag_mode(x, this.left / 100 * rect.width,
        this.right / 100 * rect.width, grab, !!this.range)
    },


    on_down(e) {
      if (e.button || !e.isPrimary) return
      e.currentTarget.setPointerCapture(e.pointerId)
      this.drag = {id: e.pointerId, mode: this.mode_at(e), x: e.clientX,
                   t: this.time(e), range: this.selected, moved: false}
    },


    on_move(e) {
      let drag = this.drag
      if (!drag) {this.mode = this.mode_at(e); return}
      if (e.pointerId != drag.id) return
      if (!drag.moved && Math.abs(e.clientX - drag.x) < 3) return

      drag.moved = true
      this.last_click = undefined
      this.$emit('update:range', GPUSeries.drag(drag.mode, drag.range, drag.t,
        this.time(e), this.full, this.min))
    },


    on_cancel(e) {
      if (this.drag && e.pointerId == this.drag.id)
        this.drag = this.last_click = undefined
    },


    // A click centers the window there, a double click resets it
    on_up(e) {
      let drag = this.drag
      if (!drag || e.pointerId != drag.id) return
      this.drag = undefined
      if (drag.moved) return

      if (e.timeStamp - this.last_click < 400) {
        this.last_click = undefined
        return this.$emit('update:range', null)
      }

      this.last_click = e.timeStamp
      if (drag.mode == 'select')
        this.$emit('update:range',
          GPUSeries.center(drag.range, drag.t, this.full, this.min))
    }
  }
}
</script>

<template lang="pug">
.gpu-trend-range
  .range-plot(:style="{cursor}",
    title="Drag to zoom and scroll, double click to reset",
    @pointerdown="on_down", @pointermove="on_move", @pointerup="on_up",
    @pointercancel="on_cancel", @pointerleave="mode = undefined")
    svg(:viewBox="`0 0 ${width} ${height}`", preserveAspectRatio="none")
      line.chart-grid(v-for="tick in ticks", :x1="tick.x", :x2="tick.x",
        y1="0", :y2="height")
      path.chart-line(:d="line_path")

    .range-window(:style="{left: left + '%', width: right - left + '%'}")
      .range-handle
      .range-handle

  .chart-x(title="Time in UTC")
    span(v-for="tick in ticks", :style="{left: tick.pos + '%'}")
      | {{tick.label}}
</template>

<style lang="stylus">
.gpu-trend-range
  display grid
  grid-template-rows 2.5em 1.5em
  user-select none

  .range-plot
    position relative
    touch-action none
    border 1px solid var(--chart-grid)

    svg
      display block
      width 100%
      height 100%

  .chart-grid
    stroke var(--chart-grid)
    stroke-width 1
    vector-effect non-scaling-stroke

  .chart-line
    fill none
    stroke var(--chart-line)
    stroke-width 1
    stroke-linejoin round
    vector-effect non-scaling-stroke

  .range-window
    position absolute
    top 0
    bottom 0
    box-sizing border-box
    border-left 1px solid var(--chart-line)
    border-right 1px solid var(--chart-line)
    pointer-events none

    &::before
      content ''
      position absolute
      inset 0
      background var(--chart-line)
      opacity 0.2

  .range-handle
    position absolute
    top 25%
    bottom 25%
    width 0.5em
    box-sizing border-box
    background var(--panel-bg)
    border 1px solid var(--chart-line)
    border-radius 2px
    transform translateX(-50%)

    &:first-child
      left 0

    &:last-child
      left 100%

  .chart-x
    position relative
    color var(--subtitle-color)
    font-family var(--mono-font)
    font-size 80%

    span
      position absolute
      bottom 0
      white-space nowrap
      transform translateX(-50%)
</style>
