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
  props: ['series', 'field', 'range', 'window', 'units'],


  data() {
    return {width, height, pointer: undefined,
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


    x_range() {
      return this.range || this.window || GPUSeries.range(this.series)
    },


    y_range() {
      let lo = Infinity, hi = -Infinity

      for (let p of GPUSeries.visible(this.points, this.bucket, this.range))
        if (p.mean != undefined) {
          lo = Math.min(lo, p.min, p.mean)
          hi = Math.max(hi, p.max, p.mean)
        }

      let none = {lo: 0, hi: 1, step: 1}
      if (!isFinite(lo) || !isFinite(hi)) return none

      let range = hi - lo || Math.max(Math.abs(hi) / 10, 1)
      let step  = nice_step(range, 4)
      if (!(isFinite(step) && 0 < step)) return none // Beyond doubles

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
      // toFixed() takes up to 100 digits, older browsers 20
      let digits =
        Math.min(Math.max(0, -Math.floor(Math.log10(step) + 1e-9)), 20)
      let ticks  = []

      for (let i = 0; i < 20 && lo + i * step <= hi + step / 1e6; i++) {
        let value = lo + i * step
        let y     = this.y(value)
        ticks.push({value, y, pos: y / height * 100,
                    label: value.toFixed(digits)})
      }

      return ticks
    },


    x_ticks() {
      return GPUSeries.ticks(this.x_range, !!this.range).map(tick =>
        Object.assign(tick, {x: this.x(tick.t), label: GPUSeries.tick_label(
          this.format_time(tick.t), tick)}))
    },


    line_path() {
      return GPUSeries.line(this.segments, this.bucket, this.x, this.y)
    },


    band_path() {
      return GPUSeries.band(this.segments, this.bucket, this.x, this.y)
    },


    clip_path() {if (this.range) return `url(#${this.clip_id})`},


    // From the current data, which may change under a resting pointer
    hover() {
      if (this.pointer == undefined) return
      let [x0, x1] = this.x_range
      let t = x0 + this.pointer * (x1 - x0)
      let point = this.find_point(t)
      if (point) return point

      // Work Units are also labelled where nothing was recorded
      let inside = u => u.start <= t && t < u.end
      if ((this.units || []).some(inside))
        return {t: t - this.bucket / 2, time: t}
    },


    hover_x() {
      if (!this.hover) return 0
      let x = this.x(this.hover.t + this.bucket / 2)
      return Math.min(Math.max(x, 0), width)
    },


    // Work Unit bands from start to end with the stretches they ran and did
    // not run.  Overlapping units get separate lanes.
    unit_bands() {
      let [x0, x1] = this.x_range
      let visible = ([t0, t1]) => t0 < x1 && x0 < t1
      let units = (this.units || []).filter(u => visible([u.start, u.end]))
        .sort((a, b) => a.start - b.start)

      let lanes = []
      let laned = units.map(u => {
        let lane = lanes.findIndex(end => end <= u.start)
        if (lane < 0) lane = lanes.length
        lanes[lane] = u.end
        return {u, lane}
      })

      let h = height / Math.max(lanes.length, 1)

      return laned.map(({u, lane}) => {
        let rect = ([t0, t1]) => {
          let a = this.x(Math.max(t0, x0)), b = this.x(Math.min(t1, x1))
          return {x: a, width: Math.max(b - a, 0), y: lane * h, height: h}
        }

        return Object.assign({}, u, {
          span: Object.assign(rect([u.start, u.end]), {height: Math.min(3, h)}),
          runs: u.runs.filter(visible).map(rect),
          idle: u.idle.filter(visible).map(rect)
        })
      })
    },


    hover_units() {
      if (!this.hover || !this.units) return []
      let t = this.hover.t + this.bucket / 2
      let inside = ([t0, t1]) => t0 <= t && t < t1

      return this.units.filter(u => inside([u.start, u.end])).map(u =>
        u.label + (u.idle.some(inside) ? ' (not running)' : ''))
    }
  },


  methods: {
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
      this.pointer = (e.clientX - rect.left) / rect.width
    },


    open_unit(unit) {if (unit.route) this.$router.push(unit.route)}
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

    .chart-plot(@pointermove="on_move", @pointerleave="pointer = undefined")
      svg(:viewBox="`0 0 ${width} ${height}`", preserveAspectRatio="none")
        clipPath(v-if="range", :id="clip_id")
          rect(x="0", y="-2", :width="width", :height="height + 4")
        line.chart-grid(v-for="tick in y_ticks", x1="0", :x2="width",
          :y1="tick.y", :y2="tick.y")
        line.chart-grid(v-for="tick in x_ticks", :x1="tick.x", :x2="tick.x",
          y1="0", :y2="height")
        g.chart-unit(v-for="unit in unit_bands", :key="unit.id",
          :class="unit.klass", :data-label="unit.label",
          :aria-label="unit.label", @click="open_unit(unit)")
          rect.chart-unit-run(v-for="r in unit.runs", :x="r.x", :y="r.y",
            :width="r.width", :height="r.height")
          rect.chart-unit-idle(v-for="r in unit.idle", :x="r.x", :y="r.y",
            :width="r.width", :height="r.height")
          rect.chart-unit-span(:x="unit.span.x", :y="unit.span.y",
            :width="unit.span.width", :height="unit.span.height")
        g(:clip-path="clip_path", :class="{'chart-passive': units}")
          path.chart-band(:d="band_path")
          path.chart-line(:d="line_path")
        line.chart-cursor(v-if="hover", :x1="hover_x", :x2="hover_x", y1="0",
          :y2="height")

      .chart-tooltip.view-panel(v-if="hover",
        :class="{flip: width / 2 < hover_x}",
        :style="{left: hover_x / width * 100 + '%'}")
        div {{format_time(hover.time || hover.t)}} UTC
        template(v-if="hover.mean != undefined")
          div mean {{format_mean(hover.mean)}} {{info.units}}
          div {{format(hover.min)}} - {{format(hover.max)}} {{info.units}}
          div(v-if="hover.seconds < bucket")
            | {{Math.round(hover.seconds)}} of {{bucket}} s
        .chart-tooltip-unit(v-for="label in hover_units") {{label}}

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

  // Clicks reach the Work Unit bands below
  .chart-passive, .chart-cursor
    pointer-events none

  .chart-unit
    &.linked
      cursor pointer

    .chart-unit-run, .chart-unit-idle
      fill-opacity 0.12

    .chart-unit-run
      fill var(--state-run)

    .chart-unit-idle
      fill var(--state-pause)

    // Credited, other outcomes, in progress and unknown differ
    .chart-unit-span
      fill var(--state-wait)

    &.result-credited .chart-unit-span
      fill var(--state-credited)

    &.unit-open .chart-unit-span
      fill var(--state-run)

    &.result-unknown .chart-unit-span
      fill var(--secondary-color)

    &.marked
      .chart-unit-run, .chart-unit-idle
        fill var(--chart-mark)

      .chart-unit-run
        fill-opacity 0.3

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

    .chart-tooltip-unit
      max-width 16em
      white-space normal
</style>
