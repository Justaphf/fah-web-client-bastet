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
import GPUStatsFieldset from './GPUStatsFieldset.vue'
import GPUTrendChart    from './GPUTrendChart.vue'
import GPUTrendRange    from './GPUTrendRange.vue'
import GPUSeries        from './gpu-series.js'
import Unit             from './unit.js'


const trend_fields = ['power', 'gpu_clock', 'gpu_util', 'temp']
const hour   = 3600
const day    = 24 * hour
const points = 1000 // Constant, so that the client can reuse its work

const marked = {klass: 'legend-fill legend-marked', text: 'Selected Work Unit'}

const legend = [
  {klass: 'legend-fill legend-run',       text: 'Running'},
  {klass: 'legend-fill legend-idle',      text: 'Not running'},
  marked,
  {klass: 'legend-strip legend-open',     text: 'In progress'},
  {klass: 'legend-strip legend-credited', text: 'Credited'},
  {klass: 'legend-strip legend-other',    text: 'Other outcome'},
  {klass: 'legend-strip legend-unknown',  text: 'Outcome unknown'},
]

const presets = GPUSeries.presets


function bucket_text(bucket) {
  if (bucket % hour == 0) return bucket / hour + ' hour'
  if (bucket % 60 == 0)   return bucket / 60 + ' minute'
  return bucket + ' second'
}


// The preset, zoom and marked Work Unit are kept in the route query
function parse_query(query) {
  let preset = presets.find(p => p.key == query.span) || presets[1]
  let match  = /^(\d+)-(\d+)$/.exec(query.zoom || '')
  let zoom   = match && [+match[1], +match[2]]
  let unit   = typeof query.unit == 'string' && query.unit || undefined

  if (zoom && !(zoom.every(Number.isSafeInteger) && zoom[0] < zoom[1]))
    zoom = null

  return {span: preset.span, zoom, unit}
}


export default {
  props: ['mach', 'gpu'],
  components: {GPUStatsFieldset, GPUTrendChart, GPUTrendRange},


  data() {
    return Object.assign({presets}, parse_query(this.$route.query))
  },


  computed: {
    config()    {return this.mach.get_config()},
    info()      {return this.mach.get_info()},
    supported() {return this.config.gpu_telemetry_history_days != undefined},


    unsupported() {
      return this.mach.is_connected() && !this.supported &&
        !!Object.keys(this.config).length
    },


    // Monitored NVML GPUs and the one asked for, if the client reports it
    gpus() {
      let gpus      = this.info.gpus || {}
      let monitored = this.config.gpu_telemetry || {}
      let ids = Object.keys(gpus).filter(id =>
        (gpus[id].nvml && monitored[id]) || id == this.gpu)

      return ids.map(id => ({id, description: gpus[id].description || id}))
    },


    selected() {
      let gpu = this.gpus.find(gpu => gpu.id == this.gpu) || this.gpus[0]
      if (gpu) return gpu.id
    },


    description() {
      let gpu = this.gpus.find(gpu => gpu.id == this.selected)
      return gpu ? gpu.description : this.selected
    },


    active()  {return this.supported && !!this.selected},
    replies() {return this.mach.get_data().gpu_history || {}},


    // Requests outside the kept days get no reply data
    retention() {
      return GPUSeries.retention(this.config.gpu_telemetry_history_days)
    },


    window_span() {return Math.min(this.span, this.retention)},
    limited()     {return this.retention < this.span},
    preset_key()  {return presets.find(p => p.span == this.span).key},


    // Replies are used only for the selection they were requested for
    overview_tag() {
      if (this.active) return this.selected + '/' + this.window_span
    },


    overview_entry() {
      let entry = this.replies.overview
      if (entry && this.overview_tag && entry.tag == this.overview_tag)
        return entry
    },


    // undefined until the client replies, null if nothing was recorded
    overview() {return (this.overview_entry || {}).value},


    // Inside the kept days, the client may widen it to whole buckets
    overview_window() {
      let o = this.overview
      if (o) return [Math.max(o.from, o.to - this.retention), o.to]
    },


    has_rows() {return !!(this.overview && this.overview.rows.length)},


    range() {
      if (this.has_rows)
        return GPUSeries.window(this.zoom, this.overview, this.overview_window)
    },


    range_key() {
      if (this.range)
        return Math.floor(this.range[0]) + '-' + Math.ceil(this.range[1])
    },


    detail_tag() {
      if (this.active && this.range_key)
        return this.selected + '/' + this.range_key
    },


    detail_entry() {
      let entry = this.replies.detail
      if (entry && this.detail_tag && entry.tag == this.detail_tag)
        return entry
    },


    // The reply for the window shown, if it has arrived
    loaded_entry() {
      return this.range ? this.detail_entry : this.overview_entry
    },


    loaded() {return (this.loaded_entry || {}).value},


    no_reply() {
      let entry = this.loaded_entry
      return !!entry && entry.failed && entry.value === undefined
    },


    invalid() {return !!(this.loaded_entry || {}).invalid},
    too_large() {return !!(this.loaded_entry || {}).large},


    invalid_text() {
      if (this.too_large)
        return 'This range holds too much history to show, choose a shorter one'
      return 'Invalid reply from the client'
    },


    // An invalid update keeps the earlier reply
    update_text() {
      if (this.too_large)
        return 'the last update held too much history to show'
      return 'the last update from the client was invalid'
    },


    // The overview's rows until the zoomed window has been loaded
    shown() {
      if (this.loaded === null && this.range)
        return Object.assign({}, this.overview, {rows: [], units: []})
      return this.loaded || this.overview
    },


    incomplete() {
      return !!((this.overview || {}).incomplete ||
                (this.loaded || {}).incomplete)
    },


    fields() {
      let series = this.overview
      if (!this.has_rows) return []

      return trend_fields.filter(field => {
        let col = 2 + series.fields.indexOf(field)
        return 1 < col && series.rows.some(row => row[col])
      })
    },


    window_text() {
      let s = this.loaded
      let interval = t => this.$util.time_interval(t)
      let parts

      if (s) {
        let all = (s.stats || {}).all || {}
        parts = [`${this.format_time(s.from)} to ${this.format_time(s.to)} UTC`,
                 `${bucket_text(s.bucket)} buckets`,
                 `recorded ${interval(all.seconds || 0)} of ` +
                 interval(s.to - s.from)]

      } else {
        let [t0, t1] = this.range || this.overview_window
        parts = [`${this.format_time(t0)} to ${this.format_time(t1)} UTC`,
                 s === null ? 'nothing recorded' :
                 this.invalid ? this.invalid_text.toLowerCase() :
                 this.no_reply ? 'no reply from the client' : 'loading']
      }

      if (this.invalid && s !== undefined) parts.push(this.update_text)

      if (this.limited)
        parts.push('limited to ' + this.config.gpu_telemetry_history_days +
                   ' days by History Days')

      return parts.join(', ')
    },


    known_units() {
      let ids = {}
      let units = (this.mach.get_data().wus || []).concat(this.mach.get_units())
      for (let unit of units) ids[unit.id] = true
      return ids
    },


    // Clipped to the reply's window
    bands() {
      let s = this.shown
      if (!s || !s.units) return []
      let clip = ([t0, t1]) => [Math.max(t0, s.from), Math.min(t1, s.to)]

      return s.units.map(u => {
        let open = u.end == undefined
        let [start, end] = clip([u.start, open ? s.to : u.end])
        let runs   = (u.runs || []).map(clip).filter(([t0, t1]) => t0 < t1)
        let result = open ? 'open' :
          (u.result ? String(u.result).toLowerCase() : 'unknown')
        let known  = !!this.known_units[u.id]

        return {
          id: u.id, start, end, runs,
          idle: GPUSeries.gaps(runs, start, end, s.bucket),
          label: this.unit_label(u),
          route: known ? '/unit/' + u.id : undefined,
          klass: [open ? 'unit-open' : 'unit-ended', 'result-' + result,
                  known ? 'linked' : '', u.id == this.unit ? 'marked' : '']
        }
      }).filter(band => band.start < band.end)
    },


    legend_items() {
      let shown = this.unit && this.bands.some(band => band.id == this.unit)
      return legend.filter(item => item != marked || shown)
    },


    stat_sets() {
      let s = this.loaded || {}
      let stats = s.stats || {}

      return [
        {key: 'active', name: 'Work Unit Time',    stats: stats.active},
        {key: 'all',    name: 'All Recorded Time', stats: stats.all}
      ].map(set => Object.assign(set, {span: s.to - s.from}))
    },


    stats_note() {
      if (this.loaded !== undefined) return 'Nothing recorded in this window'
      if (this.invalid) return this.invalid_text
      return this.no_reply ? 'No reply from the client' : 'Loading...'
    },


    // Statistics use the stored resolution: full detail for windows up to
    // two days, else 30 minute summaries
    average_text() {
      let s = this.loaded
      if (s && s.to - s.from <= 2 * day)
        return bucket_text(
          GPUSeries.day_bucket(this.config.gpu_telemetry_bucket || 60))
      return '30 minute'
    },


    energy() {return {energy_rate: this.energy_rate}},


    energy_rate() {
      let rate = this.config.energy_rate
      if (typeof rate == 'number' && 0 <= rate) return rate
    },


    history_off() {return this.config.gpu_telemetry_history === false},


    idle_off() {
      return !this.history_off && this.config.gpu_telemetry_continuous === false
    },


    // A zoom can be clamped only once the overview is known
    zoom_key() {
      if (this.overview !== undefined) return this.range_key || ''
      let z = this.zoom
      return z ? Math.floor(z[0]) + '-' + Math.ceil(z[1]) : ''
    },


    query_key() {return this.preset_key + '/' + this.zoom_key}
  },


  watch: {
    overview_tag() {this.show()},
    selected() {this.fix_url()},
    gpu()      {this.fix_url()},


    mach(mach, old) {
      this.clear(old)
      this.zoom = parse_query(this.$route.query).zoom
      this.show()
    },


    // Navigation within this page.  Our own write may arrive after a newer
    // zoom, so its arrival is skipped.  A zoom may clamp to the one shown, so
    // the URL is always rewritten.
    '$route.query'(query) {
      if (!/\/gpu-history(\/|$)/.test(this.$route.path)) return
      let written = this.written
      if (written && query.span == written.span &&
          query.zoom == written.zoom && query.unit == written.unit)
        return this.written = undefined

      let {span, zoom, unit} = parse_query(query)
      this.unit = unit
      if (span == this.span && (zoom || []).join('-') == this.zoom_key)
        return this.update_query()

      this.span = span
      this.zoom = zoom
      this.schedule_query()
    },


    range_key() {
      if (this.range_key) return this.schedule_detail(1000)
      clearTimeout(this.detail_timer)
      this.detail_timer = undefined
      this.mach.clear_gpu_history('detail')
    },


    // Some days could not be read yet
    overview() {
      clearTimeout(this.overview_timer)
      if ((this.overview || {}).incomplete)
        this.overview_timer = setTimeout(this.request_overview, 5000)
    },


    detail_entry() {
      let detail = (this.detail_entry || {}).value
      if (detail && detail.incomplete && !this.detail_timer)
        this.schedule_detail(5000)
    },


    query_key() {this.schedule_query()}
  },


  mounted() {
    if (!this.fix_url()) this.update_query()
    this.show()
    this.refresh_timer = setInterval(this.refresh, 60 * 1000)
  },


  beforeUnmount() {
    clearInterval(this.refresh_timer)
    for (let timer of ['detail_timer', 'overview_timer', 'query_timer'])
      clearTimeout(this[timer])
    this.clear(this.mach)
  },


  methods: {
    format_time(t) {return this.$util.format_time(t * 1000).substring(0, 16)},
    now() {return Math.floor(Date.now() / 1000)},


    // Finished units are linked if the machine sends its Work Unit history
    show() {
      this.mach.wus_enable(true)
      this.request_overview()
    },


    clear(mach) {
      mach.clear_gpu_history('overview')
      mach.clear_gpu_history('detail')
    },


    request_overview() {
      if (!this.active) return
      let to = this.now()
      this.mach.request_gpu_history('overview', {
        gpu: this.selected, from: to - this.window_span, to, points,
        tag: this.overview_tag})
    },


    request_detail() {
      if (!this.detail_tag) return
      let from = Math.max(Math.floor(this.range[0]),
                          this.now() - this.retention)
      this.mach.request_gpu_history('detail', {
        gpu: this.selected, from, to: Math.ceil(this.range[1]), points,
        tag: this.detail_tag})
    },


    // One timer for every detail request, a pending one is not doubled
    schedule_detail(delay) {
      clearTimeout(this.detail_timer)
      this.detail_timer = setTimeout(() => {
        this.detail_timer = undefined
        this.request_detail()
      }, delay)
    },


    // A zoomed window at the end also gets the new buckets
    refresh() {
      this.request_overview()

      if (!this.range || this.detail_timer) return
      let at_end =
        this.overview_window[1] - this.overview.bucket <= this.range[1]
      if ((at_end && this.detail_entry) || this.no_reply || this.invalid)
        this.request_detail()
    },


    set_span(span) {
      this.span = span
      this.zoom = null
    },


    route_query() {
      let query = {span: this.preset_key}
      if (this.zoom_key) query.zoom = this.zoom_key
      if (this.unit) query.unit = this.unit
      return query
    },


    schedule_query() {
      clearTimeout(this.query_timer)
      this.query_timer = setTimeout(this.update_query, 1000)
    },


    update_query() {
      let query   = this.route_query()
      let current = this.$route.query
      if (current.span != query.span || current.zoom != query.zoom ||
          current.unit != query.unit) {
        this.written = query
        this.$router.replace({query})
      }
    },


    select_gpu(id) {
      this.zoom = null
      this.unit = undefined
      this.$router.replace({path: this.mach.get_gpu_history_url(id),
                            query: {span: this.preset_key}})
    },


    // An unknown GPU in the URL is replaced by the one shown
    fix_url() {
      if (this.gpu && this.selected && this.gpu != this.selected) {
        let path = this.mach.get_gpu_history_url(this.selected)
        this.$router.replace({path, query: this.route_query()})
        return true
      }
    },


    unit_label(u) {
      let parts = [u.number != undefined ? `Work Unit #${u.number}` :
                   `Work Unit ${u.id}`]
      if (u.project != undefined) parts.push(`project ${u.project}`)
      if (u.group != undefined) parts.push(`group ${u.group || 'Default'}`)

      let outcome = u.end == undefined ? 'in progress' :
        u.result ? Unit.result_text(u.result) : 'ended, outcome unknown'

      return parts.join(', ') + ': ' + outcome
    }
  }
}
</script>

<template lang="pug">
.gpu-history-view.page-view
  ViewHeader(title="GPU History", :subtitle="mach.get_name()")

  .view-body(v-if="unsupported")
    fieldset.view-panel.gpu-history-unsupported
      legend GPU History
      div This client does not keep a GPU history.

  .view-body(v-if="supported")
    fieldset.view-panel.gpu-history-controls
      legend
        HelpBalloon(name="GPU History")
          p.
            The readings of one GPU over time.  Work Units are shown as bands
            from their first recorded reading until the client removed them
            after uploading their results.  A band is shaded where the Work
            Unit ran and in another color where it was not running: paused,
            uploading or waiting.  The line along the top of a band spans the
            whole Work Unit, its color shows the outcome.  The Work Unit this
            page was opened from has its own color, lighter where it was not
            running.  Work Units at the same time get separate lanes.  Click a
            band to open the Work Unit while it is still in the Work Unit
            history.
          p.
            The graphs show at most 1000 points; the bucket length of each
            point is given above them.  Windows of up to two days are drawn
            from the full detail history, longer ones from 30 minute
            summaries.
          p.
            Drag in the bar below the graphs to zoom and scroll.  The zoomed
            window and its statistics are then loaded on their own.  Double
            click the bar to zoom out.  Times are UTC.

      div(v-if="!gpus.length") No monitored GPUs

      .gpu-history-select(v-else)
        select.gpu-history-gpu(:value="selected",
          @change="select_gpu($event.target.value)", title="GPU")
          option(v-for="gpu in gpus", :value="gpu.id") {{gpu.description}}

        .gpu-history-presets
          Button(v-for="preset in presets", :key="preset.key",
            :class="'gpu-history-preset-' + preset.key", :text="preset.name",
            :disabled="span == preset.span", @click="set_span(preset.span)")

      p.gpu-history-off(v-if="history_off").
        Keep History is off in this machine's GPU telemetry settings, so
        nothing new is recorded.

      p.gpu-history-idle(v-if="idle_off").
        Record Continuously is off, so only Work Unit time is recorded.

    template(v-if="active")
      fieldset.view-panel.gpu-history-empty(v-if="!has_rows")
        legend {{description}} History
        div(v-if="overview === null") No history recorded for this GPU
        div(v-else-if="overview") Nothing recorded in this range
        div(v-else-if="invalid") {{invalid_text}}
        div(v-else-if="no_reply") No reply from the client
        div(v-else) Loading...
        div(v-if="invalid && overview !== undefined")
          | {{$util.capitalize(update_text)}}

      template(v-else)
        fieldset.view-panel.gpu-trends
          legend(:title="selected") {{description}} History

          .gpu-history-window {{window_text}}
          .gpu-history-incomplete(v-if="incomplete")
            | Older days are still loading

          .gpu-trend-charts
            GPUTrendChart(v-for="field in fields", :key="field",
              :class="'gpu-history-chart-' + field", :series="shown",
              :field="field", :range="range", :window="overview_window",
              :units="bands")

          GPUTrendRange(:series="overview", :field="fields[0]", :range="range",
            :window="overview_window", @update:range="zoom = $event")

          .gpu-history-legend
            span(v-for="item in legend_items")
              span(:class="item.klass")
              | {{item.text}}

        template(v-for="set in stat_sets", :key="set.key")
          GPUStatsFieldset(v-if="set.stats && set.stats.seconds",
            :class="'gpu-history-stats-' + set.key", :unit="energy",
            :id="selected", :name="set.name", :stats="set.stats",
            :span="set.span")
            template(v-if="set.key == 'active'")
              p.
                The readings taken while Work Units ran on this GPU, in the
                window given above the graphs.
              p.
                Coverage is the Work Unit time recorded out of the whole
                window.  The rest is time without a running Work Unit or time
                not recorded: the client was not running, Keep History was
                off, or the window reaches back before the history began or
                beyond History Days.
            template(v-else)
              p.
                All readings recorded in the window given above the graphs.
                With Record Continuously this includes the time no Work Unit
                ran, without it this is the Work Unit time only.
              p.
                Coverage is the time recorded out of the whole window.  The
                rest was not recorded: the client was not running, Keep
                History was off, Record Continuously was off while no Work
                Unit ran, or the window reaches back before the history began
                or beyond History Days.
            p.
              Min, Max, Mean and Energy are exact.  Median and P95 are
              computed from the stored {{average_text}} averages, or longer
              ones for days merged by History Decimation, not from single
              readings, so short peaks are understated.

          fieldset.view-panel(v-else, :class="'gpu-history-stats-' + set.key")
            legend {{set.name}} Statistics
            div {{stats_note}}
</template>

<style lang="stylus">
.gpu-history-view
  .gpu-history-controls
    display flex
    flex-direction column
    gap var(--gap)

  .gpu-history-select, .gpu-history-presets
    display flex
    flex-wrap wrap
    align-items center
    gap var(--gap)

  .gpu-history-window, .gpu-history-incomplete
    color var(--subtitle-color)
    margin-bottom var(--gap)

  .gpu-trend-charts
    display grid
    // Stylus would evaluate min() itself
    chart-width = unquote('min(100%, 40em)')
    grid-template-columns repeat(auto-fit, minmax(chart-width, 1fr))
    gap var(--gap)
    width 100%

  .gpu-trend-range
    margin-top var(--gap)

  // As the bands in GPUTrendChart
  .gpu-history-legend
    display flex
    flex-wrap wrap
    align-items center
    gap calc(var(--gap) / 2) var(--gap)
    margin-top var(--gap)
    color var(--subtitle-color)

    > span
      display inline-flex
      align-items center
      gap 0.3em

    .legend-fill, .legend-strip
      display inline-block
      width 1em

    .legend-fill
      height 0.8em
      opacity 0.3

    .legend-strip
      height 0.25em

    .legend-run
      background var(--state-run)

    .legend-idle
      background var(--state-pause)

    .legend-open
      background var(--state-run)

    .legend-credited
      background var(--state-credited)

    .legend-other
      background var(--state-wait)

    .legend-unknown
      background var(--secondary-color)

    .legend-marked
      background var(--chart-mark)
</style>
