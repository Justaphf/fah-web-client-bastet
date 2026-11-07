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


const trend_fields = ['power', 'gpu_clock', 'gpu_util', 'temp']


export default {
  props: ['unitID'],
  components: {GPUStatsFieldset, GPUTrendChart, GPUTrendRange},


  data() {
    return {
      loading: true,
      credits: [],
      ranges: {}
    }
  },


  computed: {
    unit() {return this.$machs.get_unit(this.unitID)},
    project() {return this.$projects.get(this.unit.project) || {}},


    gpu_telemetry() {
      let fields = [
        'PCIe Link',  'PCIe Max',
        'GPU Clock',  'Mem Clock',
        'GPU PState', 'GPU Temp',
        'GPU Load',   'Mem Load',
        'GPU Power',  'GPU Fans',
      ].filter(field => this.unit.get_field_content(field))

      let groups = []
      for (let i = 0; i < fields.length; i += 2)
        groups.push(fields.slice(i, i + 2))

      return groups
    },


    mach() {return (this.unit || {}).mach},


    // Clients which report the bucket length answer the series command
    series_supported() {
      let mach = this.mach
      return !!mach && typeof mach.request_series == 'function' &&
        mach.get_config().gpu_telemetry_bucket != undefined &&
        0 < (this.unit.assign.gpus || []).length
    },


    // undefined until the client replies, null if nothing was recorded
    series() {
      if (this.series_supported)
        return (this.mach.get_data().series || {})[this.unit.id]
    },


    trends() {
      let trends = []

      for (const [id, series] of Object.entries(this.series || {})) {
        let rows   = series.rows || []
        let fields = trend_fields.filter(field => {
          let col = 2 + series.fields.indexOf(field)
          return 1 < col && rows.some(row => row[col])
        })

        // A zoomed window stays put while the series grows
        if (fields.length)
          trends.push({id, series, fields,
                       range: GPUSeries.window(this.ranges[id], series)})
      }

      return trends
    }
  },


  watch: {
    'unit.project'() {this.load_credits()},
    'unit.id'()        {this.ranges = {}; this.show_series()},
    mach()             {this.ranges = {}; this.show_series()},
    series_supported() {this.show_series()},
    // Fetch the last buckets when the unit stops running
    'unit.state'()     {this.request_series()}
  },


  mounted() {
    this.load_credits()
    this.request_series()
    this.series_timer = setInterval(this.update_series, 60 * 1000)
  },


  beforeUnmount() {
    clearInterval(this.series_timer)
    this.clear_series()
  },


  methods: {
    // Refresh while buckets are added, else retry until the client replies
    update_series() {
      if (this.series === undefined ||
          ['RUN', 'FINISH'].includes((this.unit || {}).state))
        this.request_series()
    },


    // Request the series when another unit or machine is shown
    show_series() {
      let mach = this.series_supported ? this.mach : undefined
      if (mach != this.series_mach || (mach && this.unit.id != this.series_id))
        this.request_series()
    },


    // Machines keep only the series last requested
    request_series() {
      let mach = this.series_supported ? this.mach : undefined
      if (mach != this.series_mach) this.clear_series()
      if (!mach) return

      this.series_mach = mach
      this.series_id   = this.unit.id
      mach.request_series(this.series_id)
    },


    clear_series() {
      if (this.series_mach) this.series_mach.clear_series()
      this.series_mach = this.series_id = undefined
    },


    gpu_description(id) {
      return ((this.mach.get_info().gpus || {})[id] || {}).description || id
    },


    async load_credits() {
      let u = this.unit
      if (!u || !u.project) return
      let path =
        `/project/${u.project}/run/${u.run}/clone/${u.clone}/gen/${u.gen}`
      this.credits = await this.$api.fetch({
        path, expire: 10 * 60 * 1000,
        action: 'Loading Work Unit logged credits'
      })
      this.loading = false
    }
  }
}
</script>

<template lang="pug">
.unit-details-view.page-view
  ViewHeader(title="Work Unit Details")

  .view-body(v-if="unit.wu")
    fieldset.view-panel
      legend(:title="`Unit ID ${unit.id}`") Work Unit {{'#' + unit.number}}

      .info-group
        unit-info(:unit="unit", field="Status Text")
        unit-info(:unit="unit", field="Progress")

      .info-group
        unit-info(:unit="unit", field="Machine")
        unit-info(:unit="unit", field="OS Text")

      .info-group
        unit-info(:unit="unit", field="TPF")
        unit-info(:unit="unit", field="PPD")

      .info-group
        unit-info(:unit="unit", field="CPUs")
        unit-info(:unit="unit", field="GPUs Text")

      .info-group
        unit-info(:unit="unit", field="Run Time")
        unit-info(:unit="unit", field="ETA")

      .info-group
        unit-info(:unit="unit", field="Assign Time")
        unit-info(:unit="unit", field="Base Credit")

      .info-group
        unit-info(:unit="unit", field="Deadline")
        unit-info(:unit="unit", field="Timeout")

      .info-group
        unit-info(:unit="unit", field="Core")
        unit-info(:unit="unit", field="Work Server")

      .info-group
        unit-info(:unit="unit", field="Project")
        unit-info(:unit="unit", field="RCG")

      .info-group(v-for="group of gpu_telemetry")
        unit-info(v-for="field of group", :unit="unit", :field="field")

      .info-group(v-if="unit.gpu_energy")
        unit-info(:unit="unit", field="GPU Energy")
        unit-info(v-if="unit.gpu_cost", :unit="unit", field="GPU Cost")

    GPUStatsFieldset(v-for="(stats, id) in unit.gpu_stats", :key="id",
      :unit="unit", :id="id", :name="gpu_description(id)", :stats="stats")

    template(v-if="series !== undefined")
      fieldset.view-panel.gpu-trends(v-for="trend in trends", :key="trend.id")
        legend(:title="trend.id")
          | {{gpu_description(trend.id)}} Trends

        .gpu-trend-charts
          GPUTrendChart(v-for="field in trend.fields", :key="field",
            :series="trend.series", :field="field", :range="trend.range")

        GPUTrendRange(:series="trend.series", :field="trend.fields[0]",
          :range="trend.range", @update:range="ranges[trend.id] = $event")

      fieldset.view-panel.gpu-trends(v-if="!trends.length")
        legend GPU Trends
        div No history recorded

    fieldset.view-panel
      legend Logged Credits

      div(v-if="loading") Loading...
      div(v-else-if="!credits.length") No credits logged
      template(v-else)
        table.view-table
          thead
            tr
              th Code
              th User
              th Team
              th Credit
              th Assigned
              th Credited

          tbody
            tr(v-for="credit in credits")
              td.code {{credit.code}}
              td.user {{credit.user}}
              td.team {{credit.team}}
              td.credit {{(credit.credit || 0).toLocaleString()}}
              td.assigned {{credit.assign_time}}
              td.credited {{credit.credit_time}}

        p May include credits awarded to other users.

    ProjectView(v-if="project.description", :project="project", :full="true")
</template>

<style lang="stylus">
.unit-details-view
  .view-table
    .user
      max-width 20em
      overflow hidden
      text-overflow ellipsis

  .gpu-trend-charts
    display grid
    // Stylus would evaluate min() itself
    chart-width = unquote('min(100%, 40em)')
    grid-template-columns repeat(auto-fit, minmax(chart-width, 1fr))
    gap var(--gap)
    width 100%

  .gpu-trend-range
    margin-top var(--gap)
</style>
