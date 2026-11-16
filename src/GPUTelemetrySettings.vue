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


const aging_buckets = [300, 600, 1800]
const aging_max     = 3
const row_bytes     = 188   // Stored per trend graph point per GPU
const rollup_bytes  = 14e3  // Per GPU per day kept at less than 30 minutes
const day           = 86400
const day_bucket    = GPUSeries.day_bucket


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


    days_valid() {
      let days = this.config.gpu_telemetry_history_days
      return !this.has('gpu_telemetry_history_days') ||
        (Number.isInteger(days) && 1 <= days && days <= 3650)
    },


    continuous_disabled() {
      return this.has('gpu_telemetry_history') &&
        !this.config.gpu_telemetry_history
    },


    energy_rate_valid() {
      let rate = this.config.energy_rate
      return !this.has('energy_rate') ||
        (typeof rate == 'number' && isFinite(rate) && 0 <= rate)
    },


    // The client rounds the bucket up so that it divides a day
    full_bucket() {
      return this.has('gpu_telemetry_bucket') && this.bucket_valid ?
        day_bucket(this.config.gpu_telemetry_bucket) : 60
    },


    bucket_rounded() {
      return this.has('gpu_telemetry_bucket') && this.bucket_valid &&
        this.full_bucket != this.config.gpu_telemetry_bucket
    },


    continuous() {
      return !!this.config.gpu_telemetry_continuous &&
        !this.continuous_disabled
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


    // The valid tiers in sequence with the bucket each one gives
    tier_buckets() {
      let bucket = this.full_bucket
      let tiers  = []

      this.aging.forEach((tier, i) => {
        let errors = this.aging_errors[i]
        if (errors.days || errors.bucket) return
        bucket = this.effective_bucket(bucket, tier.bucket)
        tiers.push({days: tier.days, bucket})
      })

      return tiers
    },


    // Storage per GPU for all the days kept
    total_bytes() {
      let days   = this.config.gpu_telemetry_history_days
      let bucket = this.full_bucket
      let total  = 0, age = 0

      for (let tier of this.tier_buckets.concat({days: Infinity})) {
        let end = Math.min(tier.days, days)
        if (age < end) total += (end - age) * this.day_bytes(bucket)
        age    = Math.max(age, end)
        bucket = tier.bucket
      }

      return total
    },


    // Storage per GPU per day at full detail and in each valid tier
    storage_estimate() {
      if (this.continuous_disabled)
        return 'Nothing is recorded while Keep History is off.'

      let kept = this.has('gpu_telemetry_history_days') && this.days_valid ?
        this.config.gpu_telemetry_history_days : Infinity
      let per = this.continuous ? 'per day' : 'per day of folding'
      let rates = [`${this.format_bytes(this.day_bytes(this.full_bucket))} ` +
                   `per GPU ${per} at full detail`]
      let unused = false

      for (let tier of this.tier_buckets)
        if (tier.days < kept)
          rates.push(`${this.format_bytes(this.day_bytes(tier.bucket))} ` +
                     `after ${this.format_days(tier.days)}`)
        else unused = true

      let text = 'About ' + rates.join(', ')
      if (kept != Infinity)
        text += `; up to ${this.format_bytes(this.total_bytes)} per GPU for ` +
          this.format_days(kept)
      if (unused) text += '.  Tiers at or beyond History Days have no effect'

      return text + '.'
    },


    valid() {
      return this.interval_valid && this.bucket_valid && this.days_valid &&
        this.aging_valid && this.energy_rate_valid
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


    // Days kept at less than 30 minutes also keep a 30 minute summary
    day_bytes(bucket) {
      return row_bytes * day / bucket + (bucket < 1800 ? rollup_bytes : 0)
    },


    // The client merges into a whole multiple of the current bucket
    effective_bucket(bucket, target) {
      return bucket < target ? day_bucket(target, bucket) : bucket
    },


    // A new tier's bucket must be longer than this
    tier_floor() {
      let last = this.aging[this.aging.length - 1]
      let floor = this.full_bucket
      return last && floor < last.bucket ? last.bucket : floor
    },


    format_bytes(bytes) {
      if (1e9 <= bytes) return (bytes / 1e9).toFixed(1) + ' GB'
      if (1e6 <= bytes) return (bytes / 1e6).toFixed(1) + ' MB'
      return Math.round(bytes / 1e3) + ' KB'
    },


    format_days(days) {return days + (days == 1 ? ' day' : ' days')},


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
      Keep statistics and trend graphs of the monitored GPUs.  They are shown
      on the Work Unit details page, also after the Work Unit has finished,
      and on the machine's GPU History page.

    input(v-model="config.gpu_telemetry_history", type="checkbox",
      title="Keep GPU telemetry history")

  .setting(v-if="has('gpu_telemetry_continuous')")
    HelpBalloon(name="Record Continuously"): p.
      Also keep the readings taken while no Work Unit runs, for example while
      folding is paused or waiting for work.  Without it only Work Unit time
      is kept.  Requires Keep History.

    input(v-model="config.gpu_telemetry_continuous", type="checkbox",
      :disabled="continuous_disabled",
      title="Keep GPU telemetry history also while no Work Unit runs")

    span.setting-note(v-if="continuous_disabled") Requires Keep History

  .setting(v-if="has('gpu_telemetry_history_days')")
    HelpBalloon(name="History Days"): p.
      How many days of GPU history to keep, from 1 to 3650.  Older days are
      deleted.

    input(v-model.number="config.gpu_telemetry_history_days", type="number",
      min="1", max="3650", step="1", :class="{error: !days_valid}",
      title="Number of days to keep GPU history for")

  .setting(v-if="has('gpu_telemetry_bucket')")
    HelpBalloon(name="History Bucket (s)"): p.
      The time covered by one point of the trend graphs, in seconds, from 10
      to 3600.  Each point keeps the minimum, maximum and average of the
      samples it covers.  Shorter buckets show more detail but use more
      storage.  The client rounds the length up so that it divides a day,
      for example 70 seconds to 72.

    input(v-model.number="config.gpu_telemetry_bucket", type="number",
      min="10", max="3600", step="1", :class="{error: !bucket_valid}",
      title="Trend graph bucket length in seconds")

    span.setting-note.bucket-rounded(v-if="bucket_rounded")
      | Used as {{full_bucket}} s

  .setting(v-if="has('gpu_telemetry_aging')")
    HelpBalloon(name="History Decimation")
      p.
        Days of history older than the given number of days have their
        trend graphs merged into longer buckets, which use less storage.
        Nothing is deleted by this setting.
      p.
        Each tier must have more days than the one before it and a longer
        bucket than both the one before it and the History Bucket.  Buckets
        are rounded up to a whole multiple of the bucket they merge which
        divides a day, so 5 minutes after a 45 second History Bucket gives
        360 seconds.  Days kept at less than 30 minutes also keep a 30 minute
        summary of about 14 KB for long graphs.
      p.
        Storage used per monitored GPU per day, with the tiers applied in
        sequence.  With Record Continuously this is every day, else only the
        time Work Units run:
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
                title="Age of the history in days")
              |  days

            td
              select(v-model="tier.bucket",
                :class="{error: aging_errors[i].bucket}",
                title="Trend graph bucket for older history")
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
      Electricity price used to estimate the cost of the GPU energy recorded
      on this machine, for its Work Units and on its GPU History page.

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

  .setting-note
    align-self center
    color var(--subtitle-color)

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
