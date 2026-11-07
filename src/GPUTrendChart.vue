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
import Unit      from './unit.js'
import GPUSeries from './gpu-series.js'


// SVG user units, the plot is stretched to fill its box
const width  = 1000
const height = 100

let clip_ids = 0


// 1, 2 or 5 times a power of ten
function nice_step(range, count) {
  let raw = range / count
  let mag = Math.pow(10, Math.floor(Math.log10(raw)))

  for (let m of [1, 2, 5])
    if (raw <= m * mag * (1 + 1e-9)) return m * mag

  return 10 * mag
}


export default {
  props: ['series', 'field', 'range'],


  data() {
    return {width, height, hover: undefined,
            clip_id: `gpu-trend-clip-${++clip_ids}`}
  },


  computed: {
    bucket() {return this.series.bucket},
    info()   {return Unit.gpu_field(this.field)},


    title() {
      let {label, units} = this.info
      return units ? `${label} (${units})` : label
    },


    points() {return GPUSeries.points(this.series, this.field)},


    // The neighbours carry the line to the edges of a zoomed range
    segments() {
      let points =
        GPUSeries.visible(this.points, this.bucket, this.range, true)
      return GPUSeries.segments(points, this.bucket)
    },


    x_range() {return this.range || GPUSeries.range(this.series)},


    y_range() {
      let lo = Infinity, hi = -Infinity

      for (let p of GPUSeries.visible(this.points, this.bucket, this.range))
        if (p.mean != undefined) {
          lo = Math.min(lo, p.min, p.mean)
          hi = Math.max(hi, p.max, p.mean)
        }

      if (!isFinite(lo)) return {lo: 0, hi: 1, step: 1}

      let range = hi - lo || Math.max(Math.abs(hi) / 10, 1)
      let step  = nice_step(range, 4)

      lo = Math.floor(lo / step) * step
      hi = Math.ceil(hi / step) * step
      // Center a flat line, except at zero which is the natural baseline
      if (lo == hi) {
        hi = lo + step
        if (lo) lo -= step
      }

      return {lo, hi, step}
    },


    y_ticks() {
      let {lo, hi, step} = this.y_range
      let digits = Math.max(0, -Math.floor(Math.log10(step) + 1e-9))
      let ticks  = []

      for (let i = 0; lo + i * step <= hi + step / 1e6; i++) {
        let value = lo + i * step
        let y     = this.y(value)
        ticks.push({value, y, pos: y / height * 100,
                    label: value.toFixed(digits)})
      }

      return ticks
    },


    x_ticks() {
      return GPUSeries.ticks(this.x_range, !!this.range).map(tick =>
        Object.assign(tick, {x: this.x(tick.t),
                             label: this.clock(tick.t, tick.step)}))
    },


    line_path() {
      return GPUSeries.line(this.segments, this.bucket, this.x, this.y)
    },


    band_path() {
      return GPUSeries.band(this.segments, this.bucket, this.x, this.y)
    },


    clip_path() {if (this.range) return `url(#${this.clip_id})`},


    hover_x() {
      if (!this.hover) return 0
      let x = this.x(this.hover.t + this.bucket / 2)
      return Math.min(Math.max(x, 0), width)
    }
  },


  methods: {
    // UTC like the rest of the app, seconds only for sub-minute steps
    clock(t, step = 60) {
      return this.format_time(t).substring(11, step < 60 ? 19 : 16)
    },


    format_time(t) {return this.$util.format_time(t * 1000)},


    x(t) {
      let [x0, x1] = this.x_range
      return (t - x0) / (x1 - x0) * width
    },


    y(v) {
      let {lo, hi} = this.y_range
      return (1 - (v - lo) / (hi - lo)) * height
    },


    format(v)      {return Unit.format_stat(v)},
    format_mean(v) {return Unit.format_stat_mean(v)},


    find_point(t) {
      return this.points.find(p =>
        p.mean != undefined && p.t <= t && t < p.t + this.bucket)
    },


    on_move(e) {
      let rect = e.currentTarget.getBoundingClientRect()
      let [x0, x1] = this.x_range
      let t = x0 + (e.clientX - rect.left) / rect.width * (x1 - x0)
      this.hover = this.find_point(t)
    }
  }
}
</script>

<template lang="pug">
.gpu-trend-chart
  .chart-title {{title}}

  .chart-area
    .chart-y
      span(v-for="tick in y_ticks", :style="{top: tick.pos + '%'}")
        | {{tick.label}}

    .chart-plot(@pointermove="on_move", @pointerleave="hover = undefined")
      svg(:viewBox="`0 0 ${width} ${height}`", preserveAspectRatio="none")
        clipPath(v-if="range", :id="clip_id")
          rect(x="0", y="-2", :width="width", :height="height + 4")
        line.chart-grid(v-for="tick in y_ticks", x1="0", :x2="width",
          :y1="tick.y", :y2="tick.y")
        line.chart-grid(v-for="tick in x_ticks", :x1="tick.x", :x2="tick.x",
          y1="0", :y2="height")
        g(:clip-path="clip_path")
          path.chart-band(:d="band_path")
          path.chart-line(:d="line_path")
        line.chart-cursor(v-if="hover", :x1="hover_x", :x2="hover_x", y1="0",
          :y2="height")

      .chart-tooltip.view-panel(v-if="hover",
        :class="{flip: width / 2 < hover_x}",
        :style="{left: hover_x / width * 100 + '%'}")
        div {{format_time(hover.t)}} UTC
        div mean {{format_mean(hover.mean)}} {{info.units}}
        div {{format(hover.min)}} - {{format(hover.max)}} {{info.units}}
        div(v-if="hover.seconds < bucket")
          | {{Math.round(hover.seconds)}} of {{bucket}} s

    .chart-x(title="Time in UTC")
      span(v-for="tick in x_ticks", :style="{left: tick.pos + '%'}")
        | {{tick.label}}
</template>

<style lang="stylus">
.gpu-trend-chart
  display flex
  flex-direction column
  gap calc(var(--gap) / 2)
  min-width 0

  .chart-title
    color var(--subtitle-color)

  .chart-area
    display grid
    grid-template-columns 3.5em 1fr
    grid-template-rows 8em 1.5em
    column-gap calc(var(--gap) / 2)
    font-family var(--mono-font)
    font-size 80%

  .chart-y, .chart-x
    position relative
    color var(--subtitle-color)

    span
      position absolute
      white-space nowrap

  .chart-y span
    right 0
    transform translateY(-50%)

  .chart-x
    grid-column 2

    span
      bottom 0
      transform translateX(-50%)

  .chart-plot
    position relative
    touch-action pan-y

    svg
      display block
      width 100%
      height 100%
      overflow visible

  .chart-grid, .chart-cursor
    stroke var(--chart-grid)
    stroke-width 1
    vector-effect non-scaling-stroke

  .chart-cursor
    stroke var(--panel-fg)
    stroke-dasharray 2 2

  .chart-band
    fill var(--chart-line)
    fill-opacity 0.2
    stroke none

  .chart-line
    fill none
    stroke var(--chart-line)
    stroke-width 1.5
    stroke-linejoin round
    vector-effect non-scaling-stroke

  .chart-tooltip
    position absolute
    top 0
    margin 0 calc(var(--gap) / 2)
    padding calc(var(--gap) / 2)
    white-space nowrap
    pointer-events none
    box-shadow var(--shadow)
    z-index 1

    &.flip
      transform translateX(-100%)
      margin-left calc(var(--gap) / -2)
</style>
