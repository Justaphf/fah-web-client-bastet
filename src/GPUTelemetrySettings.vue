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
const aging_buckets = [300, 600, 1800]
const aging_max     = 3
const row_bytes     = 214 // Stored per trend graph point per GPU


export default {
  props: ['config', 'gpus'],


  computed: {
    interval_valid() {
      let interval = this.config.gpu_telemetry_interval
      return !this.has('gpu_telemetry_interval') ||
        (Number.isInteger(interval) && 1 <= interval && interval <= 60)
    },


    bucket_valid() {
      let bucket = this.config.gpu_telemetry_bucket
      return !this.has('gpu_telemetry_bucket') ||
        (Number.isInteger(bucket) && 10 <= bucket && bucket <= 3600)
    },


    series_max_valid() {
      let max = this.config.gpu_telemetry_series_max
      return !this.has('gpu_telemetry_series_max') ||
        (Number.isInteger(max) && 1 <= max && max <= 100000)
    },


    energy_rate_valid() {
      let rate = this.config.energy_rate
      return !this.has('energy_rate') ||
        (typeof rate == 'number' && isFinite(rate) && 0 <= rate)
    },


    full_bucket() {
      return this.has('gpu_telemetry_bucket') && this.bucket_valid ?
        this.config.gpu_telemetry_bucket : 60
    },


    aging() {
      let aging = this.config.gpu_telemetry_aging
      return Array.isArray(aging) ? aging : []
    },


    bucket_options() {
      return aging_buckets.map(
        value => ({value, name: value / 60 + ' minutes'}))
    },


    // Storage per GPU per day with the menu buckets applied in sequence
    option_day_bytes() {
      let bucket = this.full_bucket

      return aging_buckets.map(value => {
        bucket = this.effective_bucket(bucket, value)
        return this.day_bytes(bucket)
      })
    },


    // Tiers must increase in both days and bucket, starting above the full
    // detail bucket
    aging_errors() {
      return this.aging.map((tier, i) => {
        let prev = this.aging[i - 1]

        return {
          days: !Number.isInteger(tier.days) || tier.days < 1 ||
            (!!prev && tier.days <= prev.days),
          bucket: !aging_buckets.includes(tier.bucket) ||
            tier.bucket <= this.full_bucket ||
            (!!prev && tier.bucket <= prev.bucket)
        }
      })
    },


    aging_valid() {
      return !this.has('gpu_telemetry_aging') ||
        (Array.isArray(this.config.gpu_telemetry_aging) &&
         this.aging_errors.every(e => !e.days && !e.bucket))
    },


    can_add_tier() {
      return this.aging.length < aging_max &&
        this.tier_floor() < aging_buckets[aging_buckets.length - 1]
    },


    // Storage per GPU per day at full detail and in each valid tier
    storage_estimate() {
      let bucket = this.full_bucket
      let rates = [this.format_bytes(this.day_bytes(bucket)) +
                   ' per GPU per day at full detail']

      this.aging.forEach((tier, i) => {
        let errors = this.aging_errors[i]
        if (errors.days || errors.bucket) return
        bucket = this.effective_bucket(bucket, tier.bucket)
        rates.push(`${this.format_bytes(this.day_bytes(bucket))} after ` +
                   `${tier.days} days`)
      })

      let text = 'About ' + rates.join(', ')
      if (this.has('gpu_telemetry_series_max') && this.series_max_valid)
        text += `; the newest ${this.config.gpu_telemetry_series_max} units ` +
          'are kept'

      return text + '.'
    },


    valid() {
      return this.interval_valid && this.bucket_valid &&
        this.series_max_valid && this.aging_valid && this.energy_rate_valid
    }
  },


  methods: {
    has(key) {return key in this.config},


    is_monitored(id) {return !!this.config.gpu_telemetry[id]},


    // Not v-model: unmonitored ids are deleted rather than stored as false
    set_monitored(id, monitored) {
      if (monitored) this.config.gpu_telemetry[id] = true
      else delete this.config.gpu_telemetry[id]
    },


    day_bytes(bucket) {return row_bytes * 86400 / bucket},


    // The client merges into the next whole multiple of the current bucket
    effective_bucket(bucket, target) {
      return bucket < target ? Math.ceil(target / bucket) * bucket : bucket
    },


    // A new tier's bucket must be longer than this
    tier_floor() {
      let last = this.aging[this.aging.length - 1]
      let floor = this.full_bucket
      return last && floor < last.bucket ? last.bucket : floor
    },


    format_bytes(bytes) {
      if (1e6 <= bytes) return (bytes / 1e6).toFixed(1) + ' MB'
      return Math.round(bytes / 1e3) + ' KB'
    },


    add_tier() {
      let last = this.aging[this.aging.length - 1]
      let days = last && Number.isInteger(last.days) ? last.days + 7 : 7
      let floor = this.tier_floor()
      let bucket = aging_buckets.find(b => floor < b) ||
        aging_buckets[aging_buckets.length - 1]

      this.config.gpu_telemetry_aging.push({days, bucket})
    },


    remove_tier(i) {this.config.gpu_telemetry_aging.splice(i, 1)}
  }
}
</script>

<template lang="pug">
fieldset.settings.view-panel.gpu-telemetry-settings
  legend
    HelpBalloon(name="GPU Telemetry"): p.
      Monitor NVIDIA GPU clocks, temperature, load, power and fan speeds.
      Readings are shown on the machine details page whether or not the GPU
      is folding.

  .setting
    HelpBalloon(name="GPUs"): p.
      Choose which GPUs to monitor.  Only GPUs which can be queried with
      NVIDIA's management library (NVML) are listed.

    table.gpus-input.view-table
      thead
        tr
          th Description
          th ID
          th Monitor

      tbody
        tr.gpu-row(v-for="gpu in gpus", :title="`${gpu.id} ${gpu.description}`")
          td.gpu-description {{gpu.description}}
          td.gpu-id {{gpu.id}}

          td.gpu-enabled
            input(type="checkbox", :checked="is_monitored(gpu.id)",
              @change="set_monitored(gpu.id, $event.target.checked)")

  .setting(v-if="has('gpu_telemetry_interval')")
    HelpBalloon(name="Interval (s)"): p.
      How often monitored GPUs are sampled, in seconds, from 1 to 60.

    input(v-model.number="config.gpu_telemetry_interval", type="number",
      min="1", max="60", step="1", :class="{error: !interval_valid}",
      title="GPU telemetry sampling interval in seconds")

  .setting(v-if="has('gpu_telemetry_history')")
    HelpBalloon(name="Keep History"): p.
      Keep statistics and trend graphs of the monitored GPUs for each Work
      Unit.  They are shown on the Work Unit details page, also after the
      Work Unit has finished.

    input(v-model="config.gpu_telemetry_history", type="checkbox",
      title="Keep GPU telemetry history for each Work Unit")

  .setting(v-if="has('gpu_telemetry_bucket')")
    HelpBalloon(name="History Bucket (s)"): p.
      The time covered by one point of the trend graphs, in seconds, from 10
      to 3600.  Each point keeps the minimum, maximum and average of the
      samples it covers.  Shorter buckets show more detail but use more
      storage.

    input(v-model.number="config.gpu_telemetry_bucket", type="number",
      min="10", max="3600", step="1", :class="{error: !bucket_valid}",
      title="Trend graph bucket length in seconds")

  .setting(v-if="has('gpu_telemetry_series_max')")
    HelpBalloon(name="History TTL (units)"): p.
      How many Work Units' trend graphs to keep.  Older ones are deleted.
      Statistics are kept with the Work Unit history.

    input(v-model.number="config.gpu_telemetry_series_max", type="number",
      min="1", max="100000", step="1", :class="{error: !series_max_valid}",
      title="Number of Work Units to keep trend graphs for")

  .setting(v-if="has('gpu_telemetry_aging')")
    HelpBalloon(name="History Decimation")
      p.
        Finished Work Units older than the given number of days have their
        trend graphs merged into longer buckets, which use less storage.
        Nothing is deleted by this setting.
      p.
        Each tier must have more days than the one before it and a longer
        bucket than both the one before it and the History Bucket.  Buckets
        are rounded up to a whole multiple of the bucket they merge, so 5
        minutes after a 45 second History Bucket gives 315 seconds.
        Storage used per monitored GPU per day of folding, with the tiers
        applied in sequence:
      table.view-table: tbody
        tr
          td Full detail ({{full_bucket}} seconds)
          td {{format_bytes(day_bytes(full_bucket))}}
        tr(v-for="(option, i) in bucket_options")
          td {{option.name}}
          td {{format_bytes(option_day_bytes[i])}}

    .aging-input
      table.view-table(v-if="aging.length")
        thead
          tr
            th After
            th Keep
            th

        tbody
          tr(v-for="(tier, i) in aging")
            td
              input(v-model.number="tier.days", type="number", min="1",
                step="1", :class="{error: aging_errors[i].days}",
                title="Age of finished Work Units in days")
              |  days

            td
              select(v-model="tier.bucket",
                :class="{error: aging_errors[i].bucket}",
                title="Trend graph bucket for older Work Units")
                option(v-for="option in bucket_options",
                  :value="option.value") {{option.name}}

            td.actions
              div
                Button.button-icon(icon="trash", @click="remove_tier(i)",
                  title="Remove tier")

      .aging-actions
        Button(text="Add tier", icon="plus", @click="add_tier",
          :disabled="!can_add_tier", title="Add a history decimation tier")

        span {{storage_estimate}}

  .setting(v-if="has('energy_rate')")
    HelpBalloon(name="Energy Rate ($/kWh)"): p.
      Electricity price used to estimate the cost of the energy recorded for
      this machine's GPU Work Units.

    input(v-model.number="config.energy_rate", type="number", min="0",
      step="any", :class="{error: !energy_rate_valid}",
      title="Electricity price in dollars per kWh")
</template>

<style lang="stylus">
.settings-view fieldset
  &.gpu-telemetry-settings .setting > label
    white-space normal

  .gpus-input .gpu-id
    white-space nowrap

  .aging-input
    display flex
    flex-direction column
    gap var(--gap)

    input
      width 5em

    .aging-actions
      display flex
      align-items center
      gap var(--gap)
</style>
